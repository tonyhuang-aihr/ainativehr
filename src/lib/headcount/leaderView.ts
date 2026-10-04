import { conclusionFacts, directChildFacts, templateConclusion, type ConclusionFacts } from "@/lib/headcount/conclusion";
import { deptStat, formalPeople, subtreeIds, type MovementImpact, type PersonRow, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, quarterBand, roundToHalfWan, yearBand } from "@/lib/headcount/money";
import { DEMO_AI_RATIO } from "@/lib/headcount/sample";
import { sortByReporting } from "@/lib/headcount/sortPeople";

export type LeaderView = {
  departmentId: string;
  departmentName: string;
  scopeLabel: string;
  asOf: string;
  year: number;
  exact: boolean;
  conclusion: { text: string; origin: "template" | "model" | "cache" };
  basis: string[];
  budgetYuanLabel: string | null;
  annualLabel: string;
  deltaLabel: string | null;
  ratioLabel: string | null;
  now: { people: number; agents: number; currentLabel: string; quotaLine: string };
  next: {
    count: number;
    netLabel: string;
    joins: { count: number; detail: string; label: string };
    leaves: { count: number; detail: string; label: string };
    agents: { detail: string; label: string };
  };
  yearEnd: { people: number; agents: number; annualLabel: string; budgetLine: string };
  quarters: { label: string; labor: string; agent: string; total: string }[];
  quarterSummary: string;
  movements: {
    name: string;
    title: string;
    grade: string;
    route: string;
    typeLabel: string;
    quarter: string;
    year: string;
  }[];
  groups: {
    name: string;
    onBoard: number;
    incoming: number;
    quarters: string[];
    year: string;
    rows: { name: string; title: string; grade: string; employmentType: string; status: string; quarters: string[]; year: string; formula: string }[];
  }[];
  agents: { name: string; agentType: string; instances: number; status: string; quarters: string[]; year: string }[];
  others: { type: string; count: number; year: string }[];
  peopleSummary: string;
  agentSummary: string;
  options: { id: string; name: string }[];
  drivers: { detail: string; label: string }[];
  maskCosts: boolean;
  backHref: string | null;
  aiRatio: string;
};

function money(exact: boolean, yuan: number, days = 1, annual = false): string {
  if (!exact) return annual ? yearBand(yuan) : quarterBand(yuan, days);
  if (yuan === 0 || days <= 0) return "—";
  return formatWan(yuan);
}

function typeLabel(movement: MovementImpact): string {
  if (movement.kind === "离职") return `离职 · ${movement.effectiveDate}`;
  if (movement.kind === "转出") return `转出 · ${movement.effectiveDate}`;
  if (movement.kind === "转入") return `转入 · ${movement.effectiveDate}`;
  if (movement.kind === "入职") return `入职 · ${movement.effectiveDate}`;
  return `${movement.kind} · ${movement.effectiveDate}`;
}

function personStatus(person: PersonRow): string {
  if (person.status === "待离职" && person.effectiveDate) return `待离职 · ${person.effectiveDate.slice(5)}`;
  if (person.status === "待转出" && person.effectiveDate) return `待转出 · ${person.effectiveDate.slice(5)}`;
  if (person.status === "待入职" && person.effectiveDate) return `待入职 · ${person.effectiveDate.slice(5)}`;
  if (person.status === "待转入" && person.effectiveDate) return `待转入 · ${person.effectiveDate.slice(5)}`;
  return "在岗";
}

function shownMoney(mask: boolean, yuan: number, signed = false): string {
  if (mask) return yearBand(yuan);
  return signed ? formatSignedWan(yuan) : formatWan(yuan);
}

