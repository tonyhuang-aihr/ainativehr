import type { ChatTurn } from "@/lib/ai/desensitize";
import { quarterIndex, parseIsoDate } from "@/lib/headcount/calendar";
import { conclusionFacts, directChildFacts, modelUnits, type ModelUnit } from "@/lib/headcount/conclusion";
import { deptStat, type PlanResult } from "@/lib/headcount/engine";
import { TIMELINE_CHANGE_NOTE, UNATTRIBUTED_AGENT_NOTE } from "@/lib/headcount/copy";
import { baselineDailyBreakdown, businessScenarioResult, scenarioDailyBreakdown } from "@/lib/headcount/buCost";
import { formatWan, roundingGapWan, roundToHalfWan } from "@/lib/headcount/money";
import { DEMO_AI_RATIO } from "@/lib/headcount/sample";
import { costRootId, defaultAssumptions, evaluateBaseline, evaluateScenario, quarterChangeDetails, scenarioCutSeverance, type ScenarioAssumptions, type ScenarioDefinition, type ScenarioResult } from "@/lib/headcount/scenario";

export const DEFAULT_PREFILL_NOTE = "没有配置模型，使用默认值：离职率 8%，招聘周期 60 天，调薪率 0%，AI 替代比例沿用沙盘拆解。N+1 默认不计入。";
export const TIMELINE_EFFECTIVE_CAPTION = "按季初生效";
export const INCOMPLETE_RATIO_NOTE = "沙盘尚未拆解人 : AI。只标记数据不完整，不按 Agent 个数推算。";
export const MODEL_PREFILL_NOTE = "已配置模型。用模型预填时只发送脱敏后的部门汇总，不足 5 人的部门不带人数和金额。";

const QUARTER_DATE = ["2027-01-01", "2027-04-01", "2027-07-01", "2027-10-01"] as const;

export type HealthCell = { title: string; text: string; tone: "ok" | "warn" | "muted" | "compliance" };

export type HealthRow = { id: string; name: string; cells: HealthCell[] };

export type HealthCheck = { title: string; body: string; compliance: boolean };

export type CompareColumn = {
  id: string;
  name: string;
  subtitle: string;
  /** 单部门方案副标题上的 ⓘ。公司口径才有。 */
  subtitleNote: string | null;
  total: string;
  gap: string;
  over: boolean;
  people: number;
  agents: number;
  ratio: string;
  daily: string;
  oneOff: string;
  /** 四个季度各自取整后，与全年差 0.5 万时为 true。 */
  yearApprox: boolean;
  lowest: boolean;
  usage: number;
  /** 公司口径展开行。事业部和负责人没有这组格子。 */
  dailyParts: { id: string; name: string; text: string }[] | null;
  unattributed: string | null;
  approx: boolean;
};

export type TimelineRow = {
  quarter: string;
  people: number;
  agents: number;
  labor: string;
  agentCost: string;
  oneOff: string;
  total: string;
};

export type ScenarioBoard = {
  year: number;
  hero: string;
  lowestName: string;
  lowestTotal: string;
  lowestYearApprox: boolean;
  budget: string;
  percent: string;
  usage: number;
  stepSelect: string;
  stepSelectNote: string;
  stepAssume: string;
  stepAssumeNote: string;
  stepCheck: string;
  stepCheckNote: string;
  columns: CompareColumn[];
  healthName: string;
  health: HealthRow[];
  healthFootnote: string | null;
  incompleteRatioNote: string | null;
  timelineTitle: string;
  timelineCaption: string;
  timelineChangeNote: string;
  timelineSummary: string;
  timelineCostSummary: string;
  timelineLabels: string[];
  /** 与 timelineLabels 对齐。只有含出缺不补的「离职未补位」有悬停。 */
  timelineLabelNotes: (string | null)[];
  timelineRows: TimelineRow[];
  assumptionSummary: string;
  assumptionForm: { attrition: string; cycle: string; raise: string; ai: string; noticePay: boolean };
  cutSummary: string;
  prefillNote: string;
  scenarios: { id: string; name: string; compared: boolean; source: string }[];
  focusId: string;
  importNote: string | null;
  importRatio: string | null;
  importSpan: string | null;
  departments: string[];
  grades: string[];
  footer: string;
  /** 只有公司场景页展开部门持续成本。空着时页面不渲染展开钮、子行和未归属。 */
  dailyBreakdown: { note: string } | null;
  showOneOff: boolean;
  totalLabel: string;
  budgetCaption: string;
  oneOffCaption: string;
};

