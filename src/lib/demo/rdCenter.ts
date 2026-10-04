import type { DecisionRecord, Department, OrgIssue, OrgSnapshot, Person, RoleDecomposition, RolePosture, Workspace } from "@/lib/model/types";
import { createWorkspace } from "@/lib/workspace/create";

export const RD_CENTER_SAMPLE_ID = "rd-center";

export const RD_DEPT = {
  center: "D-RD",
  product1: "D-P1",
  product2: "D-P2",
  platform: "D-0203",
  arch: "D-ARCH",
  dataPlatform: "D-DPLAT",
  quality: "D-QA",
  intelligence: "D-AI",
  dataGroup: "D-DATA",
  metric: "D-METRIC",
  appCell: "D-APP",
} as const;

/** 稿面上的幅度是设计标注，不是实时的直接下级人数。只用于这套示例。 */
export const RD_SHOWCASE_SPAN: Record<string, string> = {
  研发中心: "5",
  产品研发一部: "7.0",
  产品研发二部: "6.8",
  平台部: "2.1",
  质量与交付部: "6.5",
  数据智能部: "5.6",
};

const CENTER = ["研发中心"];
const P1 = ["研发中心", "产品研发一部"];
const P2 = ["研发中心", "产品研发二部"];
const PLAT = ["研发中心", "平台部"];
const ARCH = ["研发中心", "平台部", "基础架构组"];
const DPLAT = ["研发中心", "平台部", "数据平台组"];
const QA = ["研发中心", "质量与交付部"];
const AI = ["研发中心", "数据智能部"];
const DATA = ["研发中心", "数据智能部", "数据组"];
const METRIC = ["研发中心", "数据智能部", "指标组"];
const APP = ["研发中心", "产品研发一部", "应用分析小组"];

export const APP_CELL_NAME = "应用分析小组";

type Slot = {
  id: string;
  name: string;
  employeeId: string;
  title: string;
  level: string;
  hireDate: string;
  performance: string;
  pendingRoleConfirm?: boolean;
};

function person(slot: Slot, path: string[], managerId: string | null, managerName: string): Person {
  return {
    id: slot.id,
    rowNumber: 0,
    name: slot.name,
    originalName: slot.name,
    employeeId: slot.employeeId,
    departmentRaw: path.join("/"),
    departmentPath: [...path],
    title: slot.title,
    managerName,
    managerId,
    level: slot.level,
    annualCost: null,
    hireDate: slot.hireDate,
    location: "上海",
    performance: slot.performance,
    email: "",
    pendingRoleConfirm: slot.pendingRoleConfirm,
  };
}

function filler(id: string, name: string, employeeId: string, title: string, level = "P6"): Slot {
  const bucket = Number(employeeId.replace(/\D/g, "")) % 3;
  return {
    id,
    name,
    employeeId,
    title,
    level,
    hireDate: "2020-01-06",
    performance: ["超出预期", "符合预期", "待改进"][bucket] ?? "",
  };
}

const CTO: Slot = { id: "p-cto", name: "顾承", employeeId: "E10001", title: "CTO", level: "M5", hireDate: "2016-04-01", performance: "符合预期" };
const SU: Slot = { id: "p-su", name: "苏明", employeeId: "E10021", title: "研发总监", level: "M4", hireDate: "2017-01-09", performance: "超出预期" };
const HE: Slot = { id: "p-he", name: "何岚", employeeId: "E10022", title: "研发总监", level: "M4", hireDate: "2017-05-16", performance: "符合预期" };
const ZHENG: Slot = { id: "p-zhenglan", name: "郑岚", employeeId: "E10023", title: "质量总监", level: "M4", hireDate: "2018-02-01", performance: "符合预期" };
const JIANG: Slot = { id: "p-jiang", name: "江衡", employeeId: "E18001", title: "数据组组长", level: "M3", hireDate: "2018-03-12", performance: "待改进" };

