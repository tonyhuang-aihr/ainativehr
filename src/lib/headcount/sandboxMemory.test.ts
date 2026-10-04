import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/headcount/db/client";
import { loadScenarioDefinitions } from "@/lib/headcount/db/scenarios";
import { seedSample } from "@/lib/headcount/db/seed";
import { usesEphemeralDb } from "@/lib/headcount/env";
import { computePlan } from "@/lib/headcount/engine";
import { formatWan } from "@/lib/headcount/money";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { evaluateScenario, presetScenarios } from "@/lib/headcount/scenario";
import {
  readSandboxPlans,
  sandboxStorageKey,
  sandboxSyncPlan,
  scopeStorageKey,
  writeSandboxPlans,
} from "@/lib/headcount/sandboxMemory";
import { applyLocalSandboxRestore } from "@/lib/headcount/sandboxRestore";
import { ScenarioMissing, selectScenariosForUser } from "@/lib/headcount/scopeGuard";
import { loadClosure, loadDepartments } from "@/lib/headcount/db/queries";
import { visibleDepartmentIds } from "@/lib/headcount/authz";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const huang = { id: "huang", name: "黄", role: "od" as const, departmentIds: [] as string[] };
const lin = { id: "lin", name: "林", role: "hrbp" as const, departmentIds: [DEPT.prod1] };

describe("沙盘方案留在浏览器", () => {
  it("按用户和范围分键，服务端回到预置时才恢复载入的方案", () => {
    const storage = new MemoryStorage();
    const seed = presetScenarios().find((item) => item.id === "fa")!;
    const loaded = scenarioFromSandbox(buildRdCenterWorkspace("2026-10-04T00:00:00.000Z"), 2);
    expect(scopeStorageKey(true, [])).toBe("company");
    expect(scopeStorageKey(false, ["b", "a"])).toBe("a,b");
    expect(sandboxStorageKey("huang", "company")).not.toBe(sandboxStorageKey("lin", DEPT.prod1));

    writeSandboxPlans(storage, "huang", "company", [loaded]);
    expect(readSandboxPlans(storage, "lin", "company")).toEqual([]);
    expect(readSandboxPlans(storage, "huang", DEPT.prod1)).toEqual([]);
    expect(readSandboxPlans(storage, "huang", "company").map((item) => item.name)).toEqual(["沙盘方案 A"]);

    const stored = readSandboxPlans(storage, "huang", "company");
    expect(sandboxSyncPlan(stored, [seed]).restore.map((item) => item.name)).toEqual(["沙盘方案 A"]);
    expect(sandboxSyncPlan(stored, [loaded]).restore).toEqual([]);
    expect(sandboxSyncPlan([], [loaded]).remember.map((item) => item.name)).toEqual(["沙盘方案 A"]);
    expect(sandboxSyncPlan([], [seed]).remember).toEqual([]);
    expect(sandboxSyncPlan(stored, [{ ...loaded, name: "沙盘方案 A · 已改" }]).remember.map((item) => item.name)).toEqual(["沙盘方案 A · 已改"]);
  });

  it("只有没有数据库的演示环境才从浏览器恢复", () => {
    const demo = { NODE_ENV: "test", APP_ENV: "demo" } as NodeJS.ProcessEnv;
    const demoDb = { NODE_ENV: "test", APP_ENV: "demo", DATABASE_URL: "postgres://local" } as NodeJS.ProcessEnv;
    const prod = { NODE_ENV: "test", APP_ENV: "prod" } as NodeJS.ProcessEnv;
    expect(usesEphemeralDb(demo)).toBe(true);
    expect(usesEphemeralDb(demoDb)).toBe(false);
    expect(usesEphemeralDb(prod)).toBe(false);
  });

  it("OD 的载入方案可以写回，HRBP 的公司方案被拒绝且不会进一部", async () => {
    const loaded = scenarioFromSandbox(buildRdCenterWorkspace("2026-10-04T00:00:00.000Z"), 2);
    const od = await createMemoryDb();
    await seedSample(od);
    const restored = await applyLocalSandboxRestore(od, huang, [loaded]);
    expect(restored.restoredIds).toEqual(["fa"]);
    const saved = await loadScenarioDefinitions(od);
    expect(saved.find((item) => item.id === "fa")?.name).toBe("沙盘方案 A");
    expect(formatWan(evaluateScenario(computePlan(samplePlan()), saved.find((item) => item.id === "fa")!).totalYuan)).toBe("15,945.0");
    expect(saved.filter((item) => item.id !== "fa").map((item) => item.name)).toEqual(["基准", "激进 · AI 加速", "保守"]);
    expect((await applyLocalSandboxRestore(od, huang, [loaded])).restoredIds).toEqual([]);

    const hr = await createMemoryDb();
    await seedSample(hr);
    const rejected = await applyLocalSandboxRestore(hr, lin, [loaded]);
    expect(rejected.rejectedIds).toEqual(["fa"]);
    expect(rejected.restoredIds).toEqual([]);
    expect((await loadScenarioDefinitions(hr)).find((item) => item.id === "fa")?.name).toBe("沙盘方案 A · 拆组前");

    const own = {
      ...presetScenarios()[0],
      id: "sandbox-lin",
      name: "一部沙盘",
      source: "sandbox" as const,
      hires: [{ departmentName: "产品研发一部", grade: "P6", count: 1, effectiveDate: "2027-04-01" }],
      agents: [],
      cuts: [],
      extraAgentOneOff: [],
      structureNote: null,
      spanAlert: null,
    };
    expect((await applyLocalSandboxRestore(hr, lin, [own])).restoredIds).toEqual(["sandbox-lin"]);
    const departments = await loadDepartments(hr);
    const visible = visibleDepartmentIds(lin, departments, await loadClosure(hr));
    expect(selectScenariosForUser(await loadScenarioDefinitions(hr), lin, departments, visible, null).definitions.map((item) => item.id)).toEqual(["sandbox-lin"]);
    const outside = { ...own, id: "sandbox-out", structureNote: "数据智能部 65→71 人。" };
    expect((await applyLocalSandboxRestore(hr, lin, [outside])).rejectedIds).toEqual(["sandbox-out"]);
    const after = await loadScenarioDefinitions(hr);
    expect(after.some((item) => item.id === "sandbox-out")).toBe(false);
    expect(() => selectScenariosForUser(after, lin, departments, visible, "sandbox-out")).toThrow(ScenarioMissing);
    expect(selectScenariosForUser(after, lin, departments, visible, null).definitions.map((item) => item.id)).toEqual(["sandbox-lin"]);
  }, 60_000);
});
