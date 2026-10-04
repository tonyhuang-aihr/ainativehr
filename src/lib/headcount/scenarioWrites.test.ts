import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/headcount/db/client";
import { loadScenarioDefinitions, saveScenarioDefinition } from "@/lib/headcount/db/scenarios";
import { seedSample } from "@/lib/headcount/db/seed";
import { usesEphemeralDb } from "@/lib/headcount/env";
import { computePlan } from "@/lib/headcount/engine";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { DEPT, samplePlan } from "@/lib/headcount/sample";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { presetScenarios, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { packScenarioCookie, ScenarioStateTooLarge, unpackScenarioCookie } from "@/lib/headcount/scenarioCookieCodec";
import { COOKIE_CHUNK_CHARS, decodeCookieChunks, encodeCookieChunks, MAX_COOKIE_CHUNKS, mergeScenarioState, parseScenarioEnvelope, scenarioDelta, serializeEnvelope } from "@/lib/headcount/scenarioState";
import { executeScenarioCommand, scopeSandboxImport, visibleScenarioCatalog, type ScenarioCommand, type ScenarioWrite, type WriteScope } from "@/lib/headcount/scenarioWrites";

const result = computePlan(samplePlan());
const names = result.plan.departments.map((department) => department.name);

function scopeFor(companyWide: boolean, rootId: string | null, rootName: string | null, allowed: string[]): WriteScope {
  return { companyWide, allowed: new Set(allowed), names, rootId, rootName, result };
}

const linScope = scopeFor(false, DEPT.prod1, "产品研发一部", ["产品研发一部"]);
const companyScope = scopeFor(true, "rd", "研发中心", names);

function browserJar() {
  let records: ScenarioDefinition[] = [];
  return {
    load() {
      return mergeScenarioState(presetScenarios(), records);
    },
    save(catalog: readonly ScenarioDefinition[]) {
      records = scenarioDelta(presetScenarios(), catalog);
    },
    records() {
      return records;
    },
  };
}

function apply(jar: ReturnType<typeof browserJar>, scope: WriteScope, command: ScenarioCommand): ScenarioWrite {
  const catalog = jar.load();
  const visible = visibleScenarioCatalog(catalog, scope);
  const outcome = executeScenarioCommand(catalog, visible, scope, command);
  if (outcome.ok) jar.save(outcome.catalog);
  return outcome;
}

function change(id: string, department: string, kind = "hire"): ScenarioCommand {
  return {
    type: "change",
    id,
    kind,
    count: 1,
    quarter: 2,
    department,
    grade: "P6",
    agentName: "一部 Agent",
    monthly: 1000,
    oneOff: 0,
    mark: "N",
    tenure: 2,
  };
}

describe("演示模式的场景差量可以跨实例重放", () => {
  it("cookie 分片能还原中文场景", () => {
    const envelope = { userId: "lin", scopeKey: DEPT.prod1, scenarios: presetScenarios().slice(0, 1) };
    const json = serializeEnvelope(envelope);
    const restored = parseScenarioEnvelope(decodeCookieChunks(encodeCookieChunks(json)), "lin", DEPT.prod1);
    expect(restored.map((item) => item.name)).toEqual(["基准"]);
    expect(parseScenarioEnvelope(json, "huang", DEPT.prod1)).toEqual([]);
  });

  it("五份用户场景、二十笔变动和一份导入方案时，每片 cookie 仍低于 4KB", () => {
    let catalog = presetScenarios();
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const outcome = executeScenarioCommand(catalog, visibleScenarioCatalog(catalog, linScope), linScope, { type: "create", name: `用户方案${index + 1}`, id: `copy-user-${index}` });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      catalog = outcome.catalog;
      ids.push(outcome.focusId);
    }
    for (let index = 0; index < 20; index += 1) {
      const kind = (["hire", "agent", "cut"] as const)[index % 3];
      const command: ScenarioCommand = {
        type: "change",
        id: ids[index % ids.length],
        kind,
        count: 1 + (index % 3),
        quarter: ((index % 4) + 1) as 1 | 2 | 3 | 4,
        department: "产品研发一部",
        grade: "P6",
        agentName: `一部 Agent ${index}`,
        monthly: 2000,
        oneOff: 10000,
        mark: "N",
        tenure: 3.5,
      };
      const outcome = executeScenarioCommand(catalog, visibleScenarioCatalog(catalog, linScope), linScope, command);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) catalog = outcome.catalog;
    }
    const imported = scopeSandboxImport(scenarioFromSandbox(buildRdCenterWorkspace(), 2), linScope, "sandbox-prod1-sample");
    expect(imported).not.toBeNull();
    const saved = executeScenarioCommand(catalog, visibleScenarioCatalog(catalog, linScope), linScope, { type: "import", definition: imported!, id: "sandbox-prod1-sample" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const json = serializeEnvelope({ userId: "lin", scopeKey: DEPT.prod1, scenarios: scenarioDelta(presetScenarios(), saved.catalog) });
    const chunks = packScenarioCookie(json);
    const attributes = "; Path=/; Expires=Tue, 03 Nov 2026 15:38:53 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax";
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(4);
    expect(chunks.join("").startsWith("gz.")).toBe(false);
    for (const [index, value] of chunks.entries()) {
      expect(Buffer.byteLength(`hcstate.${index}=${value}${attributes}`)).toBeLessThanOrEqual(4096);
    }
    expect(Buffer.byteLength(`hcstate.15=${"a".repeat(COOKIE_CHUNK_CHARS)}${attributes}`)).toBeLessThanOrEqual(4096);
    const restored = parseScenarioEnvelope(unpackScenarioCookie(chunks), "lin", DEPT.prod1);
    expect(restored.filter((item) => item.source === "copy")).toHaveLength(5);
    expect(restored.reduce((sum, item) => sum + item.hires.length + item.agents.length + item.cuts.length, 0)).toBeGreaterThanOrEqual(20);
    const bulky = JSON.stringify({ note: "方案".repeat(20_000) });
    const compressed = packScenarioCookie(bulky);
    expect(compressed.join("").startsWith("gz.")).toBe(true);
    expect(compressed.length).toBeLessThanOrEqual(MAX_COOKIE_CHUNKS);
    expect(unpackScenarioCookie(compressed)).toBe(bulky);
    expect(() => packScenarioCookie(JSON.stringify({ blob: randomBytes(800_000).toString("base64") }))).toThrow(ScenarioStateTooLarge);
    expect(decodeCookieChunks(encodeCookieChunks("[]"))).toBe("[]");
  });

  it("有数据库时不走浏览器，没有数据库时两台实例共用同一份差量", () => {
    expect(usesEphemeralDb({ APP_ENV: "demo" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(usesEphemeralDb({ APP_ENV: "demo", DATABASE_URL: "postgres://db" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    const jar = browserJar();
    const created = apply(jar, companyScope, { type: "create", name: "临时场景", id: "copy-1" });
    expect(created.ok).toBe(true);
    const otherInstance = mergeScenarioState(presetScenarios(), jar.records());
    expect(otherInstance.some((item) => item.id === "copy-1")).toBe(true);
    expect(mergeScenarioState(presetScenarios(), []).some((item) => item.id === "copy-1")).toBe(false);
    const toggled = apply(jar, companyScope, { type: "toggle", id: "jz", compared: false });
    expect(toggled.ok).toBe(true);
    expect(mergeScenarioState(presetScenarios(), jar.records()).find((item) => item.id === "jz")?.compared).toBe(false);
    expect(presetScenarios().find((item) => item.id === "jz")?.compared).toBe(true);
  });
});

describe("HRBP 在事业部内写入", () => {
  const jar = browserJar();

  it("新建、复制、记入变动、改假设、导入沙盘都留在一部，范围外的变动被拒绝", () => {
    const created = apply(jar, linScope, { type: "create", name: "一部草案", id: "copy-lin" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.changed?.ratio).toBe("未拆解");
    expect(created.changed?.structureNote).toBeNull();

    for (const id of ["bu-prod1-jz", "bu-prod1-jj", "bu-prod1-bs", "copy-lin"]) {
      const recorded = apply(jar, linScope, change(id, "产品研发一部"));
      expect(recorded.ok, id).toBe(true);
      if (recorded.ok) expect(recorded.changed?.hires.some((hire) => hire.departmentName === "产品研发一部")).toBe(true);
    }

    const copied = apply(jar, linScope, { type: "copy", sourceId: "bu-prod1-jz", id: "copy-jz" });
    expect(copied.ok).toBe(true);

    const assumptions = apply(jar, linScope, {
      type: "assumptions",
      id: "bu-prod1-bs",
      attrition: 9,
      cycle: 90,
      raise: 0,
      ai: null,
      noticePay: false,
    });
    expect(assumptions.ok).toBe(true);

    const imported = apply(jar, linScope, { type: "import", definition: scenarioFromSandbox(buildRdCenterWorkspace(), 2), id: "sandbox-prod1-1" });
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.changed?.id).toBe("sandbox-prod1-1");
      expect(imported.changed?.id).not.toBe("fa");
      expect(imported.changed?.agents.every((agent) => agent.departmentName === "产品研发一部")).toBe(true);
      expect(imported.changed?.structureNote ?? "").not.toContain("数据智能部");
      expect(JSON.stringify(imported.changed)).not.toContain("16,095.5");
    }

    const denied = apply(jar, linScope, change("copy-lin", "质量与交付部"));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.notice).toBe("无权查看");

    const reloaded = visibleScenarioCatalog(jar.load(), linScope);
    expect(reloaded.some((item) => item.id === "copy-lin")).toBe(true);
    expect(reloaded.find((item) => item.id === "bu-prod1-bs")?.assumptions.attritionRate).toBe(0.09);
    expect(reloaded.find((item) => item.id === "bu-prod1-jz")?.hires.some((hire) => hire.departmentName === "产品研发一部" && hire.count === 1)).toBe(true);
    expect(reloaded.some((item) => item.id === "sandbox-prod1-1")).toBe(true);
    expect(reloaded.find((item) => item.id === "copy-lin")?.hires.every((hire) => hire.departmentName === "产品研发一部")).toBe(true);

    const removed = apply(jar, linScope, { type: "delete", id: "copy-lin" });
    expect(removed.ok).toBe(true);
    expect(visibleScenarioCatalog(jar.load(), linScope).some((item) => item.id === "copy-lin")).toBe(false);
    const locked = apply(jar, linScope, { type: "delete", id: "bu-prod1-jz" });
    expect(locked.ok).toBe(false);
  });

  it("公司口径的示例方案仍保持原编号", () => {
    const jar = browserJar();
    const imported = apply(jar, companyScope, { type: "import", definition: scenarioFromSandbox(buildRdCenterWorkspace(), 2), id: "fa" });
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.changed?.id).toBe("fa");
  });

  it("数据库模式下写入留在库里，空的浏览器差量看不到", async () => {
    const db = await createMemoryDb();
    await seedSample(db);
    const definition = {
      ...presetScenarios()[0],
      id: "copy-db",
      name: "库里的场景",
      source: "copy" as const,
      hires: [],
      agents: [],
      cuts: [],
      structureNote: null,
      spanAlert: null,
    };
    await saveScenarioDefinition(db, definition);
    const stored = await loadScenarioDefinitions(db);
    expect(stored.some((item) => item.id === "copy-db")).toBe(true);
    expect(mergeScenarioState(presetScenarios(), []).some((item) => item.id === "copy-db")).toBe(false);
  });
});