const ZHAO: Slot = { id: "p-zhao", name: "赵一", employeeId: "E10012", title: "平台总监", level: "M4", hireDate: "2017-03-06", performance: "超出预期" };
const QIAN: Slot = { id: "p-qian", name: "钱二", employeeId: "E10158", title: "基础架构组组长", level: "M3", hireDate: "2018-07-02", performance: "符合预期" };
const SUN: Slot = { id: "p-sun", name: "孙三", employeeId: "E10233", title: "数据平台组组长", level: "M3", hireDate: "2019-04-15", performance: "待改进" };
const LI: Slot = { id: "p-li", name: "李四", employeeId: "E10671", title: "技术项目经理", level: "P7", hireDate: "2021-09-06", performance: "超出预期" };
const ZHOU: Slot = { id: "p-zhou", name: "周五", employeeId: "E10402", title: "数据架构师", level: "P7", hireDate: "2020-05-11", performance: "符合预期" };
const WU: Slot = { id: "p-wu", name: "吴六", employeeId: "E10815", title: "数据治理工程师", level: "P6", hireDate: "2022-03-14", performance: "超出预期" };
const ZHENG7: Slot = { id: "p-z7", name: "郑七", employeeId: "E10187", title: "SRE 专家", level: "P7", hireDate: "2018-11-19", performance: "待改进" };
const FENG: Slot = { id: "p-feng", name: "冯八", employeeId: "E10366", title: "后端工程师", level: "P6", hireDate: "2020-08-03", performance: "符合预期" };
const CHEN: Slot = { id: "p-chen", name: "陈九", employeeId: "E10529", title: "SRE 工程师", level: "P6", hireDate: "2021-06-21", performance: "超出预期" };
const CHU: Slot = { id: "p-chu", name: "褚十", employeeId: "E10744", title: "运维开发工程师", level: "P6", hireDate: "2022-02-28", performance: "待改进" };
const WEI: Slot = { id: "p-wei", name: "卫十一", employeeId: "E10902", title: "云原生工程师", level: "P6", hireDate: "2022-10-10", performance: "符合预期" };
const JIANG12: Slot = { id: "p-j12", name: "蒋十二", employeeId: "E11076", title: "后端工程师", level: "P5", hireDate: "2023-07-17", performance: "超出预期" };
const SHEN: Slot = { id: "p-shen", name: "沈十三", employeeId: "E11120", title: "存储工程师", level: "P6", hireDate: "2023-09-04", performance: "符合预期" };
const HAN: Slot = { id: "p-han", name: "韩十四", employeeId: "E12158", title: "网络工程师", level: "P5", hireDate: "2024-04-08", performance: "待改进" };
const KONG: Slot = { id: "p-kong", name: "孔十七", employeeId: "E17017", title: "算法工程师", level: "P6", hireDate: "2021-08-02", performance: "超出预期", pendingRoleConfirm: true };
const INTEL_LEAD = filler("p-intel-lead", "示例算法", "E18002", "算法工程师", "M3");
const APP_MEMBERS: Slot[] = [0, 1, 2, 3].map((index) => filler(`p-app-${index + 1}`, `示例应用${index + 1}`, `E1615${index}`, "应用分析岗"));

const ARCH_STABLE: Slot[] = [ZHENG7, FENG, WEI, JIANG12, SHEN, HAN];

function rangeFillers(prefix: string, start: number, count: number, title: string, level = "P6"): Slot[] {
  return Array.from({ length: count }, (_, index) => {
    const n = start + index;
    const employeeId = `E${n}`;
    return filler(`${prefix}-${n}`, `示例${n}`, employeeId, title, level);
  });
}