export function quarterDate(quarter: number): string {
  const index = Math.min(4, Math.max(1, quarter)) - 1;
  return QUARTER_DATE[index];
}

export function assumptionUnits(result: PlanResult): ModelUnit[] {
  return result.plan.departments.map((department) => {
    const facts = conclusionFacts(result, department.id);
    return modelUnits(facts, directChildFacts(result, department.id))[0];
  });
}

export function assumptionPrompt(units: ModelUnit[]): ChatTurn[] {
  return [
    {
      role: "system",
      content: "只根据给定的部门汇总建议四个假设。不要写人名、工号或个人金额。不足 5 人的部门只有规模描述。用 JSON 回复 attritionRate、hiringCycleDays、raiseRate、aiReplacement。没有把握时 aiReplacement 用 null，比率用小数。",
    },
    { role: "user", content: JSON.stringify(units) },
  ];
}

export function assumptionsFromModel(text: string): Partial<ScenarioAssumptions> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]) as Record<string, unknown>;
    const patch: Partial<ScenarioAssumptions> = {};
    if (typeof data.attritionRate === "number" && data.attritionRate >= 0 && data.attritionRate <= 1) patch.attritionRate = data.attritionRate;
    if (typeof data.hiringCycleDays === "number" && data.hiringCycleDays >= 0 && data.hiringCycleDays <= 365) patch.hiringCycleDays = Math.round(data.hiringCycleDays);
    if (typeof data.raiseRate === "number" && data.raiseRate >= -0.5 && data.raiseRate <= 1) patch.raiseRate = data.raiseRate;
    if (data.aiReplacement === null) patch.aiReplacement = null;
    if (typeof data.aiReplacement === "number" && data.aiReplacement >= 0 && data.aiReplacement <= 1) patch.aiReplacement = data.aiReplacement;
    return Object.keys(patch).length ? patch : null;
  } catch {
    return null;
  }
}

export async function resolvePrefill(
  units: ModelUnit[],
  complete: ((messages: ChatTurn[]) => Promise<string | null>) | null,
): Promise<{ assumptions: ScenarioAssumptions; note: string; origin: "default" | "model" }> {
  if (!complete) return { assumptions: defaultAssumptions(), note: DEFAULT_PREFILL_NOTE, origin: "default" };
  const text = await complete(assumptionPrompt(units));
  const parsed = text ? assumptionsFromModel(text) : null;
  if (!parsed) return { assumptions: defaultAssumptions(), note: DEFAULT_PREFILL_NOTE, origin: "default" };
  return { assumptions: defaultAssumptions(parsed), note: "假设来自模型，依据是脱敏后的部门汇总。N+1 仍默认不计入。", origin: "model" };
}

function rootId(result: PlanResult): string {
  return costRootId(result);
}

function quarterOf(year: number, iso: string): number {
  return quarterIndex(year, parseIsoDate(iso)) + 1;
}

function articleText(result: PlanResult, definition: ScenarioDefinition, scope: boolean): string | null {
  if (!definition.cuts.length) return null;
  const people = definition.cuts.reduce((total, cut) => total + cut.count, 0);
  if (scope) return `减员 ${people} 人 · 请与法务确认`;
  const base = deptStat(result, rootId(result)).onBoard;
  const rate = base > 0 ? ((people / base) * 100).toFixed(1) : "0.0";
  return `${people} 人 · ${rate}%`;
}

