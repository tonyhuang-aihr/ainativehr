import { eq, lt } from "drizzle-orm";
import type { HeadcountRole } from "@/lib/headcount/authz";
import { buildClosure } from "@/lib/headcount/authz";
import type { AppDatabase } from "@/lib/headcount/db/client";
import { loadDepartments, loadSettings } from "@/lib/headcount/db/queries";
import * as schema from "@/lib/headcount/db/schema";
import { clearBusiness, insertBlankPlan, seedSample } from "@/lib/headcount/db/seed";
import { hashPassword, passwordIssue } from "@/lib/headcount/password";
import { retentionCutoff } from "@/lib/headcount/retention";

async function bump(db: AppDatabase, userId: string, userName: string, action: string, detail: string) {
  const settings = await loadSettings(db);
  const version = `edited-${settings.year}-${Date.now()}`;
  await db.update(schema.planSettings).set({ dataVersion: version }).where(eq(schema.planSettings.id, 1));
  await db.insert(schema.operationLogs).values({ userId, userName, action, detail, createdAt: Date.now() });
}

export async function recordOperation(db: AppDatabase, userId: string, userName: string, action: string, detail: string) {
  await db.insert(schema.operationLogs).values({ userId, userName, action, detail, createdAt: Date.now() });
}

export async function recordAccess(db: AppDatabase, userId: string, userName: string, departmentId: string, departmentName: string) {
  await db.insert(schema.accessLogs).values({
    userId,
    userName,
    departmentId,
    departmentName,
    createdAt: Date.now(),
  });
}

export async function saveConclusion(db: AppDatabase, departmentId: string, dataVersion: string, sentence: string, origin: string) {
  await db
    .insert(schema.aiConclusions)
    .values({ departmentId, dataVersion, sentence, origin, createdAt: Date.now() })
    .onConflictDoUpdate({
      target: [schema.aiConclusions.departmentId, schema.aiConclusions.dataVersion],
      set: { sentence, origin, createdAt: Date.now() },
    });
}

export async function setExactForLeaders(db: AppDatabase, enabled: boolean, userId: string, userName: string) {
  await db.update(schema.planSettings).set({ exactForLeaders: enabled }).where(eq(schema.planSettings.id, 1));
  await db.insert(schema.toggleLogs).values({ userId, userName, enabled, createdAt: Date.now() });
  await bump(db, userId, userName, "精确估算开关", enabled ? "打开" : "关闭");
}

export async function setDepartmentBudget(db: AppDatabase, departmentId: string, amount: number, userId: string, userName: string) {
  const settings = await loadSettings(db);
  await db
    .insert(schema.departmentBudgets)
    .values({ departmentId, year: settings.year, amount, source: "manual", version: 1 })
    .onConflictDoUpdate({
      target: schema.departmentBudgets.departmentId,
      set: { amount, source: "manual" },
    });
  await bump(db, userId, userName, "部门预算", `${departmentId} ${amount}`);
}

export async function setGradeAnnual(db: AppDatabase, grade: string, annualCost: number, userId: string, userName: string, monthlyBaseWage: number | null = null) {
  const settings = await loadSettings(db);
  await db
    .insert(schema.gradeBands)
    .values({ grade, annualCost, monthlyBaseWage, year: settings.year, source: "manual", version: 1 })
    .onConflictDoUpdate({ target: schema.gradeBands.grade, set: { annualCost, monthlyBaseWage } });
  await bump(db, userId, userName, "职级成本", `${grade} 年 ${annualCost} 月工资基数 ${monthlyBaseWage ?? "空"}`);
}

export async function setCityWage(db: AppDatabase, city: string, monthlyAvg: number, userId: string, userName: string) {
  const settings = await loadSettings(db);
  await db
    .insert(schema.cityWages)
    .values({ city, year: settings.year - 1, monthlyAvg, sourceNote: "手工录入", updatedOn: settings.asOf })
    .onConflictDoUpdate({ target: schema.cityWages.city, set: { monthlyAvg, sourceNote: "手工录入", updatedOn: settings.asOf } });
  await bump(db, userId, userName, "城市社平", `${city} ${monthlyAvg}`);
}

