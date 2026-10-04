import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { can } from "@/lib/headcount/authz";
import { businessScenarioResult, mergeBusinessScenarios, scenarioDailyBreakdown } from "@/lib/headcount/buCost";
import { computePlan } from "@/lib/headcount/engine";
import { formatWan } from "@/lib/headcount/money";
import {
  PROD1_SANDBOX_DEMO,
  PROD1_SANDBOX_DEMO_CAPTION,
  PROD1_SANDBOX_DEMO_DEPARTMENT,
  PROD1_SANDBOX_DEMO_ID,
  PROD1_SANDBOX_DEMO_LISTED,
  PROD1_SANDBOX_DEMO_NAME,
  PROD1_SANDBOX_DEMO_PLACEHOLDER,
  definitionFromProd1SandboxDemo,
  sandboxImportCandidates,
  sandboxOfferCopy,
  type Prod1SandboxDemoInput,
} from "@/lib/headcount/prod1SandboxDemo";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { evaluateBaseline, evaluateScenario, presetScenarios } from "@/lib/headcount/scenario";
import { buildScenarioBoard, DEFAULT_PREFILL_NOTE } from "@/lib/headcount/scenarioView";
import { executeScenarioCommand, importableSandboxPlans, visibleScenarioCatalog, type WriteScope } from "@/lib/headcount/scenarioWrites";

const result = computePlan(samplePlan());
const names = result.plan.departments.map((department) => department.name);

function scopeFor(companyWide: boolean, rootId: string | null, rootName: string | null, allowed: string[]): WriteScope {
  return { companyWide, allowed: new Set(allowed), names, rootId, rootName, result };
}

const linScope = scopeFor(false, DEPT.prod1, "产品研发一部", ["产品研发一部"]);
const platScope = scopeFor(false, DEPT.plat, "平台部", ["平台部", "平台部直属", "基础架构组", "数据平台组"]);
const infraScope = scopeFor(false, DEPT.infra, "基础架构组", ["基础架构组"]);
const companyScope = scopeFor(true, DEPT.center, "研发中心", names);

/**
 * 只给测试走通导入和口径。不是占位夹具，也不是待发布的正式金额。
 * 一次性费用取整到 10.0 万，用来区分 OD 总成本和 HRBP 日常成本。
 */
const plumbingFixture: Prod1SandboxDemoInput = {
  groupName: "测试用小组",
  roles: [],
  agents: [{ name: "测试用 Agent", count: 1, monthlyYuan: 1000, oneOffYuan: 100_000, effectiveQuarter: 2 }],
  cuts: [],
  hires: [],
  ratio: "未拆解",
};

const listedGate = { listed: true, demo: plumbingFixture };

function zeroOneOff(input: Prod1SandboxDemoInput): Prod1SandboxDemoInput {
  return { ...input, agents: input.agents.map((agent) => ({ ...agent, oneOffYuan: 0 })) };
}

describe("产品研发一部沙盘示例先不进列表", () => {
  it("正式数据仍是空的，占位夹具不会被发布", () => {
    expect(PROD1_SANDBOX_DEMO_LISTED).toBe(false);
    expect(PROD1_SANDBOX_DEMO).toBeNull();
    expect(PROD1_SANDBOX_DEMO_PLACEHOLDER.agents.every((agent) => agent.monthlyYuan === 0 && agent.oneOffYuan === 0)).toBe(true);
    expect(sandboxImportCandidates(2).map((item) => item.id)).toEqual(["fa"]);
    expect(sandboxImportCandidates(2).some((item) => item.name === PROD1_SANDBOX_DEMO_NAME)).toBe(false);
    expect(presetScenarios().map((item) => item.id)).toEqual(["jz", "jj", "bs", "fa"]);
    expect(presetScenarios().some((item) => item.id === PROD1_SANDBOX_DEMO_ID)).toBe(false);
  });

  it("未导入时，公司和部门的锁定数字不变", () => {
    const presets = presetScenarios();
    const baseline = evaluateBaseline(result);
    const byId = Object.fromEntries(presets.map((item) => [item.id, evaluateScenario(result, item)]));
    expect(formatWan(baseline.dailyYuan)).toBe("16,071.0");
    expect(formatWan(baseline.totalYuan)).toBe("16,095.5");
    expect(formatWan(byId.jj.totalYuan)).toBe("15,972.0");
    expect(formatWan(byId.fa.totalYuan)).toBe("15,945.0");
    expect(presets.map((item) => formatWan(scenarioDailyBreakdown(result, item).rows.reduce((total, row) => total + row.yuan, 0) + scenarioDailyBreakdown(result, item).unattributedYuan))).toEqual([
      "16,070.0",
      "15,874.5",
      "15,810.0",
      "15,908.5",
    ]);
    const conservative = buildScenarioBoard(
      result,
      presets.map((item) => (item.id === "fa" ? { ...item, compared: false } : item.id === "bs" ? { ...item, compared: true } : item)),
      "bs",
      DEFAULT_PREFILL_NOTE,
    );
    expect(conservative.columns.find((column) => column.name === "保守")).toMatchObject({ daily: "15,810.0", approx: true });

    const companyBoard = buildScenarioBoard(result, presets, "jj", DEFAULT_PREFILL_NOTE);
    expect(companyBoard.columns.map((column) => column.name)).toEqual(["基线", "基准", "激进 · AI 加速", "沙盘方案 A · 拆组前"]);
    expect(companyBoard.columns.map((column) => column.name)).not.toContain(PROD1_SANDBOX_DEMO_NAME);

    const linBoard = buildScenarioBoard(result, mergeBusinessScenarios(presets, [], DEPT.prod1, result), `bu-${DEPT.prod1}-jz`, DEFAULT_PREFILL_NOTE, {
      mode: "business",
      rootId: DEPT.prod1,
      departmentNames: ["产品研发一部"],
    });
    expect(linBoard.columns.map((column) => column.total)).toEqual(["4,845.5", "4,878.5", "4,788.0", "4,765.0"]);
    expect(linBoard.budget).toBe("4,725.0");
  });
});

