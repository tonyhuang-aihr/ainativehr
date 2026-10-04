export type HeadcountRole = "od" | "leader" | "hr_admin" | "sys_admin";

export const ROLE_LABEL: Record<HeadcountRole, string> = {
  od: "OD / HRBP",
  leader: "业务负责人",
  hr_admin: "HR 管理员",
  sys_admin: "系统管理员",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role as HeadcountRole] ?? role;
}

export type HeadcountUser = {
  id: string;
  role: HeadcountRole;
  departmentIds: string[];
};

export type HeadcountAction =
  | "viewBusiness"
  | "import"
  | "editConfig"
  | "viewCompensation"
  | "viewOneOff"
  | "toggleExact"
  | "manageUsers"
  | "viewLogs"
  | "wipe"
  | "export"
  | "viewLeader";

const MATRIX: Record<HeadcountRole, HeadcountAction[]> = {
  od: ["viewBusiness", "import", "editConfig", "viewCompensation", "viewOneOff", "export"],
  leader: ["viewBusiness", "viewLeader"],
  hr_admin: ["viewBusiness", "viewCompensation", "viewOneOff", "toggleExact", "export"],
  sys_admin: ["manageUsers", "viewLogs", "wipe", "export"],
};

export function can(user: HeadcountUser, action: HeadcountAction): boolean {
  return MATRIX[user.role].includes(action);
}

export type ClosureRow = { ancestorId: string; descendantId: string; depth: number };

export function buildClosure(departments: { id: string; parentId: string | null }[]): ClosureRow[] {
  const parent = new Map(departments.map((department) => [department.id, department.parentId]));
  const rows: ClosureRow[] = [];
  for (const department of departments) {
    let ancestor: string | null = department.id;
    let depth = 0;
    const seen = new Set<string>();
    while (ancestor && !seen.has(ancestor)) {
      rows.push({ ancestorId: ancestor, descendantId: department.id, depth });
      seen.add(ancestor);
      ancestor = parent.get(ancestor) ?? null;
      depth += 1;
    }
  }
  return rows;
}

/** 业务接口用：绑定部门加上全部下级。OD / HR 看授权范围内的全部部门。系统管理员不看业务数据。 */
export function visibleDepartmentIds(user: HeadcountUser, departments: { id: string }[], closure: ClosureRow[]): string[] {
  if (user.role === "sys_admin") return [];
  if (user.role === "od" || user.role === "hr_admin") return departments.map((department) => department.id);
  const bound = new Set(user.departmentIds);
  const visible = new Set<string>();
  for (const row of closure) {
    if (bound.has(row.ancestorId)) visible.add(row.descendantId);
  }
  return [...visible];
}
