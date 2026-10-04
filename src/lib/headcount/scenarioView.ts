import type { ChatTurn } from "@/lib/ai/desensitize";
import { quarterIndex, parseIsoDate } from "@/lib/headcount/calendar";
import { conclusionFacts, directChildFacts, modelUnits, type ModelUnit } from "@/lib/headcount/conclusion";
import { deptStat, type PlanResult } from "@/lib/headcount/engine";
import { formatWan, roundToHalfWan } from "@/lib/headcount/money";
import { defaultAssumptions, evaluateBaseline, evaluateScenario, scenarioCutSeverance, type ScenarioAssumptions, type ScenarioDefinition, type ScenarioResult } from "@/lib/headcount/scenario";
import { DEFAULT_SETTINGS } from "@/lib/model/types";

export const DEFAULT_PREFILL_NOTE = "没有配置模型，使用默认值：离职率 8%，招聘周期 60 天，调薪率 0%，AI 替代比例沿用沙盘拆解。N+1 默认不计入。";
export const MODEL_PREFILL_NOTE = "已配置模型。用模型预填时只发送脱敏后的部门汇总，不足 5 人的部门不带人数和金额。";

const SPAN_LIMIT = DEFAULT_SETTINGS.thresholds.spanWide;
const LINE_SPAN_MAX = 40;
const QUARTER_DATE = ["2027-01-01", "2027-04-01", "2027-07-01", "2027-10-01"] as const;

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
  health: HealthCheck[];
  timelineTitle: string;
  timelineSummary: string;
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
  return result.plan.departments.find((department) => !department.parentId)?.id ?? "rd";
}

function percentText(count: number, base: number): string {
  if (!base) return "0.0";
  return ((count / base) * 100).toFixed(1);
}

function quarterOf(year: number, iso: string): number {
  return quarterIndex(year, parseIsoDate(iso)) + 1;
}

export function rosterSpanHints(result: PlanResult): { department: string; span: number; limit: number }[] {
  const counts = new Map<string, number>();
  for (const person of result.people) {
    if (!person.managerId || person.managerId === person.id) continue;
    counts.set(person.managerId, (counts.get(person.managerId) ?? 0) + 1);
  }
  const best = new Map<string, number>();
  const names = new Map(result.plan.departments.map((department) => [department.id, department.name]));
  for (const person of result.people) {
    const span = counts.get(person.id) ?? 0;
    if (span <= SPAN_LIMIT) continue;
    const department = names.get(person.departmentId);
    if (!department) continue;
    best.set(department, Math.max(best.get(department) ?? 0, span));
  }
  return [...best.entries()]
    .map(([department, span]) => ({ department, span, limit: SPAN_LIMIT }))
    .sort((left, right) => right.span - left.span || left.department.localeCompare(right.department, "zh"));
}

function spanBody(result: PlanResult, definition: ScenarioDefinition): string {
  if (definition.spanAlert) {
    const alert = definition.spanAlert;
    return `${alert.department} ${alert.span}，超过建议上限 ${alert.limit}。只写部门，不写负责人。`;
  }
  const spans = rosterSpanHints(result);
  const line = spans.filter((item) => item.span <= LINE_SPAN_MAX);
  const bulk = spans.length - line.length;
  const named = line.map((item) => `${item.department} ${item.span}`).join("、");
  const head = named ? `${named}，超过建议上限 ${SPAN_LIMIT}。只写部门，不写负责人。` : `有部门超过建议上限 ${SPAN_LIMIT}。只写部门，不写负责人。`;
  return bulk ? `${head}另有 ${bulk} 个部门在示例里整组建制挂在负责人名下，不逐条展开。` : head;
}

