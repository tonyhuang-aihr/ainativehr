import { presetScenarios, type ScenarioDefinition } from "@/lib/headcount/scenario";

export const DEMO_SANDBOX_CAPTION = "演示模式：刷新后沙盘方案从本机浏览器恢复";

export type SandboxEnvelope = {
  userId: string;
  scopeKey: string;
  plans: ScenarioDefinition[];
};

export function sandboxStorageKey(userId: string, scopeKey: string): string {
  return `ainativehr.headcountSandbox.v1:${userId}:${scopeKey}`;
}

export function scopeStorageKey(companyWide: boolean, visibleIds: readonly string[]): string {
  if (companyWide) return "company";
  return [...visibleIds].sort().join(",");
}

export function sameScenarioDefinition(left: ScenarioDefinition, right: ScenarioDefinition): boolean {
  return canonicalDefinition(left) === canonicalDefinition(right);
}

export function isSeedSandboxPreset(definition: ScenarioDefinition): boolean {
  const seed = presetScenarios().find((item) => item.id === "fa");
  return Boolean(seed && sameScenarioDefinition(definition, seed));
}

/** 服务端丢掉用户载入的方案时恢复；服务端已有更新的载入方案时改记服务端这份。 */
export function sandboxSyncPlan(
  stored: ScenarioDefinition[],
  server: ScenarioDefinition[],
): { restore: ScenarioDefinition[]; remember: ScenarioDefinition[] } {
  const serverSandbox = server.filter((item) => item.source === "sandbox");
  const serverById = new Map(serverSandbox.map((item) => [item.id, item]));
  const restore: ScenarioDefinition[] = [];
  const remember: ScenarioDefinition[] = [];
  const seen = new Set<string>();
  for (const plan of stored) {
    if (!isUserSandbox(plan) || seen.has(plan.id)) continue;
    seen.add(plan.id);
    const current = serverById.get(plan.id);
    if (!current || isSeedSandboxPreset(current)) {
      restore.push(plan);
      continue;
    }
    if (!sameScenarioDefinition(current, plan)) remember.push(current);
  }
  for (const plan of serverSandbox) {
    if (!isUserSandbox(plan) || seen.has(plan.id)) continue;
    remember.push(plan);
  }
  return { restore, remember };
}

export function mergeRemembered(stored: ScenarioDefinition[], remember: ScenarioDefinition[]): ScenarioDefinition[] {
  const next = stored.filter(isUserSandbox);
  for (const plan of remember) {
    if (!isUserSandbox(plan)) continue;
    const index = next.findIndex((item) => item.id === plan.id);
    if (index === -1) next.push(plan);
    else next[index] = plan;
  }
  return next;
}

export function readSandboxPlans(storage: Storage | null, userId: string, scopeKey: string): ScenarioDefinition[] {
  if (!storage) return [];
  const raw = storage.getItem(sandboxStorageKey(userId, scopeKey));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SandboxEnvelope;
    if (!parsed || parsed.userId !== userId || parsed.scopeKey !== scopeKey || !Array.isArray(parsed.plans)) return [];
    return parsed.plans.filter(isUserSandbox);
  } catch {
    return [];
  }
}

export function writeSandboxPlans(storage: Storage | null, userId: string, scopeKey: string, plans: ScenarioDefinition[]): void {
  if (!storage) return;
  const key = sandboxStorageKey(userId, scopeKey);
  const kept = plans.filter(isUserSandbox);
  if (!kept.length) {
    storage.removeItem(key);
    return;
  }
  const envelope: SandboxEnvelope = { userId, scopeKey, plans: kept };
  storage.setItem(key, JSON.stringify(envelope));
}

export function dropSandboxPlans(storage: Storage | null, userId: string, scopeKey: string, ids: readonly string[]): void {
  const rejected = new Set(ids);
  writeSandboxPlans(
    storage,
    userId,
    scopeKey,
    readSandboxPlans(storage, userId, scopeKey).filter((plan) => !rejected.has(plan.id)),
  );
}

function isUserSandbox(definition: ScenarioDefinition): boolean {
  return Boolean(
    definition &&
      definition.source === "sandbox" &&
      typeof definition.id === "string" &&
      definition.assumptions &&
      Array.isArray(definition.hires) &&
      Array.isArray(definition.agents) &&
      Array.isArray(definition.cuts) &&
      Array.isArray(definition.extraAgentOneOff) &&
      !isSeedSandboxPreset(definition),
  );
}

function canonicalDefinition(definition: ScenarioDefinition): string {
  const copy: ScenarioDefinition = {
    id: definition.id,
    name: definition.name,
    source: definition.source,
    compared: definition.compared,
    assumptions: {
      attritionRate: definition.assumptions.attritionRate,
      hiringCycleDays: definition.assumptions.hiringCycleDays,
      raiseRate: definition.assumptions.raiseRate,
      aiReplacement: definition.assumptions.aiReplacement,
      noticePay: definition.assumptions.noticePay,
    },
    assumptionOrigin: definition.assumptionOrigin,
    hires: definition.hires.map((hire) => ({
      departmentName: hire.departmentName,
      grade: hire.grade,
      count: hire.count,
      effectiveDate: hire.effectiveDate,
    })),
    agents: definition.agents.map((agent) => ({
      name: agent.name,
      count: agent.count,
      monthly: agent.monthly,
      effectiveDate: agent.effectiveDate,
      oneOff: agent.oneOff,
    })),
    extraAgentOneOff: definition.extraAgentOneOff.map((item) => ({ effectiveDate: item.effectiveDate, amount: item.amount })),
    cuts: definition.cuts.map((cut) => ({
      departmentName: cut.departmentName,
      grade: cut.grade,
      count: cut.count,
      effectiveDate: cut.effectiveDate,
      mark: cut.mark,
      tenureYears: cut.tenureYears,
      groupSize: cut.groupSize,
    })),
    ratio: definition.ratio,
    ratioNote: definition.ratioNote,
    structureNote: definition.structureNote,
    spanAlert: definition.spanAlert
      ? { department: definition.spanAlert.department, span: definition.spanAlert.span, limit: definition.spanAlert.limit }
      : null,
  };
  return JSON.stringify(copy);
}
