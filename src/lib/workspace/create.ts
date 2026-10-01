import { uid } from "@/lib/format";
import type { AppSettings, ImportMeta, OrgSnapshot, Scenario, Workspace } from "@/lib/model/types";
import { DEFAULT_SETTINGS } from "@/lib/model/types";

function copySnapshot(snapshot: OrgSnapshot): OrgSnapshot {
  return {
    people: snapshot.people.map((person) => ({ ...person, departmentPath: [...person.departmentPath] })),
    departments: snapshot.departments.map((department) => ({ ...department, path: [...department.path] })),
  };
}

export function createWorkspace(
  snapshot: OrgSnapshot,
  meta: ImportMeta,
  settings: AppSettings = DEFAULT_SETTINGS,
): Workspace {
  const baseline: Scenario = {
    id: "baseline",
    name: "基线",
    kind: "baseline",
    snapshot: copySnapshot(snapshot),
    decompositions: {},
    ignoredCodes: [],
  };
  const drafts: Scenario[] = ["方案 A", "方案 B", "方案 C"].map((name, index) => ({
    id: `scenario-${"abc"[index]}`,
    name,
    kind: "draft" as const,
    snapshot: copySnapshot(snapshot),
    decompositions: {},
    ignoredCodes: [],
  }));
  return {
    version: 1,
    scenarios: [baseline, ...drafts],
    activeScenarioId: baseline.id,
    settings: {
      ...settings,
      thresholds: { ...settings.thresholds },
    },
    templates: {},
    importMeta: meta,
    audit: [
      {
        id: uid("audit"),
        at: meta.importedAt,
        source: "user",
        label: "把导入的花名册保存为基线，并复制出方案 A / B / C",
      },
    ],
  };
}

export function activeScenario(workspace: Workspace): Scenario {
  return workspace.scenarios.find((scenario) => scenario.id === workspace.activeScenarioId) ?? workspace.scenarios[0];
}

export function baselineScenario(workspace: Workspace): Scenario {
  return workspace.scenarios.find((scenario) => scenario.kind === "baseline") ?? workspace.scenarios[0];
}

export function updateScenario(workspace: Workspace, scenarioId: string, recipe: (scenario: Scenario) => Scenario): Workspace {
  return {
    ...workspace,
    scenarios: workspace.scenarios.map((scenario) => (scenario.id === scenarioId ? recipe(scenario) : scenario)),
  };
}
