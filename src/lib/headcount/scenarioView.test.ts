import { describe, expect, it } from "vitest";
import { can, type HeadcountUser } from "@/lib/headcount/authz";
import { createMemoryDb } from "@/lib/headcount/db/client";
import { loadScenarioDefinitions, saveScenarioDefinition } from "@/lib/headcount/db/scenarios";
import { seedSample } from "@/lib/headcount/db/seed";
import * as schema from "@/lib/headcount/db/schema";
import { serializeScenarioFile, parseScenarioFile } from "@/lib/data/scenarioFile";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { computePlan } from "@/lib/headcount/engine";
import { buildLeaderView } from "@/lib/headcount/leaderView";
import { sandboxImportHasRoster, scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { evaluateScenario, presetScenarios } from "@/lib/headcount/scenario";
import {
  assumptionPrompt,
  assumptionUnits,
  buildScenarioBoard,
  copyScenario,
  DEFAULT_PREFILL_NOTE,
  healthChecks,
  resolvePrefill,
  scenarioCutTextHasPerPerson,
  setCompared,
} from "@/lib/headcount/scenarioView";
import { formatWan } from "@/lib/headcount/money";

const result = computePlan(samplePlan());
const board = buildScenarioBoard(result, presetScenarios(), "jj", DEFAULT_PREFILL_NOTE);

describe("场景页与沙盘导入", () => {
  it("三场景对比、时间轴和体检对齐稿面", () => {
    expect(board.hero).toBe("对比的 3 个场景中，沙盘方案 A成本最低（15,945.0 万），比预算总包结余 55.0 万，人 : AI 为 69 : 31；激进 · AI 加速结余 28.0 万，但要在 Q3 减员 8 人、产生 55.0 万经济补偿，人 : AI 未拆解；基准超预算总包 98.5 万。");
    expect(board.columns.map((column) => column.total)).toEqual(["16,095.5", "16,098.5", "15,972.0", "15,945.0"]);
    expect(board.columns.map((column) => column.gap)).toEqual(["超 95.5", "超 98.5", "结余 28.0", "结余 55.0"]);
    expect(board.timelineSummary).toBe("Q1 3,937.0 · Q2 4,009.0 · Q3 4,040.5 · Q4 3,985.5 万 · Q2 +12 Agent · Q3 减员 8 人");
    expect(board.health).toHaveLength(4);
    expect(board.health[0]).toMatchObject({ title: "《劳动合同法》第 41 条", compliance: true });
    expect(board.health[0].body).toContain("Q3 减员 8 人，约占职工总数 1.6%");
    expect(board.health[1].title).toBe("人 : AI 未拆解");
    expect(board.health[2].body).toBe("一次性 97.5 万，超出预留 30.0 万（示例）；部门持续成本结余 95.5 万，合计仍结余 28.0 万。");
    expect(board.health[3].title).toBe("管理幅度");
    expect(board.health[3].body).toContain("基础架构组 33");
    expect(board.cutSummary).toContain("质量与交付部 · P5 · 8 人 · 2027-07-01 · 补偿 55.0 万");
    expect(board.assumptionSummary).toContain("N+1 不计入");
    expect(board.stepCheckNote).toBe("体检 4 条提示，1 条涉及合规");
    const blob = JSON.stringify(board);
    expect(blob).not.toMatch(/钱二|赵一|68750|每人|employeeNo/);
    expect(scenarioCutTextHasPerPerson(blob)).toBe(false);
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
    expect(definition.structureNote).toContain("Q2");
    expect(definition.spanAlert).toEqual({ department: "数据组", span: 12, limit: 8 });
    const evaluated = evaluateScenario(result, definition);
    expect(formatWan(evaluated.totalYuan)).toBe("15,945.0");
    expect(evaluated.yearEndPeople).toBe(480);
  });

  it("最多对比 3 个，复制出来的场景先留在对比外", () => {
    const presets = presetScenarios();
    expect(setCompared(presets, "bs", true).error).toBe("最多对比 3 个场景");
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
