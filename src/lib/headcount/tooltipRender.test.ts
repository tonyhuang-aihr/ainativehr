import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DepartmentDailyRows } from "@/components/headcount/department-daily-rows";
import { LeaderBoard } from "@/components/headcount/leader-board";
import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { ScopeOverviewBoard } from "@/components/headcount/scope-overview";
import { HRBP_SCENARIO_TOTAL_NOTE, SCOPE_TOTAL_NOTE, SCENARIO_TOTAL_NOTE, TIMELINE_CHANGE_NOTE, TOOLTIPS } from "@/lib/headcount/copy";
import { computePlan } from "@/lib/headcount/engine";
import { buildLeaderView } from "@/lib/headcount/leaderView";
import { ROUNDING_GAP_NOTE } from "@/lib/headcount/money";
import { buildScopeOverview, scopeHasSmallGroup } from "@/lib/headcount/overview";
import { defaultDetailQuery } from "@/lib/headcount/rosterPage";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { mergeBusinessScenarios } from "@/lib/headcount/buCost";
import { presetScenarios } from "@/lib/headcount/scenario";
import { buildScenarioBoard, DEFAULT_PREFILL_NOTE } from "@/lib/headcount/scenarioView";

const result = computePlan(samplePlan());
const FILE_TIMELINE = "场景新增 = 本场景在基线之上加减的数量；括号里是加上已确认在途后，季初到季末的实际变化。两个数都直接取成本引擎结果。场景里的变动统一按该季第一天生效（P0）。";
const FILE_SCOPE = "范围合计只含日常成本（人工 + Agent），对比范围内部门预算之和；一次性费用（经济补偿、Agent 实施和培训费）由 HR 和 OD 统一管理，不计入。";
const ALLOWED_OUTSIDE_FILE = new Set([ROUNDING_GAP_NOTE, HRBP_SCENARIO_TOTAL_NOTE]);

function labels(node: ReactElement): string[] {
  const html = renderToStaticMarkup(node);
  return [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) =>
    match[1]
      .replaceAll("&quot;", "\"")
      .replaceAll("&amp;", "&")
      .replaceAll("&#x27;", "'")
      .replaceAll("&gt;", ">")
      .replaceAll("&lt;", "<"),
  );
}

function isRowFigure(note: string): boolean {
  return note.startsWith("Q1 ");
}

function detail(patch: { peopleTypes?: string[]; peopleStatuses?: string[] } = {}) {
  return { ...defaultDetailQuery(), peopleSize: 50 as const, ...patch };
}

describe("每个角色页面上的 ⓘ 都按悬停表原文渲染", () => {
  const presets = presetScenarios();
  const companyBoard = buildScenarioBoard(
    result,
    presets.map((item) => (item.id === "bs" ? { ...item, compared: true } : item.id === "fa" ? { ...item, compared: false } : item)),
    "bs",
    DEFAULT_PREFILL_NOTE,
  );
  const business = mergeBusinessScenarios(presets, [], DEPT.prod1, result);
  const businessBoard = buildScenarioBoard(result, business, "bu-prod1-jz", DEFAULT_PREFILL_NOTE, {
    mode: "business",
    rootId: DEPT.prod1,
    departmentNames: ["产品研发一部"],
  });
  const odDepartment = buildLeaderView(result, DEPT.prod1, { exact: true, showMarks: true, copyAudience: "od", companyScope: false, detail: detail() });
  const odOutsource = buildLeaderView(result, DEPT.prod1, { exact: true, showMarks: true, copyAudience: "od", companyScope: false, detail: detail({ peopleTypes: ["外包"] }) });
  const odTransit = buildLeaderView(result, DEPT.prod1, { exact: true, showMarks: true, copyAudience: "od", companyScope: false, detail: detail({ peopleStatuses: ["在途"] }) });
  const leaderDepartment = buildLeaderView(result, DEPT.infra, { exact: true, showMarks: false, copyAudience: "leader", companyScope: false, detail: detail() });
  const leaderTransit = buildLeaderView(result, DEPT.plat, { exact: false, showMarks: false, copyAudience: "leader", companyScope: false, detail: detail({ peopleStatuses: ["在途"] }) });
  const platIds = result.plan.departments.filter((department) => department.id === DEPT.plat || department.parentId === DEPT.plat).map((department) => department.id);
  const leaderOverview = buildScopeOverview(result, DEPT.plat, "leader", scopeHasSmallGroup(result, platIds));
  const odOverview = buildScopeOverview(result, DEPT.center, "od", false);
  const hrbpOverview = buildScopeOverview(result, DEPT.prod1, "hrbp", false);

  const rendered = {
    od: [
      ...labels(createElement(ScopeOverviewBoard, { overview: odOverview })),
      ...labels(createElement(LeaderBoard, { view: odDepartment })),
      ...labels(createElement(LeaderBoard, { view: odOutsource })),
      ...labels(createElement(LeaderBoard, { view: odTransit })),
      ...labels(createElement(ScenarioBoardView, { board: companyBoard })),
      ...labels(createElement(DepartmentDailyRows, { columns: companyBoard.columns, note: companyBoard.dailyBreakdown!.note, defaultOpen: true })),
    ],
    leader: [
      ...labels(createElement(ScopeOverviewBoard, { overview: leaderOverview })),
      ...labels(createElement(LeaderBoard, { view: leaderDepartment })),
      ...labels(createElement(LeaderBoard, { view: leaderTransit })),
    ],
    hrbp: [
      ...labels(createElement(ScopeOverviewBoard, { overview: hrbpOverview })),
      ...labels(createElement(ScenarioBoardView, { board: businessBoard })),
    ],
  };

  it("渲染出来的每条说明都能对上文件，HRBP 场景总成本除外", () => {
    const file = new Set<string>(TOOLTIPS.map((item) => item.text));
    for (const [role, notes] of Object.entries(rendered)) {
      const unknown = notes.filter((note) => !file.has(note) && !ALLOWED_OUTSIDE_FILE.has(note) && !isRowFigure(note));
      expect(unknown, role).toEqual([]);
    }
    expect(rendered.od).toContain(FILE_TIMELINE);
    expect(rendered.od).toContain(SCENARIO_TOTAL_NOTE);
    expect(rendered.hrbp).toContain(FILE_SCOPE);
    expect(rendered.hrbp).toContain(HRBP_SCENARIO_TOTAL_NOTE);
    expect(rendered.hrbp).not.toContain(SCENARIO_TOTAL_NOTE);
    expect(rendered.hrbp.join("\n")).not.toContain("场景总成本 = 部门日常成本（人工 + Agent 席位、算力）+ 一次性费用");
    expect(TIMELINE_CHANGE_NOTE).toBe(FILE_TIMELINE);
    expect(SCOPE_TOTAL_NOTE).toBe(FILE_SCOPE);
    const seen = new Set([...rendered.od, ...rendered.leader, ...rendered.hrbp]);
    const missing = TOOLTIPS.filter((item) => item.metric !== "≈ ① + ②" && !seen.has(item.text)).map((item) => `${item.page} / ${item.metric}`);
    expect(missing).toEqual([]);
  });
});