function departments(plan: boolean, split = false, metricHeadId = JIANG.id): Department[] {
  const rows: Array<[string, string, string[], string | null, string]> = [
    [RD_DEPT.center, "研发中心", CENTER, null, CTO.id],
    [RD_DEPT.product1, "产品研发一部", P1, RD_DEPT.center, SU.id],
    [RD_DEPT.product2, "产品研发二部", P2, RD_DEPT.center, HE.id],
    [RD_DEPT.platform, "平台部", PLAT, RD_DEPT.center, ZHAO.id],
    [RD_DEPT.arch, "基础架构组", ARCH, RD_DEPT.platform, QIAN.id],
    [RD_DEPT.dataPlatform, "数据平台组", DPLAT, RD_DEPT.platform, SUN.id],
    [RD_DEPT.quality, "质量与交付部", QA, RD_DEPT.center, ZHENG.id],
    [RD_DEPT.intelligence, "数据智能部", AI, RD_DEPT.center, INTEL_LEAD.id],
    [RD_DEPT.dataGroup, "数据组", DATA, RD_DEPT.intelligence, JIANG.id],
  ];
  if (!plan) rows.push([RD_DEPT.appCell, APP_CELL_NAME, APP, RD_DEPT.product1, APP_MEMBERS[0].id]);
  if (plan && split) rows.push([RD_DEPT.metric, "指标组", METRIC, RD_DEPT.intelligence, metricHeadId]);
  return rows.map(([id, name, path, parentId, headId]) => ({ id, name, path, parentId, headId }));
}

function platformPeople(plan: boolean): Person[] {
  const archTransfers = plan ? [CHEN, CHU] : [ZHOU, WU];
  const archMembers = [QIAN, ...ARCH_STABLE, ...archTransfers, ...rangeFillers("arch", 19001, 25, "后端工程师")];
  const dataMembers = [SUN, ...rangeFillers("dplat", 19101, 25, "数据平台工程师")];
  const people: Person[] = [
    person(ZHAO, PLAT, CTO.id, CTO.name),
    person(LI, PLAT, ZHAO.id, ZHAO.name),
  ];
  for (const slot of archMembers) {
    const manager = slot.id === QIAN.id ? ZHAO : QIAN;
    people.push(person(slot, ARCH, manager.id, manager.name));
  }
  for (const slot of dataMembers) {
    const manager = slot.id === SUN.id ? ZHAO : SUN;
    people.push(person(slot, DPLAT, manager.id, manager.name));
  }
  return people;
}

const AI_ROLES: Array<{ title: string; count: number; posture: RolePosture; aiShare: number }> = [
  { title: "应用分析岗", count: 4, posture: "draft", aiShare: 0.3 },
  { title: "数据开发工程师", count: 11, posture: "pending_review", aiShare: 0.45 },
  { title: "数据治理工程师", count: 7, posture: "pending_review", aiShare: 0.4 },
  { title: "数据组组长", count: 4, posture: "pending_review", aiShare: 0.35 },
  { title: "算法工程师", count: 15, posture: "active", aiShare: 0.38 },
  { title: "数据产品经理", count: 10, posture: "active", aiShare: 0.42 },
  { title: "分析工程师", count: 8, posture: "active", aiShare: 0.4 },
  { title: "数据运营", count: 7, posture: "active", aiShare: 0.36 },
  { title: "平台分析师", count: 5, posture: "active", aiShare: 0.33 },
];

function roleSlots(plan: boolean): Map<string, Slot[]> {
  const grouped = new Map<string, Slot[]>();
  let serial = 16001;
  for (const role of AI_ROLES) {
    let count = role.count;
    if (!plan && (role.title === "数据开发工程师" || role.title === "数据治理工程师")) count -= 1;
    if (!plan && role.title === "应用分析岗") count = 0;
    const slots: Slot[] = [];
    if (role.title === "数据组组长") slots.push(JIANG);
    if (role.title === "算法工程师") slots.push(INTEL_LEAD, KONG);
    if (plan && role.title === "数据开发工程师") slots.push({ ...ZHOU, title: "数据开发工程师" });
    if (plan && role.title === "数据治理工程师") slots.push(WU);
    if (plan && role.title === "应用分析岗") slots.push(...APP_MEMBERS);
    while (slots.length < count) {
      const employeeId = `E${serial}`;
      slots.push(filler(`ai-${serial}`, `示例${serial}`, employeeId, role.title, role.title.includes("组长") ? "M3" : "P6"));
      serial += 1;
    }
    grouped.set(
      role.title,
      slots.slice(0, count).map((slot) => ({ ...slot, title: role.title })),
    );
  }
  return grouped;
}

