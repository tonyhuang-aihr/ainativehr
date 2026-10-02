import { describe, expect, it } from "vitest";
import { buildDecisionPrefill } from "@/lib/ai/desensitize";
import { rollupCosts } from "@/lib/cost/math";
import { countExecuted, visibleDecisions } from "@/lib/decisions/trail";
import { findPersonalLeaks, guardIssues, hasPlacement, stripGuardedText } from "@/lib/decisions/guard";
import { noticePlainText } from "@/lib/data/noticeCopy";
import { clearLocalBrowserData, DATA_NOTICE_KEY, WORKSPACE_KEY } from "@/lib/data/localData";
import { parseScenarioFile, serializeScenarioFile } from "@/lib/data/scenarioFile";
import { buildRdCenterWorkspace, RD_DEPT } from "@/lib/demo/rdCenter";
import type { DecisionRecord, Person, RoleDecomposition } from "@/lib/model/types";
import { peopleInDepartment } from "@/lib/org/metrics";
import { departmentRoster } from "@/lib/roster/membership";
import { sortRoster } from "@/lib/roster/order";
import { peopleIncludedInRollup, summarizePostures } from "@/lib/roles/posture";
import { activeScenario, baselineScenario } from "@/lib/workspace/create";

const P1 = ["研发中心", "产品研发一部"];
const PLAT = ["研发中心", "平台部"];
const AI = ["研发中心", "数据智能部"];

function bare(partial: Partial<Person> & Pick<Person, "id" | "name" | "employeeId">): Person {
  return {
    rowNumber: 1,
    originalName: partial.name,
    departmentRaw: "",
    departmentPath: partial.departmentPath ?? ["部门"],
    title: partial.title ?? "工程师",
    managerName: "",
    managerId: partial.managerId ?? null,
    level: "P6",
    annualCost: null,
    hireDate: "2020-01-01",
    location: "",
    performance: partial.performance ?? "",
    email: "",
    ...partial,
  };
}

describe("花名册排序", () => {
  it("先按汇报层级，再按工号，不看绩效", () => {
    const boss = bare({ id: "boss", name: "负责人", employeeId: "E1", managerId: null, performance: "待改进" });
    const lateHigh = bare({ id: "a", name: "甲", employeeId: "E30", managerId: "boss", performance: "超出预期" });
    const earlyLow = bare({ id: "b", name: "乙", employeeId: "E10", managerId: "boss", performance: "待改进" });
    const deep = bare({ id: "c", name: "丙", employeeId: "E2", managerId: "b", performance: "超出预期" });
    const people = [deep, lateHigh, boss, earlyLow];
    expect(sortRoster(people).map((person) => person.employeeId)).toEqual(["E1", "E10", "E30", "E2"]);
  });
});

describe("决策轨迹计数与安置过滤", () => {
  const executed: DecisionRecord = {
    id: "ok",
    departmentId: "D-0203",
    title: "合并两个小组",
    date: "2026-03-20",
    status: "executed",
    initiatorRole: "HRBP",
    approverRole: "CTO",
    beforeText: "两个小组",
    afterText: "一个小组",
    fields: [{ key: "intent", text: "缩短路径", origin: "ai" }],
    opinion: "通过",
  };
  const rejected: DecisionRecord = { ...executed, id: "no", status: "rejected", title: "拟合并到另一部门" };
  const placement: DecisionRecord = {
    ...executed,
    id: "move",
    title: "更换负责人并安排调岗",
    beforeText: "调整现任负责人的去留",
    afterText: "",
    fields: [{ key: "intent", text: "人员安置：调岗", origin: "user" }],
    opinion: "谁来接任另说",
  };

  it("已驳回不计入 N", () => {
    expect(countExecuted([executed, rejected, { ...executed, id: "wait", status: "pending" }], "D-0203")).toBe(1);
    expect(countExecuted([executed], "其他")).toBe(0);
  });

  it("人员安置内容不展示，也不计入已执行", () => {
    expect(hasPlacement("安排调岗")).toBe(true);
    const visible = visibleDecisions([executed, placement]);
    expect(visible.map((item) => item.id)).toEqual(["ok"]);
    expect(countExecuted([executed, placement])).toBe(1);
  });
});

