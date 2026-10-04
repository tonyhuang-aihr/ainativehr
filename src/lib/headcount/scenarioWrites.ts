import { mergeBusinessScenarios } from "@/lib/headcount/buCost";
import { DEMO_AI_RATIO } from "@/lib/headcount/sample";
import type { PlanResult } from "@/lib/headcount/engine";
import {
  defaultAssumptions,
  presetScenarios,
  type ScenarioAssumptions,
  type ScenarioDefinition,
} from "@/lib/headcount/scenario";
import { scenarioFitsScope } from "@/lib/headcount/scopeGuard";
import { copyScenario, quarterDate, setCompared } from "@/lib/headcount/scenarioView";

const LOCKED_IDS = new Set(["jz", "jj", "bs", "fa", "jx"]);

export type WriteScope = {
  companyWide: boolean;
  allowed: ReadonlySet<string>;
  names: readonly string[];
  rootId: string | null;
  rootName: string | null;
  result: PlanResult | null;
};

export type ScenarioCommand =
  | { type: "create"; name: string; id: string }
  | { type: "copy"; sourceId: string; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "toggle"; id: string; compared: boolean }
  | { type: "assumptions"; id: string; attrition: number; cycle: number; raise: number; ai: number | null; noticePay: boolean }
  | {
      type: "change";
      id: string;
      kind: string;
      count: number;
      quarter: number;
      department: string;
      grade: string;
      agentName: string;
      monthly: number;
      oneOff: number;
      mark: string;
      tenure: number;
    }
  | { type: "import"; definition: ScenarioDefinition; id: string }
  | { type: "delete"; id: string };

export type ScenarioWrite =
  | { ok: true; catalog: ScenarioDefinition[]; changed: ScenarioDefinition | null; removedId: string | null; focusId: string; notice: string }
  | { ok: false; notice: string; focusId?: string };

export function visibleScenarioCatalog(catalog: readonly ScenarioDefinition[], scope: WriteScope): ScenarioDefinition[] {
  const visible = catalog.filter((definition) => scenarioFitsScope(definition, scope.allowed, scope.names, scope.companyWide));
  if (scope.companyWide || !scope.rootId || !scope.result) return visible;
  return mergeBusinessScenarios(catalog, visible, scope.rootId, scope.result);
}

export function canDeleteScenario(definition: { id: string; source: string }): boolean {
  if (LOCKED_IDS.has(definition.id) || definition.source === "preset") return false;
  return definition.source === "copy" || definition.source === "sandbox";
}

/**
 * 整份方案的部门都必须落在授权范围内才能导入。
 * 碰到范围外的部门、未归属 Agent、或说明里点到范围外部门时，整份拒绝，不裁掉、不改记到本部门。
 */
export function scopeSandboxImport(definition: ScenarioDefinition, scope: WriteScope, id: string): ScenarioDefinition | null {
  if (scope.companyWide) return definition;
  const next: ScenarioDefinition = { ...definition, id };
  return scenarioFitsScope(next, scope.allowed, scope.names, false) ? next : null;
}

/** 导入列表和导入动作共用这一套：范围外的方案不会出现，直接导入也会被拒绝。 */
export function importableSandboxPlans(candidates: readonly ScenarioDefinition[], scope: WriteScope): ScenarioDefinition[] {
  const plans: ScenarioDefinition[] = [];
  for (const definition of candidates) {
    const id = scope.companyWide ? definition.id : `sandbox-${scope.rootId ?? "bu"}-${definition.id}`;
    const scoped = scopeSandboxImport(definition, scope, id);
    if (scoped) plans.push(scoped);
  }
  return plans;
}

function upsert(catalog: readonly ScenarioDefinition[], next: ScenarioDefinition): ScenarioDefinition[] {
  const index = catalog.findIndex((item) => item.id === next.id);
  if (index === -1) return [...catalog, next];
  return catalog.map((item) => (item.id === next.id ? next : item));
}

function refuse(notice: string, focusId?: string): ScenarioWrite {
  return focusId ? { ok: false, notice, focusId } : { ok: false, notice };
}

function accept(catalog: readonly ScenarioDefinition[], next: ScenarioDefinition, scope: WriteScope, focusId: string, notice: string): ScenarioWrite {
  if (!scenarioFitsScope(next, scope.allowed, scope.names, scope.companyWide)) return refuse("无权查看", focusId);
  return { ok: true, catalog: upsert(catalog, next), changed: next, removedId: null, focusId, notice };
}

function quarterOf(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 2;
}

