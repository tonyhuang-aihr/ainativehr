import { quarterBounds, quarterIndex, yearDays, yearEnd, overlapDays, parseIsoDate } from "@/lib/headcount/calendar";
import { deptStat, type PlanResult } from "@/lib/headcount/engine";
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
      agents: [{ name: "测试用例生成 Agent", count: 4, monthly: 2000, effectiveDate: "2027-04-01", oneOff: 40_000 }],
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
        { name: "测试用例生成 Agent", count: 6, monthly: 2000, effectiveDate: "2027-04-01", oneOff: 0 },
        { name: "代码评审 Agent", count: 6, monthly: 3500, effectiveDate: "2027-04-01", oneOff: 0 },
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
      agents: [{ name: "代码评审 Agent", count: 2, monthly: 3500, effectiveDate: "2027-04-01", oneOff: 10_000 }],
      cuts: [],
      ratio: "78 : 22",
      ratioNote: "沿用基线拆解",
    },
    {
      id: "fa",
      name: "沙盘方案 A",
      source: "sandbox",
      compared: true,
      assumptions: defaultAssumptions(),
      assumptionOrigin: "default",
      hires: [],
      agents: [{ name: "方案 A 新增 Agent 岗位", count: 6, monthly: 380_000 / 6 / 12, effectiveDate: "2027-04-01", oneOff: 120_000 }],
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

function baselineQuarters(result: PlanResult): { labor: number[]; agent: number[]; severance: number[]; agentOneOff: number[]; headcount: number[]; agents: number[] } {
  const stat = deptStat(result, "rd");
  const year = result.plan.year;
  const bounds = quarterBounds(year);
  const headcount = bounds.map(([, end]) => {
    let count = stat.onBoard;
    for (const movement of result.movements) {
      if (parseIsoDate(movement.effectiveDate) >= end) continue;
      if (movement.kind === "入职") count += 1;
      if (movement.kind === "离职") count -= 1;
    }
    return count;
  });
  const agents = bounds.map(([, end]) => {
    let count = stat.agentInUse;
    for (const movement of result.movements) {
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

function averageFormalAnnual(result: PlanResult): number {
  const onBoard = result.people.filter((person) => person.status === "在岗" || person.status === "待离职" || person.status === "待转出");
  const annual = onBoard.reduce((total, person) => total + (result.plan.gradeAnnual[person.grade] ?? 0), 0);
  return onBoard.length ? annual / onBoard.length : 0;
}

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

export function evaluateScenario(result: PlanResult, definition: ScenarioDefinition): ScenarioResult {
  const year = result.plan.year;
  const base = baselineQuarters(result);
  const stat = deptStat(result, "rd");
  let labor = [...base.labor];
  let agent = [...base.agent];
  const severance = [...base.severance];
  const agentOneOff = [...base.agentOneOff];
  let headcount = [...base.headcount];
  let agents = [...base.agents];
  const bounds = quarterBounds(year);
  const yearDaysCount = yearDays(year);
  const average = averageFormalAnnual(result);
  const perQuarter = Math.round(stat.onBoard * definition.assumptions.attritionRate / 4);

  for (const [start, end] of bounds) {
    const length = Math.round((end - start) / 86_400_000);
    const mid = start + Math.floor(length / 2) * 86_400_000;
    const back = mid + definition.assumptions.hiringCycleDays * 86_400_000;
    const vacant = bounds.map(([from, to]) => (perQuarter * average * overlapDays(from, to, mid, back)) / yearDaysCount);
    labor = add(labor, scale(vacant, -1));
    bounds.forEach(([, quarterEnd], later) => {
      if (mid < quarterEnd && back >= quarterEnd) headcount[later] -= perQuarter;
    });
  }

  if (definition.assumptions.raiseRate) {
    labor = scale(labor, 1 + definition.assumptions.raiseRate);
  }

  for (const hire of definition.hires) {
    const annual = (result.plan.gradeAnnual[hire.grade] ?? 0) * hire.count;
    labor = add(labor, qsplit(year, annual, hire.effectiveDate));
    const when = parseIsoDate(hire.effectiveDate);
    headcount = headcount.map((count, index) => (when < bounds[index][1] ? count + hire.count : count));
  }

  for (const change of definition.agents) {
    const annual = change.monthly * 12 * change.count;
    agent = add(agent, qsplit(year, annual, change.effectiveDate));
    const when = parseIsoDate(change.effectiveDate);
    agents = agents.map((count, index) => (when < bounds[index][1] ? count + change.count : count));
    const quarter = quarterIndex(year, when);
    if (quarter >= 0) agentOneOff[quarter] += change.oneOff;
  }

  for (const once of definition.extraAgentOneOff) {
    const quarter = quarterIndex(year, parseIsoDate(once.effectiveDate));
    if (quarter >= 0) agentOneOff[quarter] += once.amount;
  }

  for (const cut of definition.cuts) {
    const annual = (result.plan.gradeAnnual[cut.grade] ?? 0) * cut.count;
    const stop = exclusiveServiceEnd(cut.effectiveDate);
    labor = add(labor, scale(qsplit(year, annual, stop), -1));
    const when = parseIsoDate(cut.effectiveDate);
    headcount = headcount.map((count, index) => (when < bounds[index][1] ? count - cut.count : count));
    const amount = scenarioCutSeverance(result, cut, definition.assumptions.noticePay);
    const quarter = quarterIndex(year, when);
    if (quarter >= 0) severance[quarter] += amount;
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
  };
}

export function evaluateBaseline(result: PlanResult): ScenarioResult {
  const base = baselineQuarters(result);
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
  };
}

export function moneyWan(yuan: number): string {
  return formatWan(yuan);
}

export function gapWan(totalYuan: number, budgetYuan: number): number {
  return Number((roundToHalfWan(totalYuan) - roundToHalfWan(budgetYuan)).toFixed(1));
}
