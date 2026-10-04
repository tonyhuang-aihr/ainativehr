import { formatIsoDate, quarterBounds, quarterIndex, yearDays, yearEnd, overlapDays, parseIsoDate } from "@/lib/headcount/calendar";
import { NOFILL_LABEL_TEMPLATE } from "@/lib/headcount/copy";
import { deptStat, subtreeIds, type PlanResult } from "@/lib/headcount/engine";
import { formatWan, roundToHalfWan } from "@/lib/headcount/money";
import { exclusiveServiceEnd, SCENARIO_NOTICE_PAY_DEFAULT } from "@/lib/headcount/policies";
import { estimateSeverance, type CompMark } from "@/lib/headcount/severance";

export type ScenarioHire = {
  departmentName: string;
  grade: string;
  count: number;
  effectiveDate: string;
};

export type ScenarioAgentChange = {
  name: string;
  count: number;
  /** 单实例月费（席位 + 算力）。 */
  monthly: number;
  effectiveDate: string;
  /** 上线当季的一次性费用，部门不摊。 */
  oneOff: number;
  /**
   * 所属部门。null 表示未归属，只计入公司口径。
   * 字段缺失时引擎直接报错，不能靠省略来表示未归属。
   */
  departmentName: string | null;
};

export type ScenarioCut = {
  departmentName: string;
  grade: string;
  count: number;
  /** 最后工作日。成本算到这一天，含当天。 */
  effectiveDate: string;
  mark: CompMark;
  /** 部门 × 职级平均司龄（年）。不足 5 人时已经并入上一级。 */
  tenureYears: number;
  groupSize: number;
};

/** 出缺不补：岗位空出后不再补人。不是增员，也不是减员。 */
export type ScenarioNofill = {
  departmentName: string;
  grade: string;
  count: number;
  effectiveDate: string;
};

export type ScenarioAssumptions = {
  attritionRate: number;
  hiringCycleDays: number;
  raiseRate: number;
  /** 空着表示沿用沙盘拆解，不另算替代。 */
  aiReplacement: number | null;
  noticePay: boolean;
};

export type ScenarioDefinition = {
  id: string;
  name: string;
  source: "preset" | "copy" | "sandbox";
  compared: boolean;
  assumptions: ScenarioAssumptions;
  assumptionOrigin: "default" | "model" | "od";
  hires: ScenarioHire[];
  agents: ScenarioAgentChange[];
  extraAgentOneOff: { effectiveDate: string; amount: number }[];
  cuts: ScenarioCut[];
  /** 缺了就空着。没有这个字段的旧场景按空列表。 */
  nofill?: ScenarioNofill[];
  /**
   * 只拆开了部分部门时的人 : AI。公司对比要标明「仅某部门」。
   * 没写时，人 : AI 就是整份方案的比例。
   */
  buRatio?: Record<string, string>;
  ratio: string;
  ratioNote: string;
  structureNote: string | null;
  spanAlert: { department: string; span: number; limit: number } | null;
};

export type ScenarioQuarter = {
  labor: number;
  agent: number;
  oneOff: number;
  total: number;
  headcount: number;
  agents: number;
};

/** 这一季相对上一季，未补上的离职缺口、场景增员、场景减员、Agent 增减。括号外的数字用这些，不用净差额的正负号。 */
export type QuarterFlow = {
  attrition: number;
  hires: number;
  cuts: number;
  agentsAdded: number;
  agentsRemoved: number;
  /** 这一季新计入离职未补位的出缺不补人数。已经加进 attrition。 */
  nofill: number;
};

export type ScenarioResult = {
  definition: ScenarioDefinition;
  quarters: ScenarioQuarter[];
  dailyYuan: number;
  oneOffYuan: number;
  severanceYuan: number;
  agentOneOffYuan: number;
  totalYuan: number;
  yearEndPeople: number;
  yearEndAgents: number;
  attritionPerQuarter: number;
  flows: QuarterFlow[];
};

const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  attritionRate: 0.08,
  hiringCycleDays: 60,
  raiseRate: 0,
  aiReplacement: null,
  noticePay: SCENARIO_NOTICE_PAY_DEFAULT,
};

