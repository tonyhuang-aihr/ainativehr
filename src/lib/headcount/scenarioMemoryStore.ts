import "server-only";

import type { HeadcountUser } from "@/lib/headcount/authz";
import { can } from "@/lib/headcount/authz";
import type { AppDatabase } from "@/lib/headcount/db/client";
import { scopeFor } from "@/lib/headcount/db/present";
import { loadPlan } from "@/lib/headcount/db/queries";
import { deleteScenarioDefinition, loadScenarioDefinitions, saveScenarioDefinition } from "@/lib/headcount/db/scenarios";
import { usesEphemeralDb } from "@/lib/headcount/env";
import { computePlan, type PlanResult } from "@/lib/headcount/engine";
import { presetScenarios, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { scopeStorageKey } from "@/lib/headcount/sandboxMemory";
import { readDemoEnvelope, writeDemoEnvelope } from "@/lib/headcount/scenarioCookies";
import { acceptStoredScenarios, mergeScenarioState, scenarioDelta } from "@/lib/headcount/scenarioState";
import { scopeRoots } from "@/lib/headcount/overview";
import { seesCompany } from "@/lib/headcount/scopeGuard";

export type ScenarioMemory = {
  mode: "browser" | "database";
  db: AppDatabase;
  userId: string;
  scopeKey: string;
  seed: ScenarioDefinition[];
  catalog: ScenarioDefinition[];
  companyWide: boolean;
  visibleIds: string[];
  departments: { id: string; name: string; parentId: string | null }[];
  allowed: Set<string>;
  names: string[];
  root: string | null;
  result: PlanResult;
  /** 浏览器里已经有一份明确的差量，包括「用户删光了」的空列表。没有 cookie 时才从 localStorage 补。 */
  cookieFound: boolean;
};

/**
 * 没有数据库时，目录 = 种子预设 + 浏览器带上来的差量。
 * 有数据库时，目录只来自数据库，不读浏览器。
 */
export async function openScenarioMemory(user: HeadcountUser): Promise<ScenarioMemory> {
  const scoped = await scopeFor(user);
  const companyWide = seesCompany(user);
  const allowed = new Set(scoped.departments.filter((department) => scoped.visible.includes(department.id)).map((department) => department.name));
  const names = scoped.departments.map((department) => department.name);
  const root = scopeRoots(scoped.departments, scoped.visible)[0] ?? null;
  const mathPlan = await loadPlan(scoped.db, { departmentIds: null, sensitive: can(user, "viewOneOff") });
  const result = computePlan(mathPlan);
  const scopeKey = scopeStorageKey(companyWide, scoped.visible);
  const base = {
    db: scoped.db,
    userId: user.id,
    scopeKey,
    companyWide,
    visibleIds: scoped.visible,
    departments: scoped.departments,
    allowed,
    names,
    root,
    result,
    cookieFound: false,
  };
  if (!usesEphemeralDb()) {
    const records = await loadScenarioDefinitions(scoped.db);
    return { ...base, mode: "database", seed: records, catalog: records };
  }
  const seed = presetScenarios();
  const demo = await readDemoEnvelope(user.id, scopeKey);
  const stored = acceptStoredScenarios(demo.scenarios, { companyWide, allowed, names });
  return { ...base, mode: "browser", seed, catalog: mergeScenarioState(seed, stored), cookieFound: demo.found };
}

export async function commitScenarioMemory(
  memory: ScenarioMemory,
  nextCatalog: readonly ScenarioDefinition[],
  changed: ScenarioDefinition | null,
  removedId: string | null,
): Promise<void> {
  if (memory.mode === "database") {
    if (removedId) await deleteScenarioDefinition(memory.db, removedId);
    else if (changed) await saveScenarioDefinition(memory.db, changed);
    return;
  }
  await writeDemoEnvelope({
    userId: memory.userId,
    scopeKey: memory.scopeKey,
    scenarios: scenarioDelta(memory.seed, nextCatalog),
  });
}
