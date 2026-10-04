import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { defaultAssumptions, type ScenarioDefinition } from "@/lib/headcount/scenario";

/** 沙盘导入列表里的名称。不要改成公司预设方案的名字。 */
export const PROD1_SANDBOX_DEMO_NAME = "沙盘示例 · 产品研发一部";

/**
 * 公司口径下的方案编号。不在公司预设编号里，所以不会进默认对比。
 * 林导入后沿用现有规则，编号变成 sandbox-prod1-prod1-demo。
 */
export const PROD1_SANDBOX_DEMO_ID = "prod1-demo";

/** 导入按钮旁的说明。必须看得出这是示例，不是已核对的正式方案。 */
export const PROD1_SANDBOX_DEMO_CAPTION =
  "示例数据 · 均为虚构。这不是最终方案，角色拆解和金额以 HR AI-OD 后续提供的为准。";

/**
 * 正式数据到齐并核对之前保持 false。
 * 只改这一处不会发布占位金额：还要同时填上 PROD1_SANDBOX_DEMO。
 */
export const PROD1_SANDBOX_DEMO_LISTED = false;

/** 成本事件一律记在这个部门。一部里的小组（例如测试组）不是部门节点。 */
export const PROD1_SANDBOX_DEMO_DEPARTMENT = "产品研发一部";

const QUARTER_DATE = ["2027-01-01", "2027-04-01", "2027-07-01", "2027-10-01"] as const;

export type Prod1SandboxRole = {
  /** 小组里的岗位。只写进说明，不单独生成成本。 */
  title: string;
  grade: string;
  headcount: number;
  /** 其中由 Agent 替代的人数。是否同时记成减员，由 cuts 决定。 */
  replacedByAgent: number;
};

export type Prod1SandboxAgent = {
  name: string;
  count: number;
  /** 单实例月费（席位 + 算力），元。 */
  monthlyYuan: number;
  /** 上线当季的一次性费用（实施 / 培训），元。OD 计入总成本，HRBP 的日常成本不含。 */
  oneOffYuan: number;
  effectiveQuarter: 1 | 2 | 3 | 4;
};

export type Prod1SandboxCut = {
  grade: string;
  count: number;
  effectiveQuarter: 1 | 2 | 3 | 4;
  mark: "N" | "N+1" | "不计";
  /** 部门 × 职级平均司龄（年）。不足 5 人时已经并入上一级。 */
  tenureYears: number;
  /** 该部门该职级的样本人数。 */
  groupSize: number;
};

export type Prod1SandboxHire = {
  grade: string;
  count: number;
  effectiveQuarter: 1 | 2 | 3 | 4;
};

/**
 * 待填的正式沙盘示例。字段到齐后整对象替换这里的 null，再把 PROD1_SANDBOX_DEMO_LISTED 改为 true。
 * 保持 null：占位夹具里的数字不会进入导入列表，也不会被当成最终金额。
 */
export type Prod1SandboxDemoInput = {
  /** 一部内部的小组名称，例如测试组。不要写成其他部门的名字。 */
  groupName: string;
  roles: Prod1SandboxRole[];
  agents: Prod1SandboxAgent[];
  cuts: Prod1SandboxCut[];
  hires: Prod1SandboxHire[];
  /** 人 : AI。还没拆解就写「未拆解」。 */
  ratio: string;
};

export const PROD1_SANDBOX_DEMO: Prod1SandboxDemoInput | null = null;

/**
 * 形状占位，方便把 HR AI-OD 的表对到字段上。
 * 导入列表不读这个对象。这里的 0 不是方案金额。
 */
export const PROD1_SANDBOX_DEMO_PLACEHOLDER: Prod1SandboxDemoInput = {
  groupName: "待指定小组",
  roles: [],
  agents: [
    {
      name: "占位 Agent",
      count: 0,
      monthlyYuan: 0,
      oneOffYuan: 0,
      effectiveQuarter: 2,
    },
  ],
  cuts: [],
  hires: [],
  ratio: "未拆解",
};