export function defaultAssumptions(patch?: Partial<ScenarioAssumptions>): ScenarioAssumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...patch, noticePay: patch?.noticePay ?? SCENARIO_NOTICE_PAY_DEFAULT };
}

export function presetScenarios(): ScenarioDefinition[] {
  const common = { assumptionOrigin: "default" as const, extraAgentOneOff: [] as ScenarioDefinition["extraAgentOneOff"], structureNote: null, spanAlert: null };
  return [
    {
      ...common,
      id: "jz",
      name: "基准",
      source: "preset",
      compared: true,
      assumptions: defaultAssumptions(),
      hires: [
        { departmentName: "产品研发一部", grade: "P6", count: 4, effectiveDate: "2027-04-01" },
        { departmentName: "数据智能部", grade: "P6", count: 2, effectiveDate: "2027-04-01" },
        { departmentName: "质量与交付部", grade: "P5", count: 4, effectiveDate: "2027-07-01" },
      ],
      agents: [{ name: "测试用例生成 Agent", count: 4, monthly: 2000, effectiveDate: "2027-04-01", oneOff: 40_000, departmentName: null }],
      cuts: [],
      ratio: "78 : 22",
      ratioNote: "沿用基线拆解",
    },
    {
      ...common,
      id: "jj",
      name: "激进 · AI 加速",
      source: "preset",
      compared: true,
      assumptions: defaultAssumptions(),
      hires: [{ departmentName: "数据智能部", grade: "P7", count: 2, effectiveDate: "2027-04-01" }],
      agents: [
        { name: "测试用例生成 Agent", count: 6, monthly: 2000, effectiveDate: "2027-04-01", oneOff: 0, departmentName: null },
        { name: "代码评审 Agent", count: 6, monthly: 3500, effectiveDate: "2027-04-01", oneOff: 0, departmentName: null },
      ],
      extraAgentOneOff: [{ effectiveDate: "2027-04-01", amount: 180_000 }],
      cuts: [
        {
          departmentName: "质量与交付部",
          grade: "P5",
          count: 8,
          effectiveDate: "2027-07-01",
          mark: "N",
          tenureYears: 3.4,
          groupSize: 28,
        },
      ],
      ratio: "未拆解",
      ratioNote: "新增 Agent 的岗位未在沙盘拆解",
    },
    {
      ...common,
      id: "bs",
      name: "保守",
      source: "preset",
      compared: false,
      assumptions: defaultAssumptions({ hiringCycleDays: 90 }),
      hires: [],
      agents: [{ name: "代码评审 Agent", count: 2, monthly: 3500, effectiveDate: "2027-04-01", oneOff: 10_000, departmentName: null }],
      cuts: [],
      ratio: "78 : 22",
      ratioNote: "沿用基线拆解",
    },
    {
      id: "fa",
      name: "沙盘方案 A · 拆组前",
      source: "sandbox",
      compared: true,
      assumptions: defaultAssumptions(),
      assumptionOrigin: "default",
      hires: [],
      agents: [{ name: "方案 A 新增 Agent 岗位", count: 6, monthly: 380_000 / 6 / 12, effectiveDate: "2027-04-01", oneOff: 120_000, departmentName: "数据智能部" }],
      extraAgentOneOff: [],
      cuts: [],
      ratio: "69 : 31",
      ratioNote: "来自沙盘方案 A 拆解",
      structureNote: "应用分析小组并入数据组。产品研发一部 150→144 人，数据智能部 65→71 人。生效季度由 OD 定为 Q2。",
      spanAlert: { department: "数据组", span: 12, limit: 8 },
    },
  ];
}

function add(left: number[], right: number[]): number[] {
  return left.map((value, index) => value + (right[index] ?? 0));
}

function scale(values: number[], factor: number): number[] {
  return values.map((value) => value * factor);
}

function qsplit(year: number, annual: number, startIso: string, endMs = yearEnd(year)): number[] {
  const start = parseIsoDate(startIso);
  return quarterBounds(year).map(([from, to]) => (annual * overlapDays(from, to, start, endMs)) / yearDays(year));
}

