import { describe, expect, it } from "vitest";
import { buildBaselineRows, companyCards } from "@/lib/headcount/baselineView";
import { computePlan } from "@/lib/headcount/engine";
import { DEPT, samplePlan } from "@/lib/headcount/sample";

const result = computePlan(samplePlan());

describe("底座按日常和一次性分列", () => {
  it("部门行对照部门预算，一次性预算池只出现在公司行", () => {
    const rows = buildBaselineRows(result);
    const plat = rows.find((row) => row.id === DEPT.plat);
    const prod1 = rows.find((row) => row.id === DEPT.prod1);
    const center = rows.find((row) => row.id === DEPT.center);
    expect(plat).toMatchObject({ yearDaily: "2,075.5", budget: "2,050.0", budgetKind: "部门预算", dailyGap: "多 25.5 万", yearOneOff: "9.0", oneOffNote: null });
    expect(prod1).toMatchObject({ yearDaily: "4,845.5", budget: "4,725.0", budgetKind: "部门预算", dailyGap: "多 120.5 万", yearOneOff: "14.0", oneOffNote: null });
    expect(center).toMatchObject({
      yearDaily: "16,071.0",
      budget: "16,000.0",
      budgetKind: "公司总包",
      dailyGap: "多 71.0 万",
      yearOneOff: "24.5",
      oneOffNote: "低于预算池 5.5 万",
    });
    expect(rows.some((row) => "yearTotal" in row)).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("含一次性");
  });

  it("日常加一次性只在公司合计里出现一次", () => {
    const cards = companyCards(result);
    expect(cards.yearDaily).toBe("16,071.0");
    expect(cards.yearOneOff).toBe("24.5");
    expect(cards.yearTotal).toBe("16,095.5");
    expect(cards.oneOffNote).toBe("低于预算池 5.5 万");
  });
});
