import { conclusionFacts, directChildFacts, templateConclusion, type ConclusionFacts } from "@/lib/headcount/conclusion";
import { deptStat, subtreeIds, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, quarterBand, roundToHalfWan, roundingGapNote, roundingGapWan, yearBand } from "@/lib/headcount/money";
import { collectAgentLines, collectPersonLines, defaultDetailQuery, pageAgents, pagePeople, transitCrossLine, type DetailQuery, type PagedAgents, type PagedPeople } from "@/lib/headcount/rosterPage";
import { DEMO_AI_RATIO } from "@/lib/headcount/sample";
import { presentVacancy } from "@/lib/headcount/vacancy";

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
  yearEnd: {
    people: number;
    agents: number;
    annualLabel: string;
    budgetLine: string;
    /** ③ 与 ①、② 各项取整后是否还能对齐。掩码区间不写这句。 */
    equation: "= ① + ②" | "≈ ① + ②" | null;
    roundingNote: string | null;
  };
  quarters: { label: string; labor: string; agent: string; total: string }[];
  quarterSummary: string;
  people: PagedPeople;
  agentsPage: PagedAgents;
  transitNote: string | null;
  showDepartment: boolean;
  showMarks: boolean;
  openSection: "people" | "agents" | null;
  listBase: string;
  options: { id: string; name: string }[];
  drivers: { detail: string; label: string }[];
  maskCosts: boolean;
  backHref: string | null;
  aiRatio: string;
};

function shownMoney(mask: boolean, yuan: number, signed = false): string {
  if (mask) return yearBand(yuan);
  return signed ? formatSignedWan(yuan) : formatWan(yuan);
}

function personnelIsSmall(facts: ConclusionFacts): boolean {
  return (
    (facts.joinHires > 0 && facts.joinHires < 2) ||
    (facts.joinTransfers > 0 && facts.joinTransfers < 2) ||
    (facts.leaveExits > 0 && facts.leaveExits < 2) ||
    (facts.leaveTransfers > 0 && facts.leaveTransfers < 2)
  );
}

function groupedConclusion(facts: ConclusionFacts): string {
  const annual = formatWan(facts.annualYuan);
  const current = formatWan(facts.currentYuan);
  const people = formatSignedWan(facts.joinYuan + facts.leaveYuan);
  const agent = formatSignedWan(facts.agentYuan);
  const budgetWan = facts.budgetYuan == null ? null : roundToHalfWan(facts.budgetYuan);
  const annualWan = roundToHalfWan(facts.annualYuan);
  let budget = "本组未单独设置预算";
  if (budgetWan != null) {
    const gap = Number((annualWan - budgetWan).toFixed(1));
    budget = gap > 0 ? `超出部门预算 ${gap.toFixed(1)} 万` : gap < 0 ? `低于部门预算 ${Math.abs(gap).toFixed(1)} 万` : "与部门预算持平";
  }
  return `${facts.year} 年预计 ${annual} 万，${budget}。现有人员和 Agent 年化 ${current} 万。已确认的 ${facts.joins + facts.leaves} 人变动 ${people} 万，Agent 调整 ${agent} 万。`;
}

function groupedBasis(facts: ConclusionFacts): string[] {
  return [
    `全年预计 ${formatWan(facts.annualYuan)} 万，来自四个季度相加后再取整。`,
    `当前年化 ${formatWan(facts.currentYuan)} 万。`,
    `已确认的 ${facts.joins + facts.leaves} 人变动 ${formatSignedWan(facts.joinYuan + facts.leaveYuan)} 万，不单列一个人的金额。`,
    `Agent 调整 ${formatSignedWan(facts.agentYuan)} 万。`,
    "经济补偿和 Agent 实施、培训没有进入这句结论。",
  ];
}

/** 页面上实际写出的取整金额：现在，以及每一条在途驱动。 */
export function displayedStepWan(facts: ConclusionFacts): number[] {
  const parts = [roundToHalfWan(facts.currentYuan)];
  if (personnelIsSmall(facts)) {
    if (facts.joins + facts.leaves > 0) parts.push(roundToHalfWan(facts.joinYuan + facts.leaveYuan));
  } else {
    if (facts.joins) parts.push(roundToHalfWan(facts.joinYuan));
    if (facts.leaves) parts.push(roundToHalfWan(facts.leaveYuan));
  }
  if (facts.agentAdded || facts.agentExpanded || facts.agentOffline) parts.push(roundToHalfWan(facts.agentYuan));
  return parts;
}

export function yearEndEquation(facts: ConclusionFacts): { equation: "= ① + ②" | "≈ ① + ②"; roundingNote: string | null } {
  const annual = roundToHalfWan(facts.annualYuan);
  const gap = roundingGapWan(annual, displayedStepWan(facts));
  return {
    equation: Math.abs(gap) < 0.05 ? "= ① + ②" : "≈ ① + ②",
    roundingNote: roundingGapNote(gap),
  };
}

