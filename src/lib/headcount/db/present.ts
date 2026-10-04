import "server-only";

import { resolveLlmConfig } from "@/lib/ai/llmConfig";
import type { ChatTurn } from "@/lib/ai/desensitize";
import { can, visibleDepartmentIds, type HeadcountUser } from "@/lib/headcount/authz";
import { assertDepartmentVisible, DepartmentMissing, ScopeDenied, seesCompany } from "@/lib/headcount/scopeGuard";
import { chooseConclusion, conclusionFacts, directChildFacts } from "@/lib/headcount/conclusion";
import { buildScopeOverview, maskPageCosts, pageKind, scopeHasSmallGroup, scopeRoots, type ScopeOverview } from "@/lib/headcount/overview";
import { getDb } from "@/lib/headcount/db/client";
import { recordAccess, saveConclusion } from "@/lib/headcount/db/mutate";
import { loadCachedConclusion, loadClosure, loadDepartments, loadPlan, loadSettings } from "@/lib/headcount/db/queries";
import { computePlan } from "@/lib/headcount/engine";
import { buildLeaderView, type LeaderView } from "@/lib/headcount/leaderView";
import type { DetailQuery } from "@/lib/headcount/rosterPage";

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

export type LeaderScreen = { kind: "overview"; overview: ScopeOverview; view: LeaderView } | { kind: "detail"; view: LeaderView };

export async function openLeader(user: SessionUser, requestedId?: string, detail?: DetailQuery): Promise<LeaderScreen> {
  if (!can(user, "viewLeader") && !can(user, "viewBusiness")) throw new Error("无权查看");
  if (user.role === "sys_admin") throw new Error("无权查看");
  const { db, departments, visible } = await scopeFor(user);
  if (requestedId && !departments.some((department) => department.id === requestedId)) throw new DepartmentMissing();
  if (requestedId && !visible.includes(requestedId)) throw new ScopeDenied("部门不在授权范围");
  const requested = requestedId && visible.includes(requestedId) ? requestedId : null;
  const roots = scopeRoots(departments, visible);
  const departmentId = requested ?? roots[0] ?? visible[0];
  if (!departmentId) throw new Error("没有可查看的部门");
  const settings = await loadSettings(db);
  const plan = await loadPlan(db, { departmentIds: visible, sensitive: false });
  const result = computePlan(plan);
  const facts = conclusionFacts(result, departmentId);
  await recordAccess(db, user.id, user.name, departmentId, facts.name);
  if (pageKind(departmentId, departments, visible) === "overview") {
    const ranges = user.role === "leader" && scopeHasSmallGroup(result, visible);
    const overviewAudience = user.role === "leader" ? "leader" : user.role === "hrbp" ? "hrbp" : "od";
    const overview = buildScopeOverview(result, departmentId, overviewAudience, ranges);
    const view = buildLeaderView(result, departmentId, {
      exact: !ranges,
      maskCosts: ranges,
      showMarks: false,
      copyAudience: "leader",
      companyScope: false,
      listBase: `/headcount/leader?dept=${departmentId}`,
      detail,
    });
    return { kind: "overview", overview, view };
  }
  const mask = user.role === "leader" && maskPageCosts(result, visible, departmentId);
  const names = plan.people.map((person) => person.name);
  const employeeNos = plan.people.map((person) => person.employeeNo);
  const departmentNames = departments.map((department) => department.name);
  const cached = mask ? null : await loadCachedConclusion(db, departmentId, settings.dataVersion);
  const config = resolveLlmConfig({ LLM_API_KEY: process.env.LLM_API_KEY });
  const chosen = mask
    ? { text: "", origin: "template" as const }
    : await chooseConclusion({
        root: facts,
        children: directChildFacts(result, departmentId),
        names,
        employeeNos,
        departmentNames,
        cached,
        complete: config.enabled ? completeWithModel : null,
      });
  if (chosen.origin === "model") await saveConclusion(db, departmentId, settings.dataVersion, chosen.text, chosen.origin);
  const back = roots.length === 1 && roots[0] !== departmentId ? "/headcount/leader" : null;
  const view = buildLeaderView(result, departmentId, {
    exact: settings.exactForLeaders && !mask,
    maskCosts: mask,
    backHref: back,
    listBase: `/headcount/leader?dept=${departmentId}`,
    detail,
    conclusionText: chosen.text || undefined,
    conclusionOrigin: chosen.origin,
  });
  view.options = visible
    .map((id) => departments.find((department) => department.id === id))
    .filter((department): department is NonNullable<typeof department> => Boolean(department))
    .map((department) => ({ id: department.id, name: department.name }));
  return { kind: "detail", view };
}