export function healthRow(result: PlanResult, scenario: ScenarioResult, options?: { budgetYuan?: number; basis?: "total" | "daily"; article?: "company" | "scope" }): HealthRow {
  const basis = options?.basis ?? "total";
  const compared = basis === "daily" ? scenario.dailyYuan : scenario.totalYuan;
  const budget = options?.budgetYuan ?? result.plan.companyBudget;
  const gap = roundToHalfWan(compared) - roundToHalfWan(budget);
  const definition = scenario.definition;
  const article = articleText(result, definition, options?.article === "scope");
  const cells: HealthCell[] = [
    gap > 0 ? { title: "超预算", text: `超 ${formatWan(gap * 10_000)}`, tone: "warn" } : { title: "超预算", text: "正常", tone: "ok" },
    definition.spanAlert
      ? { title: "管理幅度", text: `${definition.spanAlert.span} > ${definition.spanAlert.limit}`, tone: "warn" }
      : { title: "管理幅度", text: "—", tone: "muted" },
    definition.ratio === "未拆解" ? { title: "人 : AI", text: "未拆解", tone: "warn" } : { title: "人 : AI", text: "正常", tone: "ok" },
    article ? { title: "第 41 条", text: article, tone: "compliance" } : { title: "第 41 条", text: "正常", tone: "ok" },
  ];
  return { id: definition.id, name: definition.name, cells };
}

export function healthChecks(result: PlanResult, scenario: ScenarioResult): HealthCheck[] {
  return healthRow(result, scenario).cells
    .filter((cell) => cell.tone === "warn" || cell.tone === "compliance")
    .map((cell) => ({
      title: cell.title === "第 41 条" ? "《劳动合同法》第 41 条" : cell.title,
      body: cell.text,
      compliance: cell.tone === "compliance",
    }));
}

function gapLabel(totalYuan: number, budgetYuan: number): { over: boolean; text: string; amount: string } {
  const gap = roundToHalfWan(totalYuan) - roundToHalfWan(budgetYuan);
  const amount = formatWan(Math.abs(gap) * 10_000);
  if (gap > 0) return { over: true, text: `超 ${amount}`, amount };
  return { over: false, text: `结余 ${amount}`, amount };
}

/** 方案名以字母或数字结尾、后面接中文时补一个空格。以中文结尾的名字保持紧挨。 */
export function phraseAfterName(name: string, rest: string): string {
  const space = /[A-Za-z0-9]$/.test(name) && /^[\u3400-\u9fff]/.test(rest);
  return space ? `${name} ${rest}` : `${name}${rest}`;
}

export function displayedRatio(definition: ScenarioDefinition, companyWide: boolean): string {
  const entries = Object.entries(definition.buRatio ?? {});
  if (companyWide && entries.length === 1) return `${entries[0][1]} · 仅${entries[0][0]}`;
  return definition.ratio;
}

export function partialBuName(definition: { buRatio?: Record<string, string> }): string | null {
  const entries = Object.entries(definition.buRatio ?? {});
  return entries.length === 1 ? entries[0][0] : null;
}

/** 公司对比里的单部门方案。不参与「成本最低」，副标题只写范围。 */
export function singleDepartmentPlanNote(departmentName: string): string {
  return `单部门方案：只含${departmentName}的变动，其他部门按基线和默认假设计算，不参与『成本最低』比较；人 : AI 只代表${departmentName}已拆解的岗位。`;
}

function ratioWords(definition: ScenarioDefinition, companyWide: boolean): string {
  if (definition.ratio === "未拆解") return "人 : AI 未拆解";
  return `人 : AI 为 ${displayedRatio(definition, companyWide)}`;
}

