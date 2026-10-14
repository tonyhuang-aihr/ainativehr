import { SMALL_GROUP, groupSizePhrase, scrubText } from "@/lib/ai/desensitize";
import type { ChatTurn } from "@/lib/ai/desensitize";
import { deptStat, subtreeIds, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, roundToHalfWan, roundingGapWan, sumWithinHalfWan } from "@/lib/headcount/money";

export type ConclusionFacts = {
  id: string;
  name: string;
  year: number;
  headcount: number;
  agents: number;
  yearEndPeople: number;
  yearEndAgents: number;
  quotaPeople: number;
  quotaAgents: number;
  annualYuan: number;
  currentYuan: number;
  budgetYuan: number | null;
  inFlightYuan: number;
  joins: number;
  joinHires: number;
  joinTransfers: number;
  joinYuan: number;
  leaves: number;
  leaveExits: number;
  leaveTransfers: number;
  leaveYuan: number;
  agentAdded: number;
  agentExpanded: number;
  agentOffline: number;
  agentYuan: number;
  movementCount: number;
  quartersYuan: number[];
};

export type ModelUnit = {
  name: string;
  scale: string;
  headcount?: number;
  agents?: number;
  yearEndPeople?: number;
  yearEndAgents?: number;
  annualWan?: number;
  currentWan?: number;
  budgetWan?: number | null;
  deltaWan?: number;
  joins?: number;
  joinWan?: number;
  leaves?: number;
  leaveWan?: number;
  agentWan?: number;
  quartersWan?: number[];
};

const DEPARTURE_WORDS = ["协商解除", "主动辞职", "过失性", "经济性裁员", "无过失", "不胜任", "裁员", "退休", "不续签", "代通知金", "离职类型", "补偿标记", "N+1", "试用期不符合"];

export function conclusionFacts(result: PlanResult, departmentId: string): ConclusionFacts {
  const stat = deptStat(result, departmentId);
  const ids = subtreeIds(result.plan, departmentId);
  const moves = result.movements.filter((movement) => ids.has(movement.departmentId));
  const joins = moves.filter((movement) => movement.kind === "入职" || movement.kind === "转入");
  const leaves = moves.filter((movement) => movement.kind === "离职" || movement.kind === "转出");
  const agents = moves.filter((movement) => movement.kind.startsWith("Agent"));
  const budget = result.plan.budgets[departmentId];
  return {
    id: departmentId,
    name: stat.name,
    year: result.plan.year,
    headcount: stat.onBoard,
    agents: stat.agentInUse,
    yearEndPeople: stat.peopleYearEnd,
    yearEndAgents: stat.agentYearEnd,
    quotaPeople: stat.quotaFormal,
    quotaAgents: stat.quotaAgent,
    annualYuan: stat.yearDailyYuan,
    currentYuan: stat.currentYuan,
    budgetYuan: budget ?? null,
    inFlightYuan: stat.inFlightYearDaily,
    joins: joins.length,
    joinHires: joins.filter((movement) => movement.kind === "入职").length,
    joinTransfers: joins.filter((movement) => movement.kind === "转入").length,
    joinYuan: joins.reduce((total, movement) => total + movement.annual, 0),
    leaves: leaves.length,
    leaveExits: leaves.filter((movement) => movement.kind === "离职").length,
    leaveTransfers: leaves.filter((movement) => movement.kind === "转出").length,
    leaveYuan: leaves.reduce((total, movement) => total + movement.annual, 0),
    agentAdded: agents.filter((movement) => movement.kind === "Agent 新增").reduce((total, movement) => total + Math.max(0, movement.agentInstances ?? 0), 0),
    agentExpanded: agents.filter((movement) => movement.kind === "Agent 调整").reduce((total, movement) => total + Math.max(0, movement.agentInstances ?? 0), 0),
    agentOffline: agents.filter((movement) => movement.kind === "Agent 下线").reduce((total, movement) => total + Math.abs(movement.agentInstances ?? 0), 0),
    agentYuan: agents.reduce((total, movement) => total + movement.annual, 0),
    movementCount: moves.length,
    quartersYuan: [0, 1, 2, 3].map((index) => stat.quarterFormal[index] + stat.quarterOther[index] + stat.quarterAgent[index]),
  };
}