describe("自由文本的姓名和工号检查", () => {
  const people = [bare({ id: "1", name: "赵一", employeeId: "E10012", originalName: "赵一" })];

  it("对上花名册里的姓名或工号", () => {
    const leaks = findPersonalLeaks("请让赵一（E10012）负责", people);
    expect(leaks.names).toEqual(["赵一"]);
    expect(leaks.ids).toEqual(["E10012"]);
    expect(guardIssues("统一口径即可", people)).toEqual([]);
    expect(guardIssues("赵一调岗到新组", people).length).toBeGreaterThan(0);
  });

  it("一键移除会去掉姓名、工号和安置句子", () => {
    const cleaned = stripGuardedText("口径统一。赵一 E10012 调岗另议。幅度回到 6。", people);
    expect(cleaned).not.toContain("赵一");
    expect(cleaned).not.toContain("E10012");
    expect(cleaned).not.toContain("调岗");
    expect(cleaned).toContain("口径统一");
    expect(cleaned).toContain("幅度回到 6");
  });
});

describe("待复核岗位不进汇总", () => {
  it("71 人里草稿 4、待复核 22 不计入，N 只数 3 个待复核岗位", () => {
    const titles: Array<[string, number, RoleDecomposition["posture"]]> = [
      ["应用分析岗", 4, "draft"],
      ["数据开发工程师", 11, "pending_review"],
      ["数据治理工程师", 7, "pending_review"],
      ["数据组组长", 4, "pending_review"],
      ["算法工程师", 15, "active"],
      ["数据产品经理", 10, "active"],
      ["分析工程师", 8, "active"],
      ["数据运营", 7, "active"],
      ["平台分析师", 5, "active"],
    ];
    const people = titles.flatMap(([title, count]) =>
      Array.from({ length: count }, (_, index) => bare({ id: `${title}-${index}`, name: `${title}${index}`, employeeId: `E${index}`, title, annualCost: 1000 })),
    );
    const decompositions: Record<string, RoleDecomposition> = {};
    for (const [title, , posture] of titles) {
      decompositions[title] = {
        roleTitle: title,
        posture,
        updatedAt: "2026-10-01",
        source: "template",
        tasks: [
          { id: "h", name: "人", timeShare: 0.62, frequency: "每日", mode: "human", reason: "", confidence: 0.8, source: "template", edited: false },
          { id: "a", name: "机", timeShare: 0.38, frequency: "每日", mode: "ai", reason: "", confidence: 0.8, source: "template", edited: false },
        ],
      };
    }
    const summary = summarizePostures(people, decompositions);
    expect(summary.people).toBe(71);
    expect(summary.draftPeople).toBe(4);
    expect(summary.pendingPeople).toBe(22);
    expect(summary.includedPeople).toBe(45);
    expect(summary.includedRoles).toBe(5);
    expect(summary.pendingRoles).toBe(3);
    const included = peopleIncludedInRollup(people, decompositions);
    const rollup = rollupCosts(included, decompositions, { computeUnitPrice: 200, collabAiShare: 0.5, monthlyHours: 160 });
    expect(rollup.headcount).toBe(45);
    expect(rollup.covered).toBe(45);
    expect(rollup.labor).toBe(45000);
    expect(rollup.ratio).toBe("38 : 62");
  });
});