export function heroSentence(result: PlanResult, compared: ScenarioResult[], options?: { budgetYuan?: number; basis?: "total" | "daily"; budgetName?: string; companyWide?: boolean }): string {
  const budgetYuan = options?.budgetYuan ?? result.plan.companyBudget;
  const budgetName = options?.budgetName ?? "预算总包";
  const amountOf = (item: ScenarioResult) => (options?.basis === "daily" ? item.dailyYuan : item.totalYuan);
  const year = result.plan.year;
  const ranked = [...compared].sort((left, right) => amountOf(left) - amountOf(right));
  const lowest = ranked[0];
  if (!lowest) return "还没有加入对比的场景。";
  const lowestGap = gapLabel(amountOf(lowest), budgetYuan);
  const companyWide = options?.companyWide !== false;
  const lowestRatio = ratioWords(lowest.definition, companyWide);
  const span = lowest.definition.spanAlert ? `，但${lowest.definition.spanAlert.department}管理幅度 ${lowest.definition.spanAlert.span} 超过建议值 ${lowest.definition.spanAlert.limit}` : "";
  const bits = [`${phraseAfterName(lowest.definition.name, "成本最低")}（${formatWan(amountOf(lowest))} 万），比${budgetName}${lowestGap.text} 万，${lowestRatio}${span}`];
  const rest = ranked.filter((item) => item.definition.id !== lowest.definition.id);
  for (const item of rest) {
    const gap = gapLabel(amountOf(item), budgetYuan);
    const cutCount = item.definition.cuts.reduce((total, cut) => total + cut.count, 0);
    if (cutCount > 0) {
      const severance = item.definition.cuts.reduce((total, cut) => total + scenarioCutSeverance(result, cut, item.definition.assumptions.noticePay), 0);
      const quarter = quarterOf(year, item.definition.cuts[0].effectiveDate);
      const ratio = ratioWords(item.definition, companyWide);
      bits.push(`${phraseAfterName(item.definition.name, gap.text)} 万，但要在 Q${quarter} 减员 ${cutCount} 人、产生 ${formatWan(severance)} 万经济补偿，${ratio}`);
      continue;
    }
    if (gap.over) bits.push(phraseAfterName(item.definition.name, `超${budgetName} ${gap.amount} 万`));
    else bits.push(`${phraseAfterName(item.definition.name, gap.text)} 万，${ratioWords(item.definition, companyWide)}`);
  }
  return `对比的 ${compared.length} 个场景中，${bits.join("；")}。`;
}

function healthFootnote(compared: ScenarioResult[]): string | null {
  const span = compared.find((item) => item.definition.spanAlert)?.definition;
  const incomplete = compared.some((item) => item.definition.ratio === "未拆解");
  const bits: string[] = [];
  if (span?.spanAlert) {
    const demo = span.spanAlert.department === "数据组" && span.spanAlert.span === 12;
    bits.push(`${span.spanAlert.department}管理幅度 ${span.spanAlert.span}，超过建议值 ${span.spanAlert.limit}（${span.name}）${demo ? "；最新版「方案 A」已拆成 6 + 6，导入后通过。基准、激进无结构调整，记「—」" : ""}。`);
  }
  if (incomplete) bits.push("人 : AI 未拆解只提示数据不全，不估算。第 41 条仅作提醒，请与法务确认是否需要报告。");
  return bits.length ? bits.join("") : null;
}

function pendingCount(assumptions: ScenarioAssumptions): number {
  return (assumptions.raiseRate === 0 ? 1 : 0) + (assumptions.aiReplacement == null ? 1 : 0);
}

