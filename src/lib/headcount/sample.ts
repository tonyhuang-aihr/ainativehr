import { AS_OF, PLAN_YEAR } from "@/lib/headcount/calendar";
import type { AgentSeed, DepartmentNode, MovementSeed, OtherSeat, PersonSeed, PlanInput } from "@/lib/headcount/types";

export const GRADE_ANNUAL: Record<string, number> = {
  P4: 170_000,
  P5: 235_000,
  P6: 300_000,
  P7: 395_000,
  P8: 520_000,
  M2: 450_000,
  M3: 545_000,
  M4: 800_000,
  M5: 1_400_000,
};

/** 元/人/月。年成本 = 月单价 × 12，和设计师脚本里的年单价一致。 */
export const OTHER_MONTHLY = { 外包: 18_000, 实习: 6_000, 顾问: 30_000 } as const;
export const OTHER_ANNUAL = {
  外包: OTHER_MONTHLY.外包 * 12,
  实习: OTHER_MONTHLY.实习 * 12,
  顾问: OTHER_MONTHLY.顾问 * 12,
} as const;

/** 来自沙盘拆解的人 : AI。没有拆解的部门写「未拆解」。 */
export const DEMO_AI_RATIO: Record<string, string> = {
  rd: "78 : 22",
  plat: "72 : 28",
  "plat-infra": "72 : 28",
  "plat-data": "72 : 28",
  "plat-direct": "72 : 28",
};

const SRC = { source: "import" as const, version: 1 };

export const DEPT = {
  center: "rd",
  direct: "rd-direct",
  prod1: "prod1",
  prod2: "prod2",
  plat: "plat",
  platDirect: "plat-direct",
  infra: "plat-infra",
  data: "plat-data",
  qa: "qa",
  ai: "ai",
} as const;

function dept(id: string, name: string, parentId: string | null, quotaFormal: number, quotaAgent: number): DepartmentNode {
  return { id, name, parentId, quotaFormal, quotaAgent };
}

function person(partial: Omit<PersonSeed, "source" | "version" | "employmentType"> & { employmentType?: PersonSeed["employmentType"] }): PersonSeed {
  return { employmentType: "正式", ...SRC, ...partial };
}

function move(partial: Omit<MovementSeed, "source" | "version" | "employmentType" | "employeeNo"> & { employmentType?: MovementSeed["employmentType"]; employeeNo?: string }): MovementSeed {
  return { employmentType: "正式", employeeNo: partial.employeeNo ?? "", ...SRC, ...partial };
}

function other(departmentId: string, employmentType: OtherSeat["employmentType"], count: number): OtherSeat {
  return { departmentId, employmentType, count, annual: OTHER_ANNUAL[employmentType] };
}

function expandMix(
  departmentId: string,
  city: string,
  mix: Record<string, number>,
  named: { name: string; employeeNo: string; grade: string; title: string }[],
): PersonSeed[] {
  const slots: { grade: string; named?: (typeof named)[number] }[] = [];
  for (const [grade, count] of Object.entries(mix)) {
    for (let index = 0; index < count; index += 1) slots.push({ grade });
  }
  for (const item of named) {
    const slot = slots.find((entry) => entry.grade === item.grade && !entry.named);
    if (!slot) throw new Error(`${departmentId} 没有 ${item.grade} 的在岗名额给 ${item.name}`);
    slot.named = item;
  }
  const headIndex = slots.findIndex((slot) => slot.grade.startsWith("M"));
  const head = headIndex >= 0 ? slots[headIndex] : slots[0];
  const headNo = head?.named?.employeeNo ?? `E${departmentId}-1`;
  return slots.map((slot, index) => {
    const namedPerson = slot.named;
    const employeeNo = namedPerson?.employeeNo ?? `E${departmentId}-${index + 1}`;
    const isHead = namedPerson ? namedPerson.employeeNo === headNo : employeeNo === headNo;
    return person({
      id: employeeNo,
      name: namedPerson?.name ?? `示例${departmentId}${index + 1}`,
      employeeNo,
      departmentId,
      title: namedPerson?.title ?? (slot.grade.startsWith("M") ? "负责人" : "工程师"),
      grade: slot.grade,
      managerId: isHead ? null : headNo,
      isManager: slot.grade.startsWith("M"),
      city,
    });
  });
}

