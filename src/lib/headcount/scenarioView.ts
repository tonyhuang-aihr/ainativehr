import type { ChatTurn } from "@/lib/ai/desensitize";
import { quarterIndex, parseIsoDate } from "@/lib/headcount/calendar";
import { conclusionFacts, directChildFacts, modelUnits, type ModelUnit } from "@/lib/headcount/conclusion";
import { deptStat, type PlanResult } from "@/lib/headcount/engine";
import { TIMELINE_CHANGE_NOTE } from "@/lib/headcount/copy";
import { formatWan, roundToHalfWan } from "@/lib/headcount/money";
import { costRootId, defaultAssumptions, evaluateBaseline, evaluateScenario, quarterChangeLabels, scenarioCutSeverance, type ScenarioAssumptions, type ScenarioDefinition, type ScenarioResult } from "@/lib/headcount/scenario";

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
  total: string;
  gap: string;
  over: boolean;
  people: number;
  agents: number;
  ratio: string;
  daily: string;
  oneOff: string;
  lowest: boolean;
  usage: number;
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
  timelineLabels: string[];
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

function articleText(result: PlanResult, definition: ScenarioDefinition): string | null {
  if (!definition.cuts.length) return null;
  const people = definition.cuts.reduce((total, cut) => total + cut.count, 0);
  const base = deptStat(result, rootId(result)).onBoard;
  const rate = base > 0 ? ((people / base) * 100).toFixed(1) : "0.0";
  return `${people} 人 · ${rate}%`;
}

