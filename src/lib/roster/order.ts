import type { Person } from "@/lib/model/types";

/** 在给定人群里沿直属上级往上数。上级不在这群人里时停住，所以部门花名册里负责人是 L1。 */
export function reportingLevel(people: Pick<Person, "id" | "managerId">[], person: Pick<Person, "id" | "managerId">): number {
  const byId = new Map(people.map((item) => [item.id, item]));
  let level = 1;
  let current = person;
  const seen = new Set<string>();
  while (current.managerId && byId.has(current.managerId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.managerId)!;
    level += 1;
    if (level > 40) break;
  }
  return level;
}

export function compareRoster(people: Person[], a: Person, b: Person): number {
  const levelDelta = reportingLevel(people, a) - reportingLevel(people, b);
  if (levelDelta !== 0) return levelDelta;
  return (a.employeeId || "\uffff").localeCompare(b.employeeId || "\uffff", "en", { numeric: true });
}

/** 先汇报层级，再工号。不读绩效。 */
export function sortRoster(people: Person[], universe: Person[] = people): Person[] {
  return [...people].sort((a, b) => compareRoster(universe, a, b));
}

export function levelLabel(level: number): string {
  return `L${level}`;
}
