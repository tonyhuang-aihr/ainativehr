import { count } from "drizzle-orm";
import { buildClosure } from "@/lib/headcount/authz";
import type { AppDatabase } from "@/lib/headcount/db/client";
import * as schema from "@/lib/headcount/db/schema";
import { hashPassword } from "@/lib/headcount/password";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, OTHER_ANNUAL, samplePlan } from "@/lib/headcount/sample";

export const SAMPLE_VERSION = "sample-2027-1";

async function writeChunks<T>(rows: T[], size: number, write: (part: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += size) {
    const part = rows.slice(index, index + size);
    if (part.length) await write(part);
  }
}

export async function seedIfEmpty(db: AppDatabase) {
  const existing = await db.select({ value: count() }).from(schema.users);
  if ((existing[0]?.value ?? 0) > 0) return;
  await seedSample(db);
}

export async function insertBlankPlan(db: AppDatabase) {
  await db.insert(schema.planSettings).values({
    id: 1,
    year: 2027,
    asOf: "2026-10-04",
    companyBudget: 0,
    oneOffBudget: null,
    exactForLeaders: false,
    dataVersion: "empty",
    source: "manual",
  });
}

export async function clearBusiness(db: AppDatabase) {
  await db.delete(schema.aiConclusions);
  await db.delete(schema.accessLogs);
  await db.delete(schema.toggleLogs);
  await db.delete(schema.operationLogs);
  await db.delete(schema.tenureAverages);
  await db.delete(schema.otherSeats);
  await db.delete(schema.agents);
  await db.delete(schema.movements);
  await db.delete(schema.people);
  await db.delete(schema.departmentBudgets);
  await db.delete(schema.scenarios);
  await db.delete(schema.departmentClosure);
  await db.delete(schema.userDepartments);
  await db.delete(schema.departments);
  await db.delete(schema.gradeBands);
  await db.delete(schema.agentPrices);
  await db.delete(schema.cityWages);
  await db.delete(schema.otherRates);
  await db.delete(schema.planSettings);
}