function driverLines(facts: ConclusionFacts, mask: boolean): { detail: string; label: string }[] {
  const moneyOf = (yuan: number) => shownMoney(mask, yuan, true);
  const personnelSmall =
    (facts.joinHires > 0 && facts.joinHires < 2) ||
    (facts.joinTransfers > 0 && facts.joinTransfers < 2) ||
    (facts.leaveExits > 0 && facts.leaveExits < 2) ||
    (facts.leaveTransfers > 0 && facts.leaveTransfers < 2);
  const lines: { detail: string; label: string }[] = [];
  if (personnelSmall) {
    if (facts.joins + facts.leaves > 0) {
      lines.push({ detail: `${facts.joins + facts.leaves} 人变动`, label: moneyOf(facts.joinYuan + facts.leaveYuan) });
    }
  } else {
    if (facts.joins) lines.push({ detail: `入职 ${facts.joinHires} · 转入 ${facts.joinTransfers}`, label: moneyOf(facts.joinYuan) });
    if (facts.leaves) lines.push({ detail: `离职 ${facts.leaveExits} · 转出 ${facts.leaveTransfers}`, label: moneyOf(facts.leaveYuan) });
  }
  if (facts.agentAdded || facts.agentExpanded || facts.agentOffline) {
    lines.push({
      detail: `Agent 新增 ${facts.agentAdded} · 扩容 ${facts.agentExpanded} · 下线 ${facts.agentOffline}`,
      label: moneyOf(facts.agentYuan),
    });
  }
  return lines;
}

