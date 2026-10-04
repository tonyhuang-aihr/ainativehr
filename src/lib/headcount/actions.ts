"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { can, type HeadcountRole } from "@/lib/headcount/authz";
import { parseBudgetBatch, parseQuotaBatch } from "@/lib/headcount/configBatch";
import { getDb } from "@/lib/headcount/db/client";
import { scopeFor } from "@/lib/headcount/db/present";
import { loadPlan } from "@/lib/headcount/db/queries";
import { loadScenarioDefinitions, saveScenarioDefinition } from "@/lib/headcount/db/scenarios";
import { computePlan } from "@/lib/headcount/engine";
import { askHeadcountModel, modelConfigured } from "@/lib/headcount/modelClient";
import { parseScenarioFile } from "@/lib/data/scenarioFile";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { defaultAssumptions, type ScenarioAssumptions, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { scenarioFitsScope, seesCompany } from "@/lib/headcount/scopeGuard";
import { assumptionUnits, copyScenario, quarterDate, resolvePrefill, setCompared } from "@/lib/headcount/scenarioView";
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
import { isDemo } from "@/lib/headcount/env";
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

async function scenarioScope(user: { id: string; role: HeadcountRole; departmentIds: string[] }) {
  const scoped = await scopeFor(user);
  const companyWide = seesCompany(user);
  const allowed = new Set(scoped.departments.filter((department) => scoped.visible.includes(department.id)).map((department) => department.name));
  return { ...scoped, companyWide, allowed, names: scoped.departments.map((department) => department.name) };
}

function visibleDefinitions(definitions: ScenarioDefinition[], scope: Awaited<ReturnType<typeof scenarioScope>>) {
  return definitions.filter((definition) => scenarioFitsScope(definition, scope.allowed, scope.names, scope.companyWide));
}

function quarterValue(value: FormDataEntryValue | null): 1 | 2 | 3 | 4 {
  const quarter = Number(value ?? 2);
  if (quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4) return quarter;
  return 2;
}

export async function copyScenarioAction(formData: FormData) {
  const user = await scenarioActor();
  const db = await getDb();
  const scope = await scenarioScope(user);
  const definitions = visibleDefinitions(await loadScenarioDefinitions(db), scope);
  const copy = copyScenario(definitions, String(formData.get("id") ?? ""), `copy-${Date.now()}`);
  if (!copy || !scenarioFitsScope(copy, scope.allowed, scope.names, scope.companyWide)) scenarioNotice("无权查看");
  await saveScenarioDefinition(db, copy);
  await recordOperation(db, user.id, user.name, "复制场景", copy.name);
  scenarioNotice(`已复制为${copy.name}`, copy.id);
}

export async function toggleScenarioAction(formData: FormData) {
  const user = await scenarioActor();
  const db = await getDb();
  const definitions = visibleDefinitions(await loadScenarioDefinitions(db), await scenarioScope(user));
  const id = String(formData.get("id") ?? "");
  const next = setCompared(definitions, id, formData.get("compared") === "on");
  if (next.error) scenarioNotice(next.error, id);
  const updated = next.definitions.find((item) => item.id === id);
  if (!updated) scenarioNotice("无权查看");
  await saveScenarioDefinition(db, updated);
  await recordOperation(db, user.id, user.name, "场景对比", `${updated.name} ${updated.compared ? "加入" : "移出"}`);
  scenarioNotice(updated.compared ? `${updated.name}已加入对比` : `${updated.name}已移出对比`, id);
}

export async function saveAssumptionsAction(formData: FormData) {
  const user = await scenarioActor();
  const db = await getDb();
  const definitions = visibleDefinitions(await loadScenarioDefinitions(db), await scenarioScope(user));
  const id = String(formData.get("id") ?? "");
  const current = definitions.find((item) => item.id === id);
  if (!current) scenarioNotice("无权查看");
  const attrition = Number(formData.get("attrition") ?? "");
  const cycle = Number(formData.get("cycle") ?? "");
  const raise = Number(formData.get("raise") ?? "");
  const aiRaw = String(formData.get("ai") ?? "").trim();
  const ai = aiRaw === "" ? null : Number(aiRaw);
  if (![attrition, cycle, raise].every((value) => Number.isFinite(value)) || (ai != null && !Number.isFinite(ai))) scenarioNotice("假设没有写成数字", id);
  const assumptions: ScenarioAssumptions = defaultAssumptions({
    attritionRate: attrition / 100,
    hiringCycleDays: Math.round(cycle),
    raiseRate: raise / 100,
    aiReplacement: ai == null ? null : ai / 100,
    noticePay: formData.get("noticePay") === "on",
  });
  const next: ScenarioDefinition = { ...current, assumptions, assumptionOrigin: "od" };
  await saveScenarioDefinition(db, next);
  await recordOperation(db, user.id, user.name, "调整场景假设", current.name);
  scenarioNotice("假设已保存", id);
}

export async function addScenarioChangeAction(formData: FormData) {
  const user = await scenarioActor();
  const db = await getDb();
  const scope = await scenarioScope(user);
  const definitions = visibleDefinitions(await loadScenarioDefinitions(db), scope);
  const id = String(formData.get("id") ?? "");
  const current = definitions.find((item) => item.id === id);
  if (!current) scenarioNotice("无权查看");
  const kind = String(formData.get("kind") ?? "");
  const count = Number(formData.get("count") ?? "");
  const effectiveDate = quarterDate(quarterValue(formData.get("quarter")));
  if (!Number.isInteger(count) || count <= 0) scenarioNotice("人数要写成正整数", id);
  const next: ScenarioDefinition = { ...current, hires: [...current.hires], agents: [...current.agents], cuts: [...current.cuts] };
  if (kind === "hire") {
    next.hires.push({ departmentName: String(formData.get("department") ?? ""), grade: String(formData.get("grade") ?? ""), count, effectiveDate });
  } else if (kind === "agent") {
    const monthly = Number(formData.get("monthly") ?? "");
    const oneOff = Number(formData.get("oneOff") ?? 0);
    if (!Number.isFinite(monthly) || !Number.isFinite(oneOff)) scenarioNotice("Agent 费用没有写成数字", id);
    next.agents.push({ name: String(formData.get("agentName") ?? "新增 Agent"), count, monthly, effectiveDate, oneOff });
  } else if (kind === "cut") {
    const mark = String(formData.get("mark") ?? "N");
    const tenureYears = Number(formData.get("tenure") ?? "");
    if (mark !== "N" && mark !== "N+1" && mark !== "不计") scenarioNotice("补偿口径不对", id);
    if (!Number.isFinite(tenureYears)) scenarioNotice("平均司龄没有写成数字", id);
    next.cuts.push({
      departmentName: String(formData.get("department") ?? ""),
      grade: String(formData.get("grade") ?? ""),
      count,
      effectiveDate,
      mark,
      tenureYears,
      groupSize: count,
    });
  } else scenarioNotice("变动类型不对", id);
  if (!scenarioFitsScope(next, scope.allowed, scope.names, scope.companyWide)) scenarioNotice("无权查看");
  await saveScenarioDefinition(db, next);
  await recordOperation(db, user.id, user.name, "按季调整场景", `${current.name} ${kind} ${effectiveDate}`);
  scenarioNotice("这一季的变动已记入场景", id);
}

async function storeImported(user: { id: string; name: string }, definition: ScenarioDefinition) {
  const db = await getDb();
  const definitions = await loadScenarioDefinitions(db);
  const others = definitions.filter((item) => item.compared && item.id !== definition.id).length;
  const next = { ...definition, compared: others >= 3 ? false : definition.compared };
  await saveScenarioDefinition(db, next);
  await recordOperation(db, user.id, user.name, "导入沙盘方案", next.structureNote ?? next.name);
  scenarioNotice(`已导入${next.name}。${next.structureNote ?? ""} 人 : AI ${next.ratio}。花名册没有写入。`, next.id);
}

export async function importSampleSandboxAction(formData: FormData) {
  const user = await scenarioActor();
  const definition = scenarioFromSandbox(buildRdCenterWorkspace(), quarterValue(formData.get("quarter")));
  const scope = await scenarioScope(user);
  if (!scenarioFitsScope(definition, scope.allowed, scope.names, scope.companyWide)) scenarioNotice("无权查看");
  await storeImported(user, definition);
}

export async function importSandboxFileAction(formData: FormData) {
  const user = await scenarioActor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) scenarioNotice("请选择沙盘导出的方案文件");
  const workspace = parseScenarioFile(await file.text());
  if (!workspace) scenarioNotice("这不是沙盘导出的方案文件");
  const definition = scenarioFromSandbox(workspace, quarterValue(formData.get("quarter")));
  const scope = await scenarioScope(user);
  if (!scenarioFitsScope(definition, scope.allowed, scope.names, scope.companyWide)) scenarioNotice("无权查看");
  await storeImported(user, definition);
}

export async function prefillAssumptionsAction(formData: FormData) {
  const user = await scenarioActor();
  const db = await getDb();
  const scope = await scenarioScope(user);
  const id = String(formData.get("id") ?? "");
  const definitions = visibleDefinitions(await loadScenarioDefinitions(db), scope);
  const current = definitions.find((item) => item.id === id);
  if (!current) scenarioNotice("无权查看");
  const plan = await loadPlan(db, { departmentIds: scope.companyWide ? null : scope.visible, sensitive: can(user, "viewOneOff") });
  const units = assumptionUnits(computePlan(plan));
  const resolved = await resolvePrefill(units, modelConfigured() ? askHeadcountModel : null);
  await saveScenarioDefinition(db, { ...current, assumptions: resolved.assumptions, assumptionOrigin: resolved.origin });
  await recordOperation(db, user.id, user.name, "预填场景假设", `${current.name} ${resolved.origin}`);
  scenarioNotice(resolved.note, id);
}

export async function purgeLogsAction() {
  const user = await currentUser();
  if (!user || !can(user, "wipe")) notice("/headcount/admin", "只有系统管理员可以清理日志");
  await purgeExpiredLogs(await getDb());
  notice("/headcount/admin", "只删除了超过 6 个月的日志");
}
