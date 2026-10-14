import type { Person } from "@/lib/model/types";

const PLACEMENT =
  /负责人更换|调整现任负责人|现任负责人|人员安置|人员去留|去留或调动|具体人员的去留|调动安排|人员调动|调岗|辞退|离职安排|更换负责人|谁来接任|降级安排/;

export type PersonalLeak = {
  names: string[];
  ids: string[];
};

export function hasPlacement(text: string): boolean {
  return PLACEMENT.test(text);
}

export function placementSentences(text: string): string[] {
  return text
    .split(/[。；;\n]/)
    .map((part) => part.trim())
    .filter((part) => part && hasPlacement(part));
}

export function findPersonalLeaks(
  text: string,
  people: Pick<Person, "name" | "originalName" | "employeeId">[],
): PersonalLeak {
  const names: string[] = [];
  const ids: string[] = [];
  const seenName = new Set<string>();
  const seenId = new Set<string>();
  for (const person of people) {
    for (const raw of [person.name, person.originalName]) {
      const name = raw.trim();
      if (name.length < 2 || seenName.has(name)) continue;
      if (text.includes(name)) {
        seenName.add(name);
        names.push(name);
      }
    }
    const employeeId = person.employeeId.trim();
    if (employeeId.length < 2 || seenId.has(employeeId)) continue;
    if (text.toLowerCase().includes(employeeId.toLowerCase())) {
      seenId.add(employeeId);
      ids.push(employeeId);
    }
  }
  return { names, ids };
}

export function guardIssues(text: string, people: Pick<Person, "name" | "originalName" | "employeeId">[]): string[] {
  const leaks = findPersonalLeaks(text, people);
  const issues: string[] = [];
  if (leaks.names.length) issues.push(`写到了姓名：${leaks.names.join("、")}`);
  if (leaks.ids.length) issues.push(`写到了工号：${leaks.ids.join("、")}`);
  if (hasPlacement(text)) issues.push("写到了人员安置（负责人去留、调岗或调动安排）");
  return issues;
}

/** 去掉姓名、工号，以及带人员安置的句子。结构描述留着。 */
export function stripGuardedText(text: string, people: Pick<Person, "name" | "originalName" | "employeeId">[]): string {
  let out = text;
  const leaks = findPersonalLeaks(out, people);
  const terms = [...leaks.names, ...leaks.ids].sort((a, b) => b.length - a.length);
  for (const term of terms) {
    out = out.split(term).join("");
    out = out.split(term.toLowerCase()).join("");
  }
  out = out
    .split(/[。；;\n]/)
    .map((part) => part.trim())
    .filter((part) => part && !hasPlacement(part))
    .join("。");
  return out.replace(/\s{2,}/g, " ").trim();
}
