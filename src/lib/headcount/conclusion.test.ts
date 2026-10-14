import { describe, expect, it } from "vitest";
import { SMALL_GROUP } from "@/lib/ai/desensitize";
import {
  chooseConclusion,
  conclusionFacts,
  conclusionMessages,
  directChildFacts,
  extractNumbers,
  mentionsHeadcountBelowFive,
  modelUnits,
  templateConclusion,
  validateConclusion,
  roundedSumMismatch,
} from "@/lib/headcount/conclusion";
import { computePlan } from "@/lib/headcount/engine";
import { sumWithinHalfWan } from "@/lib/headcount/money";
import { DEPT, samplePlan } from "@/lib/headcount/sample";

const result = computePlan(samplePlan());
const plat = conclusionFacts(result, DEPT.plat);
const children = directChildFacts(result, DEPT.plat);
const names = result.plan.people.map((person) => person.name);
const employeeNos = result.plan.people.map((person) => person.employeeNo);
const departmentNames = result.plan.departments.map((department) => department.name);
const secrets = { names, employeeNos, departmentNames };

describe("负责人结论的小部门规则", () => {
  it("少于 5 人的下级不进入模型入参，也不能靠拆分还原", () => {
    const units = modelUnits(plat, children);
    expect(children.some((child) => child.headcount < SMALL_GROUP)).toBe(true);
    expect(units).toHaveLength(1);
    expect(units[0]?.headcount).toBe(62);
    expect(units.every((unit) => unit.headcount == null || unit.headcount >= SMALL_GROUP)).toBe(true);
    const encoded = JSON.stringify(conclusionMessages(plat, children, names));
    expect(encoded).not.toContain("平台部直属");
    expect(encoded).not.toContain("赵一");
    expect(encoded).not.toContain("E10012");
  });

  it("部门本身少于 5 人时，入参和模板都没有人数和金额", () => {
    const tiny = conclusionFacts(result, DEPT.platDirect);
    expect(tiny.headcount).toBeLessThan(SMALL_GROUP);
    const units = modelUnits(tiny, []);
    expect(units).toEqual([{ name: "平台部直属", scale: "有人员调整" }]);
    expect(JSON.stringify(units)).not.toMatch(/headcount|Wan|joins/);
    const sentence = templateConclusion(tiny);
    expect(sentence).toContain("有人员调整");
    expect(sentence).not.toMatch(/\d+\s*人/);
    expect(sentence).not.toContain("万");
    expect(extractNumbers(sentence)).toEqual([tiny.year]);
    expect(validateConclusion(sentence, tiny, secrets)).toEqual({ ok: true });
  });

  it("平台部模板使用成本引擎的数字，并且能通过校验", () => {
    const sentence = templateConclusion(plat);
    expect(sentence).toContain("2,075.5 万");
    expect(sentence).toContain("25.5");
    expect(sentence).toContain("2,037.0 万");
    expect(sentence).toContain("+77.0 万");
    expect(sentence).toContain("52.5 万");
    expect(sentence).toContain("+14.0 万");
    expect(sentence).not.toMatch(/平台部直属\s*[0-4]\s*人/);
    expect(validateConclusion(sentence, plat, secrets)).toEqual({ ok: true });
  });

  it("模型如果写出少于 5 的部门人数，就退回模板", async () => {
    expect(mentionsHeadcountBelowFive("平台部直属目前 2 人。", departmentNames)).toBe(true);
    expect(mentionsHeadcountBelowFive("质量组 4 人还在编制里。", ["质量组"])).toBe(true);
    expect(mentionsHeadcountBelowFive(templateConclusion(plat), departmentNames)).toBe(false);
    const bad = "平台部直属 2 人，全年预计 2,075.5 万。";
    expect(validateConclusion(bad, plat, secrets).ok).toBe(false);
    const chosen = await chooseConclusion({
      root: plat,
      children,
      names,
      employeeNos,
      departmentNames,
      cached: null,
      complete: async () => bad,
    });
    expect(chosen.origin).toBe("template");
    expect(chosen.text).toBe(templateConclusion(plat));
  });

  it("人名、离职类型、对不上的数字都会被拒绝；没配模型就用模板", async () => {
    expect(validateConclusion("赵一所在部门全年 2,075.5 万。", plat, secrets).ok).toBe(false);
    expect(validateConclusion("其中有人协商解除，全年 2,075.5 万。", plat, secrets).ok).toBe(false);
    expect(validateConclusion("全年预计 9,999.0 万。", plat, secrets).ok).toBe(false);
    const offline = await chooseConclusion({
      root: plat,
      children,
      names,
      employeeNos,
      departmentNames,
      cached: null,
      complete: null,
    });
    expect(offline).toEqual({ text: templateConclusion(plat), origin: "template" });
    const accepted = await chooseConclusion({
      root: plat,
      children,
      names,
      employeeNos,
      departmentNames,
      cached: null,
      complete: async () => templateConclusion(plat),
    });
    expect(accepted.origin).toBe("model");
  });

  it("抽出的数字能认出带千分位的金额", () => {
    expect(extractNumbers("2027 年预计 2,075.5 万，超出 25.5 万")).toEqual([2027, 2075.5, 25.5]);
  });

  it("分项取整后与合计差 0.5 不算不一致，但 0.5 本身不能当新数字引用", () => {
    const prod1 = conclusionFacts(result, DEPT.prod1);
    const hero = "超 120.5 万（现有人员多 66.0，在途再加 54.0）。现有 4,791.0，入职 112.0，离职 58.0，全年 4,845.5。";
    expect(sumWithinHalfWan(120.5, [66, 54])).toBe(true);
    expect(sumWithinHalfWan(4845.5, [4791, 112, -58])).toBe(true);
    expect(roundedSumMismatch(hero, prod1)).toBeNull();
    expect(validateConclusion(hero, prod1, secrets)).toEqual({ ok: true });
    expect(validateConclusion("全年预计 4,845.0 万。", prod1, secrets).ok).toBe(false);
    const drifted = {
      ...prod1,
      annualYuan: 1_012_000,
      currentYuan: 802_000,
      joinYuan: 202_000,
      leaveYuan: 0,
      agentYuan: 0,
      inFlightYuan: 210_000,
      budgetYuan: null,
    };
    const apart = "预计 101.0 万，现有 80.0，加入 20.0。";
    expect(validateConclusion(apart, drifted, secrets).ok).toBe(false);
    const within = { ...drifted, annualYuan: 1_005_000, inFlightYuan: 203_000 };
    expect(validateConclusion("预计 100.5 万，现有 80.0，加入 20.0。", within, secrets)).toEqual({ ok: true });
    expect(validateConclusion("预计 100.0 万，现有 80.0，加入 20.0。", within, secrets).ok).toBe(false);
  });
});
