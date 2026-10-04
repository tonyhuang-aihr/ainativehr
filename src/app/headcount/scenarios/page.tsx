import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { can } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
import { loadPlan } from "@/lib/headcount/db/queries";
import { loadScenarioDefinitions } from "@/lib/headcount/db/scenarios";
import { computePlan } from "@/lib/headcount/engine";
import { modelConfigured } from "@/lib/headcount/modelClient";
import { buildScenarioBoard, DEFAULT_PREFILL_NOTE, MODEL_PREFILL_NOTE } from "@/lib/headcount/scenarioView";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

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
  const definitions = await loadScenarioDefinitions(db);
  const plan = await loadPlan(db, { departmentIds: null, sensitive: true });
  const board = buildScenarioBoard(computePlan(plan), definitions, query.focus ?? "jj", modelConfigured() ? MODEL_PREFILL_NOTE : DEFAULT_PREFILL_NOTE);
  return <ScenarioBoardView board={board} notice={query.notice} />;
}
