import {
  overlapDays,
  parseIsoDate,
  quarterBounds,
  quarterDayCounts,
  quarterIndex,
  yearDays,
  yearEnd,
  yearStart,
} from "@/lib/headcount/calendar";
import { estimateSeverance } from "@/lib/headcount/severance";
import type { AgentSeed, MovementSeed, PersonSeed, PlanInput } from "@/lib/headcount/types";

export type QuarterAmounts = [number, number, number, number];

export type PersonRow = {
  id: string;
  name: string;
  employeeNo: string;
  departmentId: string;
  title: string;
  grade: string;
  managerId: string | null;
  isManager: boolean;
  employmentType: "正式";
  status: "在岗" | "待入职" | "待离职" | "待转入" | "待转出";
  effectiveDate: string | null;
  quarters: QuarterAmounts;
  days: QuarterAmounts;
  annual: number;
};

export type AgentRow = {
  id: string;
  name: string;
  agentType: string;
  departmentId: string;
  instances: number;
  seatMonthly: number;
  computeMonthly: number;
  status: "在用" | "待上线" | "待调整" | "待下线";
  effectiveDate: string | null;
  quarters: QuarterAmounts;
  annual: number;
};

export type MovementImpact = {
  id: string;
  kind: MovementSeed["kind"];
  name: string;
  employeeNo: string;
  departmentId: string;
  fromDepartmentId?: string;
  toDepartmentId?: string;
  title: string;
  grade: string;
  effectiveDate: string;
  quarters: QuarterAmounts;
  annual: number;
  agentInstances: number | null;
};

export type DeptStat = {
  id: string;
  name: string;
  parentId: string | null;
  quotaFormal: number;
  onBoard: number;
  inTransit: number;
  occupied: number;
  vacancy: number;
  internalTransfers: number;
  other: { 外包: number; 实习: number; 顾问: number };
  quotaAgent: number;
  agentInUse: number;
  agentInTransit: number;
  agentOffline: number;
  agentYearEnd: number;
  peopleYearEnd: number;
  currentYuan: number;
  quarterFormal: QuarterAmounts;
  quarterOther: QuarterAmounts;
  quarterAgent: QuarterAmounts;
  quarterSeat: QuarterAmounts;
  quarterCompute: QuarterAmounts;
  quarterSeverance: QuarterAmounts;
  quarterAgentOneOff: QuarterAmounts;
  yearDailyYuan: number;
  yearOneOffYuan: number;
  yearTotalYuan: number;
  inFlightQuarterDaily: number;
  inFlightYearDaily: number;
  inFlightQuarterTotal: number;
  inFlightYearTotal: number;
};

export type PlanResult = {
  plan: PlanInput;
  people: PersonRow[];
  agents: AgentRow[];
  movements: MovementImpact[];
  departments: DeptStat[];
  severanceWarnings: string[];
};