function driverLines(facts: ConclusionFacts, mask: boolean): { detail: string; label: string }[] {
  const moneyOf = (yuan: number) => shownMoney(mask, yuan, true);
  const personnelSmall = personnelIsSmall(facts);
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
  options: {
    exact: boolean;
    maskCosts?: boolean;
    backHref?: string | null;
    listBase?: string;
    detail?: DetailQuery;
    showMarks?: boolean;
    companyScope?: boolean;
    conclusionText?: string;
    conclusionOrigin?: LeaderView["conclusion"]["origin"];
  },
): LeaderView {
  const facts = conclusionFacts(result, departmentId);
  const stat = deptStat(result, departmentId);
  const ids = subtreeIds(result.plan, departmentId);
  const exact = options.exact;
  const mask = Boolean(options.maskCosts);
  const annualWan = roundToHalfWan(facts.annualYuan);
  const budgetWan = facts.budgetYuan == null ? null : roundToHalfWan(facts.budgetYuan);
  const gap = budgetWan == null ? null : Number((annualWan - budgetWan).toFixed(1));
  const over = result.plan.departments.filter((department) => department.parentId === departmentId && deptStat(result, department.id).vacancy < 0);
  const overText = over.map((department) => `${department.name}${presentVacancy(deptStat(result, department.id).vacancy).over}`).join("、");
  const ownVacancy = presentVacancy(stat.vacancy);
  const quotaLine = `编制 ${facts.quotaPeople} 人、${facts.quotaAgents} 个 Agent · ${ownVacancy.over ? `空缺 0 · ${ownVacancy.over}` : `空缺 ${ownVacancy.slots}`}${overText ? ` · ${overText}` : ""}`;
  const detail = options.detail ?? defaultDetailQuery();
  const personLines = collectPersonLines(result, departmentId);
  const agentLines = collectAgentLines(result, departmentId);
  const showMarks = Boolean(options.showMarks) && !mask;
  const peoplePage = pagePeople(personLines, detail, { exact: exact && !mask, companyScope: options.companyScope, showCompensation: showMarks });
  const agentsPage = pageAgents(agentLines, detail, { exact: exact && !mask });
  const transitAgents = agentLines.filter((line) => line.status !== "在用");
  const transitNote = peoplePage.summary
    ? transitCrossLine(
        { count: peoplePage.summary.count, yearYuan: peoplePage.summary.yearYuan },
        { count: transitAgents.length, yearYuan: transitAgents.reduce((total, line) => total + (line.yearImpact ?? 0), 0) },
        peoplePage.summary.precise,
      )
    : null;
  const childFacts = directChildFacts(result, departmentId);
  const equation = mask ? { equation: null, roundingNote: null } : yearEndEquation(facts);
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
        : personnelIsSmall(facts)
          ? groupedConclusion(facts)
          : (options.conclusionText ?? templateConclusion(facts)),
      origin: mask || personnelIsSmall(facts) ? "template" : (options.conclusionOrigin ?? "template"),
    },
    basis: mask
      ? ["本组成本按区间返回。管辖范围内有不足 5 人的组，精确金额不出现在这个接口里。"]
      : personnelIsSmall(facts)
        ? groupedBasis(facts)
        : basisLines(facts),
    budgetYuanLabel: budgetWan == null ? null : formatWan(facts.budgetYuan ?? 0),
    annualLabel: mask ? yearBand(facts.annualYuan) : formatWan(facts.annualYuan),
    deltaLabel: mask ? null : gap == null ? null : gap === 0 ? "与预算持平" : gap > 0 ? `多 ${gap.toFixed(1)} 万` : `少 ${Math.abs(gap).toFixed(1)} 万`,
    ratioLabel: mask || !budgetWan ? null : `${((annualWan / budgetWan) * 100).toFixed(1)}%`,
    now: { people: facts.headcount, agents: facts.agents, currentLabel: mask ? yearBand(facts.currentYuan) : formatWan(facts.currentYuan), quotaLine },
    next: {
      count: facts.movementCount,
      netLabel: shownMoney(mask, facts.inFlightYuan, true),
      joins: personnelIsSmall(facts)
        ? { count: facts.joins + facts.leaves, detail: `${facts.joins + facts.leaves} 人变动`, label: shownMoney(mask, facts.joinYuan + facts.leaveYuan, true) }
        : { count: facts.joins, detail: `入职 ${facts.joinHires} · 转入 ${facts.joinTransfers}`, label: shownMoney(mask, facts.joinYuan, true) },
      leaves: personnelIsSmall(facts)
        ? { count: 0, detail: "已并入人员变动", label: "—" }
        : {
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
      equation: equation.equation,
      roundingNote: equation.roundingNote,
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
    people: peoplePage,
    agentsPage,
    transitNote,
    showDepartment: new Set(personLines.map((line) => line.departmentName)).size > 1,
    showMarks,
    openSection: detail.open,
    listBase: options.listBase ?? `/headcount/leader?dept=${departmentId}`,
    options: result.plan.departments.filter((department) => ids.has(department.id)).map((department) => ({ id: department.id, name: department.name })),
    drivers: driverLines(facts, mask),
    maskCosts: mask,
    backHref: options.backHref ?? null,
    aiRatio: DEMO_AI_RATIO[departmentId] ?? "未拆解",
  };
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
