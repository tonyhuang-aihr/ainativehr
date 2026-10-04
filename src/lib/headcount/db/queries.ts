import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/lib/headcount/db/client";
import * as schema from "@/lib/headcount/db/schema";
import { LEADER_AGENT_COLUMNS, LEADER_MOVEMENT_COLUMNS, LEADER_PERSON_COLUMNS } from "@/lib/headcount/leaderQuery";
import type { AgentSeed, DepartmentNode, EmploymentType, MovementSeed, PersonSeed, PlanInput } from "@/lib/headcount/types";
import type { CompMark } from "@/lib/headcount/severance";
import type { HeadcountRole } from "@/lib/headcount/authz";

const personFields = {
  id: schema.people.id,
  employee_no: schema.people.employeeNo,
  name: schema.people.name,
  department_id: schema.people.departmentId,
  title: schema.people.title,
  grade: schema.people.grade,
  manager_id: schema.people.managerId,
  is_manager: schema.people.isManager,
  employment_type: schema.people.employmentType,
} as const;

const movementFields = {
  id: schema.movements.id,
  kind: schema.movements.kind,
  person_name: schema.movements.personName,
  employee_no: schema.movements.employeeNo,
  department_id: schema.movements.departmentId,
  from_department_id: schema.movements.fromDepartmentId,
  to_department_id: schema.movements.toDepartmentId,
  title: schema.movements.title,
  grade: schema.movements.grade,
  employment_type: schema.movements.employmentType,
  effective_date: schema.movements.effectiveDate,
  agent_type: schema.movements.agentType,
  instance_delta: schema.movements.instanceDelta,
  seat_monthly: schema.movements.seatMonthly,
  compute_monthly: schema.movements.computeMonthly,
} as const;

const agentFields = {
  id: schema.agents.id,
  name: schema.agents.name,
  agent_type: schema.agents.agentType,
  department_id: schema.agents.departmentId,
  instances: schema.agents.instances,
  seat_monthly: schema.agents.seatMonthly,
  compute_monthly: schema.agents.computeMonthly,
} as const;

function projection<T extends Record<string, unknown>>(fields: T, names: readonly string[]) {
  const selected: Record<string, unknown> = {};
  for (const name of names) {
    if (!(name in fields)) throw new Error(`负责人查询列 ${name} 没有对应字段`);
    selected[name] = fields[name];
  }
  return selected as { [K in keyof T]: T[K] };
}

export function leaderProjectionKeys() {
  return {
    people: Object.keys(projection(personFields, LEADER_PERSON_COLUMNS)),
    movements: Object.keys(projection(movementFields, LEADER_MOVEMENT_COLUMNS)),
    agents: Object.keys(projection(agentFields, LEADER_AGENT_COLUMNS)),
  };
}

export async function loadSettings(db: AppDatabase) {
  const rows = await db.select().from(schema.planSettings).where(eq(schema.planSettings.id, 1)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("缺少计划设置");
  return row;
}

export async function loadDepartments(db: AppDatabase): Promise<DepartmentNode[]> {
  const rows = await db.select().from(schema.departments);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    quotaFormal: row.quotaFormal,
    quotaAgent: row.quotaAgent,
  }));
}

export async function loadClosure(db: AppDatabase) {
  const rows = await db.select().from(schema.departmentClosure);
  return rows.map((row) => ({ ancestorId: row.ancestorId, descendantId: row.descendantId, depth: row.depth }));
}

function asEmployment(value: string): EmploymentType {
  if (value === "外包" || value === "实习" || value === "顾问" || value === "正式") return value;
  return "正式";
}

