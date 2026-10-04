import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { allocateLargestRemainder } from "@/lib/headcount/allocation";
import {
  allocateCompanyAttrition,
  baselineDailyBreakdown,
  businessScenarioResult,
  FIRST_LEVEL_IDS,
  mergeBusinessScenarios,
  projectBusinessPreset,
  scenarioDailyBreakdown,
  vacancyQuarterSavings,
} from "@/lib/headcount/buCost";
import { DepartmentDailyRows } from "@/components/headcount/department-daily-rows";
import { SCOPE_TOTAL_NOTE, TOOLTIPS, UNATTRIBUTED_AGENT_NOTE } from "@/lib/headcount/copy";
import { loadTooltipFile } from "@/lib/headcount/tooltipFile";
import { computePlan, deptStat } from "@/lib/headcount/engine";
import { buildScopeOverview } from "@/lib/headcount/overview";
import { formatWan, ROUNDING_GAP_NOTE } from "@/lib/headcount/money";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { evaluateScenario, formalAverageAnnual, presetScenarios, quarterChangeLabels, evaluateBaseline, type ScenarioAgentChange, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { buildScenarioBoard, DEFAULT_PREFILL_NOTE } from "@/lib/headcount/scenarioView";

const result = computePlan(samplePlan());
const presets = presetScenarios();

const WAN = {
  jz: { rows: ["140.0", "4,878.5", "4,139.0", "2,056.5", "2,594.5", "2,254.5"], unattributed: "7.0", total: "16,070.0" },
  jj: { rows: ["140.0", "4,788.0", "4,139.0", "2,056.5", "2,452.5", "2,268.5"], unattributed: "30.0", total: "15,874.5" },
  bs: { rows: ["140.0", "4,765.0", "4,116.0", "2,048.5", "2,532.0", "2,201.5"], unattributed: "6.5", total: "15,810.0" },
  fa: { rows: ["140.0", "4,788.0", "4,139.0", "2,056.5", "2,547.0", "2,238.0"], unattributed: "0.0", total: "15,908.5" },
} as const;

describe("离职名额按最大余额分到一级部门", () => {
  it("公司 10 个名额按组织顺序是 0/3/3/1/2/1", () => {
    const seats = allocateCompanyAttrition(result, 0.08);
    expect(FIRST_LEVEL_IDS.map((id) => seats.get(id))).toEqual([0, 3, 3, 1, 2, 1]);
    expect([...seats.values()].reduce((total, value) => total + value, 0)).toBe(10);
  });

  it("余数同为 1/3 时名额给年初人数更多的数据智能部", () => {
    const seats = allocateLargestRemainder(2, [
      { id: "其他A", base: 1 },
      { id: "二部", base: 2 },
      { id: "数据智能部", base: 8 },
      { id: "其他B", base: 1 },
    ]);
    expect(seats.get("二部")).toBe(0);
    expect(seats.get("数据智能部")).toBe(2);
    expect([...seats.values()].reduce((total, value) => total + value, 0)).toBe(2);
  });

  it("余数和年初人数都相同，名额给传入顺序更靠前的部门", () => {
    const forward = allocateLargestRemainder(1, [
      { id: "质量与交付部", base: 5 },
      { id: "数据智能部", base: 5 },
    ]);
    const swapped = allocateLargestRemainder(1, [
      { id: "数据智能部", base: 5 },
      { id: "质量与交付部", base: 5 },
    ]);
    expect(forward.get("质量与交付部")).toBe(1);
    expect(forward.get("数据智能部")).toBe(0);
    expect(swapped.get("数据智能部")).toBe(1);
    expect(swapped.get("质量与交付部")).toBe(0);
  });

  it("年中入职不改变年初基数，也不改变缺编节省", () => {
    const before = allocateCompanyAttrition(result, 0.08);
    const saved = vacancyQuarterSavings(result, 10, formalAverageAnnual(result), 60);
    const plan = samplePlan();
    plan.movements.push({
      id: "mid-join",
      kind: "入职",
      name: "年中入职",
      employeeNo: "E99999",
      departmentId: DEPT.prod1,
      title: "工程师",
      grade: "P6",
      employmentType: "正式",
      effectiveDate: "2027-06-01",
      source: "import",
      version: 1,
    });
    const next = computePlan(plan);
    expect(deptStat(next, DEPT.prod1).onBoard).toBe(deptStat(result, DEPT.prod1).onBoard);
    expect(allocateCompanyAttrition(next, 0.08)).toEqual(before);
    expect(vacancyQuarterSavings(next, 10, formalAverageAnnual(next), 60)).toEqual(saved);
    const seats = before;
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const parts = FIRST_LEVEL_IDS.map((id) => vacancyQuarterSavings(result, seats.get(id) ?? 0, formalAverageAnnual(result), 60)[quarter] ?? 0);
      const sum = parts.reduce((total, value) => total + value, 0);
      expect(sum).toBeCloseTo(saved[quarter] ?? 0, 6);
    }
  });
});

