import { describe, expect, it } from "vitest";
import { computePlan, deptStat } from "@/lib/headcount/engine";
import { formatWan, ROUNDING_GAP_NOTE } from "@/lib/headcount/money";
import { SCENARIO_NOTICE_PAY_DEFAULT } from "@/lib/headcount/policies";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { evaluateBaseline, evaluateScenario, presetScenarios, scenarioCutSeverance } from "@/lib/headcount/scenario";

const result = computePlan(samplePlan());

describe("场景按设计师口径折算", () => {
  it("激进场景含最后工作日，合计 15,972.0，结余 28.0，Q1 3,937.0，Q3 4,040.5", () => {
    const aggressive = evaluateScenario(result, presetScenarios().find((item) => item.id === "jj")!);
    expect(formatWan(aggressive.totalYuan)).toBe("15,972.0");
    expect(formatWan(aggressive.dailyYuan)).toBe("15,874.5");
    expect(formatWan(aggressive.oneOffYuan)).toBe("97.5");
    expect(16000 - 15972).toBe(28);
    expect(formatWan(result.plan.companyBudget - aggressive.totalYuan)).toBe("28.0");
    expect(aggressive.quarters.map((quarter) => formatWan(quarter.total))).toEqual(["3,937.0", "4,009.0", "4,040.5", "3,985.5"]);
    expect(aggressive.yearEndPeople).toBe(474);
    expect(aggressive.yearEndAgents).toBe(33);
    expect(aggressive.definition.assumptions.noticePay).toBe(false);
    expect(SCENARIO_NOTICE_PAY_DEFAULT).toBe(false);
    const cut = aggressive.definition.cuts[0];
    expect(cut && formatWan(scenarioCutSeverance(result, cut, false))).toBe("55.0");
    expect(JSON.stringify(aggressive)).not.toContain("68750");
    expect(JSON.stringify(aggressive.definition)).not.toMatch(/perPerson|每人/);
  });

  it("基线、基准和沙盘方案 A 的全年数字与稿一致", () => {
    const baseline = evaluateBaseline(result);
    const presets = Object.fromEntries(presetScenarios().map((item) => [item.id, evaluateScenario(result, item)]));
    expect(formatWan(baseline.totalYuan)).toBe("16,095.5");
    expect(formatWan(baseline.dailyYuan)).toBe("16,071.0");
    expect(formatWan(baseline.oneOffYuan)).toBe("24.5");
    expect(baseline.yearEndPeople).toBe(490);
    expect(baseline.yearEndAgents).toBe(21);
    expect(formatWan(presets.jz.totalYuan)).toBe("16,098.5");
    expect(formatWan(presets.jz.dailyYuan)).toBe("16,070.0");
    expect(formatWan(presets.jz.oneOffYuan)).toBe("28.5");
    expect(presets.jz.yearEndPeople).toBe(490);
    expect(presets.jz.yearEndAgents).toBe(25);
    expect(formatWan(presets.fa.totalYuan)).toBe("15,945.0");
    expect(formatWan(presets.fa.dailyYuan)).toBe("15,908.5");
    expect(formatWan(presets.fa.oneOffYuan)).toBe("36.5");
    expect(presets.fa.yearEndPeople).toBe(480);
    expect(presets.fa.yearEndAgents).toBe(27);
    expect(presets.fa.definition.ratio).toBe("69 : 31");
    expect(presets.fa.definition.structureNote).toContain("应用分析小组");
    expect(deptStat(result, DEPT.center).yearTotalYuan).toBeGreaterThan(0);
  });

  it("取整说明只有一句", () => {
    expect(ROUNDING_GAP_NOTE).toBe("各项分别取整到 0.5 万，合计按未取整金额加总后再取整，可能差 0.5 万。");
    expect(ROUNDING_GAP_NOTE.indexOf("各项分别取整")).toBe(ROUNDING_GAP_NOTE.lastIndexOf("各项分别取整"));
  });
});
