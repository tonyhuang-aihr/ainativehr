import { rollupCosts, type CostRollup } from "@/lib/cost/math";
import type { AppSettings, Department, OrgSnapshot, Person, Scenario } from "@/lib/model/types";

export type OrgMetrics = {
  headcount: number;
  layers: number;
  avgSpan: number;
  managerCount: number;
  laborCost: number | null;
  costedPeople: number;
};

export function peopleInDepartment(people: Person[], path: string[]): Person[] {
  const key = path.join("/");
  return people.filter((person) => {
    const current = person.departmentPath.join("/");
    return current === key || current.startsWith(`${key}/`);
  });
}

export function directReports(snapshot: OrgSnapshot, personId: string): Person[] {
  return snapshot.people.filter((person) => person.managerId === personId && person.id !== personId);
}

export function orgMetrics(snapshot: OrgSnapshot): OrgMetrics {
  const spans = snapshot.people
    .map((person) => directReports(snapshot, person.id).length)
    .filter((span) => span > 0);
  const costs = snapshot.people.map((person) => person.annualCost).filter((cost): cost is number => cost != null);
  const layers = snapshot.departments.reduce((max, department) => Math.max(max, department.path.length), 0);
  return {
    headcount: snapshot.people.length,
    layers,
    avgSpan: spans.length ? spans.reduce((sum, span) => sum + span, 0) / spans.length : 0,
    managerCount: spans.length,
    laborCost: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
    costedPeople: costs.length,
  };
}

export function diffMetrics(current: OrgMetrics, baseline: OrgMetrics) {
  return {
    headcount: current.headcount - baseline.headcount,
    layers: current.layers - baseline.layers,
    avgSpan: current.avgSpan - baseline.avgSpan,
    laborCost:
      current.laborCost != null && baseline.laborCost != null ? current.laborCost - baseline.laborCost : null,
  };
}

export function scenarioRollup(scenario: Scenario, settings: AppSettings): CostRollup {
  return rollupCosts(scenario.snapshot.people, scenario.decompositions, settings);
}

export function topDepartment(person: Person): string {
  return person.departmentPath[1] ?? person.departmentPath[0] ?? "未分配";
}

export function findDepartment(snapshot: OrgSnapshot, id: string): Department | undefined {
  return snapshot.departments.find((department) => department.id === id);
}