function ratePercent(rate: number): string {
  const value = rate * 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function copyScenario(definitions: ScenarioDefinition[], sourceId: string, id: string): ScenarioDefinition | null {
  const source = definitions.find((item) => item.id === sourceId);
  if (!source) return null;
  const comparedCount = definitions.filter((item) => item.compared).length;
  return {
    ...source,
    id,
    name: `副本 · ${source.name}`,
    source: "copy",
    compared: comparedCount < 3,
    hires: [...source.hires],
    agents: [...source.agents],
    cuts: [...source.cuts],
    nofill: [...(source.nofill ?? [])],
    extraAgentOneOff: [...source.extraAgentOneOff],
  };
}

export function setCompared(definitions: ScenarioDefinition[], id: string, compared: boolean): { definitions: ScenarioDefinition[]; error: string | null } {
  const target = definitions.find((item) => item.id === id);
  const others = definitions.filter((item) => item.compared && item.id !== id && !partialBuName(item)).length;
  if (compared && !partialBuName(target ?? {}) && others >= 3) return { definitions, error: "最多对比 3 个场景" };
  return { definitions: definitions.map((item) => (item.id === id ? { ...item, compared } : item)), error: null };
}

export type ScenarioBoardOptions = {
  mode?: "company" | "business";
  rootId?: string;
  departmentNames?: string[];
};

function columnParts(result: PlanResult, item: ScenarioResult, company: boolean): Pick<CompareColumn, "dailyParts" | "unattributed" | "approx"> {
  if (!company) return { dailyParts: null, unattributed: null, approx: false };
  const breakdown = item.definition.id === "jx" ? baselineDailyBreakdown(result) : scenarioDailyBreakdown(result, item.definition);
  const partWan = breakdown.rows.map((row) => roundToHalfWan(row.yuan));
  const unattributedWan = roundToHalfWan(breakdown.unattributedYuan);
  const approx = roundingGapWan(roundToHalfWan(item.dailyYuan), [...partWan, unattributedWan]) !== 0;
  return {
    dailyParts: breakdown.rows.map((row) => ({ id: row.id, name: row.name, text: formatWan(row.yuan) })),
    unattributed: formatWan(breakdown.unattributedYuan),
    approx,
  };
}

export function buildScenarioBoard(result: PlanResult, definitions: ScenarioDefinition[], focusId: string, prefillNote: string, options?: ScenarioBoardOptions): ScenarioBoard {
  const year = result.plan.year;
  const company = options?.mode !== "business";
  const scopeRoot = options?.rootId ?? rootId(result);
  const budgetYuan = company ? result.plan.companyBudget : (result.plan.budgets[scopeRoot] ?? 0);
  const amountOf = (item: ScenarioResult) => (company ? item.totalYuan : item.dailyYuan);
  const baseline = evaluateBaseline(result, company ? undefined : scopeRoot);
  if (!company) baseline.definition.ratio = DEMO_AI_RATIO[scopeRoot] ?? "未拆解";
  const evaluated = new Map(definitions.map((definition) => {
    const scenario = company ? evaluateScenario(result, definition) : businessScenarioResult(result, definition, scopeRoot);
    return [definition.id, scenario] as const;
  }));
  const focus = (focusId === "jx" ? undefined : evaluated.get(focusId)) ?? (company ? evaluated.get("jj") : undefined) ?? [...evaluated.values()][0] ?? baseline;
  const compared = definitions.filter((definition) => definition.compared).map((definition) => evaluated.get(definition.id)!);
  const ranked = compared.filter((item) => !(company && partialBuName(item.definition)));
  const lowest = [...ranked].sort((left, right) => amountOf(left) - amountOf(right))[0] ?? baseline;
  const within = compared.filter((item) => roundToHalfWan(amountOf(item)) <= roundToHalfWan(budgetYuan)).length;
  const health = compared.map((item) => healthRow(result, item, company ? undefined : { budgetYuan, basis: "daily", article: "scope" }));
  const hints = health.flatMap((row) => row.cells).filter((cell) => cell.tone === "warn" || cell.tone === "compliance");
  const compliance = hints.filter((cell) => cell.tone === "compliance").length;
  const names = compared.map((item) => item.definition.name);
  const leftOut = definitions.filter((definition) => !definition.compared).map((definition) => `「${definition.name}」未加入对比`);
  const opening = deptStat(result, company ? rootId(result) : scopeRoot);
  const labelDetails = quarterChangeDetails(baseline, focus, { people: opening.onBoard, agents: opening.agentInUse });
  const labels = labelDetails.map((label) => label.text);
  const pending = pendingCount(focus.definition.assumptions);
  const assumptions = focus.definition.assumptions;
  const sandbox = definitions.find((definition) => definition.source === "sandbox");
  const columns: CompareColumn[] = [baseline, ...compared].map((item) => {
    const gap = gapLabel(amountOf(item), budgetYuan);
    const lowestColumn = item.definition.id === lowest.definition.id;
    let subtitle = "预设";
    if (item.definition.id === "jx") subtitle = "含已确认在途";
    else if (lowestColumn) subtitle = "成本最低";
    else if (item.definition.id === focus.definition.id) subtitle = "正在编辑";
    else if (item.definition.source === "sandbox") subtitle = "来自沙盘";
    else if (item.definition.source === "copy") subtitle = "副本";
    const partial = company ? partialBuName(item.definition) : null;
    const subtitleNote = partial ? singleDepartmentPlanNote(partial) : null;
    if (partial) subtitle = `仅${partial}`;
    const parts = columnParts(result, item, company);
    const shownQuarters = item.quarters.map((quarter) => (company ? quarter.total : quarter.labor + quarter.agent));
    const yearApprox = roundingGapWan(roundToHalfWan(amountOf(item)), shownQuarters.map((value) => roundToHalfWan(value))) !== 0;
    return {
      id: item.definition.id,
      name: item.definition.name,
      subtitle,
      subtitleNote,
      total: formatWan(amountOf(item)),
      gap: gap.text,
      over: gap.over,
      people: item.yearEndPeople,
      agents: item.yearEndAgents,
      ratio: displayedRatio(item.definition, company),
      daily: formatWan(item.dailyYuan),
      oneOff: formatWan(item.oneOffYuan),
      yearApprox,
      lowest: lowestColumn,
      usage: budgetYuan ? Math.min(100, (roundToHalfWan(amountOf(item)) / roundToHalfWan(budgetYuan)) * 100) : 0,
      ...parts,
    };
  });
  const hero = heroSentence(result, ranked, company ? { companyWide: true } : { budgetYuan, basis: "daily", budgetName: "部门预算", companyWide: false });
  const cut = focus.definition.cuts[0];
  const cutSummary = cut
    ? focus.definition.cuts
        .map((item) => `${item.departmentName} · ${item.grade} · ${item.count} 人 · ${item.effectiveDate} · 补偿 ${formatWan(scenarioCutSeverance(result, item, assumptions.noticePay))} 万${company ? "计入公司一次性，不摊到部门" : "不计入日常成本"}`)
        .join("；")
    : "这一场景没有减员";
  const shownQuarter = (quarter: ScenarioResult["quarters"][number]) => (company ? quarter.total : quarter.labor + quarter.agent);
  return {
    year,
    hero,
    lowestName: lowest.definition.name,
    lowestTotal: formatWan(amountOf(lowest)),
    lowestYearApprox: columns.find((column) => column.lowest)?.yearApprox ?? false,
    budget: formatWan(budgetYuan),
    percent: `${((roundToHalfWan(amountOf(lowest)) / roundToHalfWan(budgetYuan)) * 100).toFixed(1)}%`,
    usage: budgetYuan ? (roundToHalfWan(amountOf(lowest)) / roundToHalfWan(budgetYuan)) * 100 : 0,
    stepSelect: `基线 + ${compared.length} 个场景：${names.join("、") || "还没有"}`,
    stepSelectNote: `${leftOut.join(" · ") || "对比里的场景都已选上"} · 最多对比 3 个`,
    stepAssume: `${focus.definition.name}：离职率 ${ratePercent(assumptions.attritionRate)}% · 招聘周期 ${assumptions.hiringCycleDays} 天`,
    stepAssumeNote: `${labels.join(" · ") || "这一场景没有按季增减"} · ${pending ? `另有 ${pending} 项假设待定` : "假设都已填写"}`,
    stepCheck: `${within} / ${compared.length} 个场景在预算内 · 最低：${lowest.definition.name}`,
    stepCheckNote: `体检 ${hints.length} 条提示，${compliance} 条涉及合规`,
    columns,
    healthName: "对比场景",
    health,
    healthFootnote: healthFootnote(compared),
    incompleteRatioNote: health.some((row) => row.cells.some((cell) => cell.text === "未拆解")) ? INCOMPLETE_RATIO_NOTE : null,
    timelineTitle: `时间轴 · ${focus.definition.name}`,
    timelineCaption: TIMELINE_EFFECTIVE_CAPTION,
    timelineChangeNote: TIMELINE_CHANGE_NOTE,
    timelineSummary: `${focus.quarters.map((quarter, index) => `Q${index + 1} ${formatWan(shownQuarter(quarter))}`).join(" · ")} 万${labels.length ? ` · ${labels.join(" · ")}` : ""}`,
    timelineCostSummary: `${focus.quarters.map((quarter, index) => `Q${index + 1} ${formatWan(shownQuarter(quarter))}`).join(" · ")} 万`,
    timelineLabels: labels,
    timelineLabelNotes: labelDetails.map((label) => label.note),
    timelineRows: focus.quarters.map((quarter, index) => ({
      quarter: `Q${index + 1}`,
      people: quarter.headcount,
      agents: quarter.agents,
      labor: formatWan(quarter.labor),
      agentCost: formatWan(quarter.agent),
      oneOff: formatWan(quarter.oneOff),
      total: formatWan(shownQuarter(quarter)),
    })),
    assumptionSummary: `离职率 ${ratePercent(assumptions.attritionRate)}% · 招聘周期 ${assumptions.hiringCycleDays} 天 · ${assumptions.noticePay ? "N+1 计入" : "N+1 不计入"}${pending ? ` · ${pending} 项待定` : ""}`,
    assumptionForm: {
      attrition: ratePercent(assumptions.attritionRate),
      cycle: String(assumptions.hiringCycleDays),
      raise: ratePercent(assumptions.raiseRate),
      ai: assumptions.aiReplacement == null ? "" : ratePercent(assumptions.aiReplacement),
      noticePay: assumptions.noticePay,
    },
    cutSummary,
    prefillNote,
    scenarios: definitions.map((definition) => ({ id: definition.id, name: definition.name, compared: definition.compared, source: definition.source })),
    focusId: focus.definition.id,
    importNote: sandbox?.structureNote ?? null,
    importRatio: sandbox?.ratio ?? null,
    importSpan: sandbox?.spanAlert ? `${sandbox.spanAlert.department} ${sandbox.spanAlert.span}，上限 ${sandbox.spanAlert.limit}` : null,
    departments: options?.departmentNames ?? result.plan.departments.map((department) => department.name),
    grades: Object.keys(result.plan.gradeAnnual),
    footer: "示例数据 · 均为虚构 · 体检只用匿名汇总数据",
    dailyBreakdown: company ? { note: UNATTRIBUTED_AGENT_NOTE } : null,
    showOneOff: company,
    totalLabel: company ? "全年总成本" : "全年日常成本",
    budgetCaption: company ? "预算总包" : "部门预算",
    oneOffCaption: company ? "一次性费用（经济补偿、Agent 实施 / 培训）按公司统一管理计入总成本，不摊到部门" : "对比的是日常成本（人工 + Agent），不含一次性费用。",
  };
}

export function scenarioCutTextHasPerPerson(value: string): boolean {
  return /68750|每人|perPerson/.test(value);
}
