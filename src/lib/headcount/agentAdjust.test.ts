import { describe, expect, it } from "vitest";
import { overlapDays, parseIsoDate, quarterBounds, yearDays, yearEnd } from "@/lib/headcount/calendar";
import { computePlan } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, roundToHalfWan } from "@/lib/headcount/money";
import { collectAgentLines, defaultDetailQuery, pageAgents } from "@/lib/headcount/rosterPage";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import type { AgentSeed, MovementSeed, PlanInput } from "@/lib/headcount/types";

const cents = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};

function planFor(agent: Pick<AgentSeed, "instances" | "seatMonthly" | "computeMonthly">, movement: Pick<MovementSeed, "instanceDelta" | "seatMonthly" | "computeMonthly" | "effectiveDate">): PlanInput {
  return {
    year: 2027,
    asOf: "2026-10-04",
    companyBudget: 16_000_000,
    oneOffBudget: null,
    departments: [{ id: "d", name: "组", parentId: null, quotaFormal: 1, quotaAgent: 10 }],
    gradeAnnual: {},
    people: [],
    agents: [{ id: "agent", name: "评审 Agent", agentType: "编码助手", departmentId: "d", source: "manual", version: 1, ...agent }],
    movements: [{
      id: "adjust",
      kind: "Agent 调整",
      name: "评审 Agent",
      employeeNo: "",
      departmentId: "d",
      title: "编码助手",
      grade: "",
      employmentType: "正式",
      agentType: "编码助手",
      source: "manual",
      version: 1,
      ...movement,
    }],
    others: [],
    cityMonthly: {},
    budgets: {},
    tenure: [],
  };
}

function combinedQuarters(result: ReturnType<typeof computePlan>): number[] {
  const base = result.agents.find((row) => row.id === "agent");
  const delta = result.agents.find((row) => row.id === "adjust");
  if (!base || !delta) throw new Error("缺少调整前后的 Agent 行");
  return [0, 1, 2, 3].map((index) => base.quarters[index] + delta.quarters[index]);
}