/** 公司方案用研发中心。范围里没有研发中心时，用这份计划自己的根部门，OD 数字不变。 */
export function costRootId(result: PlanResult): string {
  if (result.plan.departments.some((department) => department.id === "rd")) return "rd";
  const ids = new Set(result.plan.departments.map((department) => department.id));
  const root = result.plan.departments.find((department) => !department.parentId || !ids.has(department.parentId));
  return root?.id ?? result.plan.departments[0]?.id ?? "rd";
}

function emptyFlows(): QuarterFlow[] {
  return [0, 1, 2, 3].map(() => ({ attrition: 0, hires: 0, cuts: 0, agentsAdded: 0, agentsRemoved: 0, nofill: 0 }));
}

function baselineQuarters(result: PlanResult, rootId: string): { labor: number[]; agent: number[]; severance: number[]; agentOneOff: number[]; headcount: number[]; agents: number[] } {
  const stat = deptStat(result, rootId);
  const ids = subtreeIds(result.plan, rootId);
  const year = result.plan.year;
  const bounds = quarterBounds(year);
  const headcount = bounds.map(([, end]) => {
    let count = stat.onBoard;
    for (const movement of result.movements) {
      if (!ids.has(movement.departmentId)) continue;
      if (parseIsoDate(movement.effectiveDate) >= end) continue;
      if (movement.kind === "入职") count += 1;
      if (movement.kind === "离职") count -= 1;
    }
    return count;
  });
  const agents = bounds.map(([, end]) => {
    let count = stat.agentInUse;
    for (const movement of result.movements) {
      if (!ids.has(movement.departmentId)) continue;
      if (!movement.kind.startsWith("Agent")) continue;
      if (parseIsoDate(movement.effectiveDate) >= end) continue;
      count += movement.agentInstances ?? 0;
    }
    return count;
  });
  return {
    labor: [0, 1, 2, 3].map((index) => stat.quarterFormal[index] + stat.quarterOther[index]),
    agent: [...stat.quarterAgent],
    severance: [...stat.quarterSeverance],
    agentOneOff: [...stat.quarterAgentOneOff],
    headcount,
    agents,
  };
}

/** 在岗、待离职、待转出的正式员工年均。计算中不取整。 */
export function formalAverageAnnual(result: PlanResult): number {
  const onBoard = result.people.filter((person) => person.status === "在岗" || person.status === "待离职" || person.status === "待转出");
  const annual = onBoard.reduce((total, person) => total + (result.plan.gradeAnnual[person.grade] ?? 0), 0);
  return onBoard.length ? annual / onBoard.length : 0;
}

export function requireAgentDepartment(agent: ScenarioAgentChange): void {
  if (agent.departmentName === undefined || agent.departmentName === "") throw new Error(`Agent「${agent.name}」缺少所属部门`);
}

export function scenarioAgentQuarters(result: PlanResult, agents: ScenarioAgentChange[]): number[] {
  const year = result.plan.year;
  let quarters = [0, 0, 0, 0];
  for (const change of agents) {
    requireAgentDepartment(change);
    quarters = add(quarters, qsplit(year, change.monthly * 12 * change.count, change.effectiveDate));
  }
  return quarters;
}

export type ScenarioEvalOptions = {
  rootId?: string;
  /** 缺编人数。不传时按该根部门年初在岗取整一次。 */
  attritionPerQuarter?: number;
  /** 缺编用的正式员工年均。不传时用这份计划里的人，公司方案即公司均薪。 */
  averageFormalAnnual?: number;
};

/** 场景减员的补偿月数。平均司龄先换成完整月，再按第 47 条折月。 */
export function scenarioCutSeverance(result: PlanResult, cut: ScenarioCut, noticePay: boolean): number {
  const gradeAnnual = result.plan.gradeAnnual[cut.grade] ?? 0;
  const city = result.plan.cityMonthly["北京"] ?? null;
  const estimated = estimateSeverance({
    mark: cut.mark,
    gradeAnnual,
    monthlyWageBase: result.plan.gradeMonthly?.[cut.grade],
    averageMonths: Math.round(cut.tenureYears * 12),
    cityMonthly: city,
    noticePay: noticePay && cut.mark !== "不计",
  });
  return estimated.amount * cut.count;
}