function platformPeople(): PersonSeed[] {
  const people: PersonSeed[] = [
    person({ id: "E10012", name: "赵一", employeeNo: "E10012", departmentId: DEPT.platDirect, title: "平台总监", grade: "M4", managerId: null, isManager: true, city: "北京" }),
    person({ id: "E10671", name: "李四", employeeNo: "E10671", departmentId: DEPT.platDirect, title: "技术项目经理", grade: "P7", managerId: "E10012", isManager: false, city: "北京" }),
    person({ id: "E10158", name: "钱二", employeeNo: "E10158", departmentId: DEPT.infra, title: "基础架构组组长", grade: "M3", managerId: "E10012", isManager: true, city: "北京" }),
    person({ id: "E10233", name: "孙三", employeeNo: "E10233", departmentId: DEPT.data, title: "数据平台组组长", grade: "M3", managerId: "E10012", isManager: true, city: "北京" }),
  ];
  const infraNamed: [string, string, string, string][] = [
    ["郑七", "E10187", "SRE 专家", "P7"],
    ["冯八", "E10366", "后端工程师", "P6"],
    ["周五", "E10402", "数据架构师", "P7"],
    ["吴六", "E10815", "数据治理工程师", "P6"],
    ["卫十一", "E10902", "云原生工程师", "P6"],
    ["蒋十二", "E11076", "后端工程师", "P5"],
    ["沈十三", "E11120", "存储工程师", "P6"],
    ["韩十四", "E12158", "网络工程师", "P5"],
  ];
  for (const [name, employeeNo, title, grade] of infraNamed) {
    people.push(person({ id: employeeNo, name, employeeNo, departmentId: DEPT.infra, title, grade, managerId: "E10158", isManager: false, city: "北京" }));
  }
  const generated = [...Array(3).fill("P7"), ...Array(12).fill("P6"), ...Array(8).fill("P5"), ...Array(2).fill("P4")];
  generated.forEach((grade, index) => {
    const employeeNo = `E${19001 + index}`;
    const title = grade === "P5" || grade === "P4" ? "后端工程师" : "平台工程师";
    people.push(person({ id: employeeNo, name: `示例${19001 + index}`, employeeNo, departmentId: DEPT.infra, title, grade, managerId: "E10158", isManager: false, city: "北京" }));
  });
  const dataMix: [string, number][] = [["P7", 3], ["P6", 13], ["P5", 7], ["P4", 2]];
  let cursor = 0;
  for (const [grade, count] of dataMix) {
    for (let index = 0; index < count; index += 1) {
      const named = grade === "P5" && cursor === 16;
      const employeeNo = named ? "E12366" : `E${19101 + cursor}`;
      const name = named ? "何二十一" : `示例${19101 + cursor}`;
      people.push(person({
        id: employeeNo,
        name,
        employeeNo,
        departmentId: DEPT.data,
        title: "数据开发工程师",
        grade,
        managerId: "E10233",
        isManager: false,
        city: "北京",
        hireDate: named ? "2024-04-08" : undefined,
      }));
      cursor += 1;
    }
  }
  return people;
}