export async function loadPlan(db: AppDatabase, input: { departmentIds: string[] | null; sensitive: boolean }): Promise<PlanInput> {
  const settings = await loadSettings(db);
  const departments = await loadDepartments(db);
  const allowed = input.departmentIds == null ? null : new Set(input.departmentIds);
  const inScope = (departmentId: string) => allowed == null || allowed.has(departmentId);
  const grades = await db.select().from(schema.gradeBands);
  const cities = input.sensitive ? await db.select().from(schema.cityWages) : [];
  const budgets = await db.select().from(schema.departmentBudgets);
  const rates = await db.select().from(schema.otherRates);
  const rateOf = new Map(rates.map((row) => [row.employmentType, row.annualCost]));
  const seats = await db.select().from(schema.otherSeats);
  const tenure = input.sensitive ? await db.select().from(schema.tenureAverages) : [];

  let people: PersonSeed[] = [];
  let movements: MovementSeed[] = [];
  let agents: AgentSeed[] = [];
  if (allowed == null || allowed.size > 0) {
    const departmentFilter = allowed == null ? undefined : [...allowed];
    if (input.sensitive) {
      const personRows = departmentFilter
        ? await db.select().from(schema.people).where(inArray(schema.people.departmentId, departmentFilter))
        : await db.select().from(schema.people);
      people = personRows.filter((row) => inScope(row.departmentId)).map((row) => ({
        id: row.id,
        employeeNo: row.employeeNo,
        name: row.name,
        departmentId: row.departmentId,
        title: row.title,
        grade: row.grade,
        managerId: row.managerId,
        isManager: row.isManager,
        employmentType: asEmployment(row.employmentType),
        city: row.city,
        hireDate: row.hireDate ?? undefined,
        source: "import",
        version: row.version,
      }));
      const movementRows = departmentFilter
        ? await db.select().from(schema.movements).where(inArray(schema.movements.departmentId, departmentFilter))
        : await db.select().from(schema.movements);
      movements = movementRows.filter((row) => inScope(row.departmentId)).map((row) => ({
        id: row.id,
        kind: row.kind as MovementSeed["kind"],
        name: row.personName,
        employeeNo: row.employeeNo,
        departmentId: row.departmentId,
        fromDepartmentId: row.fromDepartmentId ?? undefined,
        toDepartmentId: row.toDepartmentId ?? undefined,
        title: row.title,
        grade: row.grade,
        employmentType: asEmployment(row.employmentType),
        effectiveDate: row.effectiveDate,
        compMark: (row.compMark as CompMark | null) ?? undefined,
        hireDate: row.hireDate ?? undefined,
        city: row.city ?? undefined,
        agentType: row.agentType ?? undefined,
        instanceDelta: row.instanceDelta ?? undefined,
        seatMonthly: row.seatMonthly ?? undefined,
        computeMonthly: row.computeMonthly ?? undefined,
        oneOff: row.oneOff ?? undefined,
        source: "import",
        version: row.version,
      }));
    } else {
      const personRows = departmentFilter
        ? await db.select(projection(personFields, LEADER_PERSON_COLUMNS)).from(schema.people).where(inArray(schema.people.departmentId, departmentFilter))
        : await db.select(projection(personFields, LEADER_PERSON_COLUMNS)).from(schema.people);
      people = personRows.filter((row) => inScope(row.department_id)).map((row) => ({
        id: row.id,
        employeeNo: row.employee_no,
        name: row.name,
        departmentId: row.department_id,
        title: row.title,
        grade: row.grade,
        managerId: row.manager_id,
        isManager: row.is_manager,
        employmentType: asEmployment(row.employment_type),
        city: "",
        source: "import" as const,
        version: 1,
      }));
      const movementRows = departmentFilter
        ? await db
            .select(projection(movementFields, LEADER_MOVEMENT_COLUMNS))
            .from(schema.movements)
            .where(inArray(schema.movements.departmentId, departmentFilter))
        : await db.select(projection(movementFields, LEADER_MOVEMENT_COLUMNS)).from(schema.movements);
      movements = movementRows.filter((row) => inScope(row.department_id)).map((row) => ({
        id: row.id,
        kind: row.kind as MovementSeed["kind"],
        name: row.person_name,
        employeeNo: row.employee_no,
        departmentId: row.department_id,
        fromDepartmentId: row.from_department_id ?? undefined,
        toDepartmentId: row.to_department_id ?? undefined,
        title: row.title,
        grade: row.grade,
        employmentType: asEmployment(row.employment_type),
        effectiveDate: row.effective_date,
        agentType: row.agent_type ?? undefined,
        instanceDelta: row.instance_delta ?? undefined,
        seatMonthly: row.seat_monthly ?? undefined,
        computeMonthly: row.compute_monthly ?? undefined,
        source: "import" as const,
        version: 1,
      }));
    }
    const agentRows = departmentFilter
      ? await db.select(projection(agentFields, LEADER_AGENT_COLUMNS)).from(schema.agents).where(inArray(schema.agents.departmentId, departmentFilter))
      : await db.select(projection(agentFields, LEADER_AGENT_COLUMNS)).from(schema.agents);
    agents = agentRows.filter((row) => inScope(row.department_id)).map((row) => ({
      id: row.id,
      name: row.name,
      agentType: row.agent_type,
      departmentId: row.department_id,
      instances: row.instances,
      seatMonthly: row.seat_monthly,
      computeMonthly: row.compute_monthly,
      source: "import" as const,
      version: 1,
    }));
    if (input.sensitive) {
      const fullAgents = departmentFilter
        ? await db.select().from(schema.agents).where(inArray(schema.agents.departmentId, departmentFilter))
        : await db.select().from(schema.agents);
      agents = fullAgents.filter((row) => inScope(row.departmentId)).map((row) => ({
        id: row.id,
        name: row.name,
        agentType: row.agentType,
        departmentId: row.departmentId,
        instances: row.instances,
        seatMonthly: row.seatMonthly,
        computeMonthly: row.computeMonthly,
        source: "import",
        version: row.version,
      }));
    }
  }

  const visibleDepartments = allowed == null ? departments : departments.filter((department) => allowed.has(department.id));
  return {
    year: settings.year,
    asOf: settings.asOf,
    companyBudget: settings.companyBudget,
    oneOffBudget: input.sensitive ? settings.oneOffBudget : null,
    departments: visibleDepartments,
    gradeAnnual: Object.fromEntries(grades.map((row) => [row.grade, row.annualCost])),
    people,
    movements,
    agents,
    others: seats
      .filter((row) => inScope(row.departmentId) && row.employmentType !== "正式")
      .map((row) => ({
        departmentId: row.departmentId,
        employmentType: row.employmentType as "外包" | "实习" | "顾问",
        count: row.headcount,
        annual: rateOf.get(row.employmentType) ?? 0,
      })),
    cityMonthly: Object.fromEntries(cities.map((row) => [row.city, row.monthlyAvg])),
    budgets: Object.fromEntries(budgets.filter((row) => inScope(row.departmentId)).map((row) => [row.departmentId, row.amount])),
    tenure: tenure
      .filter((row) => inScope(row.departmentId))
      .map((row) => ({ departmentId: row.departmentId, grade: row.grade, averageMonths: row.averageMonths, count: row.headcount })),
  };
}