export function evaluateScenario(result: PlanResult, definition: ScenarioDefinition, options?: ScenarioEvalOptions): ScenarioResult {
  for (const change of definition.agents) requireAgentDepartment(change);
  const year = result.plan.year;
  const rootId = options?.rootId ?? costRootId(result);
  const base = baselineQuarters(result, rootId);
  const stat = deptStat(result, rootId);
  let labor = [...base.labor];
  let agent = [...base.agent];
  const severance = [...base.severance];
  const agentOneOff = [...base.agentOneOff];
  let headcount = [...base.headcount];
  let agents = [...base.agents];
  const bounds = quarterBounds(year);
  const yearDaysCount = yearDays(year);
  const average = options?.averageFormalAnnual ?? formalAverageAnnual(result);
  const perQuarter = options?.attritionPerQuarter ?? Math.round(stat.onBoard * definition.assumptions.attritionRate / 4);
  const scopeIds = subtreeIds(result.plan, rootId);
  const wholePlan = result.plan.departments.every((department) => scopeIds.has(department.id));
  const namesInScope = new Set(result.plan.departments.filter((department) => scopeIds.has(department.id)).map((department) => department.name));
  const personHere = (name: string) => wholePlan || namesInScope.has(name);
  const agentHere = (change: ScenarioAgentChange) => wholePlan || (change.departmentName != null && namesInScope.has(change.departmentName));
  const gap = [0, 0, 0, 0];
  const flows = emptyFlows();

  for (const [start, end] of bounds) {
    const length = Math.round((end - start) / 86_400_000);
    const mid = start + Math.floor(length / 2) * 86_400_000;
    const back = mid + definition.assumptions.hiringCycleDays * 86_400_000;
    const vacant = bounds.map(([from, to]) => (perQuarter * average * overlapDays(from, to, mid, back)) / yearDaysCount);
    labor = add(labor, scale(vacant, -1));
    bounds.forEach(([, quarterEnd], later) => {
      if (mid < quarterEnd && back >= quarterEnd) {
        headcount[later] -= perQuarter;
        gap[later] += perQuarter;
      }
    });
  }
  for (let index = 0; index < 4; index += 1) flows[index].attrition = gap[index] - (index === 0 ? 0 : gap[index - 1]);

  if (definition.assumptions.raiseRate) {
    labor = scale(labor, 1 + definition.assumptions.raiseRate);
  }

  for (const hire of definition.hires) {
    if (!personHere(hire.departmentName)) continue;
    const annual = (result.plan.gradeAnnual[hire.grade] ?? 0) * hire.count;
    labor = add(labor, qsplit(year, annual, hire.effectiveDate));
    const when = parseIsoDate(hire.effectiveDate);
    headcount = headcount.map((count, index) => (when < bounds[index][1] ? count + hire.count : count));
    const hired = quarterIndex(year, when);
    if (hired >= 0 && hired < 4) flows[hired].hires += hire.count;
  }

  for (const change of definition.agents) {
    if (!agentHere(change)) continue;
    const annual = change.monthly * 12 * change.count;
    agent = add(agent, qsplit(year, annual, change.effectiveDate));
    const when = parseIsoDate(change.effectiveDate);
    agents = agents.map((count, index) => (when < bounds[index][1] ? count + change.count : count));
    const quarter = quarterIndex(year, when);
    if (quarter >= 0 && quarter < 4) {
      agentOneOff[quarter] += change.oneOff;
      if (change.count > 0) flows[quarter].agentsAdded += change.count;
      else if (change.count < 0) flows[quarter].agentsRemoved += Math.abs(change.count);
    }
  }

  if (wholePlan) {
    for (const once of definition.extraAgentOneOff) {
      const quarter = quarterIndex(year, parseIsoDate(once.effectiveDate));
      if (quarter >= 0) agentOneOff[quarter] += once.amount;
    }
  }

  for (const vacancy of definition.nofill ?? []) {
    if (!personHere(vacancy.departmentName) || vacancy.count === 0) continue;
    const index = quarterIndex(year, parseIsoDate(vacancy.effectiveDate));
    if (index < 0 || index > 3) continue;
    const started = formatIsoDate(bounds[index][0]);
    const annual = (result.plan.gradeAnnual[vacancy.grade] ?? 0) * vacancy.count;
    labor = add(labor, scale(qsplit(year, annual, started), -1));
    const when = bounds[index][0];
    headcount = headcount.map((count, later) => (when < bounds[later][1] ? count - vacancy.count : count));
    flows[index].nofill += vacancy.count;
    flows[index].attrition += vacancy.count;
  }

  for (const cut of definition.cuts) {
    if (!personHere(cut.departmentName)) continue;
    const annual = (result.plan.gradeAnnual[cut.grade] ?? 0) * cut.count;
    const stop = exclusiveServiceEnd(cut.effectiveDate);
    labor = add(labor, scale(qsplit(year, annual, stop), -1));
    const when = parseIsoDate(cut.effectiveDate);
    headcount = headcount.map((count, index) => (when < bounds[index][1] ? count - cut.count : count));
    const amount = scenarioCutSeverance(result, cut, definition.assumptions.noticePay);
    const quarter = quarterIndex(year, when);
    if (quarter >= 0 && quarter < 4) {
      severance[quarter] += amount;
      flows[quarter].cuts += cut.count;
    }
  }

  const quarters = [0, 1, 2, 3].map((index) => {
    const oneOff = severance[index] + agentOneOff[index];
    return {
      labor: labor[index],
      agent: agent[index],
      oneOff,
      total: labor[index] + agent[index] + oneOff,
      headcount: headcount[index],
      agents: agents[index],
    };
  });
  const dailyYuan = quarters.reduce((total, quarter) => total + quarter.labor + quarter.agent, 0);
  const oneOffYuan = quarters.reduce((total, quarter) => total + quarter.oneOff, 0);
  return {
    definition,
    quarters,
    dailyYuan,
    oneOffYuan,
    severanceYuan: severance.reduce((total, value) => total + value, 0),
    agentOneOffYuan: agentOneOff.reduce((total, value) => total + value, 0),
    totalYuan: dailyYuan + oneOffYuan,
    yearEndPeople: headcount[3],
    yearEndAgents: agents[3],
    attritionPerQuarter: perQuarter,
    flows,
  };
}