export async function setQuota(db: AppDatabase, departmentId: string, quotaFormal: number, quotaAgent: number, userId: string, userName: string) {
  await db.update(schema.departments).set({ quotaFormal, quotaAgent, source: "manual" }).where(eq(schema.departments.id, departmentId));
  await bump(db, userId, userName, "编制", `${departmentId} 人 ${quotaFormal} Agent ${quotaAgent}`);
}

export async function setOneOffBudget(db: AppDatabase, amount: number | null, userId: string, userName: string) {
  await db.update(schema.planSettings).set({ oneOffBudget: amount }).where(eq(schema.planSettings.id, 1));
  await bump(db, userId, userName, "一次性预算池", amount == null ? "清空" : String(amount));
}

export async function createAccount(
  db: AppDatabase,
  input: { username: string; name: string; password: string; role: HeadcountRole; departmentId: string },
  actorId: string,
  actorName: string,
) {
  const issue = passwordIssue(input.password);
  if (issue) return issue;
  const username = input.username.trim();
  if (!/^[a-zA-Z0-9._-]{2,32}$/.test(username)) return "用户名用 2 到 32 位字母、数字、点或横线";
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).limit(1);
  if (existing.length) return "用户名已存在";
  const hash = await hashPassword(input.password);
  await db.insert(schema.users).values({
    id: username,
    username,
    name: input.name.trim() || username,
    passwordHash: hash,
    role: input.role,
    status: "active",
    failedAttempts: 0,
    lockedUntil: null,
  });
  if (input.departmentId) {
    await db.insert(schema.userDepartments).values({ userId: username, departmentId: input.departmentId });
  }
  await recordOperation(db, actorId, actorName, "新建账号", `${username} ${input.role}`);
  return null;
}

export async function bindAccount(db: AppDatabase, userId: string, departmentId: string, actorId: string, actorName: string) {
  await db.delete(schema.userDepartments).where(eq(schema.userDepartments.userId, userId));
  if (departmentId) await db.insert(schema.userDepartments).values({ userId, departmentId });
  await recordOperation(db, actorId, actorName, "绑定部门", `${userId} ${departmentId || "无"}`);
}

export async function wipeOnline(db: AppDatabase, actorId: string, actorName: string) {
  await clearBusiness(db);
  await insertBlankPlan(db);
  await recordOperation(db, actorId, actorName, "清除在线数据", "已清除业务数据和日志，账号保留");
}

export async function restoreSampleData(db: AppDatabase, actorId: string, actorName: string) {
  await clearBusiness(db);
  await seedSample(db);
  await recordOperation(db, actorId, actorName, "恢复示例数据", "重新写入示例公司");
}

export async function rebuildClosure(db: AppDatabase) {
  const departments = await loadDepartments(db);
  await db.delete(schema.departmentClosure);
  const rows = buildClosure(departments);
  if (rows.length) await db.insert(schema.departmentClosure).values(rows);
}

export async function purgeExpiredLogs(db: AppDatabase, now = Date.now()) {
  const cutoff = retentionCutoff(now);
  await db.delete(schema.accessLogs).where(lt(schema.accessLogs.createdAt, cutoff));
  await db.delete(schema.toggleLogs).where(lt(schema.toggleLogs.createdAt, cutoff));
  await db.delete(schema.operationLogs).where(lt(schema.operationLogs.createdAt, cutoff));
}

export async function findUserByUsername(db: AppDatabase, username: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
  return rows[0] ?? null;
}

export async function userDepartmentIds(db: AppDatabase, userId: string) {
  const rows = await db.select().from(schema.userDepartments).where(eq(schema.userDepartments.userId, userId));
  return rows.map((row) => row.departmentId);
}

export async function markLoginFailure(db: AppDatabase, userId: string, failures: number, lockedUntil: number | null) {
  await db.update(schema.users).set({ failedAttempts: failures, lockedUntil }).where(eq(schema.users.id, userId));
}

export async function markLoginSuccess(db: AppDatabase, userId: string, userName: string) {
  await db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, userId));
  await recordOperation(db, userId, userName, "登录", "成功");
}

