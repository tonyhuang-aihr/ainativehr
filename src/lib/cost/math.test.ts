import { describe, expect, it } from "vitest";
import {
  computeCostPerMonth,
  formatHumanAiRatio,
  releasedHoursPerMonth,
  roleAnnualCost,
  rollupCosts,
  splitTime,
} from "@/lib/cost/math";
import { decomposeRoleOffline } from "@/lib/ai/templates";
import type { RoleTask } from "@/lib/model/types";

const tasks: Pick<RoleTask, "timeShare" | "mode">[] = [
  { timeShare: 0.2, mode: "human" },
  { timeShare: 0.3, mode: "ai" },
  { timeShare: 0.5, mode: "collab" },
];

describe("人机比与成本", () => {
  it("协同默认按 50% 分摊", () => {
    const split = splitTime(tasks, 0.5);
    expect(split.ai).toBeCloseTo(0.55);
    expect(split.human).toBeCloseTo(0.45);
    expect(formatHumanAiRatio(split.ai, split.human)).toBe("55 : 45");
    expect(releasedHoursPerMonth(tasks, 0.5, 160)).toBeCloseTo(88);
  });

  it("协同比例可配置", () => {
    const split = splitTime(tasks, 0.25);
    expect(split.ai).toBeCloseTo(0.425);
    expect(split.human).toBeCloseTo(0.575);
    expect(formatHumanAiRatio(split.ai, split.human)).toBe("42.5 : 57.5");
  });

  it("算力只计 AI 和协同任务，总成本 = 人力 + 年化算力", () => {
    expect(computeCostPerMonth(tasks, 200)).toBe(400);
    expect(computeCostPerMonth([{ timeShare: 1, mode: "human" }], 200)).toBe(0);
    const cost = roleAnnualCost(100000, tasks, { computeUnitPrice: 200 });
    expect(cost).toEqual({ labor: 100000, compute: 4800, total: 104800 });
  });

  it("按在岗人数汇总到岗位之上", () => {
    const decomposition = {
      roleTitle: "客户成功顾问",
      tasks: tasks.map((task, index) => ({
        id: `t${index}`,
        name: `任务${index}`,
        frequency: "每周",
        reason: "",
        confidence: 0.8,
        source: "template" as const,
        edited: false,
        ...task,
      })),
      updatedAt: "2026-10-01T00:00:00.000Z",
      source: "template" as const,
    };
    const rollup = rollupCosts(
      [
        { title: "客户成功顾问", annualCost: 200000 },
        { title: "客户成功顾问", annualCost: 220000 },
        { title: "销售顾问", annualCost: 180000 },
      ],
      { 客户成功顾问: decomposition },
      { computeUnitPrice: 200, collabAiShare: 0.5, monthlyHours: 160 },
    );
    expect(rollup.covered).toBe(2);
    expect(rollup.labor).toBe(600000);
    expect(rollup.compute).toBe(9600);
    expect(rollup.total).toBe(609600);
    expect(rollup.releasedHours).toBeCloseTo(176);
    expect(rollup.ratio).toBe("55 : 45");
  });

  it("离线模板的工时加总为 100%", () => {
    for (const title of ["客户成功顾问", "平台总监", "后端工程师", "产品经理", "战略负责人"]) {
      const generated = decomposeRoleOffline(title);
      const total = generated.reduce((sum, task) => sum + task.timeShare, 0);
      expect(total).toBeCloseTo(1);
      expect(generated.length).toBeGreaterThanOrEqual(5);
    }
  });
});
