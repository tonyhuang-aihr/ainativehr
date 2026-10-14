import type { Workspace } from "@/lib/model/types";

export const SCENARIO_FILE_KIND = "ainativehr.scenario";

export type ScenarioFile = {
  kind: typeof SCENARIO_FILE_KIND;
  version: 1;
  exportedAt: string;
  workspace: Workspace;
};

export function serializeScenarioFile(workspace: Workspace, exportedAt = new Date().toISOString()): string {
  const file: ScenarioFile = {
    kind: SCENARIO_FILE_KIND,
    version: 1,
    exportedAt,
    workspace,
  };
  return JSON.stringify(file, null, 2);
}

export function parseScenarioFile(text: string): Workspace | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as { kind?: string; workspace?: Workspace };
  if (record.kind !== SCENARIO_FILE_KIND) return null;
  const workspace = record.workspace;
  if (!workspace || workspace.version !== 1 || !Array.isArray(workspace.scenarios) || workspace.scenarios.length === 0) return null;
  return { ...workspace, collab: workspace.collab ?? null, decisions: workspace.decisions ?? [] };
}
