"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { can, type HeadcountRole } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
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
  if (!user || !can(user, "manageUsers")) notice("/headcount/admin", "只有系统管理员可以改绑定");
  await bindAccount(await getDb(), String(formData.get("userId") ?? ""), String(formData.get("departmentId") ?? ""), user.id, user.name);
  notice("/headcount/admin", "部门绑定已更新");
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

export async function purgeLogsAction() {
  const user = await currentUser();
  if (!user || !can(user, "viewLogs")) notice("/headcount/admin", "只有系统管理员可以清理日志");
  await purgeExpiredLogs(await getDb());
  notice("/headcount/admin", "只删除了超过 6 个月的日志");
}
