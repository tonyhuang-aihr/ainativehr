export type SortablePerson = {
  id: string;
  managerId: string | null;
  isManager: boolean;
  employeeNo: string;
};

/** 负责人在前，再排直接下属。同一上级下面，管理岗在前，其余按工号。不按成本排。 */
export function sortByReporting<T extends SortablePerson>(people: T[]): T[] {
  const ids = new Set(people.map((person) => person.id));
  const groups = new Map<string | null, T[]>();
  for (const person of people) {
    const manager = person.managerId && ids.has(person.managerId) ? person.managerId : null;
    const list = groups.get(manager) ?? [];
    list.push(person);
    groups.set(manager, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => {
      if (left.isManager !== right.isManager) return left.isManager ? -1 : 1;
      return left.employeeNo.localeCompare(right.employeeNo, "en", { numeric: true });
    });
  }
  const ordered: T[] = [];
  const walk = (managerId: string | null) => {
    for (const person of groups.get(managerId) ?? []) {
      ordered.push(person);
      walk(person.id);
    }
  };
  walk(null);
  return ordered;
}
