"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { can, type HeadcountRole } from "@/lib/headcount/authz";
import { parseBudgetBatch, parseQuotaBatch } from "@/lib/headcount/configBatch";
import { getDb } from "@/lib/headcount/db/client";
import { loadPlan } from "@/lib/headcount/db/queries";
import { computePlan } from "@/lib/headcount/engine";
import { askHeadcountModel, modelConfigured } from "@/lib/headcount/modelClient";
import { parseScenarioFile } from "@/lib/data/scenarioFile";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { normalizeScenarioDefinition, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { assumptionUnits, resolvePrefill } from "@/lib/headcount/scenarioView";
import { commitScenarioMemory, openScenarioMemory } from "@/lib/headcount/scenarioMemoryStore";
import { ScenarioStateTooLarge } from "@/lib/headcount/scenarioCookieCodec";
import { acceptStoredScenarios, mergeScenarioState, scenarioDelta } from "@/lib/headcount/scenarioState";
import { executeScenarioCommand, visibleScenarioCatalog, type ScenarioCommand, type WriteScope } from "@/lib/headcount/scenarioWrites";
import {
  bindAccount,
  createAccount,
  purgeExpiredLogs,
  recordOperation,
  restoreSampleData,
  setCityWage,
  setDepartmentBudget,
  setExactForLeaders,
  setGradeAnnual,
  setOneOffBudget,
  setQuota,
  wipeOnline,
} from "@/lib/headcount/db/mutate";
import { listUsers, loadDepartments } from "@/lib/headcount/db/queries";
import { isDemo, usesEphemeralDb } from "@/lib/headcount/env";
import { currentUser } from "@/lib/headcount/session";

function notice(path: string, message: string): never {
  redirect(`${path}?notice=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/headcount",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/headcount/login?error=1");
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/headcount/login" });
}

export async function commitImportAction() {
  const user = await currentUser();
  if (!user || !can(user, "import")) notice("/headcount/login", "需要登录");
  const db = await getDb();
  if (isDemo()) {
    await recordOperation(db, user.id, user.name, "导入", "演示环境忽略上传内容，保留示例数据");
    notice("/headcount/import", "演示环境 · 示例数据仍在使用。上传只在浏览器里做了校验，没有写入。");
  }
  await recordOperation(db, user.id, user.name, "导入", "非演示环境的花名册写入尚未接通，未改动现有数据");
  notice("/headcount/import", "这一环境还没有接通正式花名册写入。");
}

export async function budgetAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  const departmentId = String(formData.get("departmentId") ?? "");
  const amount = Number(formData.get("amount") ?? "");
  if (!departmentId || !Number.isFinite(amount)) notice("/headcount/import", "预算没有写成数字");
  await setDepartmentBudget(await getDb(), departmentId, Math.round(amount), user.id, user.name);
  revalidatePath("/headcount");
  notice("/headcount/import", "部门预算已保存");
}

export async function gradeAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  const grade = String(formData.get("grade") ?? "").trim();
  const amount = Number(formData.get("amount") ?? "");
  const monthlyRaw = String(formData.get("monthly") ?? "").trim();
  const monthly = monthlyRaw === "" ? null : Number(monthlyRaw);
  if (!grade || !Number.isFinite(amount) || (monthly != null && !Number.isFinite(monthly))) notice("/headcount/import", "职级成本没有写成数字");
  await setGradeAnnual(await getDb(), grade, Math.round(amount), user.id, user.name, monthly == null ? null : Math.round(monthly));
  notice("/headcount/import", "职级成本已保存");
}

export async function cityAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  const city = String(formData.get("city") ?? "").trim();
  const amount = Number(formData.get("amount") ?? "");
  if (!city || !Number.isFinite(amount)) notice("/headcount/import", "城市工资没有写成数字");
  await setCityWage(await getDb(), city, Math.round(amount), user.id, user.name);
  notice("/headcount/import", "城市社平已保存");
}

export async function quotaAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  const departmentId = String(formData.get("departmentId") ?? "");
  const formal = Number(formData.get("formal") ?? "");
  const agent = Number(formData.get("agent") ?? "");
  if (!departmentId || !Number.isFinite(formal) || !Number.isFinite(agent)) notice("/headcount/import", "编制没有写成数字");
  await setQuota(await getDb(), departmentId, Math.round(formal), Math.round(agent), user.id, user.name);
  notice("/headcount/import", "编制已保存");
}

function departmentIdOf(departments: { id: string; name: string }[], key: string): string | null {
  return departments.find((department) => department.id === key || department.name === key)?.id ?? null;
}

export async function budgetBatchAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  let rows;
  try {
    rows = parseBudgetBatch(String(formData.get("lines") ?? ""));
  } catch (error) {
    notice("/headcount/import", error instanceof Error ? error.message : "无法导入预算");
  }
  if (rows.length === 0) notice("/headcount/import", "没有可导入的预算");
  const db = await getDb();
  const departments = await loadDepartments(db);
  for (const row of rows) {
    const departmentId = departmentIdOf(departments, row.key);
    if (!departmentId) notice("/headcount/import", `找不到部门 ${row.key}`);
    await setDepartmentBudget(db, departmentId, row.amount, user.id, user.name);
  }
  notice("/headcount/import", `已导入 ${rows.length} 条部门预算`);
}

export async function quotaBatchAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  let rows;
  try {
    rows = parseQuotaBatch(String(formData.get("lines") ?? ""));
  } catch (error) {
    notice("/headcount/import", error instanceof Error ? error.message : "无法导入编制");
  }
  if (rows.length === 0) notice("/headcount/import", "没有可导入的编制");
  const db = await getDb();
  const departments = await loadDepartments(db);
  for (const row of rows) {
    const departmentId = departmentIdOf(departments, row.key);
    if (!departmentId) notice("/headcount/import", `找不到部门 ${row.key}`);
    await setQuota(db, departmentId, row.formal, row.agent, user.id, user.name);
  }
  notice("/headcount/import", `已导入 ${rows.length} 条编制`);
}

export async function oneOffBudgetAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  const raw = String(formData.get("amount") ?? "").trim();
  const amount = raw === "" ? null : Number(raw);
  if (amount != null && !Number.isFinite(amount)) notice("/headcount/import", "预算池没有写成数字");
  await setOneOffBudget(await getDb(), amount == null ? null : Math.round(amount), user.id, user.name);
  notice("/headcount/import", "一次性费用预算池已保存");
}

export async function exactAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "toggleExact")) notice("/headcount/admin", "只有 HR 管理员可以改这个开关");
  await setExactForLeaders(await getDb(), formData.get("enabled") === "on", user.id, user.name);
  notice("/headcount/admin", "精确估算开关已更新，并写入日志");
}

export async function createUserAction(formData: FormData) {
  const user = await currentUser();
  if (!user || !can(user, "manageUsers")) notice("/headcount/admin", "只有系统管理员可以建账号");
  const role = String(formData.get("role") ?? "") as HeadcountRole;
  if (role !== "od" && role !== "hrbp" && role !== "leader" && role !== "hr_admin" && role !== "sys_admin") notice("/headcount/admin", "角色不对");
  const issue = await createAccount(
    await getDb(),
    {
      username: String(formData.get("username") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
      role,
      departmentId: String(formData.get("departmentId") ?? ""),
    },
    user.id,
    user.name,
  );
  notice("/headcount/admin", issue ?? "账号已创建");
}

export async function bindUserAction(formData: FormData) {
  const user = await currentUser();
  const userId = String(formData.get("userId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const db = await getDb();
  if (user && can(user, "manageUsers")) {
    await bindAccount(db, userId, departmentId, user.id, user.name);
    notice("/headcount/admin", "部门绑定已更新");
  }
  if (!user || !can(user, "editConfig")) notice("/headcount/login", "需要登录");
  const target = (await listUsers(db)).find((account) => account.id === userId);
  if (!target || (target.role !== "leader" && target.role !== "hrbp")) notice("/headcount/import", "只能绑定业务负责人和 HRBP");
  await bindAccount(db, userId, departmentId, user.id, user.name);
  notice("/headcount/import", "部门绑定已更新");
}

export async function wipeAction() {
  const user = await currentUser();
  if (!user || !can(user, "wipe")) notice("/headcount/admin", "只有系统管理员可以清除");
  await wipeOnline(await getDb(), user.id, user.name);
  notice("/headcount/admin", "在线业务数据和日志已清除。账号还在。演示环境不会自动灌回示例。");
}

export async function restoreAction() {
  const user = await currentUser();
  if (!user || !can(user, "wipe")) notice("/headcount/admin", "只有系统管理员可以恢复示例");
  await restoreSampleData(await getDb(), user.id, user.name);
  notice("/headcount/admin", "示例公司已恢复");
}

function scenarioNotice(message: string, focus?: string): never {
  const params = new URLSearchParams({ notice: message });
  if (focus) params.set("focus", focus);
  redirect(`/headcount/scenarios?${params.toString()}`);
}

async function scenarioActor() {
  const user = await currentUser();
  if (!user || !can(user, "viewScenarios")) notice("/headcount/login", "需要登录");
  return user;
}

function writeScopeOf(memory: Awaited<ReturnType<typeof openScenarioMemory>>): WriteScope {
  const rootName = memory.departments.find((department) => department.id === memory.root)?.name ?? null;
  return {
    companyWide: memory.companyWide,
    allowed: memory.allowed,
    names: memory.names,
    rootId: memory.root,
    rootName,
    result: memory.result,
  };
}

function quarterValue(value: FormDataEntryValue | null): 1 | 2 | 3 | 4 {
  const quarter = Number(value ?? 2);
  if (quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4) return quarter;
  return 2;
}

async function runScenarioCommand(command: ScenarioCommand, log: string) {
  const user = await scenarioActor();
  const memory = await openScenarioMemory(user);
  const scope = writeScopeOf(memory);
  const visible = visibleScenarioCatalog(memory.catalog, scope);
  const outcome = executeScenarioCommand(memory.catalog, visible, scope, command);
  if (!outcome.ok) scenarioNotice(outcome.notice, outcome.focusId);
  try {
    await commitScenarioMemory(memory, outcome.catalog, outcome.changed, outcome.removedId);
  } catch (error) {
    if (error instanceof ScenarioStateTooLarge) scenarioNotice(error.message, outcome.removedId ? undefined : outcome.focusId);
    throw error;
  }
  await recordOperation(memory.db, user.id, user.name, log, outcome.changed?.name ?? outcome.removedId ?? outcome.focusId);
  scenarioNotice(outcome.notice, outcome.removedId ? undefined : outcome.focusId);
}

export async function createScenarioAction(formData: FormData) {
  await runScenarioCommand({ type: "create", name: String(formData.get("name") ?? ""), id: `copy-${Date.now()}` }, "新建场景");
}

export async function renameScenarioAction(formData: FormData) {
  await runScenarioCommand({ type: "rename", id: String(formData.get("id") ?? ""), name: String(formData.get("name") ?? "") }, "重命名场景");
}

export async function copyScenarioAction(formData: FormData) {
  await runScenarioCommand({ type: "copy", sourceId: String(formData.get("id") ?? ""), id: `copy-${Date.now()}` }, "复制场景");
}

export async function deleteScenarioAction(formData: FormData) {
  await runScenarioCommand({ type: "delete", id: String(formData.get("id") ?? "") }, "删除场景");
}

export async function toggleScenarioAction(formData: FormData) {
  await runScenarioCommand({ type: "toggle", id: String(formData.get("id") ?? ""), compared: formData.get("compared") === "on" }, "场景对比");
}

export async function saveAssumptionsAction(formData: FormData) {
  const aiRaw = String(formData.get("ai") ?? "").trim();
  await runScenarioCommand(
    {
      type: "assumptions",
      id: String(formData.get("id") ?? ""),
      attrition: Number(formData.get("attrition") ?? ""),
      cycle: Number(formData.get("cycle") ?? ""),
      raise: Number(formData.get("raise") ?? ""),
      ai: aiRaw === "" ? null : Number(aiRaw),
      noticePay: formData.get("noticePay") === "on",
    },
    "调整场景假设",
  );
}

export async function addScenarioChangeAction(formData: FormData) {
  await runScenarioCommand(
    {
      type: "change",
      id: String(formData.get("id") ?? ""),
      kind: String(formData.get("kind") ?? ""),
      count: Number(formData.get("count") ?? ""),
      quarter: quarterValue(formData.get("quarter")),
      department: String(formData.get("department") ?? ""),
      grade: String(formData.get("grade") ?? ""),
      agentName: String(formData.get("agentName") ?? ""),
      monthly: Number(formData.get("monthly") ?? ""),
      oneOff: Number(formData.get("oneOff") ?? 0),
      mark: String(formData.get("mark") ?? "N"),
      tenure: Number(formData.get("tenure") ?? ""),
    },
    "按季调整场景",
  );
}

export async function restoreLocalSandboxAction(plans: ScenarioDefinition[]): Promise<{ restoredIds: string[]; rejectedIds: string[] }> {
  return adoptDemoStateAction(plans);
}

export async function adoptDemoStateAction(plans: ScenarioDefinition[]): Promise<{ restoredIds: string[]; rejectedIds: string[] }> {
  const user = await currentUser();
  if (!user || !can(user, "viewScenarios") || !usesEphemeralDb()) return { restoredIds: [], rejectedIds: [] };
  const memory = await openScenarioMemory(user);
  const scope = writeScopeOf(memory);
  const restoredIds: string[] = [];
  const rejectedIds: string[] = [];
  const accepted: ScenarioDefinition[] = [];
  for (const raw of plans) {
    let definition: ScenarioDefinition | null = null;
    try {
      definition = raw && typeof raw === "object" && typeof raw.id === "string" ? normalizeScenarioDefinition(raw) : null;
    } catch {
      definition = null;
    }
    if (!definition) {
      if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string") rejectedIds.push(raw.id);
      continue;
    }
    const [kept] = acceptStoredScenarios([definition], scope);
    if (!kept) {
      rejectedIds.push(definition.id);
      continue;
    }
    accepted.push(kept);
    restoredIds.push(kept.id);
  }
  const merged = mergeScenarioState(memory.seed, [...scenarioDelta(memory.seed, memory.catalog), ...accepted]);
  try {
    await commitScenarioMemory(memory, merged, null, null);
  } catch (error) {
    if (error instanceof ScenarioStateTooLarge) return { restoredIds: [], rejectedIds: restoredIds };
    throw error;
  }
  if (restoredIds.length) {
    await recordOperation(memory.db, user.id, user.name, "恢复本机场景", restoredIds.join(","));
    revalidatePath("/headcount/scenarios");
  }
  return { restoredIds, rejectedIds };
}

export async function importSampleSandboxAction(formData: FormData) {
  const definition = scenarioFromSandbox(buildRdCenterWorkspace(), quarterValue(formData.get("quarter")));
  const user = await scenarioActor();
  const memory = await openScenarioMemory(user);
  const id = memory.companyWide ? definition.id : `sandbox-${memory.root ?? "bu"}-${Date.now()}`;
  await runScenarioCommand({ type: "import", definition, id }, "导入沙盘方案");
}

export async function importSandboxFileAction(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) scenarioNotice("请选择沙盘导出的方案文件");
  const workspace = parseScenarioFile(await file.text());
  if (!workspace) scenarioNotice("这不是沙盘导出的方案文件");
  const definition = scenarioFromSandbox(workspace, quarterValue(formData.get("quarter")));
  const user = await scenarioActor();
  const memory = await openScenarioMemory(user);
  const id = memory.companyWide ? definition.id : `sandbox-${memory.root ?? "bu"}-${Date.now()}`;
  await runScenarioCommand({ type: "import", definition, id }, "导入沙盘方案");
}

export async function prefillAssumptionsAction(formData: FormData) {
  const user = await scenarioActor();
  const memory = await openScenarioMemory(user);
  const scope = writeScopeOf(memory);
  const id = String(formData.get("id") ?? "");
  const current = visibleScenarioCatalog(memory.catalog, scope).find((item) => item.id === id);
  if (!current) scenarioNotice("无权查看");
  const plan = await loadPlan(memory.db, { departmentIds: memory.companyWide ? null : memory.visibleIds, sensitive: can(user, "viewOneOff") });
  const units = assumptionUnits(computePlan(plan));
  const resolved = await resolvePrefill(units, modelConfigured() ? askHeadcountModel : null);
  const next = { ...current, assumptions: resolved.assumptions, assumptionOrigin: resolved.origin };
  try {
    await commitScenarioMemory(memory, memory.catalog.map((item) => (item.id === id ? next : item)).concat(memory.catalog.some((item) => item.id === id) ? [] : [next]), next, null);
  } catch (error) {
    if (error instanceof ScenarioStateTooLarge) scenarioNotice(error.message, id);
    throw error;
  }
  await recordOperation(memory.db, user.id, user.name, "预填场景假设", `${current.name} ${resolved.origin}`);
  scenarioNotice(resolved.note, id);
}

export async function purgeLogsAction() {
  const user = await currentUser();
  if (!user || !can(user, "wipe")) notice("/headcount/admin", "只有系统管理员可以清理日志");
  await purgeExpiredLogs(await getDb());
  notice("/headcount/admin", "只删除了超过 6 个月的日志");
}
