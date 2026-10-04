import { quarterBounds, yearDays, overlapDays } from "@/lib/headcount/calendar";
import { allocateLargestRemainder, type RemainderShare } from "@/lib/headcount/allocation";
import { deptStat, subtreeIds, type PlanResult } from "@/lib/headcount/engine";
import { DEMO_AI_RATIO } from "@/lib/headcount/sample";
import {
  costRootId,
  evaluateBaseline,
  evaluateScenario,
  formalAverageAnnual,
  presetScenarios,
  scenarioAgentQuarters,
  type ScenarioDefinition,
  type ScenarioResult,
} from "@/lib/headcount/scenario";

/** 组织架构顺序。平级余数相同时，越靠前越先分到名额。 */
export const FIRST_LEVEL_IDS = ["rd-direct", "prod1", "prod2", "plat", "qa", "ai"] as const;

export type DailyRow = { id: string; name: string; yuan: number };

export type DailyBreakdown = {
  rows: DailyRow[];
  unattributedYuan: number;
};

export function firstLevelShares(result: PlanResult): RemainderShare[] {
  return FIRST_LEVEL_IDS.map((id) => ({ id, base: deptStat(result, id).onBoard }));
}

/** 公司只取整一次。各部门用这一整数，不再各自四舍五入。 */
export function companyAttritionCount(result: PlanResult, rate: number): number {
  const root = costRootId(result);
  return Math.round(deptStat(result, root).onBoard * rate / 4);
}

export function allocateCompanyAttrition(result: PlanResult, rate: number): Map<string, number> {
  return allocateLargestRemainder(companyAttritionCount(result, rate), firstLevelShares(result));
}

/** 和场景引擎同一套缺编窗口。返回每个季度少掉的人工成本（元，正数）。 */
export function vacancyQuarterSavings(result: PlanResult, seats: number, average: number, hiringCycleDays: number): number[] {
  const year = result.plan.year;
  const bounds = quarterBounds(year);
  const yearDaysCount = yearDays(year);
  const saved = [0, 0, 0, 0];
  for (const [start, end] of bounds) {
    const length = Math.round((end - start) / 86_400_000);
    const mid = start + Math.floor(length / 2) * 86_400_000;
    const back = mid + hiringCycleDays * 86_400_000;
    bounds.forEach(([from, to], index) => {
      saved[index] += (seats * average * overlapDays(from, to, mid, back)) / yearDaysCount;
    });
  }
  return saved;
}

function unattributedYuan(result: PlanResult, definition: ScenarioDefinition): number {
  const agents = definition.agents.filter((agent) => agent.departmentName === null);
  return scenarioAgentQuarters(result, agents).reduce((total, value) => total + value, 0);
}

function reconcile(companyDaily: number, rows: DailyRow[], unattributed: number): DailyBreakdown {
  const sum = rows.reduce((total, row) => total + row.yuan, 0) + unattributed;
  const residual = companyDaily - sum;
  if (rows.length && residual !== 0) {
    const last = rows[rows.length - 1];
    rows[rows.length - 1] = { ...last, yuan: last.yuan + residual };
  }
  return { rows, unattributedYuan: unattributed };
}

export function baselineDailyBreakdown(result: PlanResult): DailyBreakdown {
  const company = evaluateBaseline(result);
  const rows = FIRST_LEVEL_IDS.map((id) => {
    const stat = deptStat(result, id);
    return { id, name: stat.name, yuan: evaluateBaseline(result, id).dailyYuan };
  });
  return reconcile(company.dailyYuan, rows, 0);
}

