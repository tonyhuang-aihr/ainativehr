import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { can } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
import { scopeFor } from "@/lib/headcount/db/present";
import { loadPlan } from "@/lib/headcount/db/queries";
import { loadScenarioDefinitions } from "@/lib/headcount/db/scenarios";
import { computePlan } from "@/lib/headcount/engine";
import { usesEphemeralDb } from "@/lib/headcount/env";
import { modelConfigured } from "@/lib/headcount/modelClient";
import { scopeStorageKey } from "@/lib/headcount/sandboxMemory";
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
  let selection;
  try {
    selection = selectScenariosForUser(definitions, user, scoped.departments, scoped.visible, query.focus ?? (companyWide ? "jj" : null));
  } catch (error) {
    if (error instanceof ScopeDenied) forbidden();
    throw error;
  }
  const plan = await loadPlan(db, { departmentIds: companyWide ? null : scoped.visible, sensitive: can(user, "viewOneOff") });
  const board = buildScenarioBoard(computePlan(plan), selection.definitions, selection.focusId, modelConfigured() ? MODEL_PREFILL_NOTE : DEFAULT_PREFILL_NOTE);
  const sandboxRestore = usesEphemeralDb()
    ? {
        userId: user.id,
        scopeKey: scopeStorageKey(companyWide, scoped.visible),
        plans: selection.definitions.filter((definition) => definition.source === "sandbox"),
      }
    : null;
  return <ScenarioBoardView board={board} notice={query.notice} sandboxRestore={sandboxRestore} />;
}