describe("一部示例接上之后只给林和 OD 导入", () => {
  it("林能导入，平台部和基础架构组不能，范围规则没有放宽", () => {
    const candidates = sandboxImportCandidates(2, listedGate);
    expect(candidates.map((item) => item.id)).toEqual(["fa", PROD1_SANDBOX_DEMO_ID]);
    expect(candidates[1]?.agents.every((agent) => agent.departmentName === PROD1_SANDBOX_DEMO_DEPARTMENT)).toBe(true);
    expect(candidates[1]?.structureNote).toContain("示例数据");
    expect(candidates[1]?.structureNote).not.toContain("数据智能部");

    const linOffers = importableSandboxPlans(candidates, linScope);
    expect(linOffers.map((item) => item.id)).toEqual([`sandbox-${DEPT.prod1}-${PROD1_SANDBOX_DEMO_ID}`]);
    expect(linOffers[0]?.name).toBe(PROD1_SANDBOX_DEMO_NAME);
    expect(sandboxOfferCopy(linOffers[0]!).caption).toBe(PROD1_SANDBOX_DEMO_CAPTION);
    expect(sandboxOfferCopy(linOffers[0]!).caption).toContain("示例数据");

    expect(importableSandboxPlans(candidates, platScope)).toEqual([]);
    expect(importableSandboxPlans(candidates, infraScope)).toEqual([]);
    expect(importableSandboxPlans(candidates, companyScope).map((item) => item.id)).toEqual(["fa", PROD1_SANDBOX_DEMO_ID]);

    const leaked = definitionFromProd1SandboxDemo(plumbingFixture);
    const outside = [
      { ...leaked, agents: [{ ...leaked.agents[0]!, departmentName: "数据智能部" }] },
      { ...leaked, agents: [{ ...leaked.agents[0]!, departmentName: null }] },
      { ...leaked, structureNote: "数据智能部 65→71 人。" },
    ];
    for (const plan of outside) {
      expect(importableSandboxPlans([plan], linScope), plan.agents[0]?.departmentName ?? plan.id).toEqual([]);
    }

    const visible = visibleScenarioCatalog(presetScenarios(), linScope);
    const imported = executeScenarioCommand(presetScenarios(), visible, linScope, {
      type: "import",
      definition: linOffers[0]!,
      id: linOffers[0]!.id,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.changed?.compared).toBe(false);
    expect(imported.changed?.agents[0]?.departmentName).toBe("产品研发一部");

    const denied = executeScenarioCommand(presetScenarios(), visibleScenarioCatalog(presetScenarios(), platScope), platScope, {
      type: "import",
      definition: leaked,
      id: "sandbox-plat-prod1-demo",
    });
    expect(denied.ok).toBe(false);
  });

  it("林按一部日常成本和 4,725.0 对比，黄按公司口径计入一次性费用", () => {
    const listed = importableSandboxPlans(sandboxImportCandidates(2, listedGate), linScope)[0]!;
    const companyPlan = importableSandboxPlans(sandboxImportCandidates(2, listedGate), companyScope).find((item) => item.id === PROD1_SANDBOX_DEMO_ID)!;
    const withoutFee = definitionFromProd1SandboxDemo(zeroOneOff(plumbingFixture));

    const charged = evaluateScenario(result, companyPlan);
    const plain = evaluateScenario(result, withoutFee);
    expect(charged.oneOffYuan - plain.oneOffYuan).toBe(100_000);
    expect(charged.totalYuan - plain.totalYuan).toBe(100_000);
    expect(charged.dailyYuan).toBe(plain.dailyYuan);

    const linCharged = businessScenarioResult(result, listed, DEPT.prod1);
    const linPlain = businessScenarioResult(result, { ...withoutFee, id: listed.id }, DEPT.prod1);
    expect(linCharged.dailyYuan).toBe(linPlain.dailyYuan);
    expect(linCharged.oneOffYuan - linPlain.oneOffYuan).toBe(100_000);

    const linOptions = { mode: "business" as const, rootId: DEPT.prod1, departmentNames: ["产品研发一部"] };
    const linBoard = buildScenarioBoard(result, [{ ...listed, compared: true }], listed.id, DEFAULT_PREFILL_NOTE, linOptions);
    const linBoardPlain = buildScenarioBoard(result, [{ ...withoutFee, id: listed.id, compared: true }], listed.id, DEFAULT_PREFILL_NOTE, linOptions);
    expect(linBoard.budget).toBe("4,725.0");
    expect(linBoard.budgetCaption).toBe("部门预算");
    expect(linBoard.showOneOff).toBe(false);
    expect(linBoard.totalLabel).toBe("全年日常成本");
    const linColumn = linBoard.columns.find((column) => column.id === listed.id);
    expect(linColumn?.total).toBe(linColumn?.daily);
    expect(linColumn?.total).toBe(linBoardPlain.columns.find((column) => column.id === listed.id)?.total);
    const linHtml = renderToStaticMarkup(createElement(ScenarioBoardView, { board: linBoard }));
    expect(linHtml).not.toContain(">一次性<");
    expect(linHtml).toContain(PROD1_SANDBOX_DEMO_CAPTION);
    expect(linHtml).toContain(PROD1_SANDBOX_DEMO_NAME);

    const odBoard = buildScenarioBoard(result, [{ ...companyPlan, compared: true }], companyPlan.id, DEFAULT_PREFILL_NOTE);
    const odBoardPlain = buildScenarioBoard(result, [{ ...withoutFee, compared: true }], withoutFee.id, DEFAULT_PREFILL_NOTE);
    expect(odBoard.showOneOff).toBe(true);
    expect(odBoard.budgetCaption).toBe("预算总包");
    const odColumn = odBoard.columns.find((column) => column.id === PROD1_SANDBOX_DEMO_ID);
    const odPlainColumn = odBoardPlain.columns.find((column) => column.id === PROD1_SANDBOX_DEMO_ID);
    expect(odColumn?.total).not.toBe(odColumn?.daily);
    expect(odColumn?.total).not.toBe(odPlainColumn?.total);
    const odHtml = renderToStaticMarkup(createElement(ScenarioBoardView, { board: odBoard }));
    expect(odHtml).toContain(">一次性<");
    expect(odHtml).toContain(PROD1_SANDBOX_DEMO_CAPTION);

    const presetBoard = buildScenarioBoard(result, [...presetScenarios(), companyPlan], "jj", DEFAULT_PREFILL_NOTE);
    expect(presetBoard.columns.map((column) => column.name)).toEqual(["基线", "基准", "激进 · AI 加速", "沙盘方案 A · 拆组前"]);
    expect(presetBoard.columns.map((column) => column.name)).not.toContain(PROD1_SANDBOX_DEMO_NAME);
  });

  it("赵、钱、范看不到场景页，范即使管辖一部也进不了导入列表", () => {
    for (const user of [
      { id: "zhao", role: "leader" as const, departmentIds: [DEPT.plat] },
      { id: "qian", role: "leader" as const, departmentIds: [DEPT.infra] },
      { id: "fan", role: "leader" as const, departmentIds: [DEPT.prod1] },
    ]) {
      expect(can(user, "viewScenarios"), user.id).toBe(false);
    }
    expect(can({ id: "lin", role: "hrbp", departmentIds: [DEPT.prod1] }, "viewScenarios")).toBe(true);
    expect(can({ id: "huang", role: "od", departmentIds: [] }, "viewScenarios")).toBe(true);
  });
});