export function healthRow(result: PlanResult, scenario: ScenarioResult): HealthRow {
  const gap = roundToHalfWan(scenario.totalYuan) - roundToHalfWan(result.plan.companyBudget);
  const definition = scenario.definition;
  const article = articleText(result, definition);
  const cells: HealthCell[] = [
    gap > 0 ? { title: "超预算", text: `超 ${formatWan(gap * 10_000)}`, tone: "warn" } : { title: "超预算", text: "正常", tone: "ok" },
    definition.spanAlert
      ? { title: "管理幅度", text: `${definition.spanAlert.span} > ${definition.spanAlert.limit}`, tone: "warn" }
      : definition.structureNote
        ? { title: "管理幅度", text: "正常", tone: "ok" }
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

export function heroSentence(result: PlanResult, compared: ScenarioResult[]): string {
  const budgetYuan = result.plan.companyBudget;
  const year = result.plan.year;
  const ranked = [...compared].sort((left, right) => left.totalYuan - right.totalYuan);
  const lowest = ranked[0];
  if (!lowest) return "还没有加入对比的场景。";
  const lowestGap = gapLabel(lowest.totalYuan, budgetYuan);
  const lowestRatio = lowest.definition.ratio === "未拆解" ? "人 : AI 未拆解" : `人 : AI 为 ${lowest.definition.ratio}`;
  const span = lowest.definition.spanAlert ? `，但${lowest.definition.spanAlert.department}管理幅度 ${lowest.definition.spanAlert.span} 超过建议值 ${lowest.definition.spanAlert.limit}` : "";
  const bits = [`${phraseAfterName(lowest.definition.name, "成本最低")}（${formatWan(lowest.totalYuan)} 万），比预算总包${lowestGap.text} 万，${lowestRatio}${span}`];
  const rest = ranked.filter((item) => item.definition.id !== lowest.definition.id);
  for (const item of rest) {
    const gap = gapLabel(item.totalYuan, budgetYuan);
    const cutCount = item.definition.cuts.reduce((total, cut) => total + cut.count, 0);
    if (cutCount > 0) {
      const severance = item.definition.cuts.reduce((total, cut) => total + scenarioCutSeverance(result, cut, item.definition.assumptions.noticePay), 0);
      const quarter = quarterOf(year, item.definition.cuts[0].effectiveDate);
      const ratio = item.definition.ratio === "未拆解" ? "人 : AI 未拆解" : `人 : AI 为 ${item.definition.ratio}`;
      bits.push(`${phraseAfterName(item.definition.name, gap.text)} 万，但要在 Q${quarter} 减员 ${cutCount} 人、产生 ${formatWan(severance)} 万经济补偿，${ratio}`);
      continue;
    }
    if (gap.over) bits.push(phraseAfterName(item.definition.name, `超预算总包 ${gap.amount} 万`));
    else bits.push(`${phraseAfterName(item.definition.name, gap.text)} 万，人 : AI 为 ${item.definition.ratio}`);
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
  return { ...source, id, name: `副本 · ${source.name}`, source: "copy", compared: comparedCount < 3, hires: [...source.hires], agents: [...source.agents], cuts: [...source.cuts], extraAgentOneOff: [...source.extraAgentOneOff] };
}

export function setCompared(definitions: ScenarioDefinition[], id: string, compared: boolean): { definitions: ScenarioDefinition[]; error: string | null } {
  const others = definitions.filter((item) => item.compared && item.id !== id).length;
  if (compared && others >= 3) return { definitions, error: "最多对比 3 个场景" };
  return { definitions: definitions.map((item) => (item.id === id ? { ...item, compared } : item)), error: null };
}

export function buildScenarioBoard(result: PlanResult, definitions: ScenarioDefinition[], focusId: string, prefillNote: string): ScenarioBoard {
  const year = result.plan.year;
  const budgetYuan = result.plan.companyBudget;
  const baseline = evaluateBaseline(result);
  const evaluated = new Map(definitions.map((definition) => [definition.id, evaluateScenario(result, definition)]));
  const focus = evaluated.get(focusId) ?? evaluated.get("jj") ?? [...evaluated.values()][0] ?? baseline;
  const compared = definitions.filter((definition) => definition.compared).map((definition) => evaluated.get(definition.id)!);
  const lowest = [...compared].sort((left, right) => left.totalYuan - right.totalYuan)[0] ?? baseline;
  const within = compared.filter((item) => roundToHalfWan(item.totalYuan) <= roundToHalfWan(budgetYuan)).length;
  const health = compared.map((item) => healthRow(result, item));
  const hints = health.flatMap((row) => row.cells).filter((cell) => cell.tone === "warn" || cell.tone === "compliance");
  const compliance = hints.filter((cell) => cell.tone === "compliance").length;
  const names = compared.map((item) => item.definition.name);
  const leftOut = definitions.filter((definition) => !definition.compared).map((definition) => `「${definition.name}」未加入对比`);
  const opening = deptStat(result, rootId(result));
  const labels = quarterChangeLabels(baseline, focus, { people: opening.onBoard, agents: opening.agentInUse });
  const pending = pendingCount(focus.definition.assumptions);
  const assumptions = focus.definition.assumptions;
  const sandbox = definitions.find((definition) => definition.source === "sandbox");
  const columns: CompareColumn[] = [baseline, ...compared].map((item) => {
    const gap = gapLabel(item.totalYuan, budgetYuan);
    const lowestColumn = item.definition.id === lowest.definition.id;
    let subtitle = "预设";
    if (item.definition.id === "jx") subtitle = "含已确认在途";
    else if (lowestColumn) subtitle = "成本最低";
    else if (item.definition.id === focus.definition.id) subtitle = "正在编辑";
    else if (item.definition.source === "sandbox") subtitle = "来自沙盘";
    else if (item.definition.source === "copy") subtitle = "副本";
    return {
      id: item.definition.id,
      name: item.definition.name,
      subtitle,
      total: formatWan(item.totalYuan),
      gap: gap.text,
      over: gap.over,
      people: item.yearEndPeople,
      agents: item.yearEndAgents,
      ratio: item.definition.ratio,
      daily: formatWan(item.dailyYuan),
      oneOff: formatWan(item.oneOffYuan),
      lowest: lowestColumn,
      usage: budgetYuan ? Math.min(100, (roundToHalfWan(item.totalYuan) / roundToHalfWan(budgetYuan)) * 100) : 0,
    };
  });
  const heroCompared = compared.length ? compared : [focus];
  const hero = heroSentence(result, heroCompared);
  const cut = focus.definition.cuts[0];
  const cutSummary = cut
    ? focus.definition.cuts
        .map((item) => `${item.departmentName} · ${item.grade} · ${item.count} 人 · ${item.effectiveDate} · 补偿 ${formatWan(scenarioCutSeverance(result, item, assumptions.noticePay))} 万计入公司一次性，不摊到部门`)
        .join("；")
    : "这一场景没有减员";
  return {
    year,
    hero,
    lowestName: lowest.definition.name,
    lowestTotal: formatWan(lowest.totalYuan),
    budget: formatWan(budgetYuan),
    percent: `${((roundToHalfWan(lowest.totalYuan) / roundToHalfWan(budgetYuan)) * 100).toFixed(1)}%`,
    usage: budgetYuan ? (roundToHalfWan(lowest.totalYuan) / roundToHalfWan(budgetYuan)) * 100 : 0,
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
    timelineSummary: `${focus.quarters.map((quarter, index) => `Q${index + 1} ${formatWan(quarter.total)}`).join(" · ")} 万${labels.length ? ` · ${labels.join(" · ")}` : ""}`,
    timelineLabels: labels,
    timelineRows: focus.quarters.map((quarter, index) => ({
      quarter: `Q${index + 1}`,
      people: quarter.headcount,
      agents: quarter.agents,
      labor: formatWan(quarter.labor),
      agentCost: formatWan(quarter.agent),
      oneOff: formatWan(quarter.oneOff),
      total: formatWan(quarter.total),
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
    departments: result.plan.departments.map((department) => department.name),
    grades: Object.keys(result.plan.gradeAnnual),
    footer: "示例数据 · 均为虚构 · 体检只用匿名汇总数据",
  };
}

export function scenarioCutTextHasPerPerson(value: string): boolean {
  return /68750|每人|perPerson/.test(value);
}
