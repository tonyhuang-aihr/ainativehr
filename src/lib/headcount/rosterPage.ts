import { CURRENT_QUARTER_INDEX } from "@/lib/headcount/calendar";
import { subtreeIds, type AgentRow, type MovementImpact, type PersonRow, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, quarterBand, yearBand } from "@/lib/headcount/money";
import { sortByReporting } from "@/lib/headcount/sortPeople";

export const PERSON_TRANSIT = ["待入职", "待转入", "待离职", "待转出"] as const;
export const AGENT_TRANSIT = ["待新增", "待扩容或调整", "待下线"] as const;
export const PAGE_SIZES = [10, 20, 50] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export type DetailQuery = {
  peopleStatuses: string[];
  peoplePage: number;
  peopleSize: PageSize;
  agentStatuses: string[];
  agentPage: number;
  agentSize: PageSize;
  open: "people" | "agents" | null;
};

export type PersonLine = {
  id: string;
  name: string;
  title: string;
  grade: string;
  employmentType: string;
  status: "在岗" | "待入职" | "待转入" | "待离职" | "待转出";
  effectiveDate: string | null;
  managerId: string | null;
  isManager: boolean;
  employeeNo: string;
  headcount: number;
  yearCost: number;
  yearImpact: number | null;
  quarterImpact: number | null;
  quarters: number[];
};

export type AgentLine = {
  id: string;
  name: string;
  agentType: string;
  departmentName: string;
  instances: number;
  seatMonthly: number;
  computeMonthly: number;
  status: "在用" | "待新增" | "待扩容或调整" | "待下线";
  effectiveDate: string | null;
  yearCost: number;
  yearImpact: number | null;
  quarters: number[];
};

export type PersonTableRow = {
  id: string;
  name: string;
  title: string;
  grade: string;
  employmentType: string;
  status: string;
  effectiveDate: string;
  yearCost: string;
  yearImpact: string;
  quarters: string;
};

export type AgentTableRow = {
  id: string;
  name: string;
  agentType: string;
  instances: number;
  seat: string;
  compute: string;
  status: string;
  effectiveDate: string;
  yearCost: string;
  yearImpact: string;
  quarters: string;
};

export type PagedPeople = {
  counts: Record<"全部" | "在岗" | "在途" | "待入职" | "待转入" | "待离职" | "待转出", number>;
  total: number;
  page: number;
  pageSize: PageSize;
  statuses: string[];
  sort: "reporting" | "effective";
  rows: PersonTableRow[];
  summary: { count: number; quarter: string; year: string } | null;
};

export type PagedAgents = {
  counts: Record<"全部" | "在用" | "在途" | "待新增" | "待扩容或调整" | "待下线", number>;
  total: number;
  page: number;
  pageSize: PageSize;
  statuses: string[];
  sort: "name" | "effective";
  rows: AgentTableRow[];
};

const EMPTY_DETAIL: DetailQuery = {
  peopleStatuses: [],
  peoplePage: 1,
  peopleSize: 10,
  agentStatuses: [],
  agentPage: 1,
  agentSize: 10,
  open: null,
};

export function clampPageSize(value: string | number | undefined): PageSize {
  const size = Number(value);
  if (size === 20 || size === 50) return size;
  return 10;
}

