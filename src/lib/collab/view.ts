import type { CollabBundle, Department, OrgSnapshot, Person, PersonGoal, PersonOkr } from "@/lib/model/types";
import { departmentLinks, rollupLinksToVisible, scorePairs, type DeptLink, type MetricKey, type ResolvedPair, type ScoredPair } from "@/lib/collab/strength";

export type CollaboratorCard = {
  personId: string;
  name: string;
  title: string;
  departmentName: string;
  relation: "本部门" | "跨部门";
  score: number | null;
  counts: { messages: number | null; meetings: number | null; okr: number | null };
  norm: { messages: number | null; meetings: number | null; okr: number | null };
  missing: MetricKey[];
};

function pathKey(path: string[]): string {
  return path.join("/");
}

function deptOf(snapshot: OrgSnapshot, person: Person): Department | undefined {
  const key = pathKey(person.departmentPath);
  return snapshot.departments.find((department) => pathKey(department.path) === key);
}

export function resolvePairs(bundle: CollabBundle, snapshot: OrgSnapshot): ResolvedPair[] {
  const byName = new Map<string, Person>();
  for (const person of snapshot.people) {
    if (!byName.has(person.name)) byName.set(person.name, person);
  }
  const pairs: ResolvedPair[] = [];
  for (const pair of bundle.pairs) {
    const a = byName.get(pair.personA);
    const b = byName.get(pair.personB);
    if (!a || !b || a.id === b.id) continue;
    pairs.push({
      aId: a.id,
      bId: b.id,
      aDeptId: deptOf(snapshot, a)?.id ?? "",
      bDeptId: deptOf(snapshot, b)?.id ?? "",
      messages: pair.messages,
      meetings: pair.meetings,
      okr: pair.okrAlignments,
    });
  }
  return pairs;
}

export function scoredCollaboration(bundle: CollabBundle | null, snapshot: OrgSnapshot): ScoredPair[] {
  if (!bundle) return [];
  return scorePairs(resolvePairs(bundle, snapshot));
}

function relationOf(leaderDept: Department, other: Person, departments: Department[]): "本部门" | "跨部门" {
  const otherDept = departments.find((department) => pathKey(department.path) === pathKey(other.departmentPath));
  if (!otherDept) return "跨部门";
  const leaderKey = pathKey(leaderDept.path);
  const otherKey = pathKey(otherDept.path);
  if (otherKey === leaderKey || otherKey.startsWith(`${leaderKey}/`)) return "本部门";
  return "跨部门";
}

/** 负责人卡片里的协作对象。按强度排列便于查看，但不带名次。 */
export function leaderCollaborators(snapshot: OrgSnapshot, leaderId: string, pairs: ScoredPair[]): CollaboratorCard[] {
  const leader = snapshot.people.find((person) => person.id === leaderId);
  const leaderDept = leader ? deptOf(snapshot, leader) : undefined;
  if (!leader || !leaderDept) return [];
  const people = new Map(snapshot.people.map((person) => [person.id, person]));
  const cards: CollaboratorCard[] = [];
  for (const pair of pairs) {
    const otherId = pair.aId === leaderId ? pair.bId : pair.bId === leaderId ? pair.aId : null;
    if (!otherId) continue;
    const other = people.get(otherId);
    if (!other) continue;
    const department = deptOf(snapshot, other);
    cards.push({
      personId: other.id,
      name: other.name,
      title: other.title,
      departmentName: department?.name ?? other.departmentPath.at(-1) ?? "",
      relation: relationOf(leaderDept, other, snapshot.departments),
      score: pair.score,
      counts: { messages: pair.messages, meetings: pair.meetings, okr: pair.okr },
      norm: pair.norm,
      missing: pair.missing,
    });
  }
  return cards.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, "zh-CN"));
}

export function okrFor(bundle: CollabBundle | null, personName: string): PersonOkr | null {
  return bundle?.okrs.find((item) => item.personName === personName) ?? null;
}

export function goalsFor(bundle: CollabBundle | null, personName: string): PersonGoal[] {
  return bundle?.goals.filter((item) => item.personName === personName) ?? [];
}

export function canvasLinks(snapshot: OrgSnapshot, pairs: ScoredPair[], visible: Set<string>): DeptLink[] {
  return rollupLinksToVisible(departmentLinks(pairs), snapshot.departments, visible);
}
