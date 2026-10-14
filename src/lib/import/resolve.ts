import type { RawPerson } from "@/lib/model/types";

export type ResolveResult =
  | { status: "none" }
  | { status: "unique"; person: RawPerson }
  | { status: "ambiguous"; candidates: RawPerson[] }
  | { status: "missing" };

export function leafDepartment(departmentRaw: string): string {
  const parts = departmentRaw
    .split(/[/\\>＞｜|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || departmentRaw.trim() || "未填部门";
}

export function resolveManager(person: RawPerson, people: RawPerson[]): ResolveResult {
  const raw = person.managerRaw.trim();
  if (!raw) return { status: "none" };
  const byId = people.filter((item) => item.employeeId && item.employeeId === raw && item.rowNumber !== person.rowNumber);
  if (byId.length === 1) return { status: "unique", person: byId[0] };
  if (byId.length > 1) return { status: "ambiguous", candidates: byId };
  const byName = people.filter(
    (item) => item.rowNumber !== person.rowNumber && (item.name === raw || item.originalName === raw),
  );
  if (byName.length === 1) return { status: "unique", person: byName[0] };
  if (byName.length > 1) return { status: "ambiguous", candidates: byName };
  if (people.some((item) => item.rowNumber === person.rowNumber && (item.name === raw || item.employeeId === raw))) {
    return { status: "unique", person };
  }
  return { status: "missing" };
}

export function chooseRoot(people: RawPerson[]): RawPerson | null {
  if (people.length === 0) return null;
  const blanks = people.filter((person) => !person.managerRaw.trim());
  if (blanks.length === 1) return blanks[0];
  const counts = new Map<string, number>();
  for (const person of people) {
    const manager = person.managerRaw.trim();
    if (!manager) continue;
    counts.set(manager, (counts.get(manager) ?? 0) + 1);
  }
  const pool = blanks.length > 0 ? blanks : people;
  let best = pool[0];
  let bestCount = -1;
  for (const person of pool) {
    const count = Math.max(counts.get(person.name) ?? 0, counts.get(person.originalName) ?? 0, counts.get(person.employeeId) ?? 0);
    if (count > bestCount) {
      best = person;
      bestCount = count;
    }
  }
  return best;
}

export function managerIndexes(people: RawPerson[]): (number | null)[] {
  const indexByRow = new Map(people.map((person, index) => [person.rowNumber, index]));
  return people.map((person) => {
    const resolved = resolveManager(person, people);
    if (resolved.status !== "unique") return null;
    return indexByRow.get(resolved.person.rowNumber) ?? null;
  });
}

export function cycleMemberIndexes(people: RawPerson[]): number[][] {
  const next = managerIndexes(people);
  const state = new Array(people.length).fill(0);
  const stack: number[] = [];
  const cycles: number[][] = [];
  const dfs = (index: number) => {
    state[index] = 1;
    stack.push(index);
    const manager = next[index];
    if (manager != null) {
      if (state[manager] === 1) {
        const at = stack.indexOf(manager);
        cycles.push(stack.slice(at));
      } else if (state[manager] === 0) {
        dfs(manager);
      }
    }
    stack.pop();
    state[index] = 2;
  };
  for (let index = 0; index < people.length; index += 1) {
    if (state[index] === 0) dfs(index);
  }
  return cycles;
}
