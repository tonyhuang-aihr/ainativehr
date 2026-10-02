import type { Person } from "@/lib/model/types";

export function pathKey(path: string[]): string {
  return path.join("/");
}

export function personInDepartment(person: Person, path: string[], includeDescendants: boolean): boolean {
  const key = pathKey(path);
  const current = pathKey(person.departmentPath);
  if (!includeDescendants) return current === key;
  return current === key || current.startsWith(`${key}/`);
}

export type DeptRoster = {
  current: Person[];
  departed: Person[];
  arrivedIds: Set<string>;
  inCount: number;
  outCount: number;
  net: number;
  fromDept: Map<string, string>;
  toDept: Map<string, string>;
};

export function departmentRoster(
  baseline: Person[],
  current: Person[],
  path: string[],
  includeDescendants: boolean,
): DeptRoster {
  const baseById = new Map(baseline.map((person) => [person.id, person]));
  const currentById = new Map(current.map((person) => [person.id, person]));
  const inNow = current.filter((person) => personInDepartment(person, path, includeDescendants));
  const inBase = baseline.filter((person) => personInDepartment(person, path, includeDescendants));
  const nowIds = new Set(inNow.map((person) => person.id));
  const baseIds = new Set(inBase.map((person) => person.id));
  const arrivedIds = new Set(inNow.filter((person) => !baseIds.has(person.id)).map((person) => person.id));
  const departed = inBase.filter((person) => !nowIds.has(person.id));
  const fromDept = new Map<string, string>();
  const toDept = new Map<string, string>();
  for (const person of inNow) {
    const previous = baseById.get(person.id);
    if (previous) fromDept.set(person.id, previous.departmentPath.at(-1) ?? "");
  }
  for (const person of departed) {
    const next = currentById.get(person.id);
    if (next) toDept.set(person.id, next.departmentPath.at(-1) ?? "");
  }
  return {
    current: inNow,
    departed,
    arrivedIds,
    inCount: arrivedIds.size,
    outCount: departed.length,
    net: arrivedIds.size - departed.length,
    fromDept,
    toDept,
  };
}