function fullUnit(facts: ConclusionFacts): ModelUnit {
  return {
    name: facts.name,
    scale: groupSizePhrase(facts.headcount),
    headcount: facts.headcount,
    agents: facts.agents,
    yearEndPeople: facts.yearEndPeople,
    yearEndAgents: facts.yearEndAgents,
    annualWan: roundToHalfWan(facts.annualYuan),
    currentWan: roundToHalfWan(facts.currentYuan),
    budgetWan: facts.budgetYuan == null ? null : roundToHalfWan(facts.budgetYuan),
    deltaWan: roundToHalfWan(facts.inFlightYuan),
    joins: facts.joins,
    joinWan: roundToHalfWan(facts.joinYuan),
    leaves: facts.leaves,
    leaveWan: roundToHalfWan(facts.leaveYuan),
    agentWan: roundToHalfWan(facts.agentYuan),
    quartersWan: facts.quartersYuan.map((value) => roundToHalfWan(value)),
  };
}

/** 少于 5 人的部门不送人数，也不送能反推出人均的金额。有小部门时不送下级拆分，避免用总数相减还原。 */
export function modelUnits(root: ConclusionFacts, children: ConclusionFacts[]): ModelUnit[] {
  if (root.headcount < SMALL_GROUP) return [{ name: root.name, scale: "有人员调整" }];
  const self = fullUnit(root);
  if (children.some((child) => child.headcount < SMALL_GROUP)) return [self];
  return [self, ...children.map(fullUnit)];
}

export function directChildFacts(result: PlanResult, departmentId: string): ConclusionFacts[] {
  return result.plan.departments
    .filter((department) => department.parentId === departmentId)
    .map((department) => conclusionFacts(result, department.id));
}

export function templateConclusion(facts: ConclusionFacts): string {
  if (facts.headcount < SMALL_GROUP) {
    const budget = facts.budgetYuan == null ? "未设置部门预算。" : "部门预算已设置，具体金额不在这条结论里。";
    return `${facts.year} 年该部门有人员调整。人数和可换算到个人的金额不写入这句结论。${budget}`;
  }
  const annual = formatWan(facts.annualYuan);
  const current = formatWan(facts.currentYuan);
  const budgetWan = facts.budgetYuan == null ? null : roundToHalfWan(facts.budgetYuan);
  const annualWan = roundToHalfWan(facts.annualYuan);
  const currentWan = roundToHalfWan(facts.currentYuan);
  let budgetClause = "未设置部门预算";
  if (budgetWan != null) {
    const gap = annualWan - budgetWan;
    budgetClause = gap > 0 ? `超出部门预算 ${formatWan(gap * 10_000)} 万` : gap < 0 ? `低于部门预算 ${formatWan(Math.abs(gap) * 10_000)} 万` : "与部门预算持平";
  }
  const within = budgetWan == null ? "的成本见右侧" : currentWan <= budgetWan ? "在预算内" : "已超出预算";
  const reason = budgetWan != null && annualWan > budgetWan ? "超出来自" : "变化来自";
  const agentWord = facts.agentYuan >= 0 ? "扩容" : "调整";
  return `${facts.year} 年预计 ${annual} 万，${budgetClause}。现有人员和 Agent 本身${within}（${current} 万），${reason}已确认的 ${facts.joins} 人加入（${formatSignedWan(facts.joinYuan)} 万）和 Agent ${agentWord}（${formatSignedWan(facts.agentYuan)} 万），${facts.leaves} 人离开抵消了 ${formatWan(Math.abs(facts.leaveYuan))} 万。`;
}

