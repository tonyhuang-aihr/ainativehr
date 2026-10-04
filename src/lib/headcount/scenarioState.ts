import { sameScenarioDefinition } from "@/lib/headcount/sandboxMemory";
import { normalizeScenarioDefinition, type ScenarioDefinition } from "@/lib/headcount/scenario";
import { scenarioFitsScope } from "@/lib/headcount/scopeGuard";

export const SCENARIO_STATE_STORAGE_PREFIX = "ainativehr.headcountState.v1";
export const SCENARIO_STATE_COOKIE = "hcstate";
/** 单片值的长度。加上名字和属性后仍低于浏览器约 4KB 的单条 cookie 上限。 */
export const COOKIE_CHUNK_CHARS = 2800;
export const MAX_COOKIE_CHUNKS = 16;

export type ScenarioEnvelope = {
  userId: string;
  scopeKey: string;
  scenarios: ScenarioDefinition[];
};

export type ScenarioScopeCheck = {
  companyWide: boolean;
  allowed: ReadonlySet<string>;
  names: readonly string[];
};

export function scenarioStateStorageKey(userId: string, scopeKey: string): string {
  return `${SCENARIO_STATE_STORAGE_PREFIX}:${userId}:${scopeKey}`;
}

/** 种子里没有、或和种子不一样的场景。演示模式只把这份差量放进浏览器。 */
export function scenarioDelta(seed: readonly ScenarioDefinition[], catalog: readonly ScenarioDefinition[]): ScenarioDefinition[] {
  const seedById = new Map(seed.map((item) => [item.id, item]));
  return catalog.filter((item) => {
    const base = seedById.get(item.id);
    return !base || !sameScenarioDefinition(base, item);
  });
}

export function mergeScenarioState(seed: readonly ScenarioDefinition[], stored: readonly ScenarioDefinition[]): ScenarioDefinition[] {
  const storedById = new Map(stored.map((item) => [item.id, item]));
  const merged = seed.map((item) => storedById.get(item.id) ?? item);
  const extras = stored.filter((item) => !seed.some((base) => base.id === item.id));
  return [...merged, ...extras];
}

export function acceptStoredScenarios(stored: readonly ScenarioDefinition[], scope: ScenarioScopeCheck): ScenarioDefinition[] {
  return stored.filter((item) => scenarioFitsScope(item, scope.allowed, scope.names, scope.companyWide));
}

export function splitCookieValue(value: string): string[] {
  if (!value) return [];
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += COOKIE_CHUNK_CHARS) chunks.push(value.slice(index, index + COOKIE_CHUNK_CHARS));
  return chunks;
}

export function encodeCookieChunks(json: string): string[] {
  return splitCookieValue(Buffer.from(json, "utf8").toString("base64url"));
}

export function decodeCookieChunks(chunks: readonly string[]): string {
  if (!chunks.length) return "";
  return Buffer.from(chunks.join(""), "base64url").toString("utf8");
}

export function serializeEnvelope(envelope: ScenarioEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseScenarioEnvelope(json: string, userId: string, scopeKey: string): ScenarioDefinition[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as ScenarioEnvelope;
    if (!parsed || parsed.userId !== userId || parsed.scopeKey !== scopeKey || !Array.isArray(parsed.scenarios)) return [];
    return parsed.scenarios.flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.assumptions) return [];
      if (!Array.isArray(item.hires) || !Array.isArray(item.agents) || !Array.isArray(item.cuts)) return [];
      return [normalizeScenarioDefinition(item)];
    });
  } catch {
    return [];
  }
}

/** null 表示这台浏览器还没记过。空数组表示记过、而且当前没有用户改动。 */
export function readScenarioState(storage: Storage | null, userId: string, scopeKey: string): ScenarioDefinition[] | null {
  if (!storage) return null;
  const raw = storage.getItem(scenarioStateStorageKey(userId, scopeKey));
  if (raw == null) return null;
  return parseScenarioEnvelope(raw, userId, scopeKey);
}

export function writeScenarioState(storage: Storage | null, userId: string, scopeKey: string, scenarios: ScenarioDefinition[]): void {
  if (!storage) return;
  const envelope: ScenarioEnvelope = { userId, scopeKey, scenarios };
  storage.setItem(scenarioStateStorageKey(userId, scopeKey), serializeEnvelope(envelope));
}
