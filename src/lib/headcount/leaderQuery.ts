/** 负责人查询只点名这些列。补偿标记、入职日期、一次性费用不在名单里。 */
export const LEADER_PERSON_COLUMNS = ["id", "employee_no", "name", "department_id", "title", "grade", "manager_id", "is_manager", "employment_type"] as const;

export const LEADER_MOVEMENT_COLUMNS = [
  "id",
  "kind",
  "person_name",
  "employee_no",
  "department_id",
  "from_department_id",
  "to_department_id",
  "title",
  "grade",
  "employment_type",
  "effective_date",
  "agent_type",
  "instance_delta",
  "seat_monthly",
  "compute_monthly",
] as const;

export const LEADER_AGENT_COLUMNS = ["id", "name", "agent_type", "department_id", "instances", "seat_monthly", "compute_monthly"] as const;

const FORBIDDEN = /comp_mark|hire_date|one_off|severance|departure_type|compensation/i;

export function leaderColumnsAreSafe(): boolean {
  return [...LEADER_PERSON_COLUMNS, ...LEADER_MOVEMENT_COLUMNS, ...LEADER_AGENT_COLUMNS].every((column) => !FORBIDDEN.test(column));
}