export function evaluateBaseline(result: PlanResult, rootId = costRootId(result)): ScenarioResult {
  const base = baselineQuarters(result, rootId);
  const quarters = [0, 1, 2, 3].map((index) => {
    const oneOff = base.severance[index] + base.agentOneOff[index];
    return {
      labor: base.labor[index],
      agent: base.agent[index],
      oneOff,
      total: base.labor[index] + base.agent[index] + oneOff,
      headcount: base.headcount[index],
      agents: base.agents[index],
    };
  });
  const dailyYuan = quarters.reduce((total, quarter) => total + quarter.labor + quarter.agent, 0);
  const oneOffYuan = quarters.reduce((total, quarter) => total + quarter.oneOff, 0);
  return {
    definition: {
      id: "jx",
      name: "基线",
      source: "preset",
      compared: true,
      assumptions: defaultAssumptions({ attritionRate: 0, hiringCycleDays: 0 }),
      assumptionOrigin: "default",
      hires: [],
      agents: [],
      extraAgentOneOff: [],
      cuts: [],
      ratio: "78 : 22",
      ratioNote: "基线拆解",
      structureNote: null,
      spanAlert: null,
    },
    quarters,
    dailyYuan,
    oneOffYuan,
    severanceYuan: base.severance.reduce((total, value) => total + value, 0),
    agentOneOffYuan: base.agentOneOff.reduce((total, value) => total + value, 0),
    totalYuan: dailyYuan + oneOffYuan,
    yearEndPeople: base.headcount[3],
    yearEndAgents: base.agents[3],
    attritionPerQuarter: 0,
    flows: emptyFlows(),
  };
}