describe("部门持续成本和未归属 Agent", () => {
  it("公司均薪是 150,075,000 ÷ 486，计算中不取整", () => {
    expect(formalAverageAnnual(result)).toBe(150_075_000 / 486);
    expect(Math.round(formalAverageAnnual(result))).toBe(308_796);
  });

  it("四个场景的部门行、未归属和合计与核对清单一致，未取整金额也能加总", () => {
    for (const definition of presets) {
      const expected = WAN[definition.id as keyof typeof WAN];
      const company = evaluateScenario(result, definition);
      const breakdown = scenarioDailyBreakdown(result, definition);
      expect(formatWan(company.dailyYuan)).toBe(expected.total);
      expect(breakdown.rows.map((row) => formatWan(row.yuan))).toEqual([...expected.rows]);
      expect(formatWan(breakdown.unattributedYuan)).toBe(expected.unattributed);
      const sum = breakdown.rows.reduce((total, row) => total + row.yuan, 0) + breakdown.unattributedYuan;
      expect(sum).toBe(company.dailyYuan);
      expect(company.dailyYuan + company.oneOffYuan).toBe(company.totalYuan);
      for (const row of breakdown.rows) {
        const scoped = businessScenarioResult(result, definition, row.id);
        expect(scoped.dailyYuan).toBe(row.yuan);
      }
    }
    const baseline = baselineDailyBreakdown(result);
    expect(formatWan(baseline.unattributedYuan)).toBe("0.0");
    expect(baseline.rows.reduce((total, row) => total + row.yuan, 0)).toBe(evaluateBaseline(result).dailyYuan);
  });

  it("所属部门缺失或空字符串时直接报错", () => {
    const agent = { name: "未填部门", count: 1, monthly: 1000, effectiveDate: "2027-04-01", oneOff: 0 } as ScenarioAgentChange;
    const definition = { ...presets[0], agents: [agent] };
    expect(() => evaluateScenario(result, definition)).toThrow("Agent「未填部门」缺少所属部门");
    expect(() => evaluateScenario(result, { ...presets[0], agents: [{ ...agent, departmentName: "" }] })).toThrow("缺少所属部门");
  });

  it("默认对比没有 ≈，把保守放进对比后只有保守那一列有 ≈", () => {
    const board = buildScenarioBoard(result, presets, "jj", DEFAULT_PREFILL_NOTE);
    expect(board.columns.map((column) => column.name)).toEqual(["基线", "基准", "激进 · AI 加速", "沙盘方案 A · 拆组前"]);
    expect(board.columns.every((column) => column.approx === false)).toBe(true);
    expect(board.dailyBreakdown?.note).toBe(UNATTRIBUTED_AGENT_NOTE);
    const withConservative = presets.map((item) => (item.id === "fa" ? { ...item, compared: false } : item.id === "bs" ? { ...item, compared: true } : item));
    const conservative = buildScenarioBoard(result, withConservative, "bs", DEFAULT_PREFILL_NOTE);
    const flagged = conservative.columns.filter((column) => column.approx).map((column) => column.name);
    expect(flagged).toEqual(["保守"]);
    const conservativeColumn = conservative.columns.find((column) => column.name === "保守");
    expect(conservativeColumn?.daily).toBe("15,810.0");
    const wan = (text: string) => Number(text.replace(/,/g, ""));
    const summed = (conservativeColumn?.dailyParts ?? []).reduce((total, part) => total + wan(part.text), 0) + wan(conservativeColumn?.unattributed ?? "0");
    expect(summed).toBe(15809.5);
    const html = renderToStaticMarkup(createElement(DepartmentDailyRows, { columns: board.columns, note: board.dailyBreakdown!.note }));
    expect(html).toContain("›");
    expect(html).not.toContain("⌄");
    expect(html).not.toContain("未归属部门 Agent");
    expect(html).not.toContain("产品研发一部");
    expect(html).not.toContain("≈");
    expect(html).toContain("部门持续成本 人工 + Agent");
    const open = renderToStaticMarkup(createElement(DepartmentDailyRows, { columns: board.columns, note: board.dailyBreakdown!.note, defaultOpen: true }));
    expect(open).toContain("⌄");
    expect(open).toContain("未归属部门 Agent");
    expect(open).toContain(UNATTRIBUTED_AGENT_NOTE);
    expect(open).toContain("text-xs");
    expect(open).toContain("pl-8");
    const unattributedRow = open.split("未归属部门 Agent")[1] ?? "";
    expect(unattributedRow).toContain("0.0");
    expect(unattributedRow).toContain("7.0");
    expect(unattributedRow).toContain("30.0");
    const comparedHtml = renderToStaticMarkup(createElement(DepartmentDailyRows, { columns: conservative.columns, note: conservative.dailyBreakdown!.note }));
    const dailyRow = comparedHtml.split("部门持续成本 人工 + Agent")[1]?.split("</tr>")[0] ?? "";
    expect(dailyRow.match(/≈/g)?.length).toBe(1);
    expect(dailyRow).toContain("≈ 15,810.0");
    expect(dailyRow).not.toContain("15,810.0≈");
    expect(dailyRow).toContain(ROUNDING_GAP_NOTE);
  });
});