export function allowedNumbers(facts: ConclusionFacts): number[] {
  if (facts.headcount < SMALL_GROUP) return [facts.year];
  const annualWan = roundToHalfWan(facts.annualYuan);
  const values = [
    facts.year,
    facts.headcount,
    facts.agents,
    facts.yearEndPeople,
    facts.yearEndAgents,
    facts.quotaPeople,
    facts.quotaAgents,
    facts.joins,
    facts.joinHires,
    facts.joinTransfers,
    facts.leaves,
    facts.leaveExits,
    facts.leaveTransfers,
    facts.agentAdded,
    facts.agentExpanded,
    facts.agentOffline,
    facts.movementCount,
    annualWan,
    roundToHalfWan(facts.currentYuan),
    roundToHalfWan(facts.joinYuan),
    roundToHalfWan(Math.abs(facts.leaveYuan)),
    roundToHalfWan(Math.abs(facts.agentYuan)),
    roundToHalfWan(facts.inFlightYuan),
    ...facts.quartersYuan.map((value) => roundToHalfWan(value)),
  ];
  if (facts.budgetYuan != null) {
    const budgetWan = roundToHalfWan(facts.budgetYuan);
    const currentWan = roundToHalfWan(facts.currentYuan);
    values.push(budgetWan, Math.abs(Number((annualWan - budgetWan).toFixed(1))));
    values.push(Math.abs(Number((currentWan - budgetWan).toFixed(1))));
    values.push(Math.abs(roundToHalfWan(facts.currentYuan - facts.budgetYuan)));
    values.push(Math.abs(roundToHalfWan(facts.annualYuan - facts.budgetYuan)));
    if (budgetWan !== 0) values.push(Math.round((annualWan / budgetWan) * 1000) / 10);
  }
  return values;
}

export function extractNumbers(sentence: string): number[] {
  const stripped = sentence.replace(/Q[1-4]/gi, " ");
  const matches = stripped.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) ?? [];
  return matches.map((item) => Number(item.replace(/,/g, "")));
}

export function mentionsHeadcountBelowFive(sentence: string, departmentNames: string[]): boolean {
  const names = [...departmentNames].sort((left, right) => right.length - left.length);
  for (const name of names) {
    if (!name) continue;
    let from = 0;
    while (from < sentence.length) {
      const index = sentence.indexOf(name, from);
      if (index < 0) break;
      const window = sentence.slice(Math.max(0, index - 6), index + name.length + 14);
      for (const match of window.matchAll(/(\d+)\s*人/g)) {
        if (Number(match[1]) < SMALL_GROUP) return true;
      }
      from = index + name.length;
    }
  }
  if (/[0-4]\s*人的/.test(sentence)) return true;
  if (/(?:部门|团队|小组)[^。\n]{0,8}[0-4]\s*人/.test(sentence)) return true;
  return false;
}

export function mentionsPerson(sentence: string, names: string[], employeeNos: string[]): boolean {
  for (const name of names) {
    if (name.trim().length >= 2 && sentence.includes(name.trim())) return true;
  }
  for (const employeeNo of employeeNos) {
    if (employeeNo.trim().length >= 3 && sentence.includes(employeeNo.trim())) return true;
  }
  return false;
}

export function mentionsDepartureType(sentence: string): boolean {
  return DEPARTURE_WORDS.some((word) => sentence.includes(word));
}

function numberAllowed(value: number, allowed: number[]): boolean {
  return allowed.some((item) => Math.abs(item - value) < 0.011);
}

function quotes(quoted: number[], wan: number): boolean {
  return quoted.some((value) => Math.abs(value - Math.abs(wan)) < 0.011);
}

/**
 * 句子里如果同时出现引擎取整后的分项和合计，分项相加与合计差在 0.5 万以内不算不一致。
 * 差本身不能当成一个新数字写进句子：每个被引用的数仍然必须等于某个引擎取整值。
 */