function add(target: QuarterAmounts, extra: number[]): QuarterAmounts {
  return [target[0] + extra[0], target[1] + extra[1], target[2] + extra[2], target[3] + extra[3]];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function zeros(): QuarterAmounts {
  return [0, 0, 0, 0];
}

function prorate(year: number, annual: number, start: number, end: number): { quarters: QuarterAmounts; days: QuarterAmounts } {
  const bounds = quarterBounds(year);
  const totalDays = yearDays(year);
  const quarters = bounds.map(([from, to]) => (annual * overlapDays(from, to, start, end)) / totalDays) as QuarterAmounts;
  const days = bounds.map(([from, to]) => overlapDays(from, to, start, end)) as QuarterAmounts;
  return { quarters, days };
}

function subtreeOf(plan: PlanInput, rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const department of plan.departments) {
    if (!department.parentId) continue;
    const list = children.get(department.parentId) ?? [];
    list.push(department.id);
    children.set(department.parentId, list);
  }
  const ids = new Set<string>();
  const walk = (id: string) => {
    ids.add(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  walk(rootId);
  return ids;
}

function annualOf(plan: PlanInput, grade: string): number {
  return plan.gradeAnnual[grade] ?? 0;
}

export function computePlan(plan: PlanInput): PlanResult {
  const start = yearStart(plan.year);
  const end = yearEnd(plan.year);
  const people: PersonRow[] = [];
  const leaving = new Map<string, MovementSeed>();
  for (const movement of plan.movements) {
    if ((movement.kind === "离职" || movement.kind === "转出") && movement.employeeNo) leaving.set(movement.employeeNo, movement);
  }
  for (const seed of plan.people) {
    const movement = leaving.get(seed.employeeNo);
    const rowEnd = movement ? parseIsoDate(movement.effectiveDate) : end;
    const status = movement ? (movement.kind === "离职" ? "待离职" : "待转出") : "在岗";
    const share = prorate(plan.year, annualOf(plan, seed.grade), start, rowEnd);
    people.push({
      id: seed.id,
      name: seed.name,
      employeeNo: seed.employeeNo,
      departmentId: seed.departmentId,
      title: seed.title,
      grade: seed.grade,
      managerId: seed.managerId,
      isManager: seed.isManager,
      employmentType: "正式",
      status,
      effectiveDate: movement?.effectiveDate ?? null,
      quarters: share.quarters,
      days: share.days,
      annual: sum(share.quarters),
    });
  }
  for (const movement of plan.movements) {
    if (movement.kind !== "入职" && movement.kind !== "转入") continue;
    const share = prorate(plan.year, annualOf(plan, movement.grade), parseIsoDate(movement.effectiveDate), end);
    people.push({
      id: movement.id,
      name: movement.name,
      employeeNo: movement.employeeNo,
      departmentId: movement.departmentId,
      title: movement.title,
      grade: movement.grade,
      managerId: null,
      isManager: false,
      employmentType: "正式",
      status: movement.kind === "入职" ? "待入职" : "待转入",
      effectiveDate: movement.effectiveDate,
      quarters: share.quarters,
      days: share.days,
      annual: sum(share.quarters),
    });
  }

  const agents: AgentRow[] = [];
  for (const agent of plan.agents) {
    const offline = plan.movements.find((movement) => movement.kind === "Agent 下线" && movement.name === agent.name && movement.departmentId === agent.departmentId);
    const rowEnd = offline ? parseIsoDate(offline.effectiveDate) : end;
    const annual = (agent.seatMonthly + agent.computeMonthly) * 12 * agent.instances;
    const share = prorate(plan.year, annual, start, rowEnd);
    agents.push({
      id: agent.id,
      name: agent.name,
      agentType: agent.agentType,
      departmentId: agent.departmentId,
      instances: agent.instances,
      seatMonthly: agent.seatMonthly,
      computeMonthly: agent.computeMonthly,
      status: offline ? "待下线" : "在用",
      effectiveDate: offline?.effectiveDate ?? null,
      quarters: share.quarters,
      annual: sum(share.quarters),
    });
  }
  for (const movement of plan.movements) {
    if (movement.kind !== "Agent 新增" && movement.kind !== "Agent 调整") continue;
    const instances = movement.instanceDelta ?? 0;
    const annual = ((movement.seatMonthly ?? 0) + (movement.computeMonthly ?? 0)) * 12 * instances;
    const share = prorate(plan.year, annual, parseIsoDate(movement.effectiveDate), end);
    const base = plan.agents.find((agent) => agent.name === movement.name && agent.departmentId === movement.departmentId);
    agents.push({
      id: movement.id,
      name: movement.name,
      agentType: movement.agentType ?? movement.title,
      departmentId: movement.departmentId,
      instances,
      seatMonthly: movement.seatMonthly ?? 0,
      computeMonthly: movement.computeMonthly ?? 0,
      status: movement.kind === "Agent 新增" ? "待上线" : "待调整",
      effectiveDate: movement.effectiveDate,
      quarters: share.quarters,
      annual: sum(share.quarters),
    });
    if (movement.kind === "Agent 调整" && base) {
      const existing = agents.find((row) => row.id === base.id);
      if (existing) existing.status = "待调整";
    }
  }

  const severanceWarnings: string[] = [];
  const severance = new Map<string, { quarters: QuarterAmounts; annual: number }>();
  for (const movement of plan.movements) {
    if (movement.kind !== "离职" || !movement.compMark) continue;
    const result = estimateSeverance({
      mark: movement.compMark,
      gradeAnnual: annualOf(plan, movement.grade),
      monthlyWageBase: plan.gradeMonthly?.[movement.grade],
      hireDate: movement.hireDate,
      effectiveDate: movement.effectiveDate,
      cityMonthly: movement.city ? plan.cityMonthly[movement.city] : null,
    });
    if (result.warning) severanceWarnings.push(`${movement.name}：${result.warning}`);
    const quarters = zeros();
    const index = quarterIndex(plan.year, parseIsoDate(movement.effectiveDate));
    if (index >= 0) quarters[index] = result.amount;
    severance.set(movement.id, { quarters, annual: result.amount });
  }
  const agentOneOff = new Map<string, { quarters: QuarterAmounts; annual: number }>();
  for (const movement of plan.movements) {
    if (!movement.kind.startsWith("Agent") || !movement.oneOff) continue;
    const quarters = zeros();
    const index = quarterIndex(plan.year, parseIsoDate(movement.effectiveDate));
    if (index >= 0) quarters[index] = movement.oneOff;
    agentOneOff.set(movement.id, { quarters, annual: movement.oneOff });
  }

  const movements = plan.movements
    .map((movement) => impactOf(plan, movement))
    .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || left.id.localeCompare(right.id));

  const departments = plan.departments.map((department) =>
    summarize(plan, department.id, people, agents, severance, agentOneOff),
  );
  return { plan, people, agents, movements, departments, severanceWarnings };
}

function impactOf(plan: PlanInput, movement: MovementSeed): MovementImpact {
  const end = yearEnd(plan.year);
  const when = parseIsoDate(movement.effectiveDate);
  if (movement.kind === "入职" || movement.kind === "转入") {
    const share = prorate(plan.year, annualOf(plan, movement.grade), when, end);
    return row(movement, share.quarters, sum(share.quarters), null);
  }
  if (movement.kind === "离职" || movement.kind === "转出") {
    const share = prorate(plan.year, annualOf(plan, movement.grade), when, end);
    const quarters = share.quarters.map((value) => -value) as QuarterAmounts;
    return row(movement, quarters, -sum(share.quarters), null);
  }
  const instances = movement.instanceDelta ?? 0;
  const rate = ((movement.seatMonthly ?? 0) + (movement.computeMonthly ?? 0)) * 12 * Math.abs(instances);
  const share = prorate(plan.year, rate, when, end);
  const sign = instances < 0 ? -1 : 1;
  const quarters = share.quarters.map((value) => sign * value) as QuarterAmounts;
  return row(movement, quarters, sign * sum(share.quarters), instances);
}

function row(movement: MovementSeed, quarters: QuarterAmounts, annual: number, agentInstances: number | null): MovementImpact {
  return {
    id: movement.id,
    kind: movement.kind,
    name: movement.name,
    employeeNo: movement.employeeNo,
    departmentId: movement.departmentId,
    fromDepartmentId: movement.fromDepartmentId,
    toDepartmentId: movement.toDepartmentId,
    title: movement.title,
    grade: movement.grade,
    effectiveDate: movement.effectiveDate,
    quarters,
    annual,
    agentInstances,
  };
}

function summarize(
  plan: PlanInput,
  departmentId: string,
  people: PersonRow[],
  agents: AgentRow[],
  severance: Map<string, { quarters: QuarterAmounts; annual: number }>,
  agentOneOff: Map<string, { quarters: QuarterAmounts; annual: number }>,
): DeptStat {
  const department = plan.departments.find((item) => item.id === departmentId);
  if (!department) throw new Error(`没有部门 ${departmentId}`);
  const ids = subtreeOf(plan, departmentId);
  const roster = plan.people.filter((person) => ids.has(person.departmentId));
  const inbound = plan.movements.filter((movement) => (movement.kind === "入职" || movement.kind === "转入") && ids.has(movement.departmentId));
  const internal = inbound.filter((movement) => movement.kind === "转入" && movement.fromDepartmentId && ids.has(movement.fromDepartmentId));
  const onBoard = roster.length;
  const inTransit = inbound.length - internal.length;
  const leaves = plan.movements.filter((movement) => movement.kind === "离职" && ids.has(movement.departmentId)).length;
  const transfersOut = plan.movements.filter(
    (movement) => movement.kind === "转出" && ids.has(movement.departmentId) && (!movement.toDepartmentId || !ids.has(movement.toDepartmentId)),
  ).length;
  const other = { 外包: 0, 实习: 0, 顾问: 0 };
  let otherAnnual = 0;
  for (const seat of plan.others) {
    if (!ids.has(seat.departmentId)) continue;
    other[seat.employmentType] += seat.count;
    otherAnnual += seat.annual * seat.count;
  }
  const baseAgents = plan.agents.filter((agent) => ids.has(agent.departmentId));
  const agentInUse = baseAgents.reduce((total, agent) => total + agent.instances, 0);
  const agentMoves = plan.movements.filter((movement) => movement.kind.startsWith("Agent") && ids.has(movement.departmentId));
  const agentInTransit = agentMoves.reduce((total, movement) => total + Math.max(0, movement.instanceDelta ?? 0), 0);
  const agentOffline = agentMoves.reduce((total, movement) => total + Math.max(0, -(movement.instanceDelta ?? 0)), 0);
  const currentPeople = roster.reduce((total, person) => total + (plan.gradeAnnual[person.grade] ?? 0), 0);
  const currentAgents = baseAgents.reduce((total, agent) => total + (agent.seatMonthly + agent.computeMonthly) * 12 * agent.instances, 0);
  const currentYuan = currentPeople + otherAnnual + currentAgents;

  let quarterFormal = zeros();
  let quarterOther = zeros();
  let quarterAgent = zeros();
  let quarterSeat = zeros();
  let quarterCompute = zeros();
  for (const person of people) {
    if (ids.has(person.departmentId)) quarterFormal = add(quarterFormal, person.quarters);
  }
  const otherShare = prorate(plan.year, otherAnnual, yearStart(plan.year), yearEnd(plan.year));
  quarterOther = otherShare.quarters;
  for (const agent of agents) {
    if (!ids.has(agent.departmentId)) continue;
    quarterAgent = add(quarterAgent, agent.quarters);
    const seatRate = agent.seatMonthly * 12 * agent.instances;
    const computeRate = agent.computeMonthly * 12 * agent.instances;
    const totalRate = seatRate + computeRate;
    if (totalRate > 0) {
      quarterSeat = add(quarterSeat, agent.quarters.map((value) => (value * seatRate) / totalRate));
      quarterCompute = add(quarterCompute, agent.quarters.map((value) => (value * computeRate) / totalRate));
    }
  }
  let quarterSeverance = zeros();
  let quarterAgentOneOff = zeros();
  for (const movement of plan.movements) {
    if (!ids.has(movement.departmentId)) continue;
    const comp = severance.get(movement.id);
    if (comp) quarterSeverance = add(quarterSeverance, comp.quarters);
    const once = agentOneOff.get(movement.id);
    if (once) quarterAgentOneOff = add(quarterAgentOneOff, once.quarters);
  }
  const quarterDaily = add(add(quarterFormal, quarterOther), quarterAgent);
  const yearDailyYuan = sum(quarterDaily);
  const yearOneOffYuan = sum(quarterSeverance) + sum(quarterAgentOneOff);
  const yearTotalYuan = yearDailyYuan + yearOneOffYuan;
  const qDays = quarterDayCounts(plan.year);
  const days = yearDays(plan.year);
  const q1Current = (currentYuan * qDays[0]) / days;
  const q1Daily = quarterDaily[0];
  const q1One = quarterSeverance[0] + quarterAgentOneOff[0];
  return {
    id: department.id,
    name: department.name,
    parentId: department.parentId,
    quotaFormal: department.quotaFormal,
    onBoard,
    inTransit,
    occupied: onBoard + inTransit,
    vacancy: department.quotaFormal - (onBoard + inTransit),
    internalTransfers: internal.length,
    other,
    quotaAgent: department.quotaAgent,
    agentInUse,
    agentInTransit,
    agentOffline,
    agentYearEnd: agentInUse + agentMoves.reduce((total, movement) => total + (movement.instanceDelta ?? 0), 0),
    peopleYearEnd: onBoard + inTransit - leaves - transfersOut,
    currentYuan,
    quarterFormal,
    quarterOther,
    quarterAgent,
    quarterSeat,
    quarterCompute,
    quarterSeverance,
    quarterAgentOneOff,
    yearDailyYuan,
    yearOneOffYuan,
    yearTotalYuan,
    inFlightQuarterDaily: q1Daily - q1Current,
    inFlightYearDaily: yearDailyYuan - currentYuan,
    inFlightQuarterTotal: q1Daily + q1One - q1Current,
    inFlightYearTotal: yearTotalYuan - currentYuan,
  };
}

export function deptStat(result: PlanResult, id: string): DeptStat {
  const found = result.departments.find((department) => department.id === id);
  if (!found) throw new Error(`没有部门汇总 ${id}`);
  return found;
}

export function formalPeople(result: PlanResult, departmentIds: Set<string>): PersonRow[] {
  return result.people.filter((person) => departmentIds.has(person.departmentId));
}

export function subtreeIds(plan: PlanInput, rootId: string): Set<string> {
  return subtreeOf(plan, rootId);
}

export type { AgentSeed, PersonSeed };
