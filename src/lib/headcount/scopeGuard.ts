import type { HeadcountUser } from "@/lib/headcount/authz";
import type { ScenarioDefinition } from "@/lib/headcount/scenario";

export class ScopeDenied extends Error {
  readonly status = 403;
  constructor(message = "无权查看") {
    super(message);
    this.name = "ScopeDenied";
  }
}

export class ScenarioMissing extends Error {
  readonly status = 404;
  constructor(message = "场景不存在或已删除") {
    super(message);
    this.name = "ScenarioMissing";
  }
}

const COMPANY_SCENARIO_IDS = new Set(["jx", "jz", "jj", "bs", "fa"]);
const PROJECTED_PRESET = /^bu-(.+)-(jz|jj|bs|fa|jx)$/;

/** 知道这个编号，但当前用户看不到。未知编号返回 false，交给 404。 */
export function focusIsOutOfScope(
  focusId: string,
  companyWide: boolean,
  departmentIds: readonly string[],
  visibleIds: readonly string[],
): boolean {
  if (companyWide) return false;
  if (COMPANY_SCENARIO_IDS.has(focusId)) return true;
  const match = PROJECTED_PRESET.exec(focusId);
  if (!match) return false;
  const departmentId = match[1];
  return departmentIds.includes(departmentId) && !visibleIds.includes(departmentId);
}

/** 公司口径只有 OD 和 HR 管理员。HRBP 只看自己的事业部。 */
export function seesCompany(user: HeadcountUser): boolean {
  return user.role === "od" || user.role === "hr_admin";
}

export function assertDepartmentVisible(visibleIds: readonly string[], departmentId: string): void {
  if (!visibleIds.includes(departmentId)) throw new ScopeDenied("部门不在授权范围");
}

export function scenarioFitsScope(
  definition: ScenarioDefinition,
  allowedNames: ReadonlySet<string>,
  departmentNames: readonly string[],
  companyWide: boolean,
): boolean {
  if (companyWide) return true;
  if (COMPANY_SCENARIO_IDS.has(definition.id)) return false;
  if (definition.source === "preset" && !definition.id.startsWith("bu-")) return false;
  const outside = (name: string) => !allowedNames.has(name);
  if (definition.hires.some((hire) => outside(hire.departmentName))) return false;
  if (definition.cuts.some((cut) => outside(cut.departmentName))) return false;
  if (definition.agents.some((agent) => agent.departmentName == null || outside(agent.departmentName))) return false;
  if (definition.spanAlert && outside(definition.spanAlert.department)) return false;
  if (definition.structureNote && departmentNames.some((name) => outside(name) && definition.structureNote!.includes(name))) return false;
  return true;
}

export function selectScenariosForUser(
  definitions: ScenarioDefinition[],
  user: HeadcountUser,
  departments: { id: string; name: string }[],
  visibleIds: readonly string[],
  focusId: string | null,
): { definitions: ScenarioDefinition[]; focusId: string } {
  const companyWide = seesCompany(user);
  const allowed = new Set(departments.filter((department) => visibleIds.includes(department.id)).map((department) => department.name));
  const names = departments.map((department) => department.name);
  const departmentIds = departments.map((department) => department.id);
  if (focusId) {
    const target = definitions.find((definition) => definition.id === focusId);
    if (!target) {
      if (focusIsOutOfScope(focusId, companyWide, departmentIds, visibleIds)) throw new ScopeDenied("无权查看");
      throw new ScenarioMissing();
    }
    if (!scenarioFitsScope(target, allowed, names, companyWide)) throw new ScopeDenied("无权查看");
  }
  const visible = definitions.filter((definition) => scenarioFitsScope(definition, allowed, names, companyWide));
  const focus = focusId && visible.some((definition) => definition.id === focusId)
    ? focusId
    : (visible.find((definition) => definition.compared)?.id ?? visible[0]?.id ?? "jx");
  return { definitions: visible, focusId: focus };
}