export function detailHref(base: string, patch: Record<string, string | null>): string {
  const [path, existing] = base.split("?");
  const params = new URLSearchParams(existing ?? "");
  for (const [key, value] of Object.entries(patch)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export function detailQueryFromSearch(query: {
  people?: string;
  page?: string;
  size?: string;
  agents?: string;
  agentPage?: string;
  agentSize?: string;
  open?: string;
}): DetailQuery {
  return {
    peopleStatuses: (query.people ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    peoplePage: Math.max(1, Number(query.page) || 1),
    peopleSize: clampPageSize(query.size),
    agentStatuses: (query.agents ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    agentPage: Math.max(1, Number(query.agentPage) || 1),
    agentSize: clampPageSize(query.agentSize),
    open: query.open === "people" || query.open === "agents" ? query.open : null,
  };
}

function expandPeople(statuses: string[]): Set<PersonLine["status"]> | null {
  if (statuses.length === 0 || statuses.includes("全部")) return null;
  const selected = new Set<PersonLine["status"]>();
  for (const status of statuses) {
    if (status === "在途") PERSON_TRANSIT.forEach((item) => selected.add(item));
    else if ((PERSON_TRANSIT as readonly string[]).includes(status) || status === "在岗") selected.add(status as PersonLine["status"]);
  }
  return selected;
}

function peopleTransitOnly(selected: Set<PersonLine["status"]> | null): boolean {
  if (!selected || selected.size === 0) return false;
  return [...selected].every((status) => (PERSON_TRANSIT as readonly string[]).includes(status));
}

function personImpact(person: PersonRow, movements: MovementImpact[]): MovementImpact | undefined {
  if (person.status === "待入职" || person.status === "待转入") return movements.find((movement) => movement.id === person.id);
  if (person.status === "待离职") return movements.find((movement) => movement.kind === "离职" && movement.employeeNo === person.employeeNo && movement.departmentId === person.departmentId);
  if (person.status === "待转出") return movements.find((movement) => movement.kind === "转出" && movement.employeeNo === person.employeeNo && movement.departmentId === person.departmentId);
  return undefined;
}

export function collectPersonLines(result: PlanResult, departmentId: string): PersonLine[] {
  const ids = subtreeIds(result.plan, departmentId);
  const names = new Map(result.plan.departments.map((department) => [department.id, department.name]));
  const people = result.people.filter((person) => ids.has(person.departmentId));
  const lines: PersonLine[] = people.map((person) => {
    const impact = personImpact(person, result.movements);
    return {
      id: person.id,
      name: person.name,
      title: person.title,
      grade: person.grade,
      employmentType: person.employmentType,
      status: person.status,
      effectiveDate: person.effectiveDate,
      managerId: person.managerId,
      isManager: person.isManager,
      employeeNo: person.employeeNo,
      headcount: 1,
      yearCost: person.annual,
      yearImpact: impact ? impact.annual : null,
      quarterImpact: impact ? impact.quarters[CURRENT_QUARTER_INDEX] : null,
      quarters: [...person.quarters],
    };
  });
  for (const seat of result.plan.others) {
    if (!ids.has(seat.departmentId) || seat.count <= 0) continue;
    lines.push({
      id: `other:${seat.departmentId}:${seat.employmentType}`,
      name: `${seat.employmentType}（${names.get(seat.departmentId) ?? seat.departmentId}）`,
      title: seat.employmentType,
      grade: "—",
      employmentType: seat.employmentType,
      status: "在岗",
      effectiveDate: null,
      managerId: null,
      isManager: false,
      employeeNo: `~${seat.employmentType}`,
      headcount: seat.count,
      yearCost: seat.annual * seat.count,
      yearImpact: null,
      quarterImpact: null,
      quarters: [0, 0, 0, 0],
    });
  }
  return lines;
}

function countPeople(lines: PersonLine[]): PagedPeople["counts"] {
  const count = (status?: PersonLine["status"]) => lines.filter((line) => !status || line.status === status).reduce((total, line) => total + line.headcount, 0);
  const transit = PERSON_TRANSIT.reduce((total, status) => total + count(status), 0);
  return { 全部: count(), 在岗: count("在岗"), 在途: transit, 待入职: count("待入职"), 待转入: count("待转入"), 待离职: count("待离职"), 待转出: count("待转出") };
}

function slicePage<T>(items: T[], page: number, pageSize: PageSize): { page: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  return { page: current, rows: items.slice(start, start + pageSize) };
}

function moneyText(exact: boolean, yuan: number, annual = true): string {
  if (!exact) return annual ? yearBand(yuan) : quarterBand(yuan, 1);
  if (yuan === 0) return "—";
  return formatWan(yuan);
}

function signedText(exact: boolean, yuan: number): string {
  if (!exact) return yearBand(yuan);
  return formatSignedWan(yuan);
}

export function pagePeople(lines: PersonLine[], query: Pick<DetailQuery, "peopleStatuses" | "peoplePage" | "peopleSize">, options: { exact: boolean; preciseSummary?: boolean }): PagedPeople {
  const selected = expandPeople(query.peopleStatuses);
  const filtered = selected ? lines.filter((line) => selected.has(line.status)) : [...lines];
  const byDate = peopleTransitOnly(selected);
  const ordered = byDate
    ? [...filtered].sort((left, right) => (left.effectiveDate ?? "9999").localeCompare(right.effectiveDate ?? "9999") || left.name.localeCompare(right.name, "zh"))
    : sortByReporting(filtered);
  const sliced = slicePage(ordered, query.peoplePage, query.peopleSize);
  const headcount = filtered.reduce((total, line) => total + line.headcount, 0);
  const preciseSummary = options.exact || (options.preciseSummary !== false && headcount >= 5);
  const quarterSum = filtered.reduce((total, line) => total + (line.quarterImpact ?? 0), 0);
  const yearSum = filtered.reduce((total, line) => total + (line.yearImpact ?? 0), 0);
  const summary = byDate
    ? {
        count: headcount,
        quarter: preciseSummary ? formatSignedWan(quarterSum) : yearBand(quarterSum),
        year: preciseSummary ? formatSignedWan(yearSum) : yearBand(yearSum),
      }
    : null;
  return {
    counts: countPeople(lines),
    total: headcount,
    page: sliced.page,
    pageSize: query.peopleSize,
    statuses: query.peopleStatuses,
    sort: byDate ? "effective" : "reporting",
    rows: sliced.rows.map((line) => ({
      id: line.id,
      name: line.name,
      title: line.title,
      grade: line.grade,
      employmentType: line.employmentType,
      status: line.status,
      effectiveDate: line.status === "在岗" ? "" : (line.effectiveDate ?? ""),
      yearCost: moneyText(options.exact, line.yearCost),
      yearImpact: line.yearImpact == null ? "" : signedText(options.exact, line.yearImpact),
      quarters: ["Q1", "Q2", "Q3", "Q4"].map((label, index) => `${label} ${moneyText(options.exact, line.quarters[index] ?? 0, false)}`).join(" · "),
    })),
    summary,
  };
}

function agentStatus(status: AgentRow["status"]): AgentLine["status"] {
  if (status === "待上线") return "待新增";
  if (status === "待调整") return "待扩容或调整";
  if (status === "待下线") return "待下线";
  return "在用";
}

export function collectAgentLines(result: PlanResult, departmentId: string): AgentLine[] {
  const ids = subtreeIds(result.plan, departmentId);
  const names = new Map(result.plan.departments.map((department) => [department.id, department.name]));
  return result.agents
    .filter((agent) => ids.has(agent.departmentId))
    .map((agent) => {
      const status = agentStatus(agent.status);
      const own = result.movements.find((item) => item.id === agent.id);
      const offline = result.movements.find((item) => item.kind === "Agent 下线" && item.name === agent.name && item.departmentId === agent.departmentId);
      const movement = own ?? (status === "待下线" ? offline : undefined);
      return {
        id: agent.id,
        name: agent.name,
        agentType: agent.agentType,
        departmentName: names.get(agent.departmentId) ?? agent.departmentId,
        instances: agent.instances,
        seatMonthly: agent.seatMonthly,
        computeMonthly: agent.computeMonthly,
        status,
        effectiveDate: agent.effectiveDate,
        yearCost: agent.annual,
        yearImpact: movement ? movement.annual : null,
        quarters: [...agent.quarters],
      };
    });
}

function expandAgents(statuses: string[]): Set<AgentLine["status"]> | null {
  if (statuses.length === 0 || statuses.includes("全部")) return null;
  const selected = new Set<AgentLine["status"]>();
  for (const status of statuses) {
    if (status === "在途") AGENT_TRANSIT.forEach((item) => selected.add(item));
    else if (status === "在用" || (AGENT_TRANSIT as readonly string[]).includes(status)) selected.add(status as AgentLine["status"]);
  }
  return selected;
}

function agentTransitOnly(selected: Set<AgentLine["status"]> | null): boolean {
  if (!selected || selected.size === 0) return false;
  return [...selected].every((status) => (AGENT_TRANSIT as readonly string[]).includes(status));
}

export function pageAgents(lines: AgentLine[], query: Pick<DetailQuery, "agentStatuses" | "agentPage" | "agentSize">, options: { exact: boolean }): PagedAgents {
  const selected = expandAgents(query.agentStatuses);
  const filtered = selected ? lines.filter((line) => selected.has(line.status)) : [...lines];
  const byDate = agentTransitOnly(selected);
  const ordered = byDate
    ? [...filtered].sort((left, right) => (left.effectiveDate ?? "9999").localeCompare(right.effectiveDate ?? "9999") || left.name.localeCompare(right.name, "zh"))
    : [...filtered].sort((left, right) => left.departmentName.localeCompare(right.departmentName, "zh") || left.name.localeCompare(right.name, "zh"));
  const sliced = slicePage(ordered, query.agentPage, query.agentSize);
  const count = (status?: AgentLine["status"]) => lines.filter((line) => !status || line.status === status).reduce((total, line) => total + line.instances, 0);
  return {
    counts: {
      全部: count(),
      在用: count("在用"),
      在途: AGENT_TRANSIT.reduce((total, status) => total + count(status), 0),
      待新增: count("待新增"),
      "待扩容或调整": count("待扩容或调整"),
      待下线: count("待下线"),
    },
    total: filtered.reduce((total, line) => total + line.instances, 0),
    page: sliced.page,
    pageSize: query.agentSize,
    statuses: query.agentStatuses,
    sort: byDate ? "effective" : "name",
    rows: sliced.rows.map((line) => ({
      id: line.id,
      name: line.name,
      agentType: line.agentType,
      instances: line.instances,
      seat: `${line.seatMonthly.toLocaleString("zh-CN")} 元/月`,
      compute: `${line.computeMonthly.toLocaleString("zh-CN")} 元/月`,
      status: line.status,
      effectiveDate: line.status === "在用" ? "" : (line.effectiveDate ?? ""),
      yearCost: moneyText(options.exact, line.yearCost),
      yearImpact: line.yearImpact == null || line.status === "在用" ? "" : signedText(options.exact, line.yearImpact),
      quarters: ["Q1", "Q2", "Q3", "Q4"].map((label, index) => `${label} ${moneyText(options.exact, line.quarters[index] ?? 0, false)}`).join(" · "),
    })),
  };
}

export function defaultDetailQuery(): DetailQuery {
  return { ...EMPTY_DETAIL };
}