export function roundedSumMismatch(sentence: string, facts: ConclusionFacts): string | null {
  if (facts.headcount < SMALL_GROUP) return null;
  const quoted = extractNumbers(sentence);
  const annual = roundToHalfWan(facts.annualYuan);
  const current = roundToHalfWan(facts.currentYuan);
  if (quotes(quoted, annual) && quotes(quoted, current)) {
    const drivers = [facts.joinYuan, facts.leaveYuan, facts.agentYuan].map((yuan) => roundToHalfWan(yuan)).filter((wan) => wan !== 0);
    if (drivers.length > 0 && drivers.every((wan) => quotes(quoted, wan))) {
      const gap = roundingGapWan(annual, [current, ...drivers]);
      if (!sumWithinHalfWan(annual, [current, ...drivers])) {
        return `分项相加与合计差 ${Math.abs(gap).toFixed(1)} 万，超过 0.5`;
      }
    }
  }
  if (facts.budgetYuan == null) return null;
  const budget = roundToHalfWan(facts.budgetYuan);
  const over = Number((annual - budget).toFixed(1));
  const currentOver = Number((current - budget).toFixed(1));
  const inFlight = roundToHalfWan(facts.inFlightYuan);
  if ([over, currentOver, inFlight].every((wan) => wan !== 0 && quotes(quoted, wan))) {
    const gap = roundingGapWan(over, [currentOver, inFlight]);
    if (!sumWithinHalfWan(over, [currentOver, inFlight])) {
      return `现有差额与在途相加，和超出预算差 ${Math.abs(gap).toFixed(1)} 万，超过 0.5`;
    }
  }
  return null;
}

export function validateConclusion(
  sentence: string,
  facts: ConclusionFacts,
  secrets: { names: string[]; employeeNos: string[]; departmentNames: string[] },
): { ok: true } | { ok: false; reason: string } {
  const text = sentence.trim();
  if (!text) return { ok: false, reason: "空句子" };
  if (mentionsPerson(text, secrets.names, secrets.employeeNos)) return { ok: false, reason: "出现了人名或工号" };
  if (mentionsDepartureType(text)) return { ok: false, reason: "出现了离职类型" };
  if (mentionsHeadcountBelowFive(text, secrets.departmentNames)) return { ok: false, reason: "出现了少于 5 人的部门人数" };
  const allowed = allowedNumbers(facts);
  for (const value of extractNumbers(text)) {
    if (!numberAllowed(value, allowed)) return { ok: false, reason: `数字 ${value} 对不上成本引擎` };
  }
  const summed = roundedSumMismatch(text, facts);
  if (summed) return { ok: false, reason: summed };
  return { ok: true };
}

export function conclusionMessages(root: ConclusionFacts, children: ConclusionFacts[], secrets: string[]): ChatTurn[] {
  const units = modelUnits(root, children);
  const body = scrubText(JSON.stringify({ year: root.year, departments: units }), secrets);
  return [
    {
      role: "system",
      content:
        "你是编制规划助手。只用用户给出的部门汇总写一句简体中文结论。每个数字都必须来自这些汇总，不要自己计算新的数字，不要点名员工，不要写工号、薪酬、离职类型或补偿。少于 5 人的部门只写成「有人员调整」，不要写出它的人数或金额。人在前，写成「人 : AI」时不要颠倒。",
    },
    { role: "user", content: body },
  ];
}

export async function chooseConclusion(input: {
  root: ConclusionFacts;
  children: ConclusionFacts[];
  names: string[];
  employeeNos: string[];
  departmentNames: string[];
  cached: string | null;
  complete: ((messages: ChatTurn[]) => Promise<string | null>) | null;
}): Promise<{ text: string; origin: "template" | "model" | "cache" }> {
  const fallback = templateConclusion(input.root);
  const secrets = { names: input.names, employeeNos: input.employeeNos, departmentNames: input.departmentNames };
  if (input.cached) {
    const cached = validateConclusion(input.cached, input.root, secrets);
    if (cached.ok) return { text: input.cached, origin: "cache" };
  }
  if (!input.complete) return { text: fallback, origin: "template" };
  const raw = await input.complete(conclusionMessages(input.root, input.children, [...input.names, ...input.employeeNos]));
  if (!raw) return { text: fallback, origin: "template" };
  const verdict = validateConclusion(raw, input.root, secrets);
  if (!verdict.ok) return { text: fallback, origin: "template" };
  return { text: raw.trim(), origin: "model" };
}
