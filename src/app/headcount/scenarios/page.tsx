import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { can } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
import { scopeFor } from "@/lib/headcount/db/present";
import { loadPlan } from "@/lib/headcount/db/queries";
import { loadScenarioDefinitions } from "@/lib/headcount/db/scenarios";
import { computePlan, subtreeIds } from "@/lib/headcount/engine";
import { usesEphemeralDb } from "@/lib/headcount/env";
import { modelConfigured } from "@/lib/headcount/modelClient";
import { scopeStorageKey } from "@/lib/headcount/sandboxMemory";
import { mergeBusinessScenarios } from "@/lib/headcount/buCost";
import { scopeRoots } from "@/lib/headcount/overview";
import { buildScenarioBoard, DEFAULT_PREFILL_NOTE, MODEL_PREFILL_NOTE } from "@/lib/headcount/scenarioView";
import { ScopeDenied, seesCompany, selectScenariosForUser } from "@/lib/headcount/scopeGuard";
import { currentUser } from "@/lib/headcount/session";
import { forbidden, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ScenariosPage({ searchParams }: { searchParams: Promise<{ notice?: string; focus?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (!can(user, "viewScenarios")) {
    if (user.role === "leader") redirect("/headcount/leader");
    if (user.role === "sys_admin") redirect("/headcount/admin");
    redirect("/headcount/baseline");
  }
  const query = await searchParams;
  const db = await getDb();
  const scoped = await scopeFor(user);
  const definitions = await loadScenarioDefinitions(db);
  const companyWide = seesCompany(user);
  const companyIds = new Set(["jx", "jz", "jj", "bs", "fa"]);
  if (!companyWide && query.focus && companyIds.has(query.focus)) forbidden();
  let selection;
  try {
    const guardFocus = companyWide ? (query.focus ?? "jj") : query.focus && definitions.some((item) => item.id === query.focus) ? query.focus : null;
    selection = selectScenariosForUser(definitions, user, scoped.departments, scoped.visible, guardFocus);
  } catch (error) {
    if (error instanceof ScopeDenied) forbidden();
    throw error;
  }
  const mathPlan = await loadPlan(db, { departmentIds: null, sensitive: can(user, "viewOneOff") });
  const result = computePlan(mathPlan);
  let boardDefinitions = selection.definitions;
  let focusId = selection.focusId;
  let departmentNames: string[] | undefined;
  if (!companyWide) {
    const root = scopeRoots(scoped.departments, scoped.visible)[0];
    if (!root) forbidden();
    boardDefinitions = mergeBusinessScenarios(definitions, selection.definitions, root, result);
    if (query.focus && !boardDefinitions.some((item) => item.id === query.focus)) forbidden();
    focusId = query.focus && boardDefinitions.some((item) => item.id === query.focus) ? query.focus : (boardDefinitions.find((item) => item.id === `bu-${root}-jz`)?.id ?? boardDefinitions[0]?.id ?? focusId);
    const ids = subtreeIds(result.plan, root);
    departmentNames = result.plan.departments.filter((department) => ids.has(department.id)).map((department) => department.name);
    const board = buildScenarioBoard(result, boardDefinitions, focusId, modelConfigured() ? MODEL_PREFILL_NOTE : DEFAULT_PREFILL_NOTE, {
      mode: "business",
      rootId: root,
      departmentNames,
    });
    const sandboxRestore = usesEphemeralDb()
      ? {
          userId: user.id,
          scopeKey: scopeStorageKey(companyWide, scoped.visible),
          plans: selection.definitions.filter((definition) => definition.source === "sandbox"),
        }
      : null;
    return <ScenarioBoardView board={board} notice={query.notice} sandboxRestore={sandboxRestore} />;
  }
  const board = buildScenarioBoard(result, boardDefinitions, focusId, modelConfigured() ? MODEL_PREFILL_NOTE : DEFAULT_PREFILL_NOTE);
  const sandboxRestore = usesEphemeralDb()
    ? {
        userId: user.id,
        scopeKey: scopeStorageKey(companyWide, scoped.visible),
        plans: selection.definitions.filter((definition) => definition.source === "sandbox"),
      }
    : null;
  return <ScenarioBoardView board={board} notice={query.notice} sandboxRestore={sandboxRestore} />;
}