export function executeScenarioCommand(
  catalog: readonly ScenarioDefinition[],
  visible: readonly ScenarioDefinition[],
  scope: WriteScope,
  command: ScenarioCommand,
): ScenarioWrite {
  if (command.type === "create") {
    const name = command.name.trim();
    if (!name) return refuse("场景需要一个名称");
    const seed = catalog.find((item) => item.id === "jz") ?? presetScenarios()[0];
    const ratio = scope.companyWide ? seed.ratio : (DEMO_AI_RATIO[scope.rootId ?? ""] ?? "未拆解");
    const definition: ScenarioDefinition = {
      id: command.id,
      name,
      source: "copy",
      compared: visible.filter((item) => item.compared).length < 3,
      assumptions: { ...seed.assumptions },
      assumptionOrigin: "od",
      hires: [],
      agents: [],
      extraAgentOneOff: [],
      cuts: [],
      ratio,
      ratioNote: ratio === "未拆解" ? "沙盘尚未拆解" : seed.ratioNote,
      structureNote: null,
      spanAlert: null,
    };
    return accept(catalog, definition, scope, definition.id, `已新建${definition.name}`);
  }

  if (command.type === "copy") {
    const copy = copyScenario([...visible], command.sourceId, command.id);
    if (!copy) return refuse("无权查看");
    return accept(catalog, copy, scope, copy.id, `已复制为${copy.name}`);
  }

  if (command.type === "rename") {
    const name = command.name.trim();
    if (!name) return refuse("场景需要一个名称", command.id);
    if (LOCKED_IDS.has(command.id)) return refuse("这个场景不能改名", command.id);
    const current = visible.find((item) => item.id === command.id);
    if (!current) return refuse("无权查看");
    return accept(catalog, { ...current, name }, scope, command.id, `已改名为${name}`);
  }

  if (command.type === "toggle") {
    const next = setCompared([...visible], command.id, command.compared);
    if (next.error) return refuse(next.error, command.id);
    const updated = next.definitions.find((item) => item.id === command.id);
    if (!updated) return refuse("无权查看");
    return accept(catalog, updated, scope, command.id, updated.compared ? `${updated.name}已加入对比` : `${updated.name}已移出对比`);
  }

  if (command.type === "assumptions") {
    const current = visible.find((item) => item.id === command.id);
    if (!current) return refuse("无权查看");
    if (![command.attrition, command.cycle, command.raise].every((value) => Number.isFinite(value)) || (command.ai != null && !Number.isFinite(command.ai))) {
      return refuse("假设没有写成数字", command.id);
    }
    const assumptions: ScenarioAssumptions = defaultAssumptions({
      attritionRate: command.attrition / 100,
      hiringCycleDays: Math.round(command.cycle),
      raiseRate: command.raise / 100,
      aiReplacement: command.ai == null ? null : command.ai / 100,
      noticePay: command.noticePay,
    });
    return accept(catalog, { ...current, assumptions, assumptionOrigin: "od" }, scope, command.id, "假设已保存");
  }

  if (command.type === "change") {
    const current = visible.find((item) => item.id === command.id);
    if (!current) return refuse("无权查看");
    if (!Number.isInteger(command.count) || command.count <= 0) return refuse("人数要写成正整数", command.id);
    const effectiveDate = quarterDate(quarterOf(command.quarter));
    const next: ScenarioDefinition = { ...current, hires: [...current.hires], agents: [...current.agents], cuts: [...current.cuts] };
    if (command.kind === "hire") {
      next.hires.push({ departmentName: command.department, grade: command.grade, count: command.count, effectiveDate });
    } else if (command.kind === "agent") {
      const departmentName = command.department.trim();
      if (!departmentName) return refuse(`Agent「${command.agentName || "新增 Agent"}」缺少所属部门`, command.id);
      if (!Number.isFinite(command.monthly) || !Number.isFinite(command.oneOff)) return refuse("Agent 费用没有写成数字", command.id);
      next.agents.push({
        name: command.agentName || "新增 Agent",
        count: command.count,
        monthly: command.monthly,
        effectiveDate,
        oneOff: command.oneOff,
        departmentName,
      });
    } else if (command.kind === "cut") {
      if (command.mark !== "N" && command.mark !== "N+1" && command.mark !== "不计") return refuse("补偿口径不对", command.id);
      if (!Number.isFinite(command.tenure)) return refuse("平均司龄没有写成数字", command.id);
      next.cuts.push({
        departmentName: command.department,
        grade: command.grade,
        count: command.count,
        effectiveDate,
        mark: command.mark,
        tenureYears: command.tenure,
        groupSize: command.count,
      });
    } else return refuse("变动类型不对", command.id);
    return accept(catalog, next, scope, command.id, "这一季的变动已记入场景");
  }

  if (command.type === "import") {
    const imported = scopeSandboxImport(command.definition, scope, command.id);
    if (!imported) return refuse("无权查看");
    const others = visible.filter((item) => item.compared && item.id !== imported.id).length;
    const next = { ...imported, compared: others >= 3 ? false : imported.compared };
    return accept(catalog, next, scope, next.id, `已导入${next.name}。${next.structureNote ?? ""} 人 : AI ${next.ratio}。花名册没有写入。`);
  }

  const current = visible.find((item) => item.id === command.id);
  if (!current || !canDeleteScenario(current)) return refuse("这个场景不能删除", command.id);
  if (!scenarioFitsScope(current, scope.allowed, scope.names, scope.companyWide)) return refuse("无权查看");
  return {
    ok: true,
    catalog: catalog.filter((item) => item.id !== current.id),
    changed: null,
    removedId: current.id,
    focusId: current.id,
    notice: `已删除${current.name}`,
  };
}