/** 旧数据里省略的所属部门：方案 A 归数据智能部，其余视为未归属。新写入仍必须显式给出。 */
export function normalizeScenarioDefinition(definition: ScenarioDefinition): ScenarioDefinition {
  return {
    ...definition,
    nofill: definition.nofill ?? [],
    agents: definition.agents.map((agent) => ({
      ...agent,
      departmentName:
        agent.departmentName === undefined || agent.departmentName === ""
          ? definition.id === "fa" || agent.name.includes("方案 A")
            ? "数据智能部"
            : null
          : agent.departmentName,
    })),
  };
}

export function moneyWan(yuan: number): string {
  return formatWan(yuan);
}

export function gapWan(totalYuan: number, budgetYuan: number): number {
  return Number((roundToHalfWan(totalYuan) - roundToHalfWan(budgetYuan)).toFixed(1));
}

export type QuarterChangeLabel = { text: string; note: string | null };

const NOFILL_LABEL_INSTRUCTION = "（同季还有按离职率估算的未补位时，句末加：其余 M 人按离职率估算。）";

/** 只挂在含出缺不补的「离职未补位」标签上。其余标签没有悬停。文件里的 N / M 和括号是模板，这里填上人数。 */
export function nofillLabelNote(nofill: number, rest: number): string | null {
  if (nofill <= 0) return null;
  const template = NOFILL_LABEL_TEMPLATE;
  if (!template.endsWith(NOFILL_LABEL_INSTRUCTION) || !template.includes("出缺不补 N 人")) {
    throw new Error("出缺不补悬停模板无法填数");
  }
  const lead = template.slice(0, -NOFILL_LABEL_INSTRUCTION.length).replace("出缺不补 N 人", `出缺不补 ${nofill} 人`);
  return rest > 0 ? `${lead}其余 ${rest} 人按离职率估算。` : lead;
}

/** 类别来自事件来源。同一季有两条人员标签时，人数括号只挂在最后一条。 */
export function quarterChangeDetails(
  baseline: ScenarioResult,
  scenario: ScenarioResult,
  opening: { people: number; agents: number },
): QuarterChangeLabel[] {
  const labels: QuarterChangeLabel[] = [];
  for (let index = 0; index < 4; index += 1) {
    const quarter = index + 1;
    const flow = scenario.flows[index];
    const base = baseline.flows[index];
    const peopleBits: { text: string; note: string | null }[] = [];
    const attrition = flow.attrition - base.attrition;
    const hires = flow.hires - base.hires;
    const cuts = flow.cuts - base.cuts;
    const nofill = (flow.nofill ?? 0) - (base.nofill ?? 0);
    if (attrition > 0) peopleBits.push({ text: `离职未补位 ${attrition} 人`, note: nofillLabelNote(nofill, attrition - nofill) });
    if (hires > 0) peopleBits.push({ text: `场景增员 ${hires} 人`, note: null });
    if (cuts > 0) peopleBits.push({ text: `场景减员 ${cuts} 人`, note: null });
    const peopleFrom = index === 0 ? opening.people : scenario.quarters[index - 1].headcount;
    const peopleTo = scenario.quarters[index].headcount;
    peopleBits.forEach((bit, bitIndex) => {
      const paren = bitIndex === peopleBits.length - 1 ? `（含基线变动共 ${peopleFrom}→${peopleTo}）` : "";
      labels.push({ text: `Q${quarter} ${bit.text}${paren}`, note: bit.note });
    });
    const agentsFrom = index === 0 ? opening.agents : scenario.quarters[index - 1].agents;
    const agentsTo = scenario.quarters[index].agents;
    const added = flow.agentsAdded - base.agentsAdded;
    const removed = flow.agentsRemoved - base.agentsRemoved;
    if (added > 0) labels.push({ text: `Q${quarter} 场景新增 ${added} 个 Agent（含基线变动共 ${agentsFrom}→${agentsTo}）`, note: null });
    if (removed > 0) labels.push({ text: `Q${quarter} 下线 ${removed} 个 Agent（含基线变动共 ${agentsFrom}→${agentsTo}）`, note: null });
  }
  return labels;
}

export function quarterChangeLabels(
  baseline: ScenarioResult,
  scenario: ScenarioResult,
  opening: { people: number; agents: number },
): string[] {
  return quarterChangeDetails(baseline, scenario, opening).map((label) => label.text);
}
