import "server-only";

import { resolveLlmConfig } from "@/lib/ai/llmConfig";
import type { ChatTurn } from "@/lib/ai/desensitize";
import { can, visibleDepartmentIds, type HeadcountUser } from "@/lib/headcount/authz";
import { buildBaselineRows, companyCards } from "@/lib/headcount/baselineView";
import { chooseConclusion, conclusionFacts, directChildFacts } from "@/lib/headcount/conclusion";
import { getDb } from "@/lib/headcount/db/client";
import { recordAccess, saveConclusion } from "@/lib/headcount/db/mutate";
import { loadCachedConclusion, loadClosure, loadDepartments, loadPlan, loadSettings } from "@/lib/headcount/db/queries";
import { computePlan } from "@/lib/headcount/engine";
import { buildLeaderView, type LeaderView } from "@/lib/headcount/leaderView";

export type SessionUser = HeadcountUser & { name: string };

async function completeWithModel(messages: ChatTurn[]): Promise<string | null> {
  const config = resolveLlmConfig({
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  });
  if (!config.enabled) return null;
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, temperature: 0.2, messages }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return payload.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export async function scopeFor(user: HeadcountUser) {
  const db = await getDb();
  const departments = await loadDepartments(db);
  const closure = await loadClosure(db);
  return { db, departments, closure, visible: visibleDepartmentIds(user, departments, closure) };
}

export async function openLeader(user: SessionUser, requestedId?: string): Promise<LeaderView> {
  if (!can(user, "viewLeader") && !can(user, "viewBusiness")) throw new Error("无权查看");
  if (user.role === "sys_admin") throw new Error("无权查看");
  const { db, departments, visible } = await scopeFor(user);
  const requested = requestedId && visible.includes(requestedId) ? requestedId : null;
  if (requestedId && !requested) throw new Error("部门不在授权范围");
  const departmentId = requested ?? user.departmentIds.find((id) => visible.includes(id)) ?? visible.find((id) => id === "plat") ?? visible[0];
  if (!departmentId) throw new Error("没有可查看的部门");
  const settings = await loadSettings(db);
  const exact = settings.exactForLeaders;
  const plan = await loadPlan(db, { departmentIds: visible, sensitive: false });
  const result = computePlan(plan);
  const facts = conclusionFacts(result, departmentId);
  const names = plan.people.map((person) => person.name);
  const employeeNos = plan.people.map((person) => person.employeeNo);
  const departmentNames = departments.map((department) => department.name);
  const cached = await loadCachedConclusion(db, departmentId, settings.dataVersion);
  const config = resolveLlmConfig({ LLM_API_KEY: process.env.LLM_API_KEY });
  const chosen = await chooseConclusion({
    root: facts,
    children: directChildFacts(result, departmentId),
    names,
    employeeNos,
    departmentNames,
    cached,
    complete: config.enabled ? completeWithModel : null,
  });
  if (chosen.origin === "model") await saveConclusion(db, departmentId, settings.dataVersion, chosen.text, chosen.origin);
  await recordAccess(db, user.id, user.name, departmentId, facts.name);
  const view = buildLeaderView(result, departmentId, { exact, conclusionText: chosen.text, conclusionOrigin: chosen.origin });
  view.options = visible
    .map((id) => departments.find((department) => department.id === id))
    .filter((department): department is NonNullable<typeof department> => Boolean(department))
    .map((department) => ({ id: department.id, name: department.name }));
  return view;
}

export async function openBaseline(user: HeadcountUser) {
  if (!can(user, "viewBusiness") || user.role === "leader") throw new Error("无权查看底座");
  const { db, visible } = await scopeFor(user);
  const plan = await loadPlan(db, { departmentIds: visible, sensitive: can(user, "viewOneOff") });
  const result = computePlan(plan);
  return { rows: buildBaselineRows(result), cards: companyCards(result), asOf: plan.asOf, year: plan.year };
}

export async function importContext(user: HeadcountUser) {
  const { departments } = await scopeFor(user);
  const db = await getDb();
  const settings = await loadSettings(db);
  const names = new Map(departments.map((department) => [department.id, department.name]));
  const parentOfName = new Map(departments.map((department) => [department.name, department.parentId ? names.get(department.parentId) ?? null : null]));
  return {
    departments: departments.map((department) => department.name),
    grades: Object.keys((await loadPlan(db, { departmentIds: [], sensitive: false })).gradeAnnual),
    cities: ["北京", "上海", "杭州", "成都"],
    year: settings.year,
    asOf: settings.asOf,
    parentNames: Object.fromEntries(parentOfName),
    departmentRows: departments,
    budgets: (await loadPlan(db, { departmentIds: null, sensitive: true })).budgets,
    oneOffBudget: (await loadSettings(db)).oneOffBudget,
  };
}
