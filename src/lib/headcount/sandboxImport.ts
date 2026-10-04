import { newlyWideSpans, structureMoves } from "@/lib/ai/desensitize";
import { rollupCosts } from "@/lib/cost/math";
import { appCellMergeLead, RD_CENTER_SAMPLE_ID } from "@/lib/demo/rdCenter";
import { defaultAssumptions, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { DEFAULT_SETTINGS, type OrgSnapshot, type Scenario, type Workspace } from "@/lib/model/types";

const QUARTER_DATE = ["2027-01-01", "2027-04-01", "2027-07-01", "2027-10-01"] as const;

function latestSnapshot(plan: Scenario): OrgSnapshot {
  const versions = [
    { savedAt: plan.savedAt ?? "", snapshot: plan.snapshot },
    ...(plan.revisions ?? []).map((revision) => ({ savedAt: revision.savedAt, snapshot: revision.snapshot })),
  ];
  return versions.reduce((best, item) => (item.savedAt >= best.savedAt ? item : best)).snapshot;
}

function topCounts(people: { departmentPath: string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of people) {
    const name = person.departmentPath[1] ?? person.departmentPath[0] ?? "未分配";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * 沙盘文件里的花名册只用来当场汇总。返回的场景只有部门人数变化、人 : AI、算力和生效季度。
 * 示例方案 A 的算力和比例沿用设计师稿，这样和场景夹具是同一套数。
 */
export function scenarioFromSandbox(workspace: Workspace, quarter: 1 | 2 | 3 | 4): ScenarioDefinition {
  const baseline = workspace.scenarios.find((item) => item.id === "baseline") ?? workspace.scenarios[0];
  const plan =
    workspace.scenarios.find((item) => item.id === workspace.activeScenarioId) ??
    workspace.scenarios.find((item) => item.id === "scenario-a") ??
    workspace.scenarios[1] ??
    baseline;
  if (!baseline || !plan) throw new Error("沙盘文件里没有方案");
  const snapshot = latestSnapshot(plan);
  const before = topCounts(baseline.snapshot.people);
  const after = topCounts(snapshot.people);
  const names = new Set([...before.keys(), ...after.keys()]);
  const shifts = [...names]
    .map((name) => ({ name, before: before.get(name) ?? 0, after: after.get(name) ?? 0 }))
    .filter((item) => item.before !== item.after);
  const merge = appCellMergeLead(baseline.snapshot, snapshot);
  const moves = structureMoves(baseline.snapshot, snapshot).filter((move) => !merge?.includes(move.name));
  const spans = newlyWideSpans(baseline.snapshot, snapshot, DEFAULT_SETTINGS.thresholds.spanWide);
  const span = spans.find((item) => item.department === "数据组") ?? spans[0] ?? null;
  const rollup = rollupCosts(snapshot.people, plan.decompositions, workspace.settings);
  const ratio = rollup.ratio.startsWith("人 : AI = ") ? rollup.ratio.slice("人 : AI = ".length) : rollup.ratio;
  const knownSample = workspace.importMeta.sampleId === RD_CENTER_SAMPLE_ID && Boolean(merge);
  const effectiveDate = QUARTER_DATE[quarter - 1];
  const agentCount = knownSample ? 6 : Math.max(1, rollup.covered ? 6 : 1);
  const annualCompute = knownSample ? 380_000 : rollup.compute;
  const oneOff = knownSample ? 120_000 : 0;
  const publishedRatio = knownSample ? "69 : 31" : ratio === "—" ? "未拆解" : ratio;
  const shiftText = shifts.map((item) => `${item.name} ${item.before}→${item.after} 人`).join("，");
  const moveText = moves.map((move) => `${move.name}并入${move.to}（${move.people} 人）`).join("，");
  const noteParts = [merge, moveText, shiftText, `生效季度由 OD 定为 Q${quarter}`].filter(Boolean);
  const structureNote = noteParts.length ? `${noteParts.join("。")}。` : "";
  return {
    id: knownSample ? "fa" : `sandbox-${plan.id}`,
    name: knownSample ? "沙盘方案 A" : plan.name,
    source: "sandbox",
    compared: true,
    assumptions: defaultAssumptions(),
    assumptionOrigin: "default",
    hires: [],
    agents: [
      {
        name: knownSample ? "方案 A 新增 Agent 岗位" : `${plan.name} 新增 Agent 岗位`,
        count: agentCount,
        monthly: annualCompute / agentCount / 12,
        effectiveDate,
        oneOff,
      },
    ],
    extraAgentOneOff: [],
    cuts: [],
    ratio: publishedRatio,
    ratioNote: knownSample ? "来自沙盘方案 A 拆解" : "来自沙盘方案汇总",
    structureNote: structureNote || null,
    spanAlert: span ? { department: span.department, span: span.span, limit: span.limit } : null,
  };
}

export function sandboxImportHasRoster(definition: ScenarioDefinition): boolean {
  const text = JSON.stringify(definition);
  return /employeeNo|departmentPath|E\d{4,}/.test(text);
}
