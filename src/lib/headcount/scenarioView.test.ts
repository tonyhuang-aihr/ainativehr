import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { can, type HeadcountUser } from "@/lib/headcount/authz";
import { createMemoryDb } from "@/lib/headcount/db/client";
import { loadScenarioDefinitions, saveScenarioDefinition } from "@/lib/headcount/db/scenarios";
import { seedSample } from "@/lib/headcount/db/seed";
import * as schema from "@/lib/headcount/db/schema";
import { serializeScenarioFile, parseScenarioFile } from "@/lib/data/scenarioFile";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { computePlan, deptStat } from "@/lib/headcount/engine";
import { buildLeaderView } from "@/lib/headcount/leaderView";
import { sandboxImportHasRoster, scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { evaluateBaseline, evaluateScenario, presetScenarios, quarterChangeLabels } from "@/lib/headcount/scenario";
import {
  assumptionPrompt,
  assumptionUnits,
  buildScenarioBoard,
  copyScenario,
  DEFAULT_PREFILL_NOTE,
  COMPARISON_CAP,
  healthChecks,
  heroSentence,
  phraseAfterName,
  resolvePrefill,
  scenarioCutTextHasPerPerson,
  setCompared,
} from "@/lib/headcount/scenarioView";
import { formatWan } from "@/lib/headcount/money";

const result = computePlan(samplePlan());
const board = buildScenarioBoard(result, presetScenarios(), "jj", DEFAULT_PREFILL_NOTE);

describe("场景页与沙盘导入", () => {
  it("三场景对比、时间轴和体检对齐稿面", () => {
    expect(board.hero).toBe("对比的 3 个场景中，沙盘方案 A · 拆组前成本最低（15,945.0 万），比预算总包结余 55.0 万，人 : AI 为 69 : 31，但数据组管理幅度 12 超过建议值 8；激进 · AI 加速结余 28.0 万，但要在 Q3 减员 8 人、产生 55.0 万经济补偿，人 : AI 未拆解；基准超预算总包 98.5 万。");
    expect(board.columns.map((column) => column.total)).toEqual(["16,095.5", "16,098.5", "15,972.0", "15,945.0"]);
    expect(board.columns.map((column) => column.gap)).toEqual(["超 95.5", "超 98.5", "结余 28.0", "结余 55.0"]);
    expect(board.timelineCaption).toBe("按季初生效");
    const baseline = evaluateBaseline(result);
    const aggressive = evaluateScenario(result, presetScenarios().find((item) => item.id === "jj")!);
    const opening = { people: deptStat(result, DEPT.center).onBoard, agents: deptStat(result, DEPT.center).agentInUse };
    const labels = quarterChangeLabels(baseline, aggressive, opening);
    expect(board.timelineLabels).toEqual(labels);
    expect(board.timelineSummary).toContain(labels.join(" · "));
    expect(labels).toEqual([
      "Q1 离职未补位 10 人（含基线变动共 486→479）",
      "Q2 场景增员 2 人（含基线变动共 479→482）",
      "Q2 场景新增 12 个 Agent（含基线变动共 19→34）",
      "Q3 场景减员 8 人（含基线变动共 482→474）",
    ]);
    expect(phraseAfterName("沙盘方案 A", "成本最低")).toBe("沙盘方案 A 成本最低");
    expect(phraseAfterName("沙盘方案 A · 拆组前", "成本最低")).toBe("沙盘方案 A · 拆组前成本最低");
    const renamed = presetScenarios().map((item) => (item.id === "fa" ? { ...item, name: "沙盘方案 A" } : item));
    const compared = renamed.filter((item) => item.compared).map((item) => evaluateScenario(result, item));
    expect(heroSentence(result, compared)).toContain("沙盘方案 A 成本最低");
    expect(heroSentence(result, compared)).not.toContain("沙盘方案 A成本最低");
    expect(opening.agents).toBe(15);
    expect(quarterChangeLabels(baseline, baseline, opening)).toEqual([]);
    expect(baseline.quarters.map((quarter) => quarter.agents)).toEqual([19, 22, 21, 21]);
    expect(aggressive.quarters.map((quarter) => quarter.agents)).toEqual([19, 34, 33, 33]);
    expect(board.health.map((row) => row.name)).toEqual(["基准", "激进 · AI 加速", "沙盘方案 A · 拆组前"]);
    const cell = (name: string, title: string) => board.health.find((row) => row.name === name)?.cells.find((item) => item.title === title)?.text;
    expect(cell("激进 · AI 加速", "超预算")).toBe("正常");
    expect(cell("激进 · AI 加速", "管理幅度")).toBe("—");
    expect(cell("基准", "管理幅度")).toBe("—");
    expect(cell("激进 · AI 加速", "人 : AI")).toBe("未拆解");
    expect(cell("激进 · AI 加速", "人 : AI")).not.toMatch(/\d/);
    expect(cell("激进 · AI 加速", "第 41 条")).toBe("8 人 · 1.6%");
    expect(cell("沙盘方案 A · 拆组前", "管理幅度")).toBe("12 > 8");
    expect(cell("基准", "超预算")).toBe("超 98.5");
    expect(cell("沙盘方案 A · 拆组前", "第 41 条")).toBe("正常");
    expect(JSON.stringify(board.health)).not.toContain("一次性费用超出预留");
    expect(JSON.stringify(board.health)).not.toContain("基础架构组");
    expect(board.incompleteRatioNote).toBe("沙盘尚未拆解人 : AI。只标记数据不完整，不按 Agent 个数推算。");
    expect(board.cutSummary).toContain("质量与交付部 · P5 · 8 人 · 2027-07-01 · 补偿 55.0 万");
    expect(board.assumptionSummary).toContain("N+1 不计入");
    expect(board.stepCheck).toBe("2 / 3 个场景在预算内 · 最低：沙盘方案 A · 拆组前");
    expect(board.stepCheckNote).toBe("体检 4 条提示，1 条涉及合规");
    expect(board.healthHintCount).toBe(4);
    expect(board.health.flatMap((row) => row.cells).filter((cell) => cell.tone === "warn" || cell.tone === "compliance")).toHaveLength(board.healthHintCount);
    expect(board.editingOutsideNote).toBeNull();
    expect(board.stepSelectNote).toBe("「保守」未加入对比 · 最多对比 3 个");
    expect(board.stepAssume).toBe("激进 · AI 加速：离职率 8% · 招聘周期 60 天");
    expect(board.timelineTitle).toBe("时间轴 · 激进 · AI 加速");
    expect(board.healthFootnote).toBe("数据组管理幅度 12，超过建议值 8（沙盘方案 A · 拆组前）；最新版「方案 A」已拆成 6 + 6，导入后通过。基准、激进无结构调整，记「—」。人 : AI 未拆解只提示数据不全，不估算。第 41 条仅作提醒，请与法务确认是否需要报告。");
    expect(board.assumptionSummary).toContain("· 2 项待定");
    expect(board.nofillSummary).toBeNull();
    const blob = JSON.stringify(board);
    expect(blob).not.toMatch(/钱二|赵一|68750|每人|employeeNo/);
    expect(scenarioCutTextHasPerPerson(blob)).toBe(false);
    const html = renderToStaticMarkup(createElement(ScenarioBoardView, { board }));
    const health = html.slice(html.indexOf('id="health-checks"'));
    expect(health.startsWith('id="health-checks"')).toBe(true);
    expect(health).toContain("体检 · 3 个场景 · 4 项");
    expect(health).toContain(">4 条提示<");
    expect(health).toContain("xl:overflow-visible");
    expect(health).toContain("xl:w-max");
    expect(health).toContain("xl:whitespace-normal");
    expect(health).toContain("xl:max-w-40");
    expect(html).not.toContain("360px");
    expect(html).not.toContain("未在对比中");
    const assume = html.slice(html.indexOf("调假设"), html.indexOf("看对比 / 体检"));
    expect(assume).not.toContain("正在编辑：");
  });

  it("正在编辑的场景不在对比里时，调假设标题旁有灰色提示，时间轴仍跟这个场景", () => {
    const outside = buildScenarioBoard(result, presetScenarios(), "bs", DEFAULT_PREFILL_NOTE);
    expect(outside.editingOutsideNote).toBe("正在编辑：保守（未在对比中）");
    expect(outside.stepAssume).toBe("保守：离职率 8% · 招聘周期 90 天");
    expect(outside.timelineTitle).toBe("时间轴 · 保守");
    expect(outside.columns.map((column) => column.name)).toEqual(["基线", "基准", "激进 · AI 加速", "沙盘方案 A · 拆组前"]);
    const removed = presetScenarios().map((item) => (item.id === "jj" ? { ...item, compared: false } : item.id === "bs" ? { ...item, compared: true } : item));
    const stillEditing = buildScenarioBoard(result, removed, "jj", DEFAULT_PREFILL_NOTE);
    expect(stillEditing.editingOutsideNote).toBe("正在编辑：激进 · AI 加速（未在对比中）");
    expect(stillEditing.stepAssume).toBe("激进 · AI 加速：离职率 8% · 招聘周期 60 天");
    expect(stillEditing.timelineTitle).toBe("时间轴 · 激进 · AI 加速");
    expect(stillEditing.columns.map((column) => column.name)).toEqual(["基线", "基准", "保守", "沙盘方案 A · 拆组前"]);
    const html = renderToStaticMarkup(createElement(ScenarioBoardView, { board: outside }));
    const assume = html.slice(html.indexOf(">调假设<"), html.indexOf("看对比 / 体检"));
    expect(assume).toContain("正在编辑：保守（未在对比中）");
    expect(assume).toContain("text-muted");
    const quiet = renderToStaticMarkup(createElement(ScenarioBoardView, { board }));
    expect(quiet.slice(quiet.indexOf(">调假设<"), quiet.indexOf("看对比 / 体检"))).not.toContain("正在编辑：");
    const cleared = renderToStaticMarkup(createElement(ScenarioBoardView, { board: { ...board, healthHintCount: 0 } }));
    expect(cleared.slice(cleared.indexOf('id="health-checks"'), cleared.indexOf("超预算"))).not.toContain("条提示");
  });

  it("四个场景的时间轴标签与核对清单逐字一致", () => {
    const opening = { people: deptStat(result, DEPT.center).onBoard, agents: deptStat(result, DEPT.center).agentInUse };
    const baseline = evaluateBaseline(result);
    const expected = {
      jz: [
        "Q1 离职未补位 10 人（含基线变动共 486→479）",
        "Q2 场景增员 6 人（含基线变动共 479→486）",
        "Q2 场景新增 4 个 Agent（含基线变动共 19→26）",
        "Q3 场景增员 4 人（含基线变动共 486→490）",
      ],
      jj: [
        "Q1 离职未补位 10 人（含基线变动共 486→479）",
        "Q2 场景增员 2 人（含基线变动共 479→482）",
        "Q2 场景新增 12 个 Agent（含基线变动共 19→34）",
        "Q3 场景减员 8 人（含基线变动共 482→474）",
      ],
      bs: [
        "Q1 离职未补位 10 人（含基线变动共 486→479）",
        "Q2 场景新增 2 个 Agent（含基线变动共 19→24）",
      ],
      fa: [
        "Q1 离职未补位 10 人（含基线变动共 486→479）",
        "Q2 场景新增 6 个 Agent（含基线变动共 19→28）",
      ],
    };
    const presets = presetScenarios();
    for (const definition of presets) {
      const labels = expected[definition.id as keyof typeof expected];
      expect(quarterChangeLabels(baseline, evaluateScenario(result, definition), opening)).toEqual(labels);
      expect(buildScenarioBoard(result, presets, definition.id, DEFAULT_PREFILL_NOTE).timelineLabels).toEqual(labels);
      expect(labels.some((label) => label.startsWith("Q4"))).toBe(false);
      expect(labels.every((label) => label.endsWith("）") && label.includes("（含基线变动共 "))).toBe(true);
    }
    const latest = scenarioFromSandbox(buildRdCenterWorkspace("2026-10-04T00:00:00.000Z"), 2);
    expect(latest.name).toBe("沙盘方案 A");
    expect(quarterChangeLabels(baseline, evaluateScenario(result, latest), opening)).toEqual(expected.fa);
    const withLatest = presets.map((item) => (item.id === "fa" ? latest : item));
    expect(buildScenarioBoard(result, withLatest, "fa", DEFAULT_PREFILL_NOTE).timelineLabels).toEqual(expected.fa);
    expect(quarterChangeLabels(baseline, baseline, opening)).toEqual([]);
  });

  it("预填只送脱敏汇总，没有模型时用默认假设", async () => {
    const units = assumptionUnits(result);
    const tiny = units.find((unit) => unit.name === "平台部直属");
    expect(tiny).toEqual({ name: "平台部直属", scale: "有人员调整" });
    expect(tiny).not.toHaveProperty("headcount");
    expect(tiny).not.toHaveProperty("annualWan");
    const prompt = JSON.stringify(assumptionPrompt(units));
    expect(prompt).not.toMatch(/钱二|E10012|employeeNo/);
    const resolved = await resolvePrefill(units, null);
    expect(resolved.note).toBe(DEFAULT_PREFILL_NOTE);
    expect(resolved.assumptions.noticePay).toBe(false);
    expect(resolved.assumptions.aiReplacement).toBeNull();
    const fromModel = await resolvePrefill(units, async () => "{\"attritionRate\":0.1,\"hiringCycleDays\":45,\"raiseRate\":0.02,\"aiReplacement\":null}");
    expect(fromModel.origin).toBe("model");
    expect(fromModel.assumptions.attritionRate).toBe(0.1);
    expect(fromModel.assumptions.noticePay).toBe(false);
  });

  it("沙盘示例方案 A 只留下汇总，并算出稿上的成本", () => {
    const workspace = buildRdCenterWorkspace("2026-10-04T00:00:00.000Z");
    const file = serializeScenarioFile(workspace, "2026-10-04T00:00:00.000Z");
    expect(file).toContain("E16150");
    const parsed = parseScenarioFile(file);
    const definition = scenarioFromSandbox(parsed!, 2);
    expect(sandboxImportHasRoster(definition)).toBe(false);
    expect(definition.id).toBe("fa");
    expect(definition.ratio).toBe("69 : 31");
    expect(definition.structureNote).toContain("应用分析小组并入数据组");
    expect(definition.structureNote).toContain("产品研发一部 150→144 人");
    expect(definition.structureNote).toContain("数据智能部 65→71 人");
    expect(definition.structureNote?.endsWith("定为 Q2。")).toBe(true);
    expect(definition.spanAlert).toBeNull();
    const prior = workspace.scenarios.find((item) => item.id === "scenario-a")?.revisions?.find((item) => item.name === "方案 A · 拆组前");
    expect(prior?.name).toBe("方案 A · 拆组前");
    const older = {
      ...parsed!,
      scenarios: parsed!.scenarios.map((item) => (item.id === "scenario-a" ? { ...item, snapshot: prior!.snapshot, savedAt: prior!.savedAt, revisions: [] } : item)),
    };
    expect(scenarioFromSandbox(older, 2).spanAlert).toEqual({ department: "数据组", span: 12, limit: 8 });
    const evaluated = evaluateScenario(result, definition);
    expect(formatWan(evaluated.totalYuan)).toBe("15,945.0");
    expect(evaluated.yearEndPeople).toBe(480);
  });

  it("最多对比 3 个，复制出来的场景先留在对比外", () => {
    expect(COMPARISON_CAP).toBe(3);
    const presets = presetScenarios();
    const blocked = setCompared(presets, "bs", true);
    expect(blocked.error).toBe("最多对比 3 个场景");
    expect(blocked.definitions).toEqual(presets);
    const copy = copyScenario(presets, "jj", "copy-1");
    expect(copy?.name).toBe("副本 · 激进 · AI 加速");
    expect(copy?.compared).toBe(false);
    expect(copy?.source).toBe("copy");
  });

  it("负责人视图不出现场景", () => {
    const zhao: HeadcountUser = { id: "zhao", role: "leader", departmentIds: [DEPT.plat] };
    expect(can(zhao, "viewScenarios")).toBe(false);
    const view = buildLeaderView(result, DEPT.plat, { exact: false });
    const blob = JSON.stringify(view);
    expect(blob).not.toContain("激进");
    expect(blob).not.toContain("未归属部门 Agent");
    expect(blob).not.toContain("15,972.0");
    expect(healthChecks(result, evaluateScenario(result, presetScenarios()[0])).some((item) => item.title === "超预算")).toBe(true);
  });

  it("已有库补上四个预设，并丢掉占位场景", async () => {
    const db = await createMemoryDb();
    await db.insert(schema.scenarios).values({ id: "later", name: "占位", source: "manual", version: 1, note: "H3 尚未开放" });
    const rows = await loadScenarioDefinitions(db);
    expect(rows.map((item) => item.id)).toEqual(["jz", "jj", "bs", "fa"]);
    const copy = copyScenario(rows, "bs", "copy-bs");
    if (!copy) throw new Error("缺少保守场景");
    await saveScenarioDefinition(db, copy);
    const again = await loadScenarioDefinitions(db);
    expect(again.some((item) => item.id === "copy-bs")).toBe(true);
    const fresh = await createMemoryDb();
    await seedSample(fresh);
    const seeded = await loadScenarioDefinitions(fresh);
    expect(seeded.map((item) => item.id)).toEqual(["jz", "jj", "bs", "fa"]);
  });
});
