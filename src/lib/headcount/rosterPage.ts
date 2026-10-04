import { CURRENT_QUARTER_INDEX } from "@/lib/headcount/calendar";
import { OUTSOURCE_SEAT_NOTE } from "@/lib/headcount/copy";
import { subtreeIds, type MovementImpact, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, quarterBand, yearBand } from "@/lib/headcount/money";
import { sortByReporting } from "@/lib/headcount/sortPeople";

export const PERSON_TRANSIT = ["待入职", "待转入", "待离职", "待转出"] as const;
export const AGENT_TRANSIT = ["待新增", "待扩容或调整", "待下线"] as const;
export const EMPLOYMENT_TYPES = ["正式", "外包", "实习", "顾问"] as const;
export const PAGE_SIZES = [10, 20, 50] as const;

export type PageSize = (typeof PAGE_SIZES)[number];
export type AgentSort = "cost" | "name" | "effective";
export type PersonStatus = "在岗" | "待入职" | "待转入" | "待离职" | "待转出";
export type AgentChange = "在用" | "待新增" | "待扩容" | "待调整" | "待下线";

export type DetailQuery = {
  peopleStatuses: string[];
  peopleTypes: string[];
  peoplePage: number;
  peopleSize: PageSize;
  agentStatuses: string[];
  agentSort: AgentSort;
  agentPage: number;
  agentSize: PageSize;
  open: "people" | "agents" | null;
};

export type PersonLine = {
  id: string;
  name: string;
  departmentName: string;
  title: string;
  grade: string;
  employmentType: string;
  status: PersonStatus;
  effectiveDate: string | null;
  managerId: string | null;
  isManager: boolean;
  employeeNo: string;
  headcount: number;
  yearCost: number;
  yearImpact: number | null;
  quarterImpact: number | null;
  compMark: string | null;
  quarters: number[];
};

export type AgentLine = {
  id: string;
  name: string;
  agentType: string;
  departmentName: string;
  instancesLabel: string;
  seatMonthly: number;
  computeMonthly: number;
  seatBefore: number | null;
  computeBefore: number | null;
  status: AgentChange;
  effectiveDate: string | null;
  yearCost: number;
  yearImpact: number | null;
};

export type PersonTableRow = {
  id: string;
  name: string;
  departmentName: string;
  title: string;
  grade: string;
  employmentType: string;
  status: string;
  effectiveDate: string;
  statusLabel: string;
  yearCost: string;
  yearImpact: string;
  compMark?: string;
  nameNote?: string;
  quarters: string;
};

export type AgentTableRow = {
  id: string;
  name: string;
  departmentName: string;
  agentType: string;
  instancesLabel: string;
  seat: string;
  compute: string;
  status: AgentChange;
  effectiveDate: string;
  statusLabel: string;
  yearCost: string;
  yearImpact: string;
};

export type PeopleCounts = Record<"全部" | "在岗无变动" | "在途" | "待入职" | "待转入" | "待离职" | "待转出", number>;
export type TypeCounts = Record<"全部" | "正式" | "外包" | "实习" | "顾问", number>;
export type AgentCounts = Record<"全部" | "在用无变动" | "在途" | "待新增" | "待扩容或调整" | "待下线", number>;

export type PagedPeople = {
  counts: PeopleCounts;
  typeCounts: TypeCounts;
  total: number;
  page: number;
  pageCount: number;
  pageSize: PageSize;
  statuses: string[];
  types: string[];
  sort: "reporting" | "effective";
  /** 当前筛选下的渲染行数。外包汇总算 1 行，其余按编制。 */
  displayRows: number;
  /** 当前筛选下的编制合计，等于命中的状态芯片之和。 */
  counted: number;
  summaryHead: string;
  footer: string;
  rows: PersonTableRow[];
  summary: { count: number; quarter: string; year: string; yearYuan: number; precise: boolean; label: string } | null;
};

export type PagedAgents = {
  counts: AgentCounts;
  total: number;
  page: number;
  pageCount: number;
  pageSize: PageSize;
  statuses: string[];
  sort: AgentSort;
  footer: string;
  annualLabel: string;
  rows: AgentTableRow[];
};