/** 拆组前：应用分析岗并入后，数据组组长直接下级是 12。基线停在上限上。拆组后组长和指标组各 6 人。 */
function dataGroupPeople(plan: boolean, grouped: Map<string, Slot[]>, split = false): Person[] {
  const leads = grouped.get("数据组组长") ?? [];
  const head = leads[0];
  const subleads = leads.slice(1);
  const ics = [...(grouped.get("数据开发工程师") ?? []), ...(grouped.get("数据治理工程师") ?? []), ...(grouped.get("应用分析岗") ?? [])];
  if (plan && split && subleads[0]) {
    const metricLead = subleads[0];
    const staying = subleads.slice(1);
    const stayIcCount = Math.max(0, 6 - staying.length - 1);
    const stayIcs = ics.slice(0, stayIcCount);
    const metricIcs = ics.slice(stayIcCount, stayIcCount + 6);
    const rest = ics.slice(stayIcCount + 6);
    const people = [person(head, DATA, CTO.id, CTO.name)];
    for (const slot of [...staying, ...stayIcs]) people.push(person(slot, DATA, head.id, head.name));
    people.push(person(metricLead, METRIC, head.id, head.name));
    for (const slot of metricIcs) people.push(person(slot, METRIC, metricLead.id, metricLead.name));
    rest.forEach((slot, index) => {
      const manager = staying[index % Math.max(1, staying.length)] ?? head;
      people.push(person(slot, DATA, manager.id, manager.name));
    });
    return people;
  }
  const directIcCount = plan ? Math.max(0, 12 - subleads.length) : Math.min(5, ics.length);
  const directIcs = ics.slice(0, directIcCount);
  const indirect = ics.slice(directIcCount);
  const people = [person(head, DATA, CTO.id, CTO.name)];
  for (const slot of [...subleads, ...directIcs]) people.push(person(slot, DATA, head.id, head.name));
  indirect.forEach((slot, index) => {
    const manager = subleads[index % Math.max(1, subleads.length)] ?? head;
    people.push(person(slot, DATA, manager.id, manager.name));
  });
  return people;
}

function metricLeadId(): string {
  return roleSlots(true).get("数据组组长")?.[1]?.id ?? JIANG.id;
}

function restIntelligencePeople(grouped: Map<string, Slot[]>): Person[] {
  const slots = ["算法工程师", "数据产品经理", "分析工程师", "数据运营", "平台分析师"].flatMap((title) => grouped.get(title) ?? []);
  const lead = slots.find((slot) => slot.id === INTEL_LEAD.id) ?? slots[0];
  return slots.map((slot) =>
    slot.id === lead.id ? person(slot, AI, CTO.id, CTO.name) : person(slot, AI, lead.id, lead.name),
  );
}

function intelligencePeople(plan: boolean, split = false): Person[] {
  const grouped = roleSlots(plan);
  return [...dataGroupPeople(plan, grouped, split), ...restIntelligencePeople(grouped)];
}

function appCellPeople(): Person[] {
  const [lead, ...rest] = APP_MEMBERS;
  return [person(lead, APP, SU.id, SU.name), ...rest.map((slot) => person(slot, APP, lead.id, lead.name))];
}

function flatTeam(head: Slot, path: string[], count: number, title: string, idStart: number, extra: Slot[] = []): Person[] {
  const fillers = rangeFillers("team", idStart, count - 1 - extra.length, title);
  const members = [...extra, ...fillers];
  return [
    person(head, path, CTO.id, CTO.name),
    ...members.map((slot) => person(slot, path, head.id, head.name)),
  ];
}