/** 写入示例公司。账号已存在时不覆盖密码。 */
export async function seedSample(db: AppDatabase, options?: { replaceUsers?: boolean }) {
  const plan = samplePlan();
  const hash = await hashPassword(DEMO_PASSWORD);
  if (options?.replaceUsers) await db.delete(schema.users);
  const existingUsers = await db.select({ id: schema.users.id }).from(schema.users);
  if (existingUsers.length === 0) {
    await db.insert(schema.users).values(
      DEMO_ACCOUNTS.map((account) => ({
        id: account.username,
        username: account.username,
        name: account.name,
        passwordHash: hash,
        role: account.role,
        status: "active",
        failedAttempts: 0,
        lockedUntil: null,
      })),
    );
  }
  await db.insert(schema.departments).values(
    plan.departments.map((department) => ({
      id: department.id,
      name: department.name,
      parentId: department.parentId,
      quotaFormal: department.quotaFormal,
      quotaAgent: department.quotaAgent,
      source: "import",
      version: 1,
    })),
  );
  await db.insert(schema.departmentClosure).values(buildClosure(plan.departments));
  const bindings = DEMO_ACCOUNTS.flatMap((account) => account.departmentIds.map((departmentId) => ({ userId: account.username, departmentId })));
  if (bindings.length) await db.insert(schema.userDepartments).values(bindings);
  await writeChunks(plan.people, 80, (part) =>
    db.insert(schema.people).values(
      part.map((person) => ({
        id: person.id,
        employeeNo: person.employeeNo,
        name: person.name,
        departmentId: person.departmentId,
        title: person.title,
        grade: person.grade,
        managerId: person.managerId,
        isManager: person.isManager,
        employmentType: person.employmentType,
        city: person.city,
        hireDate: person.hireDate ?? null,
        source: person.source,
        version: person.version,
      })),
    ),
  );
  await writeChunks(plan.movements, 40, (part) =>
    db.insert(schema.movements).values(
      part.map((movement) => ({
        id: movement.id,
        kind: movement.kind,
        personName: movement.name,
        employeeNo: movement.employeeNo,
        departmentId: movement.departmentId,
        fromDepartmentId: movement.fromDepartmentId ?? null,
        toDepartmentId: movement.toDepartmentId ?? null,
        title: movement.title,
        grade: movement.grade,
        employmentType: movement.employmentType,
        effectiveDate: movement.effectiveDate,
        compMark: movement.compMark ?? null,
        hireDate: movement.hireDate ?? null,
        city: movement.city ?? null,
        agentType: movement.agentType ?? null,
        instanceDelta: movement.instanceDelta ?? null,
        seatMonthly: movement.seatMonthly ?? null,
        computeMonthly: movement.computeMonthly ?? null,
        oneOff: movement.oneOff ?? null,
        source: movement.source,
        version: movement.version,
      })),
    ),
  );
  await db.insert(schema.agents).values(
    plan.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      agentType: agent.agentType,
      departmentId: agent.departmentId,
      instances: agent.instances,
      seatMonthly: agent.seatMonthly,
      computeMonthly: agent.computeMonthly,
      source: agent.source,
      version: agent.version,
    })),
  );
  await db.insert(schema.gradeBands).values(
    Object.entries(plan.gradeAnnual).map(([grade, annualCost]) => ({
      grade,
      annualCost,
      year: plan.year,
      source: "manual",
      version: 1,
    })),
  );
  const prices = new Map<string, { seat: number; compute: number; oneOff: number }>();
  for (const agent of plan.agents) prices.set(agent.agentType, { seat: agent.seatMonthly, compute: agent.computeMonthly, oneOff: 0 });
  for (const movement of plan.movements) {
    if (!movement.agentType) continue;
    const current = prices.get(movement.agentType) ?? { seat: movement.seatMonthly ?? 0, compute: movement.computeMonthly ?? 0, oneOff: 0 };
    if (movement.seatMonthly) current.seat = movement.seatMonthly;
    if (movement.computeMonthly) current.compute = movement.computeMonthly;
    current.oneOff = Math.max(current.oneOff, movement.oneOff ?? 0);
    prices.set(movement.agentType, current);
  }
  await db.insert(schema.agentPrices).values(
    [...prices.entries()].map(([agentType, price]) => ({
      agentType,
      seatMonthly: price.seat,
      computeMonthly: price.compute,
      oneOff: price.oneOff,
      source: "manual",
      version: 1,
    })),
  );
  await db.insert(schema.cityWages).values(
    Object.entries(plan.cityMonthly).map(([city, monthlyAvg]) => ({
      city,
      year: plan.year - 1,
      monthlyAvg,
      sourceNote: "示例：上年度职工月平均工资",
      updatedOn: plan.asOf,
    })),
  );
  await db.insert(schema.otherRates).values(
    (Object.entries(OTHER_ANNUAL) as [string, number][]).map(([employmentType, annualCost]) => ({ employmentType, annualCost })),
  );
  await db.insert(schema.otherSeats).values(
    plan.others.map((seat) => ({
      id: `${seat.departmentId}:${seat.employmentType}`,
      departmentId: seat.departmentId,
      employmentType: seat.employmentType,
      headcount: seat.count,
    })),
  );
  const budgetRows = Object.entries(plan.budgets).map(([departmentId, amount]) => ({
    departmentId,
    year: plan.year,
    amount,
    source: "manual",
    version: 1,
  }));
  if (budgetRows.length) await db.insert(schema.departmentBudgets).values(budgetRows);
  await db.insert(schema.planSettings).values({
    id: 1,
    year: plan.year,
    asOf: plan.asOf,
    companyBudget: plan.companyBudget,
    oneOffBudget: plan.oneOffBudget,
    exactForLeaders: false,
    dataVersion: SAMPLE_VERSION,
    source: "import",
  });
  if (plan.tenure.length) {
    await db.insert(schema.tenureAverages).values(
      plan.tenure.map((row) => ({
        departmentId: row.departmentId,
        grade: row.grade,
        averageMonths: row.averageMonths,
        headcount: row.count,
      })),
    );
  }
  await db.insert(schema.toggleLogs).values({
    userId: "hradmin",
    userName: "韩管理",
    enabled: false,
    createdAt: Date.parse("2026-10-04T02:15:00Z"),
  });
  await db.insert(schema.scenarios).values({
    id: "later",
    name: "情景与时间线",
    source: "manual",
    version: 1,
    note: "H3、P1、P2 尚未开放",
  });
}