const EMPTY_DETAIL: DetailQuery = {
  peopleStatuses: [],
  peopleTypes: [],
  peoplePage: 1,
  peopleSize: 10,
  agentStatuses: [],
  agentSort: "cost",
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
  types?: string;
  page?: string;
  size?: string;
  agents?: string;
  agentSort?: string;
  agentPage?: string;
  agentSize?: string;
  open?: string;
}): DetailQuery {
  const agentSort = query.agentSort === "name" || query.agentSort === "effective" ? query.agentSort : "cost";
  return {
    peopleStatuses: (query.people ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    peopleTypes: (query.types ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    peoplePage: Math.max(1, Number(query.page) || 1),
    peopleSize: clampPageSize(query.size),
    agentStatuses: (query.agents ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    agentSort,
    agentPage: Math.max(1, Number(query.agentPage) || 1),
    agentSize: clampPageSize(query.agentSize),
    open: query.open === "people" || query.open === "agents" ? query.open : null,
  };
}

function expandPeople(statuses: string[]): Set<PersonStatus> | null {
  if (statuses.length === 0 || statuses.includes("全部")) return null;
  const selected = new Set<PersonStatus>();
  for (const status of statuses) {
    if (status === "在途") PERSON_TRANSIT.forEach((item) => selected.add(item));
    else if (status === "在岗" || status === "在岗无变动") selected.add("在岗");
    else if ((PERSON_TRANSIT as readonly string[]).includes(status)) selected.add(status as PersonStatus);
  }
  return selected;
}

function peopleTransitOnly(selected: Set<PersonStatus> | null): boolean {
  if (!selected || selected.size === 0) return false;
  return [...selected].every((status) => (PERSON_TRANSIT as readonly string[]).includes(status));
}

function personImpact(person: { id: string; status: PersonStatus; employeeNo: string; departmentId: string }, movements: MovementImpact[]): MovementImpact | undefined {
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
    const leaving = result.plan.movements.find((movement) => movement.kind === "离职" && movement.employeeNo === person.employeeNo && movement.departmentId === person.departmentId);
    return {
      id: person.id,
      name: person.name,
      departmentName: names.get(person.departmentId) ?? person.departmentId,
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
      compMark: person.status === "待离职" ? (leaving?.compMark ?? "—") : null,
      quarters: [...person.quarters],
    };
  });
  for (const seat of result.plan.others) {
    if (!ids.has(seat.departmentId) || seat.count <= 0) continue;
    const departmentName = names.get(seat.departmentId) ?? seat.departmentId;
    if (seat.employmentType === "外包") {
      lines.push({
        id: `other:${seat.departmentId}:${seat.employmentType}`,
        name: `${seat.employmentType}（${departmentName}）`,
        departmentName,
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
        compMark: null,
        quarters: [0, 0, 0, 0],
      });
      continue;
    }
    for (let index = 0; index < seat.count; index += 1) {
      lines.push({
        id: `other:${seat.departmentId}:${seat.employmentType}:${index}`,
        name: `${seat.employmentType}（${departmentName}）`,
        departmentName,
        title: seat.employmentType,
        grade: "—",
        employmentType: seat.employmentType,
        status: "在岗",
        effectiveDate: null,
        managerId: null,
        isManager: false,
        employeeNo: `~${seat.employmentType}-${index}`,
        headcount: 1,
        yearCost: seat.annual,
        yearImpact: null,
        quarterImpact: null,
        compMark: null,
        quarters: [0, 0, 0, 0],
      });
    }
  }
  return lines;
}

function isOutsourceAggregate(line: PersonLine): boolean {
  return line.employmentType === "外包" && line.id.startsWith("other:");
}

function headcountOf(lines: PersonLine[], status?: PersonStatus): number {
  return lines.filter((line) => !status || line.status === status).reduce((total, line) => total + line.headcount, 0);
}

function countPeople(lines: PersonLine[]): PeopleCounts {
  const steady = headcountOf(lines, "在岗");
  const transit = PERSON_TRANSIT.reduce((total, status) => total + headcountOf(lines, status), 0);
  return {
    全部: headcountOf(lines),
    在岗无变动: steady,
    在途: transit,
    待入职: headcountOf(lines, "待入职"),
    待转入: headcountOf(lines, "待转入"),
    待离职: headcountOf(lines, "待离职"),
    待转出: headcountOf(lines, "待转出"),
  };
}

function countTypes(lines: PersonLine[]): TypeCounts {
  const of = (type?: string) => lines.filter((line) => !type || line.employmentType === type).reduce((total, line) => total + line.headcount, 0);
  return { 全部: of(), 正式: of("正式"), 外包: of("外包"), 实习: of("实习"), 顾问: of("顾问") };
}

export function pairedTransfers(lines: PersonLine[]): number {
  const outgoing = new Set(lines.filter((line) => line.status === "待转出" && line.employeeNo).map((line) => line.employeeNo));
  return new Set(lines.filter((line) => line.status === "待转入" && outgoing.has(line.employeeNo)).map((line) => line.employeeNo)).size;
}

export function peopleLineFacts(lines: PersonLine[]): { rows: number; counted: number; pairs: number; outsourceSeats: number; outsourceRows: number; footer: string; summaryHead: string } {
  const outsource = lines.filter(isOutsourceAggregate);
  const outsourceSeats = outsource.reduce((total, line) => total + line.headcount, 0);
  const outsourceRows = outsource.length;
  const counted = lines.reduce((total, line) => total + line.headcount, 0);
  const rows = lines.reduce((total, line) => total + (isOutsourceAggregate(line) ? 1 : line.headcount), 0);
  const pairs = pairedTransfers(lines);
  const exceptions: string[] = [];
  if (outsourceSeats > outsourceRows) exceptions.push(`外包 ${outsourceSeats} 个座位合并为 ${outsourceRows} 行`);
  if (pairs > 0) exceptions.push(`${pairs} 人内部转岗各占两行，实际 ${counted - pairs} 人`);
  const footer = exceptions.length === 0
    ? `共 ${counted} 人`
    : rows === counted
      ? `共 ${rows} 行（${exceptions.join("；")}）`
      : `共 ${rows} 行，计 ${counted}（${exceptions.join("；")}）`;
  const summaryHead = rows !== counted ? `${rows} 行，计 ${counted}` : exceptions.length > 0 ? `${rows} 行` : `${counted} 人`;
  return { rows, counted, pairs, outsourceSeats, outsourceRows, footer, summaryHead };
}

export function peopleFooterLabel(lines: PersonLine[]): string {
  return peopleLineFacts(lines).footer;
}

export function peopleRosterSummary(page: Pick<PagedPeople, "counts" | "typeCounts" | "summaryHead">, options: { exact: boolean; showMarks: boolean }): string {
  const counts = page.counts;
  const parts = PERSON_TRANSIT.filter((status) => counts[status] > 0).map((status) => `${status} ${counts[status]}`);
  const typeText = EMPLOYMENT_TYPES.filter((type) => page.typeCounts[type] > 0).map((type) => `${type} ${page.typeCounts[type]}`).join(" · ");
  const cost = options.exact ? "OD 看精确估算" : "成本为区间";
  const mark = options.showMarks ? " · 补偿标记仅 OD / HR 可见" : "";
  return `${page.summaryHead} · 在岗无变动 ${counts.在岗无变动} · 在途 ${counts.在途}${parts.length ? `（${parts.join(" · ")}）` : ""} · ${typeText} · ${cost}${mark}`;
}

function slicePage<T>(items: T[], page: number, pageSize: PageSize): { page: number; pageCount: number; rows: T[] } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  return { page: current, pageCount, rows: items.slice(start, start + pageSize) };
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

function applyPeopleStatus(lines: PersonLine[], statuses: string[]): PersonLine[] {
  const selected = expandPeople(statuses);
  return selected ? lines.filter((line) => selected.has(line.status)) : [...lines];
}

function applyPeopleType(lines: PersonLine[], types: string[]): PersonLine[] {
  if (types.length === 0 || types.includes("全部")) return [...lines];
  const selected = new Set(types);
  return lines.filter((line) => selected.has(line.employmentType));
}

export function pagePeople(
  lines: PersonLine[],
  query: Pick<DetailQuery, "peopleStatuses" | "peoplePage" | "peopleSize"> & { peopleTypes?: string[] },
  options: { exact: boolean; preciseSummary?: boolean; companyScope?: boolean; showCompensation?: boolean },
): PagedPeople {
  const types = query.peopleTypes ?? [];
  const statusBasis = applyPeopleType(lines, types);
  const typeBasis = applyPeopleStatus(lines, query.peopleStatuses);
  const filtered = applyPeopleStatus(statusBasis, query.peopleStatuses);
  const selected = expandPeople(query.peopleStatuses);
  const byDate = peopleTransitOnly(selected);
  const ordered = byDate
    ? [...filtered].sort((left, right) => (left.effectiveDate ?? "9999").localeCompare(right.effectiveDate ?? "9999") || left.name.localeCompare(right.name, "zh"))
    : sortByReporting(filtered);
  const sliced = slicePage(ordered, query.peoplePage, query.peopleSize);
  const facts = peopleLineFacts(filtered);
  const headcount = facts.counted;
  const precise = options.exact || (options.preciseSummary !== false && headcount >= 5);
  const quarterSum = filtered.reduce((total, line) => total + (line.quarterImpact ?? 0), 0);
  const yearSum = filtered.reduce((total, line) => total + (line.yearImpact ?? 0), 0);
  const quarter = precise ? formatSignedWan(quarterSum) : yearBand(quarterSum);
  const year = precise ? formatSignedWan(yearSum) : yearBand(yearSum);
  const summary = byDate
    ? {
        count: headcount,
        quarter,
        year,
        yearYuan: yearSum,
        precise,
        label: options.exact ? "精确估算" : precise ? "精确合计" : "区间",
      }
    : null;
  return {
    counts: countPeople(statusBasis),
    typeCounts: countTypes(typeBasis),
    total: headcount,
    page: sliced.page,
    pageCount: sliced.pageCount,
    pageSize: query.peopleSize,
    statuses: query.peopleStatuses,
    types,
    sort: byDate ? "effective" : "reporting",
    displayRows: facts.rows,
    counted: facts.counted,
    summaryHead: facts.summaryHead,
    footer: facts.footer,
    rows: sliced.rows.map((line) => {
      const row: PersonTableRow = {
        id: line.id,
        name: line.name,
        departmentName: line.departmentName,
        title: line.title,
        grade: line.grade,
        employmentType: line.employmentType,
        status: line.status,
        effectiveDate: line.status === "在岗" ? "" : (line.effectiveDate ?? ""),
        statusLabel: line.status === "在岗" || !line.effectiveDate ? line.status : `${line.status} · ${line.effectiveDate}`,
        yearCost: moneyText(options.exact, line.yearCost),
        yearImpact: line.yearImpact == null ? "" : signedText(options.exact, line.yearImpact),
        quarters: ["Q1", "Q2", "Q3", "Q4"].map((label, index) => `${label} ${moneyText(options.exact, line.quarters[index] ?? 0, false)}`).join(" · "),
      };
      if (options.showCompensation) row.compMark = line.compMark ?? "—";
      if (line.employmentType === "外包" && line.id.startsWith("other:")) row.nameNote = OUTSOURCE_SEAT_NOTE;
      return row;
    }),
    summary,
  };
}

function adjustmentChange(oldSeat: number, oldCompute: number, movement: { seatMonthly?: number; computeMonthly?: number; instanceDelta?: number }): "待扩容" | "待调整" {
  const priceChanged = (movement.seatMonthly ?? oldSeat) !== oldSeat || (movement.computeMonthly ?? oldCompute) !== oldCompute;
  const delta = movement.instanceDelta ?? 0;
  if (!priceChanged && delta > 0) return "待扩容";
  return "待调整";
}

export function collectAgentLines(result: PlanResult, departmentId: string): AgentLine[] {
  const ids = subtreeIds(result.plan, departmentId);
  const names = new Map(result.plan.departments.map((department) => [department.id, department.name]));
  const lines: AgentLine[] = [];
  for (const agent of result.plan.agents.filter((item) => ids.has(item.departmentId))) {
    const offline = result.plan.movements.find((movement) => movement.kind === "Agent 下线" && movement.name === agent.name && movement.departmentId === agent.departmentId);
    const adjust = result.plan.movements.find((movement) => movement.kind === "Agent 调整" && movement.name === agent.name && movement.departmentId === agent.departmentId);
    const baseRow = result.agents.find((row) => row.id === agent.id);
    const departmentName = names.get(agent.departmentId) ?? agent.departmentId;
    if (offline) {
      const impact = result.movements.find((movement) => movement.id === offline.id);
      lines.push({
        id: agent.id,
        name: agent.name,
        agentType: agent.agentType,
        departmentName,
        instancesLabel: `${agent.instances} → 0`,
        seatMonthly: agent.seatMonthly,
        computeMonthly: agent.computeMonthly,
        seatBefore: null,
        computeBefore: null,
        status: "待下线",
        effectiveDate: offline.effectiveDate,
        yearCost: baseRow?.annual ?? 0,
        yearImpact: impact?.annual ?? null,
      });
      continue;
    }
    if (adjust) {
      const deltaRow = result.agents.find((row) => row.id === adjust.id);
      const next = agent.instances + (adjust.instanceDelta ?? 0);
      lines.push({
        id: agent.id,
        name: agent.name,
        agentType: agent.agentType,
        departmentName,
        instancesLabel: `${agent.instances} → ${next}`,
        seatMonthly: adjust.seatMonthly ?? agent.seatMonthly,
        computeMonthly: adjust.computeMonthly ?? agent.computeMonthly,
        seatBefore: agent.seatMonthly,
        computeBefore: agent.computeMonthly,
        status: adjustmentChange(agent.seatMonthly, agent.computeMonthly, adjust),
        effectiveDate: adjust.effectiveDate,
        yearCost: (baseRow?.annual ?? 0) + (deltaRow?.annual ?? 0),
        yearImpact: deltaRow?.annual ?? null,
      });
      continue;
    }
    lines.push({
      id: agent.id,
      name: agent.name,
      agentType: agent.agentType,
      departmentName,
      instancesLabel: String(agent.instances),
      seatMonthly: agent.seatMonthly,
      computeMonthly: agent.computeMonthly,
      seatBefore: null,
      computeBefore: null,
      status: "在用",
      effectiveDate: null,
      yearCost: baseRow?.annual ?? 0,
      yearImpact: null,
    });
  }
  for (const movement of result.plan.movements) {
    if (movement.kind !== "Agent 新增" || !ids.has(movement.departmentId)) continue;
    const row = result.agents.find((item) => item.id === movement.id);
    lines.push({
      id: movement.id,
      name: movement.name,
      agentType: movement.agentType ?? movement.title,
      departmentName: names.get(movement.departmentId) ?? movement.departmentId,
      instancesLabel: `0 → ${movement.instanceDelta ?? 0}`,
      seatMonthly: movement.seatMonthly ?? 0,
      computeMonthly: movement.computeMonthly ?? 0,
      seatBefore: null,
      computeBefore: null,
      status: "待新增",
      effectiveDate: movement.effectiveDate,
      yearCost: row?.annual ?? 0,
      yearImpact: row?.annual ?? null,
    });
  }
  return lines;
}

function agentMatches(line: AgentLine, status: string): boolean {
  if (status === "在用" || status === "在用无变动") return line.status === "在用";
  if (status === "待新增") return line.status === "待新增";
  if (status === "待下线") return line.status === "待下线";
  if (status === "待扩容") return line.status === "待扩容";
  if (status === "待调整") return line.status === "待调整";
  if (status === "待扩容或调整") return line.status === "待扩容" || line.status === "待调整";
  if (status === "在途") return line.status !== "在用";
  return false;
}

function expandAgentFilter(statuses: string[]): ((line: AgentLine) => boolean) | null {
  if (statuses.length === 0 || statuses.includes("全部")) return null;
  return (line) => statuses.some((status) => agentMatches(line, status));
}

function countAgents(lines: AgentLine[]): AgentCounts {
  const of = (status?: AgentChange | "待扩容或调整") => lines.filter((line) => {
    if (!status) return true;
    if (status === "待扩容或调整") return line.status === "待扩容" || line.status === "待调整";
    return line.status === status;
  }).length;
  const added = of("待新增");
  const changed = of("待扩容或调整");
  const offline = of("待下线");
  return { 全部: lines.length, 在用无变动: of("在用"), 在途: added + changed + offline, 待新增: added, "待扩容或调整": changed, 待下线: offline };
}

function priceLabel(before: number | null, after: number): string {
  const afterText = after.toLocaleString("en-US");
  if (before == null || before === after) return afterText;
  return `${before.toLocaleString("en-US")} → ${afterText}`;
}

function agentStatusLabel(line: AgentLine): string {
  if (line.status === "在用" || !line.effectiveDate) return "在用";
  const name = line.status === "待扩容" || line.status === "待调整" || line.status === "待新增" || line.status === "待下线" ? line.status : line.status;
  return `${name} · ${line.effectiveDate}`;
}

export function pageAgents(
  lines: AgentLine[],
  query: Pick<DetailQuery, "agentStatuses" | "agentPage" | "agentSize"> & { agentSort?: AgentSort },
  options: { exact: boolean },
): PagedAgents {
  const selected = expandAgentFilter(query.agentStatuses);
  const filtered = selected ? lines.filter(selected) : [...lines];
  const sort = query.agentSort ?? "cost";
  const ordered = [...filtered].sort((left, right) => {
    if (sort === "effective") return (left.effectiveDate ?? "9999").localeCompare(right.effectiveDate ?? "9999") || left.name.localeCompare(right.name, "zh");
    if (sort === "name") return left.departmentName.localeCompare(right.departmentName, "zh") || left.name.localeCompare(right.name, "zh");
    return right.yearCost - left.yearCost || left.name.localeCompare(right.name, "zh");
  });
  const sliced = slicePage(ordered, query.agentPage, query.agentSize);
  return {
    counts: countAgents(lines),
    total: filtered.length,
    page: sliced.page,
    pageCount: sliced.pageCount,
    pageSize: query.agentSize,
    statuses: query.agentStatuses,
    sort,
    footer: `共 ${filtered.length} 项`,
    annualLabel: formatWan(lines.reduce((total, line) => total + line.yearCost, 0)),
    rows: sliced.rows.map((line) => ({
      id: line.id,
      name: line.name,
      departmentName: line.departmentName,
      agentType: line.agentType,
      instancesLabel: line.instancesLabel,
      seat: priceLabel(line.seatBefore, line.seatMonthly),
      compute: priceLabel(line.computeBefore, line.computeMonthly),
      status: line.status,
      effectiveDate: line.status === "在用" ? "" : (line.effectiveDate ?? ""),
      statusLabel: agentStatusLabel(line),
      yearCost: moneyText(options.exact, line.yearCost),
      yearImpact: line.yearImpact == null || line.status === "在用" ? "" : signedText(options.exact, line.yearImpact),
    })),
  };
}

export function transitCrossLine(people: { count: number; yearYuan: number }, agents: { count: number; yearYuan: number }, precise: boolean): string {
  const totalYear = precise ? formatSignedWan(people.yearYuan + agents.yearYuan) : yearBand(people.yearYuan + agents.yearYuan);
  if (agents.count === 0) return `本部门 Agent 无在途 · 全部在途 ${people.count} 笔 ${totalYear} 万`;
  const agentYear = precise ? formatSignedWan(agents.yearYuan) : yearBand(agents.yearYuan);
  return `加 Agent 在途 ${agents.count} 项 ${agentYear} 万 = 全部在途 ${people.count + agents.count} 笔 ${totalYear} 万`;
}

export function defaultDetailQuery(): DetailQuery {
  return { ...EMPTY_DETAIL, peopleStatuses: [], peopleTypes: [] };
}