export function healthChecks(result: PlanResult, scenario: ScenarioResult): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const year = result.plan.year;
  const definition = scenario.definition;
  const onBoard = deptStat(result, rootId(result)).onBoard;
  if (definition.cuts.length) {
    const byQuarter = new Map<number, number>();
    for (const cut of definition.cuts) {
      const quarter = quarterOf(year, cut.effectiveDate);
      byQuarter.set(quarter, (byQuarter.get(quarter) ?? 0) + cut.count);
    }
    const count = definition.cuts.reduce((total, cut) => total + cut.count, 0);
    const where = [...byQuarter.entries()].map(([quarter, people]) => `Q${quarter} 减员 ${people} 人`).join("、");
    checks.push({
      title: "《劳动合同法》第 41 条",
      body: `${where}，约占职工总数 ${percentText(count, onBoard)}%。仅作提醒，请与法务确认是否需要报告。`,
      compliance: true,
    });
  }
  if (definition.ratio === "未拆解") {
    const byQuarter = new Map<number, number>();
    for (const agent of definition.agents) {
      const quarter = quarterOf(year, agent.effectiveDate);
      byQuarter.set(quarter, (byQuarter.get(quarter) ?? 0) + agent.count);
    }
    const top = [...byQuarter.entries()].sort((left, right) => right[1] - left[1])[0];
    const added = top ? `Q${top[0]} 新增 ${top[1]} 个 Agent 的岗位没有沙盘拆解` : "新增 Agent 的岗位没有沙盘拆解";
    checks.push({ title: "人 : AI 未拆解", body: `${added}，不按 Agent 个数推算。`, compliance: false });
  }
  const reserve = result.plan.oneOffBudget;
  if (reserve != null && scenario.oneOffYuan > reserve) {
    const room = roundToHalfWan(result.plan.companyBudget - reserve) - roundToHalfWan(scenario.dailyYuan);
    const totalGap = roundToHalfWan(result.plan.companyBudget) - roundToHalfWan(scenario.totalYuan);
    const roomText = `${room >= 0 ? "结余" : "超"} ${formatWan(Math.abs(room) * 10_000)}`;
    const totalText = `${totalGap >= 0 ? "仍结余" : "超"} ${formatWan(Math.abs(totalGap) * 10_000)}`;
    checks.push({
      title: "一次性费用超出预留",
      body: `一次性 ${formatWan(scenario.oneOffYuan)} 万，超出预留 ${formatWan(reserve)} 万（示例）；部门持续成本${roomText} 万，合计${totalText} 万。`,
      compliance: false,
    });
  } else if (roundToHalfWan(scenario.totalYuan) > roundToHalfWan(result.plan.companyBudget)) {
    const gap = roundToHalfWan(scenario.totalYuan) - roundToHalfWan(result.plan.companyBudget);
    checks.push({ title: "超预算", body: `全年 ${formatWan(scenario.totalYuan)} 万，超预算总包 ${formatWan(gap * 10_000)} 万。`, compliance: false });
  }
  if (roundToHalfWan(scenario.totalYuan) > roundToHalfWan(result.plan.companyBudget) && reserve != null && scenario.oneOffYuan > reserve) {
    const gap = roundToHalfWan(scenario.totalYuan) - roundToHalfWan(result.plan.companyBudget);
    checks.push({ title: "超预算", body: `全年超预算总包 ${formatWan(gap * 10_000)} 万。`, compliance: false });
  }
  const spans = definition.spanAlert ? [definition.spanAlert] : rosterSpanHints(result);
  if (spans.length) checks.push({ title: "管理幅度", body: spanBody(result, definition), compliance: false });
  return checks;
}

function gapLabel(totalYuan: number, budgetYuan: number): { over: boolean; text: string; amount: string } {
  const gap = roundToHalfWan(totalYuan) - roundToHalfWan(budgetYuan);
  const amount = formatWan(Math.abs(gap) * 10_000);
  if (gap > 0) return { over: true, text: `超 ${amount}`, amount };
  return { over: false, text: `结余 ${amount}`, amount };
}