function quarterDate(quarter: 1 | 2 | 3 | 4): string {
  return QUARTER_DATE[quarter - 1];
}

export function isProd1SandboxDemoId(id: string): boolean {
  return id === PROD1_SANDBOX_DEMO_ID || id.endsWith(`-${PROD1_SANDBOX_DEMO_ID}`);
}

/** 把待填数据收成一条场景。增员、减员、Agent 的所属部门都是产品研发一部。 */
export function definitionFromProd1SandboxDemo(input: Prod1SandboxDemoInput): ScenarioDefinition {
  const roleLines = input.roles.map(
    (role) => `${role.title} ${role.grade} ${role.headcount} 人，其中 ${role.replacedByAgent} 人由 Agent 替代`,
  );
  const structureNote = [
    PROD1_SANDBOX_DEMO_CAPTION,
    `小组：${input.groupName}。`,
    roleLines.length ? `${roleLines.join("；")}。` : "角色拆解待 HR AI-OD 提供。",
  ].join("");
  return {
    id: PROD1_SANDBOX_DEMO_ID,
    name: PROD1_SANDBOX_DEMO_NAME,
    source: "sandbox",
    compared: false,
    assumptions: defaultAssumptions(),
    assumptionOrigin: "default",
    hires: input.hires.map((hire) => ({
      departmentName: PROD1_SANDBOX_DEMO_DEPARTMENT,
      grade: hire.grade,
      count: hire.count,
      effectiveDate: quarterDate(hire.effectiveQuarter),
    })),
    agents: input.agents.map((agent) => ({
      name: agent.name,
      count: agent.count,
      monthly: agent.monthlyYuan,
      effectiveDate: quarterDate(agent.effectiveQuarter),
      oneOff: agent.oneOffYuan,
      departmentName: PROD1_SANDBOX_DEMO_DEPARTMENT,
    })),
    extraAgentOneOff: [],
    cuts: input.cuts.map((cut) => ({
      departmentName: PROD1_SANDBOX_DEMO_DEPARTMENT,
      grade: cut.grade,
      count: cut.count,
      effectiveDate: quarterDate(cut.effectiveQuarter),
      mark: cut.mark,
      tenureYears: cut.tenureYears,
      groupSize: cut.groupSize,
    })),
    ratio: input.ratio,
    ratioNote: input.ratio === "未拆解" ? "沙盘尚未拆解" : "示例数据，待 HR AI-OD 核对",
    structureNote,
    spanAlert: null,
  };
}

export type SandboxDemoGate = {
  listed: boolean;
  demo: Prod1SandboxDemoInput | null;
};

/**
 * 沙盘导入列表和导入动作共用。
 * 默认不带一部示例。测试可以传入闸门，正式页面不要传。
 */
export function sandboxImportCandidates(quarter: 1 | 2 | 3 | 4 = 2, gate?: SandboxDemoGate): ScenarioDefinition[] {
  const listed = gate ? gate.listed : PROD1_SANDBOX_DEMO_LISTED;
  const demo = gate ? gate.demo : PROD1_SANDBOX_DEMO;
  const plans = [scenarioFromSandbox(buildRdCenterWorkspace(), quarter)];
  if (listed && demo) plans.push(definitionFromProd1SandboxDemo(demo));
  return plans;
}

export function sandboxOfferCopy(definition: ScenarioDefinition): { label: string; caption: string } {
  if (definition.id === "fa") return { label: "载入沙盘示例方案 A", caption: "应用分析小组并入数据组" };
  if (isProd1SandboxDemoId(definition.id) || definition.name === PROD1_SANDBOX_DEMO_NAME) {
    return { label: `载入${PROD1_SANDBOX_DEMO_NAME}`, caption: PROD1_SANDBOX_DEMO_CAPTION };
  }
  return { label: `载入${definition.name}`, caption: definition.structureNote ?? "" };
}