function snapshotPeople(plan: boolean, split = false): Person[] {
  const product1 = flatTeam(SU, P1, plan ? 144 : 146, "产品研发工程师", 21001, plan ? [] : [CHEN, CHU]);
  const product2 = flatTeam(HE, P2, 131, "产品研发工程师", 22001);
  const quality = flatTeam(ZHENG, QA, 77, "测试工程师", 23001);
  return [
    person(CTO, CENTER, null, ""),
    ...product1,
    ...(plan ? [] : appCellPeople()),
    ...product2,
    ...platformPeople(plan),
    ...quality,
    ...intelligencePeople(plan, split),
  ];
}

function taskPair(title: string, aiShare: number): RoleDecomposition["tasks"] {
  return [
    {
      id: `${title}-human`,
      name: "业务判断与交付",
      timeShare: Math.round((1 - aiShare) * 1000) / 1000,
      frequency: "每日",
      mode: "human",
      reason: "例外和口径需要人确认。",
      confidence: 0.8,
      source: "template",
      edited: false,
    },
    {
      id: `${title}-ai`,
      name: "汇总与底稿",
      timeShare: aiShare,
      frequency: "每日",
      mode: "ai",
      reason: "固定口径的汇总可以先由模型起草。",
      confidence: 0.75,
      source: "template",
      edited: false,
    },
  ];
}

function intelligenceDecompositions(): Record<string, RoleDecomposition> {
  const map: Record<string, RoleDecomposition> = {};
  for (const role of AI_ROLES) {
    map[role.title] = {
      roleTitle: role.title,
      tasks: taskPair(role.title, role.aiShare),
      updatedAt: "2026-10-01T00:00:00.000Z",
      source: "template",
      posture: role.posture,
    };
  }
  return map;
}

function field(key: DecisionRecord["fields"][number]["key"], text: string, origin: "ai" | "user"): DecisionRecord["fields"][number] {
  return { key, text, origin };
}

function platformDecisions(): DecisionRecord[] {
  return [
    {
      id: "dec-plat-2026q3",
      departmentId: RD_DEPT.platform,
      title: "2026 Q3 平台部数据底座建设",
      date: "2026-07-15",
      status: "executed",
      initiatorRole: "HRBP",
      approverRole: "CTO",
      beforeText: "新增数据平台组，幅度 3.1",
      afterText: "幅度 2.1",
      fields: [
        field("background", "各业务线自建数据管道，指标口径不统一。", "ai"),
        field("intent", "在平台部集中建设数据底座，统一指标口径。", "user"),
        field("expectedEffect", "口径覆盖 80% 业务线，KR 2.3 指标口径覆盖率提升。", "ai"),
        field("reviewDate", "2026-12-31", "user"),
      ],
      opinion: "同意。与数据智能部的分工在季度会上对齐。",
    },
    {
      id: "dec-plat-sre",
      departmentId: RD_DEPT.platform,
      title: "2026 H1 SRE 与运维整合",
      date: "2026-03-20",
      status: "executed",
      initiatorRole: "HRBP",
      approverRole: "CTO",
      beforeText: "SRE 组与运维组分开，层级 4",
      afterText: "合并为基础架构组，层级 3",
      fields: [
        field("background", "故障处置要跨两个小组来回协调。", "ai"),
        field("intent", "合成一个基础架构组，缩短故障处理路径。", "ai"),
        field("expectedEffect", "MTTR 下降，变更失败率下降。", "user"),
        field("reviewDate", "2026-09-30", "ai"),
      ],
      opinion: "通过。复盘：MTTR 预期下降 25%、实际下降 18%，部分达成；变更失败率预期下降 30%、实际下降 34%，达成。",
    },
    {
      id: "dec-plat-split",
      departmentId: RD_DEPT.platform,
      title: "基础设施部拆分方案",
      date: "2025-12-10",
      status: "executed",
      initiatorRole: "HRBP",
      approverRole: "CTO",
      beforeText: "基础设施与交付质量在同一个部门",
      afterText: "拆成平台部与质量与交付部",
      sourceNote: "来自原基础设施部",
      fields: [
        field("background", "平台能力与交付质量目标不同，放在一起两边都难对齐。", "ai"),
        field("intent", "按交付对象拆开，平台部承接底座，质量与交付部承接发布质量。", "user"),
        field("expectedEffect", "核心服务可用性目标保持，两个部门各自对齐 KR。", "ai"),
        field("reviewDate", "2026-06-30", "user"),
      ],
      opinion: "通过。半年后复盘两个部门的边界。",
    },
    {
      id: "dec-plat-reject",
      departmentId: RD_DEPT.platform,
      title: "拟合并数据平台组到数据智能部",
      date: "2026-08-20",
      status: "rejected",
      initiatorRole: "HRBP",
      approverRole: "CTO",
      beforeText: "数据平台组留在平台部",
      afterText: "未执行",
      fields: [
        field("background", "有人建议把指标组和底座组放到同一个部门。", "ai"),
        field("intent", "减少跨部门对齐。", "user"),
        field("expectedEffect", "指标口径由一个部门负责。", "ai"),
        field("reviewDate", "2026-12-31", "ai"),
      ],
      opinion: "驳回。定位不同，合并后 KR 2.3 承接不清，暂不调整。",
    },
  ];
}