export async function loadCachedConclusion(db: AppDatabase, departmentId: string, dataVersion: string) {
  const rows = await db
    .select()
    .from(schema.aiConclusions)
    .where(and(eq(schema.aiConclusions.departmentId, departmentId), eq(schema.aiConclusions.dataVersion, dataVersion)))
    .limit(1);
  return rows[0]?.sentence ?? null;
}

export async function listUsers(db: AppDatabase) {
  const accounts = await db.select().from(schema.users);
  const bindings = await db.select().from(schema.userDepartments);
  return accounts.map((account) => ({
    id: account.id,
    username: account.username,
    name: account.name,
    role: account.role as HeadcountRole,
    status: account.status,
    departmentIds: bindings.filter((binding) => binding.userId === account.id).map((binding) => binding.departmentId),
  }));
}

export async function listAccessLogs(db: AppDatabase, filter?: { name?: string; from?: number; to?: number }) {
  const rows = await db.select().from(schema.accessLogs).orderBy(desc(schema.accessLogs.createdAt)).limit(200);
  return rows.filter((row) => {
    if (filter?.name && !row.userName.includes(filter.name) && !row.departmentName.includes(filter.name)) return false;
    if (filter?.from != null && row.createdAt < filter.from) return false;
    if (filter?.to != null && row.createdAt > filter.to) return false;
    return true;
  });
}

export async function listOperationLogs(db: AppDatabase) {
  return db.select().from(schema.operationLogs).orderBy(desc(schema.operationLogs.createdAt)).limit(100);
}

export async function listToggleLogs(db: AppDatabase) {
  return db.select().from(schema.toggleLogs).orderBy(desc(schema.toggleLogs.createdAt)).limit(50);
}