export function samplePlan(): PlanInput {
  const departments: DepartmentNode[] = [
    dept(DEPT.center, "研发中心", null, 507, 25),
    dept(DEPT.prod1, "产品研发一部", DEPT.center, 156, 6),
    dept(DEPT.prod2, "产品研发二部", DEPT.center, 134, 3),
    dept(DEPT.qa, "质量与交付部", DEPT.center, 80, 4),
    dept(DEPT.ai, "数据智能部", DEPT.center, 70, 2),
    dept(DEPT.plat, "平台部", DEPT.center, 66, 10),
    dept(DEPT.platDirect, "平台部直属", DEPT.plat, 2, 2),
    dept(DEPT.infra, "基础架构组", DEPT.plat, 37, 8),
    dept(DEPT.data, "数据平台组", DEPT.plat, 27, 0),
    dept(DEPT.direct, "研发中心直属", DEPT.center, 1, 0),
  ];
  const people = [
    ...expandMix(DEPT.direct, "北京", { M5: 1 }, [{ name: "陈零", employeeNo: "E10001", grade: "M5", title: "研发中心负责人" }]),
    ...expandMix(DEPT.prod1, "上海", { M4: 1, M3: 6, M2: 4, P8: 3, P7: 22, P6: 62, P5: 40, P4: 12 }, [
      { name: "吕二十三", employeeNo: "E21023", grade: "P5", title: "后端工程师" },
      { name: "曹二十六", employeeNo: "E21026", grade: "P6", title: "前端工程师" },
      { name: "华二十八", employeeNo: "E21028", grade: "P5", title: "后端工程师" },
    ]),
    ...expandMix(DEPT.prod2, "杭州", { M4: 1, M3: 5, M2: 3, P8: 2, P7: 19, P6: 54, P5: 36, P4: 11 }, [
      { name: "魏三十", employeeNo: "E22030", grade: "P6", title: "客户端工程师" },
    ]),
    ...expandMix(DEPT.qa, "成都", { M4: 1, M3: 3, M2: 3, P7: 8, P6: 26, P5: 28, P4: 8 }, [
      { name: "戚三十三", employeeNo: "E23033", grade: "P5", title: "测试工程师" },
    ]),
    ...expandMix(DEPT.ai, "北京", { M4: 1, M3: 3, M2: 1, P8: 3, P7: 12, P6: 25, P5: 15, P4: 5 }, [
      { name: "许十八", employeeNo: "E11873", grade: "P6", title: "数据平台工程师" },
    ]),
    ...platformPeople(),
  ];
  const cao = people.find((item) => item.employeeNo === "E21026");
  if (cao) cao.hireDate = "2021-12-01";

  const movements: MovementSeed[] = [
    move({ id: "m-zhu", kind: "入职", name: "朱十五", employeeNo: "临时-0031", departmentId: DEPT.infra, title: "SRE 工程师", grade: "P6", effectiveDate: "2027-01-11" }),
    move({ id: "m-qin", kind: "入职", name: "秦十六", employeeNo: "临时-0032", departmentId: DEPT.data, title: "数据开发工程师", grade: "P6", effectiveDate: "2027-03-01" }),
    move({ id: "m-xu-in", kind: "转入", name: "许十八", employeeNo: "E11873", departmentId: DEPT.data, fromDepartmentId: DEPT.ai, title: "数据平台工程师", grade: "P6", effectiveDate: "2027-04-01" }),
    move({ id: "m-xu-out", kind: "转出", name: "许十八", employeeNo: "E11873", departmentId: DEPT.ai, toDepartmentId: DEPT.data, title: "数据平台工程师", grade: "P6", effectiveDate: "2027-04-01" }),
    move({ id: "m-jiang", kind: "离职", name: "蒋十二", employeeNo: "E11076", departmentId: DEPT.infra, title: "后端工程师", grade: "P5", effectiveDate: "2027-02-28", compMark: "不计", city: "北京" }),
    move({ id: "m-he", kind: "离职", name: "何二十一", employeeNo: "E12366", departmentId: DEPT.data, title: "数据开发工程师", grade: "P5", effectiveDate: "2027-03-31", compMark: "N", hireDate: "2024-04-08", city: "北京" }),
    move({ id: "m-shen-out", kind: "转出", name: "沈十三", employeeNo: "E11120", departmentId: DEPT.infra, toDepartmentId: DEPT.qa, title: "存储工程师", grade: "P6", effectiveDate: "2027-07-01" }),
    move({ id: "m-shen-in", kind: "转入", name: "沈十三", employeeNo: "E11120", departmentId: DEPT.qa, fromDepartmentId: DEPT.infra, title: "存储工程师", grade: "P6", effectiveDate: "2027-07-01" }),
    move({ id: "m-yang", kind: "入职", name: "杨二十二", employeeNo: "临时-2201", departmentId: DEPT.prod1, title: "前端工程师", grade: "P6", effectiveDate: "2027-01-04" }),
    move({ id: "m-lv", kind: "离职", name: "吕二十三", employeeNo: "E21023", departmentId: DEPT.prod1, title: "后端工程师", grade: "P5", effectiveDate: "2027-01-31", compMark: "不计" }),
    move({ id: "m-shi", kind: "入职", name: "施二十四", employeeNo: "临时-2202", departmentId: DEPT.prod1, title: "后端工程师", grade: "P6", effectiveDate: "2027-02-01" }),
    move({ id: "m-kong", kind: "入职", name: "孔二十五", employeeNo: "临时-2203", departmentId: DEPT.prod1, title: "测试开发工程师", grade: "P6", effectiveDate: "2027-03-01" }),
    move({ id: "m-cao", kind: "离职", name: "曹二十六", employeeNo: "E21026", departmentId: DEPT.prod1, title: "前端工程师", grade: "P6", effectiveDate: "2027-03-31", compMark: "N", hireDate: "2021-12-01", city: "上海" }),
    move({ id: "m-yan", kind: "入职", name: "严二十七", employeeNo: "临时-2204", departmentId: DEPT.prod1, title: "技术专家", grade: "P7", effectiveDate: "2027-04-01" }),
    move({ id: "m-hua", kind: "离职", name: "华二十八", employeeNo: "E21028", departmentId: DEPT.prod1, title: "后端工程师", grade: "P5", effectiveDate: "2027-05-31", compMark: "不计" }),
    move({ id: "m-jin", kind: "入职", name: "金二十九", employeeNo: "临时-2301", departmentId: DEPT.prod2, title: "客户端工程师", grade: "P6", effectiveDate: "2027-01-18" }),
    move({ id: "m-wei", kind: "离职", name: "魏三十", employeeNo: "E22030", departmentId: DEPT.prod2, title: "客户端工程师", grade: "P6", effectiveDate: "2027-02-28", compMark: "不计" }),
    move({ id: "m-tao", kind: "入职", name: "陶三十一", employeeNo: "临时-2302", departmentId: DEPT.prod2, title: "后端工程师", grade: "P6", effectiveDate: "2027-03-15" }),
    move({ id: "m-jiang32", kind: "入职", name: "姜三十二", employeeNo: "临时-2401", departmentId: DEPT.qa, title: "测试工程师", grade: "P5", effectiveDate: "2027-01-04" }),
    move({ id: "m-qi", kind: "离职", name: "戚三十三", employeeNo: "E23033", departmentId: DEPT.qa, title: "测试工程师", grade: "P5", effectiveDate: "2027-01-31", compMark: "不计" }),
    move({ id: "m-xie", kind: "入职", name: "谢三十四", employeeNo: "临时-2402", departmentId: DEPT.qa, title: "测试工程师", grade: "P5", effectiveDate: "2027-04-06" }),
    move({ id: "m-zou", kind: "入职", name: "邹三十五", employeeNo: "临时-2501", departmentId: DEPT.ai, title: "算法工程师", grade: "P7", effectiveDate: "2027-02-20" }),
    move({ id: "a-ops", kind: "Agent 新增", name: "运维巡检 Agent", employeeNo: "", departmentId: DEPT.infra, title: "运维助手", grade: "", effectiveDate: "2027-02-01", agentType: "运维助手", instanceDelta: 2, seatMonthly: 1200, computeMonthly: 2800, oneOff: 30_000 }),
    move({ id: "a-review", kind: "Agent 调整", name: "代码评审 Agent", employeeNo: "", departmentId: DEPT.infra, title: "编码助手", grade: "", effectiveDate: "2027-04-01", agentType: "编码助手", instanceDelta: 2, seatMonthly: 1500, computeMonthly: 2000, oneOff: 0 }),
    move({ id: "a-ticket", kind: "Agent 下线", name: "工单分派 Agent（旧版）", employeeNo: "", departmentId: DEPT.infra, title: "流程助手", grade: "", effectiveDate: "2027-07-01", agentType: "流程助手", instanceDelta: -1, seatMonthly: 800, computeMonthly: 700, oneOff: 0 }),
    move({ id: "a-qa", kind: "Agent 新增", name: "测试用例生成 Agent", employeeNo: "", departmentId: DEPT.qa, title: "测试助手", grade: "", effectiveDate: "2027-03-01", agentType: "测试助手", instanceDelta: 2, seatMonthly: 800, computeMonthly: 1200, oneOff: 20_000 }),
    move({ id: "a-ask", kind: "Agent 调整", name: "数据问答 Agent", employeeNo: "", departmentId: DEPT.ai, title: "助理助手", grade: "", effectiveDate: "2027-05-01", agentType: "助理助手", instanceDelta: 1, seatMonthly: 2000, computeMonthly: 3000, oneOff: 0 }),
  ];
  const agents: AgentSeed[] = [
    { id: "ag-review", name: "代码评审 Agent", agentType: "编码助手", departmentId: DEPT.infra, instances: 3, seatMonthly: 1500, computeMonthly: 2000, ...SRC },
    { id: "ag-doc", name: "文档问答 Agent", agentType: "知识助手", departmentId: DEPT.platDirect, instances: 2, seatMonthly: 600, computeMonthly: 900, ...SRC },
    { id: "ag-ticket", name: "工单分派 Agent（旧版）", agentType: "流程助手", departmentId: DEPT.infra, instances: 1, seatMonthly: 800, computeMonthly: 700, ...SRC },
    { id: "ag-p1", name: "代码评审 Agent", agentType: "编码助手", departmentId: DEPT.prod1, instances: 4, seatMonthly: 1500, computeMonthly: 2000, ...SRC },
    { id: "ag-p2", name: "代码评审 Agent", agentType: "编码助手", departmentId: DEPT.prod2, instances: 2, seatMonthly: 1500, computeMonthly: 2000, ...SRC },
    { id: "ag-qa", name: "测试用例生成 Agent", agentType: "测试助手", departmentId: DEPT.qa, instances: 2, seatMonthly: 800, computeMonthly: 1200, ...SRC },
    { id: "ag-ai", name: "数据问答 Agent", agentType: "助理助手", departmentId: DEPT.ai, instances: 1, seatMonthly: 2000, computeMonthly: 3000, ...SRC },
  ];
  const others: OtherSeat[] = [
    other(DEPT.prod1, "外包", 6),
    other(DEPT.prod1, "实习", 4),
    other(DEPT.prod2, "外包", 5),
    other(DEPT.prod2, "实习", 3),
    other(DEPT.prod2, "顾问", 1),
    other(DEPT.infra, "外包", 4),
    other(DEPT.data, "实习", 2),
    other(DEPT.platDirect, "顾问", 1),
    other(DEPT.qa, "外包", 12),
    other(DEPT.qa, "实习", 2),
    other(DEPT.ai, "外包", 2),
    other(DEPT.ai, "实习", 3),
    other(DEPT.ai, "顾问", 1),
  ];
  if (people.length !== 486) throw new Error(`示例花名册应为 486 人，实际 ${people.length}`);
  return {
    year: PLAN_YEAR,
    asOf: AS_OF,
    companyBudget: 160_000_000,
    oneOffBudget: 300_000,
    departments,
    gradeAnnual: GRADE_ANNUAL,
    people,
    movements,
    agents,
    others,
    cityMonthly: { 北京: 12_500, 上海: 12_300, 杭州: 10_600, 成都: 8_900 },
    budgets: {
      [DEPT.direct]: 1_450_000,
      [DEPT.prod1]: 47_250_000,
      [DEPT.prod2]: 42_100_000,
      [DEPT.plat]: 20_500_000,
      [DEPT.qa]: 26_000_000,
      [DEPT.ai]: 22_400_000,
    },
    tenure: [{ departmentId: DEPT.qa, grade: "P5", averageMonths: 3.4 * 12, count: 28 }],
  };
}

export const DEMO_PASSWORD = "Demo2026!";

export const DEMO_ACCOUNTS = [
  { username: "huang", name: "黄", role: "od" as const, departmentIds: [] as string[], blurb: "OD · 全公司" },
  { username: "zhao", name: "赵一", role: "leader" as const, departmentIds: [DEPT.plat], blurb: "业务负责人 · 平台部（多个部门）" },
  { username: "qian", name: "钱二", role: "leader" as const, departmentIds: [DEPT.infra], blurb: "业务负责人 · 基础架构组（单个部门）" },
  { username: "fan", name: "范四十", role: "leader" as const, departmentIds: [DEPT.prod1], blurb: "业务负责人 · 产品研发一部（单个部门）" },
  { username: "lin", name: "林", role: "hrbp" as const, departmentIds: [DEPT.prod1], blurb: "HRBP · 只看产品研发一部" },
  { username: "hradmin", name: "韩管理", role: "hr_admin" as const, departmentIds: [] as string[], blurb: "HR 管理员 · 精确估算开关" },
  { username: "admin", name: "系统管理员", role: "sys_admin" as const, departmentIds: [] as string[], blurb: "系统管理员 · 账号与日志" },
];