describe("林的事业部口径", () => {
  const root = DEPT.prod1;
  const definitions = mergeBusinessScenarios(presets, [], root, result);
  const board = buildScenarioBoard(result, definitions, `bu-${root}-jz`, DEFAULT_PREFILL_NOTE, { mode: "business", rootId: root, departmentNames: ["产品研发一部"] });

  it("基线是一部自己的日常成本，人 : AI 未拆解，假设沿用公司预设", () => {
    expect(board.focusId).toBe("bu-prod1-jz");
    expect(board.focusId).not.toBe("jx");
    expect(board.budget).toBe("4,725.0");
    expect(board.budgetCaption).toBe("部门预算");
    expect(board.columns[0]).toMatchObject({ name: "基线", total: "4,845.5", daily: "4,845.5", ratio: "未拆解", gap: "超 120.5" });
    expect(board.assumptionForm.attrition).toBe("8");
    expect(board.assumptionForm.cycle).toBe("60");
    expect(board.dailyBreakdown).toBeNull();
    expect(board.columns.every((column) => column.dailyParts == null && column.unattributed == null && column.approx === false)).toBe(true);
    const blob = JSON.stringify(board);
    expect(blob).not.toContain("未归属部门 Agent");
    expect(blob).not.toContain("沙盘里没有岗位拆解的 Agent");
    expect(blob).not.toContain("16,095.5");
    expect(blob).not.toContain("16,000.0");
    expect(blob).not.toContain("预算总包");
    expect(blob).not.toContain("78 : 22");
    expect(blob).not.toContain("内部调动");
    expect(board.showOneOff).toBe(false);
    expect(board.oneOffCaption).not.toContain("预算总包");
  });

  it("基准、激进、保守的日常成本、季度和标签", () => {
    const column = (id: string) => board.columns.find((item) => item.id === id);
    expect(column("bu-prod1-jz")).toMatchObject({ total: "4,878.5", gap: "超 153.5" });
    expect(column("bu-prod1-jj")).toMatchObject({ total: "4,788.0", gap: "超 63.0" });
    expect(column("bu-prod1-bs")).toMatchObject({ total: "4,765.0", gap: "超 40.0" });
    const labels = (id: string) => buildScenarioBoard(result, definitions, id, DEFAULT_PREFILL_NOTE, { mode: "business", rootId: root }).timelineLabels;
    expect(labels("bu-prod1-jz")).toEqual([
      "Q1 离职未补位 3 人（含基线变动共 150→148）",
      "Q2 场景增员 4 人（含基线变动共 148→152）",
    ]);
    expect(labels("bu-prod1-jj")).toEqual(["Q1 离职未补位 3 人（含基线变动共 150→148）"]);
    expect(labels("bu-prod1-bs")).toEqual(["Q1 离职未补位 3 人（含基线变动共 150→148）"]);
    const quarters = (id: string) => buildScenarioBoard(result, definitions, id, DEFAULT_PREFILL_NOTE, { mode: "business", rootId: root }).timelineRows.map((row) => row.total);
    expect(quarters("bu-prod1-jz")).toEqual(["1,180.5", "1,226.0", "1,236.0", "1,236.0"]);
    expect(quarters("bu-prod1-jj")).toEqual(["1,180.5", "1,196.0", "1,205.5", "1,205.5"]);
    expect(quarters("bu-prod1-bs")).toEqual(["1,180.5", "1,188.5", "1,198.0", "1,198.0"]);
    const cell = (name: string, title: string) => board.health.find((row) => row.name === name)?.cells.find((item) => item.title === title)?.text;
    expect(cell("基准", "超预算")).toBe("超 153.5");
    expect(cell("激进 · AI 加速", "超预算")).toBe("超 63.0");
    expect(cell("保守", "超预算")).toBe("超 40.0");
    expect(cell("基准", "管理幅度")).toBe("—");
    expect(cell("基准", "人 : AI")).toBe("未拆解");
    expect(cell("基准", "第 41 条")).toBe("正常");
    expect(cell("激进 · AI 加速", "第 41 条")).toBe("正常");
    expect(cell("保守", "第 41 条")).toBe("正常");
    const conservative = definitions.find((item) => item.id === "bu-prod1-bs");
    expect(conservative?.assumptions.hiringCycleDays).toBe(presets.find((item) => item.id === "bs")?.assumptions.hiringCycleDays);
    expect(conservative?.assumptions.attritionRate).toBe(0.08);
  });

  it("底座页只列一部，合计用范围口径，不出现公司数字", () => {
    const overview = buildScopeOverview(result, DEPT.prod1, "hrbp", false);
    expect(overview.title).toBe("事业部底座 · 产品研发一部");
    expect(overview.eyebrow).toContain("1 个部门");
    expect(overview.departments.map((row) => row.name)).toEqual(["产品研发一部"]);
    expect(overview.listTotal?.label).toBe("范围合计");
    expect(overview.listTotal?.annual).toBe("4,845.5");
    expect(overview.listTotal?.budget).toBe("4,725.0");
    expect(overview.cards.find((card) => card.label === "人 : AI 按工时")?.value).toBe("未拆解");
    expect(overview.cards.find((card) => card.label.startsWith("全年"))?.value).toBe("4,845.5");
    expect(overview.oneOff).toBeNull();
    const blob = JSON.stringify(overview);
    expect(blob).not.toContain("16,095.5");
    expect(blob).not.toContain("16,000.0");
    expect(blob).not.toContain("预算总包");
    expect(blob).not.toContain("内部调动 2 人");
    expect(blob).not.toContain("78 : 22");
    expect(blob).not.toContain(UNATTRIBUTED_AGENT_NOTE);
    expect(overview.audience).toBe("hrbp");
    expect(SCOPE_TOTAL_NOTE).not.toMatch(/16,095|16,000|预算总包/);
  });

  it("质量与交付部在激进场景里的第 41 条不带公司比例", () => {
    const projected = projectBusinessPreset(presets.find((item) => item.id === "jj") as ScenarioDefinition, DEPT.qa, result);
    const scenario = businessScenarioResult(result, projected, DEPT.qa);
    const board = buildScenarioBoard(result, [{ ...projected, compared: true }], projected.id, DEFAULT_PREFILL_NOTE, { mode: "business", rootId: DEPT.qa });
    const article = board.health[0]?.cells.find((cell) => cell.title === "第 41 条")?.text;
    expect(article).toBe("减员 8 人 · 请与法务确认");
    expect(article).not.toContain("%");
    expect(quarterChangeLabels(evaluateBaseline(result, DEPT.qa), scenario, { people: deptStat(result, DEPT.qa).onBoard, agents: deptStat(result, DEPT.qa).agentInUse }).some((label) => label.includes("减员"))).toBe(true);
  });
});

