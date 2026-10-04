import { describe, expect, it } from "vitest";
import {
  SeveranceInputError,
  compensationMonths,
  compensationMonthsFromAverage,
  completeMonths,
  estimateSeverance,
  NOTICE_PAY_BASE,
  noticePayMonthly,
  resolveTenureMonths,
} from "@/lib/headcount/severance";

const CITY = 10_000;
const CAP = CITY * 3;

function pay(months: number, annual: number, extra: Partial<Parameters<typeof estimateSeverance>[0]> = {}) {
  return estimateSeverance({
    mark: "N",
    gradeAnnual: annual,
    hireDate: "2020-01-15",
    effectiveDate: "2020-01-15",
    cityMonthly: CITY,
    averageMonths: months,
    ...extra,
  });
}

describe("第 47 条经济补偿", () => {
  it("完整月数的边界", () => {
    expect(completeMonths("2020-01-15", "2020-01-15")).toBe(0);
    expect(completeMonths("2020-01-15", "2020-07-14")).toBe(5);
    expect(completeMonths("2020-01-15", "2020-07-15")).toBe(6);
    expect(completeMonths("2020-01-15", "2020-07-16")).toBe(6);
    expect(completeMonths("2020-01-15", "2020-12-15")).toBe(11);
    expect(completeMonths("2020-01-15", "2021-01-15")).toBe(12);
    expect(completeMonths("2020-01-15", "2021-06-15")).toBe(17);
    expect(completeMonths("2020-01-15", "2021-07-15")).toBe(18);
  });

  it("0 天、5 个月 29 天、正好 6 个月、6 个月零 1 天、11 个月、1 年、1 年 5 个月、1 年 6 个月", () => {
    expect(compensationMonths(0)).toBe(0);
    expect(compensationMonths(completeMonths("2020-01-15", "2020-07-14"))).toBe(0.5);
    expect(compensationMonths(completeMonths("2020-01-15", "2020-07-15"))).toBe(1);
    expect(compensationMonths(completeMonths("2020-01-15", "2020-07-16"))).toBe(1);
    expect(compensationMonths(11)).toBe(1);
    expect(compensationMonths(12)).toBe(1);
    expect(compensationMonths(17)).toBe(1.5);
    expect(compensationMonths(18)).toBe(2);
  });

  it("月基数正好等于 3 倍、略低、略高", () => {
    const equal = estimateSeverance({
      mark: "N",
      gradeAnnual: CAP * 12,
      averageMonths: 13 * 12,
      cityMonthly: CITY,
    });
    expect(equal.capped).toBe(false);
    expect(equal.compensationMonths).toBe(13);
    expect(equal.monthlyBase).toBe(CAP);

    const lower = estimateSeverance({
      mark: "N",
      gradeAnnual: (CAP - 1) * 12,
      averageMonths: 13 * 12,
      cityMonthly: CITY,
    });
    expect(lower.capped).toBe(false);
    expect(lower.compensationMonths).toBe(13);

    const higher = estimateSeverance({
      mark: "N",
      gradeAnnual: (CAP + 1) * 12,
      averageMonths: 13 * 12,
      cityMonthly: CITY,
    });
    expect(higher.capped).toBe(true);
    expect(higher.monthlyBase).toBe(CAP);
    expect(higher.compensationMonths).toBe(12);
  });

  it("高于 3 倍时 11、12、13、20 年封顶 12 年；未超过则 20 年不封顶", () => {
    for (const years of [11, 12]) {
      const result = pay(years * 12, (CAP + 100) * 12);
      expect(result.compensationMonths).toBe(years);
      expect(result.capped).toBe(true);
    }
    for (const years of [13, 20]) {
      const result = pay(years * 12, (CAP + 100) * 12);
      expect(result.compensationMonths).toBe(12);
      expect(result.amount).toBe(CAP * 12);
    }
    const open = pay(20 * 12, 120_000);
    expect(open.capped).toBe(false);
    expect(open.compensationMonths).toBe(20);
    expect(open.amount).toBe(10_000 * 20);
  });

  it("没有城市平均工资时不封顶，并提示", () => {
    const result = estimateSeverance({
      mark: "N",
      gradeAnnual: 2_400_000,
      averageMonths: 20 * 12,
      cityMonthly: null,
    });
    expect(result.capped).toBe(false);
    expect(result.compensationMonths).toBe(20);
    expect(result.warning).toContain("未封顶");
  });

  it("补偿标记不计、N、N+1，以及 N+1 开关", () => {
    expect(estimateSeverance({ mark: "不计", gradeAnnual: 120_000, cityMonthly: CITY }).amount).toBe(0);
    const base = estimateSeverance({
      mark: "N",
      gradeAnnual: 120_000,
      averageMonths: 12,
      cityMonthly: CITY,
    });
    const plus = estimateSeverance({
      mark: "N+1",
      gradeAnnual: 120_000,
      averageMonths: 12,
      cityMonthly: CITY,
    });
    const switched = estimateSeverance({
      mark: "N",
      gradeAnnual: 120_000,
      averageMonths: 12,
      cityMonthly: CITY,
      noticePay: true,
    });
    const off = estimateSeverance({
      mark: "N",
      gradeAnnual: 120_000,
      averageMonths: 12,
      cityMonthly: CITY,
      noticePay: false,
    });
    expect(plus.amount).toBe(base.amount + 10_000);
    expect(switched.amount).toBe(plus.amount);
    expect(off.amount).toBe(base.amount);
    expect(estimateSeverance({ mark: "不计", gradeAnnual: 120_000, noticePay: true, cityMonthly: CITY }).amount).toBe(0);
    expect(NOTICE_PAY_BASE).toBe("uncapped");
  });

  it("月工资高于 3 倍时，N 只保留封顶后的经济补偿，N+1 再加一个月未封顶工资", () => {
    const annual = 480_000;
    const wage = annual / 12;
    expect(wage).toBeGreaterThan(CAP);
    const years = 13 * 12;
    const n = estimateSeverance({ mark: "N", gradeAnnual: annual, averageMonths: years, cityMonthly: CITY });
    const plus = estimateSeverance({ mark: "N+1", gradeAnnual: annual, averageMonths: years, cityMonthly: CITY });
    expect(n.capped).toBe(true);
    expect(n.compensationMonths).toBe(12);
    expect(n.monthlyBase).toBe(CAP);
    expect(n.amount).toBe(CAP * 12);
    expect(plus.capped).toBe(true);
    expect(plus.compensationMonths).toBe(12);
    expect(plus.amount).toBe(CAP * 12 + wage);
    expect(noticePayMonthly(wage, CAP, "uncapped")).toBe(wage);
    expect(noticePayMonthly(wage, CAP, "capped")).toBe(CAP);
    const cappedChoice = estimateSeverance({
      mark: "N+1",
      gradeAnnual: annual,
      averageMonths: years,
      cityMonthly: CITY,
      noticePayBase: "capped",
    });
    expect(cappedChoice.amount).toBe(CAP * 12 + CAP);
    expect(plus.amount).not.toBe(cappedChoice.amount);
  });

  it("月工资基数优先；空着则用年成本除以 12", () => {
    const withBase = estimateSeverance({
      mark: "N",
      gradeAnnual: 120_000,
      monthlyWageBase: 8_000,
      averageMonths: 12,
      cityMonthly: CITY,
    });
    expect(withBase.amount).toBe(8_000);
    expect(withBase.capped).toBe(false);
    const empty = estimateSeverance({
      mark: "N",
      gradeAnnual: 120_000,
      monthlyWageBase: null,
      averageMonths: 12,
      cityMonthly: CITY,
    });
    expect(empty.amount).toBe(10_000);
    const plus = estimateSeverance({
      mark: "N+1",
      gradeAnnual: 480_000,
      monthlyWageBase: 50_000,
      averageMonths: 13 * 12,
      cityMonthly: CITY,
    });
    expect(plus.amount).toBe(CAP * 12 + 50_000);
  });

  it("场景减员用平均司龄；不足 5 人改用上一级", () => {
    expect(compensationMonthsFromAverage(3.4 * 12)).toBe(3.5);
    const rows = [
      { departmentId: "child", grade: "P5", averageMonths: 10, count: 4 },
      { departmentId: "parent", grade: "P5", averageMonths: 40.8, count: 28 },
    ];
    const parentOf = (id: string) => (id === "child" ? "parent" : null);
    expect(resolveTenureMonths(rows, "child", "P5", parentOf)).toBe(40.8);
    expect(resolveTenureMonths(rows, "parent", "P5", parentOf)).toBe(40.8);
    const amount = estimateSeverance({
      mark: "N",
      gradeAnnual: 235_000,
      averageMonths: resolveTenureMonths(rows, "child", "P5", parentOf),
      cityMonthly: 3_000,
    });
    expect(amount.compensationMonths).toBe(3.5);
  });

  it("入职日期晚于生效日、缺入职日期都报错，不按 0 算", () => {
    expect(() => completeMonths("2024-04-08", "2024-04-07")).toThrow(SeveranceInputError);
    expect(() =>
      estimateSeverance({ mark: "N", gradeAnnual: 235_000, effectiveDate: "2027-03-31", cityMonthly: CITY }),
    ).toThrow(/缺入职日期/);
    expect(() =>
      estimateSeverance({
        mark: "N+1",
        gradeAnnual: 235_000,
        hireDate: "2027-04-01",
        effectiveDate: "2027-03-31",
        cityMonthly: CITY,
      }),
    ).toThrow(SeveranceInputError);
  });

  it("示例里的两笔计补偿金额", () => {
    const he = estimateSeverance({
      mark: "N",
      gradeAnnual: 235_000,
      hireDate: "2024-04-08",
      effectiveDate: "2027-03-31",
      cityMonthly: 12_500,
    });
    expect(he.amount).toBeCloseTo(58_750, 6);
    expect(he.capped).toBe(false);
    const cao = estimateSeverance({
      mark: "N",
      gradeAnnual: 300_000,
      hireDate: "2021-12-01",
      effectiveDate: "2027-03-31",
      cityMonthly: 12_300,
    });
    expect(cao.amount).toBeCloseTo(137_500, 6);
  });
});
