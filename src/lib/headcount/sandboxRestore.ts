import { visibleDepartmentIds, type HeadcountUser } from "@/lib/headcount/authz";
import type { AppDatabase } from "@/lib/headcount/db/client";
import { recordOperation } from "@/lib/headcount/db/mutate";
import { loadClosure, loadDepartments } from "@/lib/headcount/db/queries";
import { loadScenarioDefinitions, parseDefinition, saveScenarioDefinition } from "@/lib/headcount/db/scenarios";
import { isSeedSandboxPreset, sameScenarioDefinition } from "@/lib/headcount/sandboxMemory";
import { scenarioFitsScope, seesCompany } from "@/lib/headcount/scopeGuard";
import { COMPARISON_CAP } from "@/lib/headcount/scenarioView";

function planId(raw: unknown): string {
  if (!raw || typeof raw !== "object" || !("id" in raw) || typeof raw.id !== "string") return "";
  return raw.id;
}

/**
 * 把浏览器里的沙盘方案写回当前进程。范围检查和导入时同一套：
 * 公司示例方案不会进 HRBP 的事业部，别人的方案也不会因为 id 撞上就覆盖。
 */
export async function applyLocalSandboxRestore(
  db: AppDatabase,
  user: HeadcountUser & { name: string },
  plans: unknown[],
): Promise<{ restoredIds: string[]; rejectedIds: string[] }> {
  const departments = await loadDepartments(db);
  const closure = await loadClosure(db);
  const visible = visibleDepartmentIds(user, departments, closure);
  const companyWide = seesCompany(user);
  const allowed = new Set(departments.filter((department) => visible.includes(department.id)).map((department) => department.name));
  const names = departments.map((department) => department.name);
  const existing = await loadScenarioDefinitions(db);
  const restoredIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const raw of plans) {
    const definition = parseDefinition(JSON.stringify(raw ?? null));
    if (!definition || definition.source !== "sandbox" || isSeedSandboxPreset(definition)) {
      const id = planId(raw);
      if (id) rejectedIds.push(id);
      continue;
    }
    if (!scenarioFitsScope(definition, allowed, names, companyWide)) {
      rejectedIds.push(definition.id);
      continue;
    }
    const current = existing.find((item) => item.id === definition.id);
    if (current && !isSeedSandboxPreset(current)) continue;
    if (current && sameScenarioDefinition(current, definition)) continue;
    const others = existing.filter((item) => item.compared && item.id !== definition.id).length;
    const next = { ...definition, compared: others >= COMPARISON_CAP ? false : definition.compared };
    await saveScenarioDefinition(db, next);
    const index = existing.findIndex((item) => item.id === next.id);
    if (index === -1) existing.push(next);
    else existing[index] = next;
    restoredIds.push(next.id);
  }

  if (restoredIds.length) await recordOperation(db, user.id, user.name, "恢复沙盘方案", restoredIds.join(","));
  return { restoredIds, rejectedIds };
}
