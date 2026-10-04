import { ScenarioBoardView } from "@/components/headcount/scenario-board";
import { can } from "@/lib/headcount/authz";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { subtreeIds } from "@/lib/headcount/engine";
import { modelConfigured } from "@/lib/headcount/modelClient";
import { mergeBusinessScenarios } from "@/lib/headcount/buCost";
import { scopeRoots } from "@/lib/headcount/overview";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { openScenarioMemory } from "@/lib/headcount/scenarioMemoryStore";
import { scenarioDelta } from "@/lib/headcount/scenarioState";
import { buildScenarioBoard, DEFAULT_PREFILL_NOTE, MODEL_PREFILL_NOTE } from "@/lib/headcount/scenarioView";
import { importableSandboxPlans } from "@/lib/headcount/scenarioWrites";
import { focusIsOutOfScope, ScenarioMissing, ScopeDenied, selectScenariosForUser } from "@/lib/headcount/scopeGuard";
import { currentUser } from "@/lib/headcount/session";
import { forbidden, notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ScenariosPage({ searchParams }: { searchParams: Promise<{ notice?: string; focus?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (!can(user, "viewScenarios")) {
    if (user.role === "leader") forbidden();
    if (user.role === "sys_admin") redirect("/headcount/admin");
    redirect("/headcount/baseline");
  }
  const query = await searchParams;
  const memory = await openScenarioMemory(user);
  const departmentIds = memory.departments.map((department) => department.id);
  if (query.focus && focusIsOutOfScope(query.focus, memory.companyWide, departmentIds, memory.visibleIds)) forbidden();
  let selection;
  try {
    const guardFocus = memory.companyWide ? (query.focus ?? "jj") : query.focus && memory.catalog.some((item) => item.id === query.focus) ? query.focus : null;
    selection = selectScenariosForUser(memory.catalog, user, memory.departments, memory.visibleIds, guardFocus);
  } catch (error) {
    if (error instanceof ScenarioMissing) notFound();
    if (error instanceof ScopeDenied) forbidden();
    throw error;
  }
  const result = memory.result;
  let boardDefinitions = selection.definitions;
  let focusId = selection.focusId;
  let departmentNames: string[] | undefined;
  const options = modelConfigured() ? MODEL_PREFILL_NOTE : DEFAULT_PREFILL_NOTE;
  const sandboxOffers = importableSandboxPlans([scenarioFromSandbox(buildRdCenterWorkspace(), 2)], {
    companyWide: memory.companyWide,
    allowed: memory.allowed,
    names: memory.names,
    rootId: memory.root,
    rootName: memory.departments.find((department) => department.id === memory.root)?.name ?? null,
    result: memory.result,
  }).map((definition) => ({
    id: definition.id,
    label: definition.id === "fa" ? "载入沙盘示例方案 A" : `载入${definition.name}`,
    caption: definition.id === "fa" ? "应用分析小组并入数据组" : (definition.structureNote ?? ""),
  }));
  if (!memory.companyWide) {
    const root = scopeRoots(memory.departments, memory.visibleIds)[0];
    if (!root) forbidden();
    boardDefinitions = mergeBusinessScenarios(memory.catalog, selection.definitions, root, result);
    if (query.focus && !boardDefinitions.some((item) => item.id === query.focus)) notFound();
    focusId = query.focus && boardDefinitions.some((item) => item.id === query.focus) ? query.focus : (boardDefinitions.find((item) => item.id === `bu-${root}-jz`)?.id ?? boardDefinitions[0]?.id ?? focusId);
    const ids = subtreeIds(result.plan, root);
    departmentNames = result.plan.departments.filter((department) => ids.has(department.id)).map((department) => department.name);
    const board = buildScenarioBoard(result, boardDefinitions, focusId, options, { mode: "business", rootId: root, departmentNames });
    return <ScenarioBoardView board={board} notice={query.notice} sandboxOffers={sandboxOffers} sandboxRestore={demoRestore(memory)} />;
  }
  const board = buildScenarioBoard(result, boardDefinitions, focusId, options);
  return <ScenarioBoardView board={board} notice={query.notice} sandboxOffers={sandboxOffers} sandboxRestore={demoRestore(memory)} />;
}

function demoRestore(memory: Awaited<ReturnType<typeof openScenarioMemory>>) {
  if (memory.mode !== "browser") return null;
  return {
    userId: memory.userId,
    scopeKey: memory.scopeKey,
    plans: scenarioDelta(memory.seed, memory.catalog),
    authoritative: memory.cookieFound,
  };
}