export function buildLeaderView(
  result: PlanResult,
  departmentId: string,
  options: { exact: boolean; maskCosts?: boolean; backHref?: string | null; conclusionText?: string; conclusionOrigin?: LeaderView["conclusion"]["origin"] },
): LeaderView {
  const facts = conclusionFacts(result, departmentId);
  const stat = deptStat(result, departmentId);
  const ids = subtreeIds(result.plan, departmentId);
  const names = new Map(result.plan.departments.map((department) => [department.id, department.name]));
  const exact = options.exact;
  const mask = Boolean(options.maskCosts);
  const annualWan = roundToHalfWan(facts.annualYuan);
  const budgetWan = facts.budgetYuan == null ? null : roundToHalfWan(facts.budgetYuan);
  const gap = budgetWan == null ? null : Number((annualWan - budgetWan).toFixed(1));
  const over = result.plan.departments.filter((department) => department.parentId === departmentId && deptStat(result, department.id).vacancy < 0);
  const overText = over.map((department) => `${department.name}超编 ${Math.abs(deptStat(result, department.id).vacancy)} 人`).join("、");
  const quotaLine = `编制 ${facts.quotaPeople} 人、${facts.quotaAgents} 个 Agent${overText ? ` · ${overText}` : ""}`;
  const moves = result.movements.filter((movement) => ids.has(movement.departmentId));
  const people = formalPeople(result, ids);
  const childDepartments = result.plan.departments.filter((department) => department.parentId === departmentId);
  const listed = childDepartments.length > 0 ? childDepartments : result.plan.departments.filter((department) => department.id === departmentId);
  const groups = listed
    .map((department) => {
      const memberIds = subtreeIds(result.plan, department.id);
      const rows = sortByReporting(people.filter((person) => memberIds.has(person.departmentId)));
      const childStat = deptStat(result, department.id);
      const hideExact = mask || (childDepartments.length > 0 && mask);
      const quarters = [0, 1, 2, 3].map((index) => childStat.quarterFormal[index] + childStat.quarterOther[index] + childStat.quarterAgent[index]);
      return {
        name: department.name,
        onBoard: rows.filter((person) => person.status === "在岗" || person.status === "待离职" || person.status === "待转出").length,
        incoming: rows.filter((person) => person.status === "待入职" || person.status === "待转入").length,
        quarters: quarters.map((value, index) => (hideExact ? quarterBand(value, childStat.quarterFormal[index] || value ? 1 : 0) : value === 0 ? "—" : formatWan(value))),
        year: hideExact ? yearBand(childStat.yearDailyYuan) : formatWan(childStat.yearDailyYuan),
        rows: rows.map((person) => ({
          name: person.name,
          title: person.title,
          grade: person.grade,
          employmentType: person.employmentType,
          status: personStatus(person),
          quarters: person.quarters.map((value, index) => money(exact, value, person.days[index])),
          year: money(exact, person.annual, 1, true),
          formula: `${person.grade} · 按天折算 ${person.days.reduce((total, day) => total + day, 0)} 天 / ${result.plan.year === 2027 ? 365 : 365}`,
        })),
      };
    })
    .filter((group) => group.rows.length > 0);
  const agentRows = result.agents.filter((agent) => ids.has(agent.departmentId));
  const otherCounts = stat.other;
  const childFacts = directChildFacts(result, departmentId);
  return {
    departmentId,
    departmentName: facts.name,
    scopeLabel: childFacts.length ? `${facts.name}（全部）· ${childFacts.length} 个组` : facts.name,
    asOf: result.plan.asOf,
    year: facts.year,
    exact,
    conclusion: {
      text: mask
        ? `${facts.year} 年${facts.name}的成本按区间显示（${yearBand(facts.annualYuan)} 万）。管辖范围内有不足 5 人的组，本组不返回精确金额。`
        : (options.conclusionText ?? templateConclusion(facts)),
      origin: options.conclusionOrigin ?? "template",
    },
    basis: mask ? ["本组成本按区间返回。管辖范围内有不足 5 人的组，精确金额不出现在这个接口里。"] : basisLines(facts),
    budgetYuanLabel: budgetWan == null ? null : formatWan(facts.budgetYuan ?? 0),
    annualLabel: mask ? yearBand(facts.annualYuan) : formatWan(facts.annualYuan),
    deltaLabel: mask ? null : gap == null ? null : gap === 0 ? "与预算持平" : gap > 0 ? `多 ${gap.toFixed(1)} 万` : `少 ${Math.abs(gap).toFixed(1)} 万`,
    ratioLabel: mask || !budgetWan ? null : `${((annualWan / budgetWan) * 100).toFixed(1)}%`,
    now: { people: facts.headcount, agents: facts.agents, currentLabel: mask ? yearBand(facts.currentYuan) : formatWan(facts.currentYuan), quotaLine },
    next: {
      count: facts.movementCount,
      netLabel: shownMoney(mask, facts.inFlightYuan, true),
      joins: { count: facts.joins, detail: `入职 ${facts.joinHires} · 转入 ${facts.joinTransfers}`, label: shownMoney(mask, facts.joinYuan, true) },
      leaves: {
        count: facts.leaves,
        detail: `离职 ${facts.leaveExits} · 转出 ${facts.leaveTransfers}`,
        label: shownMoney(mask, facts.leaveYuan, true),
      },
      agents: {
        detail: `新增 ${facts.agentAdded} · 扩容 ${facts.agentExpanded} · 下线 ${facts.agentOffline}`,
        label: shownMoney(mask, facts.agentYuan, true),
      },
    },
    yearEnd: {
      people: facts.yearEndPeople,
      agents: facts.yearEndAgents,
      annualLabel: mask ? yearBand(facts.annualYuan) : formatWan(facts.annualYuan),
      budgetLine: budgetWan == null ? "本组未单独设置预算" : mask ? "本组金额为区间" : `比预算 ${formatWan(facts.budgetYuan ?? 0)} 万${gap != null && gap > 0 ? "多" : "少"} ${Math.abs(gap ?? 0).toFixed(1)} 万`,
    },
    quarters: ["Q1", "Q2", "Q3", "Q4"].map((label, index) => ({
      label,
      labor: mask ? quarterBand(stat.quarterFormal[index] + stat.quarterOther[index], 1) : formatWan(stat.quarterFormal[index] + stat.quarterOther[index]),
      agent: mask ? quarterBand(stat.quarterAgent[index], 1) : formatWan(stat.quarterAgent[index]),
      total: mask ? quarterBand(facts.quartersYuan[index] ?? 0, 1) : formatWan(facts.quartersYuan[index] ?? 0),
    })),
    quarterSummary: mask
      ? "季度成本按区间显示 · 人工 + Agent"
      : facts.quartersYuan.map((value, index) => `Q${index + 1} ${formatWan(value)}`).join(" · ") + " 万 · 人工 + Agent",
    movements: [...moves]
      .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))
      .map((movement) => ({
        name: movement.name,
        title: movement.title,
        grade: movement.grade,
        route: routeOf(movement, names),
        typeLabel: typeLabel(movement),
        quarter: money(exact, movement.quarters[0] ?? 0, movement.quarters[0] ? 1 : 0),
        year: money(exact, movement.annual, movement.annual ? 1 : 0, true),
      })),
    groups,
    agents: agentRows.map((agent) => ({
      name: agent.name,
      agentType: agent.agentType,
      instances: agent.instances,
      status: agent.status,
      quarters: agent.quarters.map((value) => (mask ? quarterBand(value, value ? 1 : 0) : value === 0 ? "—" : formatWan(value))),
      year: mask ? yearBand(agent.annual) : formatWan(agent.annual),
    })),
    others: (["外包", "实习", "顾问"] as const)
      .filter((type) => otherCounts[type] > 0)
      .map((type) => ({ type, count: otherCounts[type], year: "按单价计入人工" })),
    peopleSummary: `${people.length} 人（在岗 ${facts.headcount} · 待入职或转入 ${facts.joins}）· 按汇报关系 · 成本为${exact ? "精确估算" : "区间"}`,
    agentSummary: `Agent ${new Set(agentRows.map((agent) => agent.name)).size} 类 ${facts.agents} 个 · 外包 ${otherCounts.外包} · 实习 ${otherCounts.实习} · 顾问 ${otherCounts.顾问}`,
    options: result.plan.departments.filter((department) => ids.has(department.id)).map((department) => ({ id: department.id, name: department.name })),
    drivers: driverLines(facts, mask),
    maskCosts: mask,
    backHref: options.backHref ?? null,
    aiRatio: DEMO_AI_RATIO[departmentId] ?? "未拆解",
  };
}

