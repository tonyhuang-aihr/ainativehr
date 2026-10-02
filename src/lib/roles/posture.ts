import type { Person, RoleDecomposition, RolePosture } from "@/lib/model/types";

export function rolePosture(decomposition: RoleDecomposition | undefined): RolePosture {
  return decomposition?.posture ?? "active";
}

export function isExcludedPosture(posture: RolePosture | undefined): boolean {
  return posture === "draft" || posture === "pending_review";
}

export function peopleIncludedInRollup<T extends Pick<Person, "title">>(
  people: T[],
  decompositions: Record<string, RoleDecomposition>,
): T[] {
  return people.filter((person) => !isExcludedPosture(decompositions[person.title]?.posture));
}

export type PostureSummary = {
  people: number;
  includedPeople: number;
  includedRoles: number;
  draftPeople: number;
  draftRoles: number;
  pendingPeople: number;
  pendingRoles: number;
};

/** N 只数待复核岗位，不数草稿。草稿和待复核的人都不进入汇总。 */
export function summarizePostures(
  people: Pick<Person, "title">[],
  decompositions: Record<string, RoleDecomposition>,
): PostureSummary {
  const includedTitles = new Set<string>();
  const draftTitles = new Set<string>();
  const pendingTitles = new Set<string>();
  let draftPeople = 0;
  let pendingPeople = 0;
  let includedPeople = 0;
  for (const person of people) {
    const posture = rolePosture(decompositions[person.title]);
    if (posture === "draft") {
      draftPeople += 1;
      draftTitles.add(person.title);
    } else if (posture === "pending_review") {
      pendingPeople += 1;
      pendingTitles.add(person.title);
    } else {
      includedPeople += 1;
      includedTitles.add(person.title);
    }
  }
  return {
    people: people.length,
    includedPeople,
    includedRoles: includedTitles.size,
    draftPeople,
    draftRoles: draftTitles.size,
    pendingPeople,
    pendingRoles: pendingTitles.size,
  };
}