export function heroSentence(result: PlanResult, compared: ScenarioResult[]): string {
  const budgetYuan = result.plan.companyBudget;
  const year = result.plan.year;
  const ranked = [...compared].sort((left, right) => left.totalYuan - right.totalYuan);
  const lowest = ranked[0];
  if (!lowest) return "还没有加入对比的场景。";
  const lowestGap = gapLabel(lowest.totalYuan, budgetYuan);
  const lowestRatio = lowest.definition.ratio === "未拆解" ? "人 : AI 未拆解" : `人 : AI 为 ${lowest.definition.ratio}`;
  const bits = [`${lowest.definition.name}成本最低（${formatWan(lowest.totalYuan)} 万），比预算总包${lowestGap.text} 万，${lowestRatio}`];
  const rest = ranked.filter((item) => item.definition.id !== lowest.definition.id);
  for (const item of rest) {
    const gap = gapLabel(item.totalYuan, budgetYuan);
    const cutCount = item.definition.cuts.reduce((total, cut) => total + cut.count, 0);
    if (cutCount > 0) {
      const severance = item.definition.cuts.reduce((total, cut) => total + scenarioCutSeverance(result, cut, item.definition.assumptions.noticePay), 0);
      const quarter = quarterOf(year, item.definition.cuts[0].effectiveDate);
      const ratio = item.definition.ratio === "未拆解" ? "人 : AI 未拆解" : `人 : AI 为 ${item.definition.ratio}`;
      bits.push(`${item.definition.name}${gap.text} 万，但要在 Q${quarter} 减员 ${cutCount} 人、产生 ${formatWan(severance)} 万经济补偿，${ratio}`);
      continue;
    }
    if (gap.over) bits.push(`${item.definition.name}超预算总包 ${gap.amount} 万`);
    else bits.push(`${item.definition.name}${gap.text} 万，人 : AI 为 ${item.definition.ratio}`);
  }
  return `对比的 ${compared.length} 个场景中，${bits.join("；")}。`;
}

function eventSummary(year: number, definition: ScenarioDefinition): string {
  const agents = new Map<number, number>();
  const cuts = new Map<number, number>();
  for (const agent of definition.agents) agents.set(quarterOf(year, agent.effectiveDate), (agents.get(quarterOf(year, agent.effectiveDate)) ?? 0) + agent.count);
  for (const cut of definition.cuts) cuts.set(quarterOf(year, cut.effectiveDate), (cuts.get(quarterOf(year, cut.effectiveDate)) ?? 0) + cut.count);
  const events = [
    ...[...agents.entries()].filter((entry) => entry[1] > 0).map(([quarter, count]) => `Q${quarter} +${count} Agent`),
    ...[...cuts.entries()].filter((entry) => entry[1] > 0).map(([quarter, count]) => `Q${quarter} 减员 ${count} 人`),
  ];
  return events.join(" · ");
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
  const health = healthChecks(result, focus);
  const compliance = health.filter((item) => item.compliance).length;
  const names = compared.map((item) => item.definition.name);
  const leftOut = definitions.filter((definition) => !definition.compared).map((definition) => `「${definition.name}」未加入对比`);
  const events = eventSummary(year, focus.definition);
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
    stepAssumeNote: `${events || "这一场景没有按季增减"} · ${pending ? `另有 ${pending} 项假设待定` : "假设都已填写"}`,
    stepCheck: `${within} / ${compared.length} 个场景在预算内 · 最低：${lowest.definition.name}`,
    stepCheckNote: `体检 ${health.length} 条提示，${compliance} 条涉及合规`,
    columns,
    healthName: `${focus.definition.name} · ${health.length} 条`,
    health,
    timelineTitle: `时间轴 · ${focus.definition.name}`,
    timelineSummary: `${focus.quarters.map((quarter, index) => `Q${index + 1} ${formatWan(quarter.total)}`).join(" · ")} 万${events ? ` · ${events}` : ""}`,
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