function routeOf(movement: MovementImpact, names: Map<string, string>): string {
  const here = names.get(movement.departmentId) ?? movement.departmentId;
  if (movement.fromDepartmentId) return `${names.get(movement.fromDepartmentId) ?? movement.fromDepartmentId} → ${here}`;
  if (movement.toDepartmentId) return `${here} → ${names.get(movement.toDepartmentId) ?? movement.toDepartmentId}`;
  return here;
}

function basisLines(facts: ConclusionFacts): string[] {
  return [
    `全年预计 ${formatWan(facts.annualYuan)} 万，来自四个季度的人工和 Agent 日常成本相加后再取整。`,
    `当前年化 ${formatWan(facts.currentYuan)} 万。`,
    `已确认加入 ${facts.joins} 人，影响 ${formatSignedWan(facts.joinYuan)} 万。`,
    `已确认离开 ${facts.leaves} 人，影响 ${formatSignedWan(facts.leaveYuan)} 万。`,
    `Agent 调整影响 ${formatSignedWan(facts.agentYuan)} 万。`,
    "经济补偿和 Agent 实施、培训没有进入这句结论。",
  ];
}

export function forbiddenLeaderPaths(value: unknown, path = "$"): string[] {
  const pattern = /compmark|comp_mark|compensation|severance|oneoff|one_off|oneOff|departuretype|departure_type|hiredate|hire_date|补偿标记|离职类型/i;
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenLeaderPaths(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (pattern.test(key)) return [`${path}.${key}`];
    return forbiddenLeaderPaths(child, `${path}.${key}`);
  });
}

export type { ConclusionFacts };