describe("悬停文案是 59 条", () => {
  it("末几条按时间轴、未归属、单部门方案、Q2 出缺不补、外包、范围合计、出缺不补模板、HRBP 场景总成本排列，并与文件原文一致", () => {
    const file = loadTooltipFile();
    expect(file).toHaveLength(59);
    expect(file.at(-1)?.metric).toBe("场景总成本（HRBP 版）");
    expect(TOOLTIPS).toHaveLength(59);
    expect(TOOLTIPS.slice(51).map((item) => item.metric)).toEqual(["时间轴", "未归属部门 Agent ⓘ", "仅产品研发一部 ⓘ", "Q2 离职未补位标签", "外包（部门）", "范围合计 ⓘ", "离职未补位标签（含出缺不补）", "场景总成本（HRBP 版）"]);
    expect(TOOLTIPS.find((item) => item.metric === "时间轴")?.text).toBe(file.find((item) => item.metric === "时间轴")?.text);
    expect(TOOLTIPS.find((item) => item.metric === "≈ ① + ②")?.text).toBe("各项分别取整到 0.5 万，合计按未取整金额加总后再取整，可能差 0.5 万。");
    expect(UNATTRIBUTED_AGENT_NOTE).toBe(TOOLTIPS[52]?.text);
    expect(SCOPE_TOTAL_NOTE).toBe("范围合计只含日常成本（人工 + Agent），对比范围内部门预算之和；一次性费用（经济补偿、Agent 实施和培训费）由 HR 和 OD 统一管理，不计入。");
  });
});