describe("Agent 调价黄金用例", () => {
  it("实例增加且单价变化，从生效日按全部实例的新单价折算", () => {
    const result = computePlan(planFor(
      { instances: 3, seatMonthly: 1500, computeMonthly: 2000 },
      { instanceDelta: 2, seatMonthly: 1800, computeMonthly: 2400, effectiveDate: "2027-05-16" },
    ));
    const impact = result.movements.find((movement) => movement.id === "adjust");
    if (!impact) throw new Error("缺少调整影响");
    const bounds = quarterBounds(2027);
    const when = parseIsoDate("2027-05-16");
    const days = bounds.map(([from, to]) => overlapDays(from, to, when, yearEnd(2027)));
    expect(days).toEqual([0, 46, 92, 92]);
    expect(yearDays(2027)).toBe(365);
    expect(impact.quarters.map(cents)).toEqual([0, 15879.45, 31758.9, 31758.9]);
    expect(cents(impact.annual)).toBe(79397.26);
    expect(impact.quarters.map((value) => roundToHalfWan(value))).toEqual([0, 1.5, 3, 3]);
    expect(roundToHalfWan(impact.annual)).toBe(8);
    expect(formatSignedWan(impact.quarters[1])).toBe("+1.5");
    expect(formatSignedWan(impact.quarters[2])).toBe("+3.0");
    expect(formatSignedWan(impact.quarters[3])).toBe("+3.0");
    expect(formatSignedWan(impact.annual)).toBe("+8.0");
    const row = combinedQuarters(result);
    expect(row.map(cents)).toEqual([31068.49, 47293.15, 63517.81, 63517.81]);
    expect(cents(row.reduce((total, value) => total + value, 0))).toBe(205397.26);
    expect(row.map((value) => formatWan(value))).toEqual(["3.0", "4.5", "6.5", "6.5"]);
    expect(formatWan(row.reduce((total, value) => total + value, 0))).toBe("20.5");
    const base = result.agents.find((item) => item.id === "agent");
    expect(base?.status).toBe("待调整");
    const shown = pageAgents(collectAgentLines(result, "d"), { ...defaultDetailQuery(), agentSize: 10 }, { exact: true }).rows[0];
    expect(shown?.status).toBe("待调整");
    expect(shown?.statusLabel).toBe("待调整 · 2027-05-16");
    expect(shown?.seat).toBe("1,500 → 1,800");
    expect(shown?.instancesLabel).toBe("3 → 5");
  });

  it("实例减少且单价不变，只减多余实例的成本", () => {
    const result = computePlan(planFor(
      { instances: 5, seatMonthly: 1500, computeMonthly: 2000 },
      { instanceDelta: -2, seatMonthly: 1500, computeMonthly: 2000, effectiveDate: "2027-08-21" },
    ));
    const impact = result.movements.find((movement) => movement.id === "adjust");
    if (!impact) throw new Error("缺少调整影响");
    const bounds = quarterBounds(2027);
    const when = parseIsoDate("2027-08-21");
    const days = bounds.map(([from, to]) => overlapDays(from, to, when, yearEnd(2027)));
    expect(days).toEqual([0, 0, 41, 92]);
    expect(impact.quarters.map(cents)).toEqual([0, 0, -9435.62, -21172.6]);
    expect(cents(impact.annual)).toBe(-30608.22);
    expect(impact.quarters.map((value) => roundToHalfWan(value))).toEqual([0, 0, -1, -2]);
    expect(roundToHalfWan(impact.annual)).toBe(-3);
    expect(formatSignedWan(impact.quarters[2])).toBe("−1.0");
    expect(formatSignedWan(impact.quarters[3])).toBe("−2.0");
    expect(formatSignedWan(impact.annual)).toBe("−3.0");
    const row = combinedQuarters(result);
    expect(row.map(cents)).toEqual([51780.82, 52356.16, 43495.89, 31758.9]);
    expect(cents(row.reduce((total, value) => total + value, 0))).toBe(179391.78);
    expect(row.map((value) => formatWan(value))).toEqual(["5.0", "5.0", "4.5", "3.0"]);
    expect(formatWan(row.reduce((total, value) => total + value, 0))).toBe("18.0");
    const shown = pageAgents(collectAgentLines(result, "d"), { ...defaultDetailQuery(), agentSize: 10 }, { exact: true }).rows[0];
    expect(shown?.status).toBe("待调整");
    expect(shown?.statusLabel).toBe("待调整 · 2027-08-21");
    expect(shown?.seat).toBe("1,500");
    expect(shown?.instancesLabel).toBe("5 → 3");
  });

  it("示例公司仍是两笔待扩容、没有待调整，公司日常成本不变", () => {
    const result = computePlan(samplePlan());
    const lines = collectAgentLines(result, DEPT.center);
    const expanded = lines.filter((line) => line.status === "待扩容");
    const adjusted = lines.filter((line) => line.status === "待调整");
    expect(expanded.map((line) => `${line.departmentName} ${line.name} ${line.instancesLabel} ${line.effectiveDate}`)).toEqual([
      "基础架构组 代码评审 Agent 3 → 5 2027-04-01",
      "数据智能部 数据问答 Agent 1 → 2 2027-05-01",
    ]);
    expect(adjusted).toEqual([]);
    expect(expanded.every((line) => line.seatBefore === line.seatMonthly && line.computeBefore === line.computeMonthly)).toBe(true);
    expect(formatWan(result.departments.find((department) => department.id === DEPT.center)?.yearDailyYuan ?? 0)).toBe("16,071.0");
    expect(formatWan(result.departments.find((department) => department.id === DEPT.center)?.yearTotalYuan ?? 0)).toBe("16,095.5");
  });
});