/**
 * 示例里大组的填充汇报会让很多人超过幅度上限。画布只留下数据组这一条：
 * 应用分析小组并入之后，组长直接带 12 人，这才是 P3 要处理的提醒。
 */
export function presentRdCenterIssues(issues: OrgIssue[]): OrgIssue[] {
  return issues.filter((issue) => issue.code !== "span_wide" || issue.departmentIds.includes(RD_DEPT.dataGroup));
}

export function appCellMergeLead(baseline: OrgSnapshot, current: OrgSnapshot): string | undefined {
  const currentNames = new Set(current.departments.map((department) => department.name));
  const removed = baseline.departments.some((department) => department.name === APP_CELL_NAME && !currentNames.has(department.name));
  if (removed && currentNames.has("数据组")) return "应用分析小组并入数据组";
  return undefined;
}

export function buildRdCenterWorkspace(importedAt = new Date().toISOString()): Workspace {
  const baselinePeople = snapshotPeople(false);
  const priorPeople = snapshotPeople(true, false);
  const splitPeople = snapshotPeople(true, true);
  const baselineDepts = departments(false);
  const priorDepts = departments(true, false);
  const splitDepts = departments(true, true, metricLeadId());
  const savedAt = importedAt;
  const priorAt = new Date(Date.parse(importedAt) - 86_400_000).toISOString();
  const workspace = createWorkspace(
    { people: baselinePeople, departments: baselineDepts },
    {
      filename: "研发中心组织调整-示例数据.json",
      importedAt,
      sampleId: RD_CENTER_SAMPLE_ID,
      sampleLabel: "研发中心组织调整（示例数据）",
      sheetName: "示例数据",
      peopleCount: baselinePeople.length,
      departmentCount: baselineDepts.length,
      aiMode: "offline",
    },
  );
  const decompositions = intelligenceDecompositions();
  const quiet = ["span_wide", "span_narrow", "layers_deep", "single_person_dept"] as const;
  const planIgnored = ["span_narrow", "layers_deep", "single_person_dept"] as const;
  return {
    ...workspace,
    activeScenarioId: "scenario-a",
    decisions: platformDecisions(),
    scenarios: workspace.scenarios.map((scenario) => {
      if (scenario.id === "baseline") {
        return { ...scenario, snapshot: { people: baselinePeople, departments: baselineDepts }, ignoredCodes: [...quiet] };
      }
      if (scenario.id === "scenario-a") {
        return {
          ...scenario,
          savedAt,
          snapshot: { people: splitPeople, departments: splitDepts },
          decompositions,
          ignoredCodes: [...planIgnored],
          revisions: [{ name: "方案 A · 拆组前", savedAt: priorAt, snapshot: { people: priorPeople, departments: priorDepts } }],
        };
      }
      return { ...scenario, ignoredCodes: [...quiet] };
    }),
  };
}
