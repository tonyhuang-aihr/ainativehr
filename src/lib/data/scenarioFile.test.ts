import { describe, expect, it } from "vitest";
import { parseScenarioFile, serializeScenarioFile } from "@/lib/data/scenarioFile";
import { DEFAULT_SETTINGS, type Workspace } from "@/lib/model/types";

function workspace(): Workspace {
  return {
    version: 1,
    scenarios: [
      {
        id: "base",
        name: "基线",
        kind: "baseline",
        snapshot: { people: [], departments: [] },
        decompositions: {},
        ignoredCodes: [],
      },
    ],
    activeScenarioId: "base",
    settings: DEFAULT_SETTINGS,
    templates: {},
    importMeta: {
      filename: "花名册.xlsx",
      importedAt: "2026-10-02T00:00:00.000Z",
      sampleId: null,
      sampleLabel: null,
      sheetName: "花名册",
      peopleCount: 0,
      departmentCount: 0,
      aiMode: "offline",
    },
    audit: [],
    collab: null,
  };
}

describe("场景文件", () => {
  it("导出后再导入得到同一份工作区", () => {
    const original = workspace();
    const text = serializeScenarioFile(original, "2026-10-02T00:00:00.000Z");
    expect(text).toContain("ainativehr.scenario");
    expect(parseScenarioFile(text)).toEqual(original);
  });

  it("拒绝不是本沙盘导出的 JSON", () => {
    expect(parseScenarioFile("[]")).toBeNull();
    expect(parseScenarioFile(JSON.stringify({ version: 1, scenarios: [] }))).toBeNull();
    expect(parseScenarioFile("{")).toBeNull();
  });
});