export function scenarioDailyBreakdown(result: PlanResult, definition: ScenarioDefinition): DailyBreakdown {
  const company = evaluateScenario(result, definition);
  const average = formalAverageAnnual(result);
  const seats = allocateCompanyAttrition(result, definition.assumptions.attritionRate);
  const rows = FIRST_LEVEL_IDS.map((id) => {
    const stat = deptStat(result, id);
    const evaluated = evaluateScenario(result, definition, {
      rootId: id,
      attritionPerQuarter: seats.get(id) ?? 0,
      averageFormalAnnual: average,
    });
    return { id, name: stat.name, yuan: evaluated.dailyYuan };
  });
  return reconcile(company.dailyYuan, rows, unattributedYuan(result, definition));
}

/** 事业部看到的日常成本，和公司展开行里该部门的格子相同。 */
export function businessScenarioResult(result: PlanResult, definition: ScenarioDefinition, rootId: string): ScenarioResult {
  const average = formalAverageAnnual(result);
  const seats = allocateCompanyAttrition(result, definition.assumptions.attritionRate);
  const evaluated = evaluateScenario(result, definition, {
    rootId,
    attritionPerQuarter: seats.get(rootId) ?? 0,
    averageFormalAnnual: average,
  });
  const row = scenarioDailyBreakdown(result, definition).rows.find((item) => item.id === rootId);
  if (!row || row.yuan === evaluated.dailyYuan) return evaluated;
  const delta = row.yuan - evaluated.dailyYuan;
  return { ...evaluated, dailyYuan: evaluated.dailyYuan + delta, totalYuan: evaluated.totalYuan + delta };
}

function namesIn(result: PlanResult, rootId: string): Set<string> {
  const ids = subtreeIds(result.plan, rootId);
  return new Set(result.plan.departments.filter((department) => ids.has(department.id)).map((department) => department.name));
}

/** 公司预设投影到一个事业部。假设从公司预设原样复制，不另写一套 8% / 60 天。 */
export function projectBusinessPreset(definition: ScenarioDefinition, rootId: string, result: PlanResult): ScenarioDefinition {
  const names = namesIn(result, rootId);
  const outsideName = (name: string) => !names.has(name);
  const mentionsOutside = definition.structureNote
    ? result.plan.departments.some((department) => outsideName(department.name) && definition.structureNote!.includes(department.name))
    : false;
  const ratio = DEMO_AI_RATIO[rootId] ?? "未拆解";
  return {
    ...definition,
    id: `bu-${rootId}-${definition.id}`,
    source: "preset",
    compared: true,
    assumptions: { ...definition.assumptions },
    assumptionOrigin: "od",
    hires: definition.hires.filter((hire) => names.has(hire.departmentName)),
    agents: definition.agents.filter((agent) => agent.departmentName != null && names.has(agent.departmentName)),
    cuts: definition.cuts.filter((cut) => names.has(cut.departmentName)),
    extraAgentOneOff: [],
    ratio,
    ratioNote: ratio === "未拆解" ? "沙盘尚未拆解" : definition.ratioNote,
    structureNote: mentionsOutside ? null : definition.structureNote,
    spanAlert: definition.spanAlert && outsideName(definition.spanAlert.department) ? null : definition.spanAlert,
  };
}

const BUSINESS_PRESET_IDS = ["jz", "jj", "bs"];

/** 还没保存过的事业部预设用公司预设现算。保存之后以事业部自己的那一版为准。 */
export function mergeBusinessScenarios(
  catalog: readonly ScenarioDefinition[],
  visible: readonly ScenarioDefinition[],
  rootId: string,
  result: PlanResult,
): ScenarioDefinition[] {
  const seeds = BUSINESS_PRESET_IDS.map((id) => catalog.find((item) => item.id === id) ?? presetScenarios().find((item) => item.id === id)).filter((item): item is ScenarioDefinition => Boolean(item));
  const projected = seeds.map((seed) => projectBusinessPreset(seed, rootId, result));
  const saved = new Map(visible.map((item) => [item.id, item]));
  const merged = projected.map((item) => saved.get(item.id) ?? item);
  const rest = visible.filter((item) => !merged.some((projectedItem) => projectedItem.id === item.id));
  return [...merged, ...rest];
}