describe("研发中心示例", () => {
  const workspace = buildRdCenterWorkspace("2026-10-02T00:00:00.000Z");
  const baseline = baselineScenario(workspace).snapshot;
  const plan = activeScenario(workspace).snapshot;

  it("平台部基线和方案 A 都是 62，一部 144，数据智能部 71", () => {
    expect(peopleInDepartment(baseline.people, PLAT)).toHaveLength(62);
    expect(peopleInDepartment(plan.people, PLAT)).toHaveLength(62);
    expect(peopleInDepartment(plan.people, P1)).toHaveLength(144);
    expect(peopleInDepartment(baseline.people, P1)).toHaveLength(146);
    expect(peopleInDepartment(plan.people, AI)).toHaveLength(71);
    expect(peopleInDepartment(baseline.people, AI)).toHaveLength(69);
    expect(plan.people).toHaveLength(486);
  });

  it("方案 A 平台部调入 2 调出 2，花名册前 10 人按层级和工号", () => {
    const roster = departmentRoster(baseline.people, plan.people, PLAT, true);
    expect(roster.inCount).toBe(2);
    expect(roster.outCount).toBe(2);
    expect(roster.net).toBe(0);
    const names = sortRoster(roster.current).slice(0, 10).map((person) => person.name);
    expect(names).toEqual(["赵一", "钱二", "孙三", "李四", "郑七", "冯八", "陈九", "褚十", "卫十一", "蒋十二"]);
  });

  it("已执行 3 条，驳回的不计入", () => {
    expect(countExecuted(workspace.decisions ?? [], RD_DEPT.platform)).toBe(3);
    expect((workspace.decisions ?? []).filter((item) => item.status === "rejected")).toHaveLength(1);
  });

  it("数据智能部的岗位汇总是 45 人、5 岗，待复核 N 为 3", () => {
    const scenario = activeScenario(workspace);
    const summary = summarizePostures(peopleInDepartment(plan.people, AI), scenario.decompositions);
    expect(summary).toMatchObject({
      people: 71,
      includedPeople: 45,
      includedRoles: 5,
      draftPeople: 4,
      pendingPeople: 22,
      pendingRoles: 3,
    });
  });
});

describe("决策预填与场景往返", () => {
  it("预填会擦掉混进来的姓名和工号", () => {
    const prefill = buildDecisionPrefill({
      departmentName: "平台部",
      beforePhrase: "赵一 E10012 共 62 人",
      afterPhrase: "62 人",
      reviewDate: "2027-03-31",
      secrets: ["赵一", "E10012"],
    });
    const blob = JSON.stringify(prefill);
    expect(blob).not.toContain("赵一");
    expect(blob).not.toContain("E10012");
    expect(prefill.reviewDate).toBe("2027-03-31");
  });

  it("场景文件带上决策轨迹，旧文件没有该字段也能读", () => {
    const workspace = buildRdCenterWorkspace("2026-10-02T00:00:00.000Z");
    const text = serializeScenarioFile(workspace, "2026-10-02T00:00:00.000Z");
    const loaded = parseScenarioFile(text);
    expect(loaded?.decisions).toHaveLength(4);
    const raw = JSON.parse(text) as { workspace: { decisions?: unknown } };
    delete raw.workspace.decisions;
    expect(parseScenarioFile(JSON.stringify(raw))?.decisions).toEqual([]);
  });
});

describe("数据说明措辞", () => {
  it("写明数据只在这台浏览器，并且不用禁止的留存承诺", () => {
    const text = noticePlainText();
    expect(text).toContain("目前所有数据只存在你的浏览器里");
    expect(text).toContain("可能在一定期限内留存");
    for (const banned of ["所有接口都不留存数据", "绝不用于训练", "数据只在内存中处理", "never retained", "never used for training"]) {
      expect(text.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it("一键清空会删掉工作区和相关键", () => {
    const store = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key) => store.get(key) ?? null,
      key: (index) => [...store.keys()][index] ?? null,
      removeItem: (key) => store.delete(key),
      setItem: (key, value) => store.set(key, value),
    };
    storage.setItem(WORKSPACE_KEY, "{}");
    storage.setItem(DATA_NOTICE_KEY, "1");
    storage.setItem("ainativehr.extra.v1", "x");
    storage.setItem("other", "keep");
    clearLocalBrowserData(storage);
    expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
    expect(storage.getItem(DATA_NOTICE_KEY)).toBeNull();
    expect(storage.getItem("ainativehr.extra.v1")).toBeNull();
    expect(storage.getItem("other")).toBe("keep");
  });
});
