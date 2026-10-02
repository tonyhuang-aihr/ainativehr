import type { ExecutionMode, Person, RoleDecomposition, RoleTask } from "@/lib/model/types";
import { round1 } from "@/lib/format";

export type TimeSplit = {
  ai: number;
  human: number;
  collab: number;
  aiOnly: number;
  humanOnly: number;
};

type ShareTask = {
  timeShare: number;
  mode: ExecutionMode;
};

/**
 * 人机协同按 collabAiShare 分到 AI，其余分到人。默认 50%。
 * 人机比按人在前显示：人 : AI = 人工时占比 : AI 工时占比。
 * 释放工时 =（完全由 AI 做的工时 + 协同工时 × 分摊比例）× 月标准工时。
 * 也就是理论上能从人身上腾出来的时间，不自动减少编制。
 */
export function splitTime(tasks: ShareTask[], collabAiShare: number): TimeSplit {
  const share = clamp01(collabAiShare);
  let aiOnly = 0;
  let humanOnly = 0;
  let collab = 0;
  for (const task of tasks) {
    const weight = Number.isFinite(task.timeShare) ? Math.max(0, task.timeShare) : 0;
    if (task.mode === "ai") aiOnly += weight;
    else if (task.mode === "collab") collab += weight;
    else humanOnly += weight;
  }
  return {
    aiOnly,
    humanOnly,
    collab,
    ai: aiOnly + collab * share,
    human: humanOnly + collab * (1 - share),
  };
}

/** 参数仍是 AI 份额在前。返回值只有数字，人在前，标签由界面另写「人 : AI」。 */
export function formatHumanAiPair(ai: number, human: number): string {
  if (ai === 0 && human === 0) return "—";
  return `${trimNumber(round1(human * 100))} : ${trimNumber(round1(ai * 100))}`;
}

/** 带标签的完整写法，用于有足够宽度的句子。 */
export function formatHumanAiRatio(ai: number, human: number): string {
  const pair = formatHumanAiPair(ai, human);
  return pair === "—" ? pair : `人 : AI = ${pair}`;
}

export function releasedHoursPerMonth(tasks: ShareTask[], collabAiShare: number, monthlyHours: number): number {
  const { ai } = splitTime(tasks, collabAiShare);
  return ai * Math.max(0, monthlyHours);
}

/** 完全由 AI 做、以及人机协同的任务，各记 1 份单价。纯人工任务不计费。 */
export function computeCostPerMonth(tasks: ShareTask[], unitPrice: number): number {
  const price = Math.max(0, unitPrice);
  const count = tasks.filter((task) => task.mode === "ai" || task.mode === "collab").length;
  return count * price;
}

export function roleAnnualCost(
  annualLabor: number,
  tasks: ShareTask[],
  settings: { computeUnitPrice: number },
): { labor: number; compute: number; total: number } {
  const labor = Math.max(0, annualLabor);
  const compute = computeCostPerMonth(tasks, settings.computeUnitPrice) * 12;
  return { labor, compute, total: labor + compute };
}

export type CostRollup = {
  headcount: number;
  covered: number;
  labor: number;
  laborKnown: number;
  compute: number;
  total: number;
  releasedHours: number;
  aiShare: number;
  humanShare: number;
  ratio: string;
};

export function rollupCosts(
  people: Pick<Person, "title" | "annualCost">[],
  decompositions: Record<string, RoleDecomposition>,
  settings: { computeUnitPrice: number; collabAiShare: number; monthlyHours: number },
): CostRollup {
  let labor = 0;
  let laborKnown = 0;
  let compute = 0;
  let releasedHours = 0;
  let ai = 0;
  let human = 0;
  let covered = 0;
  for (const person of people) {
    if (person.annualCost != null) {
      labor += person.annualCost;
      laborKnown += 1;
    }
    const decomposition = decompositions[person.title];
    if (!decomposition) continue;
    covered += 1;
    const split = splitTime(decomposition.tasks, settings.collabAiShare);
    ai += split.ai;
    human += split.human;
    releasedHours += releasedHoursPerMonth(decomposition.tasks, settings.collabAiShare, settings.monthlyHours);
    compute += computeCostPerMonth(decomposition.tasks, settings.computeUnitPrice) * 12;
  }
  return {
    headcount: people.length,
    covered,
    labor,
    laborKnown,
    compute,
    total: labor + compute,
    releasedHours,
    aiShare: covered ? ai / covered : 0,
    humanShare: covered ? human / covered : 0,
    ratio: covered ? formatHumanAiRatio(ai / covered, human / covered) : "—",
  };
}

export function taskShareTotal(tasks: RoleTask[]): number {
  return tasks.reduce((sum, task) => sum + (Number.isFinite(task.timeShare) ? task.timeShare : 0), 0);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
