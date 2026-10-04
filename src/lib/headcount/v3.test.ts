import { describe, expect, it } from "vitest";
import { buildClosure, visibleDepartmentIds } from "@/lib/headcount/authz";
import { computePlan, deptStat } from "@/lib/headcount/engine";
import { buildLeaderView } from "@/lib/headcount/leaderView";
import { roundToHalfWan } from "@/lib/headcount/money";
import { buildScopeOverview, collectAlerts, maskPageCosts, pageKind, scopeHasSmallGroup } from "@/lib/headcount/overview";
import { annualFromMonthlyRate, exclusiveServiceEnd, offerIsAccepted, offerIsPending, agentChangeConfirmed, SAMPLE_FOLLOWS_DESIGNER_END } from "@/lib/headcount/policies";
import { DEPT, DEMO_ACCOUNTS, OTHER_MONTHLY, samplePlan } from "@/lib/headcount/sample";

const result = computePlan(samplePlan());

describe("v3 数字仍对齐设计师脚本", () => {
  it("公司、平台部、产品研发一部和基础架构组的取整没有因代通知金改口而移动", () => {
    expect(roundToHalfWan(deptStat(result, DEPT.center).yearTotalYuan)).toBe(16095);
    expect(roundToHalfWan(deptStat(result, DEPT.center).yearOneOffYuan)).toBe(24.5);
    expect(roundToHalfWan(deptStat(result, DEPT.plat).yearDailyYuan)).toBe(2075.5);
    expect(roundToHalfWan(deptStat(result, DEPT.prod1).yearDailyYuan)).toBe(4845);
    expect(roundToHalfWan(deptStat(result, DEPT.infra).yearDailyYuan)).toBe(1110.5);
    expect(roundToHalfWan(deptStat(result, DEPT.infra).currentYuan)).toBe(1102);
    expect(result.plan.movements.some((movement) => movement.compMark === "N+1")).toBe(false);
  });
});

describe("OD 总览告警和部门页", () => {
  it("5 条告警都能由规则重算，部门差额按原型排序", () => {
    const alerts = collectAlerts(result, DEPT.center, "company");
    expect(alerts.map((alert) => `${alert.kind} ${alert.title}`)).toEqual([
      "超预算 产品研发一部",
      "超预算 平台部",
      "超编 平台部 / 数据平台组",
      "空缺偏多 数据智能部",
      "在途集中 平台部",
    ]);
    const overview = buildScopeOverview(result, DEPT.center, "od", false);
    expect(overview.cards.find((card) => card.label.startsWith("全年"))?.value).toBe("16,095.0");
    expect(overview.departments.map((row) => row.gap)).toEqual(["+120.0", "+25.5", "−5.0", "−11.5", "−13.5", "−15.0"]);
    expect(overview.oneOff).toMatchObject({ amount: "24.5", budget: "30.0", gap: "−5.5" });
    expect(overview.conclusion).toContain("95.0");
    expect(JSON.stringify(overview)).not.toContain("1,110.5");
  });
});

describe("负责人按范围进入，小组成本在接口里就是区间", () => {
  const closure = buildClosure(samplePlan().departments);
  const zhao = visibleDepartmentIds({ id: "zhao", role: "leader", departmentIds: [DEPT.plat] }, samplePlan().departments, closure);
  const qian = visibleDepartmentIds({ id: "qian", role: "leader", departmentIds: [DEPT.infra] }, samplePlan().departments, closure);

  it("多个部门先看总览，单个部门直接进详情", () => {
    expect(pageKind(DEPT.plat, samplePlan().departments, zhao)).toBe("overview");
    expect(pageKind(DEPT.infra, samplePlan().departments, qian)).toBe("detail");
    expect(pageKind(DEPT.prod1, samplePlan().departments, [DEPT.prod1])).toBe("detail");
    expect(DEMO_ACCOUNTS.some((account) => account.username === "qian" && account.departmentIds.length === 1)).toBe(true);
  });

  it("平台部范围内有不足 5 人的组，各组成本是区间，合计仍是 2,075.5", () => {
    expect(scopeHasSmallGroup(result, zhao)).toBe(true);
    const overview = buildScopeOverview(result, DEPT.plat, "leader", true);
    const blob = JSON.stringify(overview);
    expect(blob).toContain("2,075.5");
    expect(blob).toContain("1,110–1,120");
    expect(blob).toContain("800–810");
    expect(blob).toContain("150–160");
    expect(blob).not.toContain("1,110.5");
    expect(blob).not.toContain("806.0");
    expect(blob).not.toContain("159.0");
    expect(overview.rangeNote).toContain("平台部直属");
  });

  it("从总览进入小组时，接口也不返回该组精确金额", () => {
    expect(maskPageCosts(result, zhao, DEPT.infra)).toBe(true);
    const view = buildLeaderView(result, DEPT.infra, { exact: false, maskCosts: true });
    const blob = JSON.stringify(view);
    expect(blob).toContain("1,110–1,120");
    expect(blob).not.toContain("1,110.5");
    expect(blob).not.toContain("1,102.0");
    expect(view.annualLabel).toBe("1,110–1,120");
  });

  it("只负责基础架构组的人看到精确数，人员变动合并成 3 人", () => {
    expect(maskPageCosts(result, qian, DEPT.infra)).toBe(false);
    const view = buildLeaderView(result, DEPT.infra, { exact: false, maskCosts: false });
    expect(view.annualLabel).toBe("1,110.5");
    expect(view.now.currentLabel).toBe("1,102.0");
    expect(view.drivers.map((line) => `${line.detail} ${line.label}`)).toEqual(["3 人变动 −5.5", "Agent 新增 2 · 扩容 2 · 下线 1 +14.0"]);
    expect(view.yearEnd.people).toBe(33);
    expect(view.yearEnd.agents).toBe(7);
    expect(view.aiRatio).toBe("72 : 28");
    expect(JSON.stringify(view)).not.toContain("1 人入职");
  });
});

describe("已拍板的默认值", () => {
  it("离职含最后工作日、外包按月单价、未接受的 offer 和未批准的 Agent 不计入", () => {
    expect(exclusiveServiceEnd("2027-02-28")).toBe("2027-03-01");
    expect(SAMPLE_FOLLOWS_DESIGNER_END).toBe(true);
    expect(annualFromMonthlyRate(OTHER_MONTHLY.外包)).toBe(216_000);
    expect(offerIsPending("已发未接受")).toBe(true);
    expect(offerIsAccepted("已发未接受")).toBe(false);
    expect(offerIsAccepted("已接受的 offer")).toBe(true);
    expect(agentChangeConfirmed("上线已批准")).toBe(true);
    expect(agentChangeConfirmed("待审批")).toBe(false);
  });
});