export async function openBaseline(user: HeadcountUser, detail?: DetailQuery) {
  if (!can(user, "viewBusiness") || user.role === "leader") throw new Error("无权查看底座");
  const { db, visible, departments } = await scopeFor(user);
  const plan = await loadPlan(db, { departmentIds: visible, sensitive: can(user, "viewOneOff") });
  const result = computePlan(plan);
  const root = scopeRoots(departments, visible)[0];
  if (!root) throw new Error("没有可查看的部门");
  const company = seesCompany(user);
  const overview = buildScopeOverview(result, root, company ? "od" : "hrbp", false);
  const view = buildLeaderView(result, root, {
    exact: true,
    showMarks: can(user, "viewCompensation"),
    copyAudience: company ? "od" : "leader",
    companyScope: company,
    listBase: "/headcount/baseline",
    detail,
  });
  return { overview, view, asOf: plan.asOf, year: plan.year };
}

export async function assertKnownDepartment(departmentId: string): Promise<void> {
  const db = await getDb();
  const departments = await loadDepartments(db);
  if (!departments.some((department) => department.id === departmentId)) throw new DepartmentMissing();
}

export async function openDepartment(user: HeadcountUser, departmentId: string, detail?: DetailQuery) {
  if (!can(user, "viewBusiness") || user.role === "leader") throw new ScopeDenied("无权查看底座");
  const { db, visible, departments } = await scopeFor(user);
  if (!departments.some((department) => department.id === departmentId)) throw new DepartmentMissing();
  assertDepartmentVisible(visible, departmentId);
  const plan = await loadPlan(db, { departmentIds: visible, sensitive: can(user, "viewOneOff") });
  const result = computePlan(plan);
  const facts = conclusionFacts(result, departmentId);
  const names = plan.people.map((person) => person.name);
  const employeeNos = plan.people.map((person) => person.employeeNo);
  const chosen = await chooseConclusion({
    root: facts,
    children: directChildFacts(result, departmentId),
    names,
    employeeNos,
    departmentNames: departments.map((department) => department.name),
    cached: null,
    complete: null,
  });
  const view = buildLeaderView(result, departmentId, {
    exact: true,
    maskCosts: false,
    showMarks: can(user, "viewCompensation"),
    copyAudience: seesCompany(user) ? "od" : "leader",
    companyScope: false,
    backHref: "/headcount/baseline",
    listBase: `/headcount/baseline/${departmentId}`,
    detail,
    conclusionText: chosen.text,
    conclusionOrigin: chosen.origin,
  });
  view.options = visible
    .map((id) => departments.find((department) => department.id === id))
    .filter((department): department is NonNullable<typeof department> => Boolean(department))
    .map((department) => ({ id: department.id, name: department.name }));
  const marks: Record<string, string> = {};
  if (can(user, "viewCompensation")) {
    for (const movement of plan.movements) {
      if (movement.kind !== "离职") continue;
      marks[`${movement.name}|离职 · ${movement.effectiveDate}`] = movement.compMark ?? "—";
    }
  }
  return { view, marks, showMarks: can(user, "viewCompensation") };
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
