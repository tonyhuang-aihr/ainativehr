import type { CollabBundle, OrgIssue, OrgSnapshot } from "@/lib/model/types";
import type { OrgMetrics } from "@/lib/org/metrics";
import { directReports, peopleInDepartment } from "@/lib/org/metrics";

/** 少于 5 人的部门不把精确人数交给模型。 */
export const SMALL_GROUP = 5;

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

const FORBIDDEN_JSON_KEYS = [
  "name",
  "originalName",
  "employeeId",
  "email",
  "annualCost",
  "performance",
  "personName",
  "managerName",
  "salary",
  "personA",
  "personB",
  "managerRaw",
];

export function groupSizePhrase(count: number): string {
  return count < SMALL_GROUP ? "有人员调整" : `${count} 人`;
}

function pushSecret(target: string[], value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (text.length >= 2) target.push(text);
}

/** 从本地花名册收集不能出现在模型请求里的原值。部门名不在此列。 */
export function collectPersonalSecrets(snapshot: OrgSnapshot | null, collab?: CollabBundle | null): string[] {
  const secrets: string[] = [];
  for (const person of snapshot?.people ?? []) {
    pushSecret(secrets, person.name);
    pushSecret(secrets, person.originalName);
    pushSecret(secrets, person.employeeId);
    pushSecret(secrets, person.email);
    pushSecret(secrets, person.managerName);
    pushSecret(secrets, person.performance);
    if (person.annualCost != null && person.annualCost >= 1000) {
      secrets.push(String(Math.round(person.annualCost)));
      secrets.push(person.annualCost.toLocaleString("en-US"));
    }
  }
  for (const pair of collab?.pairs ?? []) {
    pushSecret(secrets, pair.personA);
    pushSecret(secrets, pair.personB);
  }
  for (const okr of collab?.okrs ?? []) pushSecret(secrets, okr.personName);
  for (const goal of collab?.goals ?? []) pushSecret(secrets, goal.personName);
  return [...new Set(secrets)];
}

export function scrubText(text: string, secrets: string[]): string {
  let out = stripForbiddenJsonValues(text);
  const terms = [...new Set(secrets.map((item) => item.trim()).filter((item) => item.length >= 2))];
  terms.sort((a, b) => b.length - a.length);
  for (const term of terms) out = out.split(term).join("已省略");
  return out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "已省略");
}

export function stripForbiddenJsonValues(text: string): string {
  let out = text;
  for (const key of FORBIDDEN_JSON_KEYS) {
    out = out.replace(new RegExp(`("${key}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "g"), `$1"已省略"`);
    out = out.replace(new RegExp(`("${key}"\\s*:\\s*)-?\\d+(?:\\.\\d+)?`, "g"), `$1null`);
  }
  return out;
}

/** 所有发往 /api/ai/complete 的消息都先过这里。 */
export function desensitizeMessages(messages: ChatTurn[], secrets: string[]): ChatTurn[] {
  return messages.map((message) => ({
    role: message.role,
    content: scrubText(message.content, secrets),
  }));
}

function deptFact(snapshot: OrgSnapshot, departmentId: string | undefined) {
  const department = departmentId ? snapshot.departments.find((item) => item.id === departmentId) : undefined;
  if (!department) return null;
  return {
    id: department.id,
    name: department.name,
    layers: department.path.length,
    headcount: peopleInDepartment(snapshot.people, department.path).length,
  };
}

/**
 * 只允许部门名、部门 ID、人数（小部门改为「有人员调整」）、层级、岗位和汇总指标进入模型。
 */
export function buildChatMessages(input: {
  question: string;
  snapshot: OrgSnapshot | null;
  issues: OrgIssue[];
  metrics: OrgMetrics;
  secrets: string[];
}): ChatTurn[] {
  const { snapshot, issues, metrics, secrets } = input;
  const question = scrubText(input.question, secrets);
  const headcount = groupSizePhrase(metrics.headcount);
  const labor =
    metrics.headcount >= SMALL_GROUP && metrics.laborCost != null
      ? `人力成本汇总 ${Math.round(metrics.laborCost)} 元`
      : "人力成本汇总未单列";
  const deptLines = (snapshot?.departments ?? []).slice(0, 40).map((department) => {
    const count = peopleInDepartment(snapshot!.people, department.path).length;
    return `- ${department.name}（${department.id}）层级 ${department.path.length}，规模 ${groupSizePhrase(count)}`;
  });
  const issueLines = issues.slice(0, 8).map((issue) => {
    const fact = snapshot ? deptFact(snapshot, issue.departmentIds[0]) : null;
    const personId = issue.personIds[0];
    const span = snapshot && personId ? directReports(snapshot, personId).length : null;
    const where = fact ? `${fact.name}（${fact.id}）` : "未点名部门";
    const size = fact ? `规模 ${groupSizePhrase(fact.headcount)}` : "规模未提供";
    const spanText = span == null ? "" : span < SMALL_GROUP ? "，直接下级有人员调整" : `，直接下级 ${span} 人`;
    return `- ${issue.title}（${issue.code}）：${where}，${size}${spanText}`;
  });
  const body = [
    `组织汇总：人数 ${headcount}，层级 ${metrics.layers}，平均管理幅度 ${Math.round(metrics.avgSpan * 10) / 10}，${labor}。`,
    deptLines.length ? `部门：\n${deptLines.join("\n")}` : "部门：无",
    issueLines.length ? `结构提醒（不含个人）：\n${issueLines.join("\n")}` : "结构提醒：无",
    `用户问题：${question || "请根据上面的汇总说下一步。"}`,
  ].join("\n\n");
  return [
    {
      role: "system",
      content:
        "你是组织设计沙盘里的 OD 助手。用简体中文，短一些，先给结论。你只看到部门名称、部门 ID、人数、层级、岗位和汇总指标。少于 5 人的单位会写成「有人员调整」，不要追问具体人数或姓名。不要点名员工，不要要工号、薪酬或绩效，不要做个人排名。人机比一律写成「人 : AI = 人工时 : AI 工时」，人在前。你只提建议，不宣称已经改了架构。",
    },
    { role: "user", content: scrubText(body, secrets) },
  ];
}

export type DecisionPrefill = {
  background: string;
  intent: string;
  expectedEffect: string;
  reviewDate: string;
};

export type HeadcountChange = {
  id?: string;
  name: string;
  before: number;
  after: number;
};

/** 方案相对基线的部门人数。只取中心下的一级部门，下级组的变化记在上级里。 */
export function departmentHeadcountChanges(baseline: OrgSnapshot, current: OrgSnapshot): HeadcountChange[] {
  return current.departments
    .filter((department) => department.path.length === 2)
    .map((department) => ({
      id: department.id,
      name: department.name,
      before: peopleInDepartment(baseline.people, department.path).length,
      after: peopleInDepartment(current.people, department.path).length,
    }));
}

function changedOnly(changes: HeadcountChange[]): HeadcountChange[] {
  return changes.filter((change) => change.before !== change.after);
}

/** 少于 5 人的一侧不写具体人数。人数没变的部门不出现在这句话里。 */
export function headcountChangePhrase(change: HeadcountChange): string {
  if (change.before < SMALL_GROUP || change.after < SMALL_GROUP) return `${change.name}有人员调整`;
  return `${change.name} ${change.before} 人 → ${change.after} 人`;
}

export function changeEnds(changes: HeadcountChange[]): { beforeText: string; afterText: string } {
  const changed = changedOnly(changes);
  if (changed.length === 0) return { beforeText: "部门人数与基线一致", afterText: "部门人数与基线一致" };
  const hidden = (change: HeadcountChange) => change.before < SMALL_GROUP || change.after < SMALL_GROUP;
  return {
    beforeText: changed.map((change) => (hidden(change) ? `${change.name}有人员调整` : `${change.name} ${change.before} 人`)).join("；"),
    afterText: changed.map((change) => (hidden(change) ? `${change.name}有人员调整` : `${change.name} ${change.after} 人`)).join("；"),
  };
}

export type StructureMove = {
  name: string;
  from: string;
  to: string;
  people: number;
};

export type SpanShift = {
  department: string;
  span: number;
  limit: number;
};

function peopleOnPath(people: OrgSnapshot["people"], path: string[]): OrgSnapshot["people"] {
  const key = path.join("/");
  return people.filter((person) => {
    const current = person.departmentPath.join("/");
    return current === key || current.startsWith(`${key}/`);
  });
}

function spanCounts(snapshot: OrgSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of snapshot.people) {
    if (!person.managerId || person.managerId === person.id) continue;
    counts.set(person.managerId, (counts.get(person.managerId) ?? 0) + 1);
  }
  return counts;
}

/** 基线有、方案里没了的部门，按人员去向看成一次并入。 */
export function structureMoves(baseline: OrgSnapshot, current: OrgSnapshot): StructureMove[] {
  const currentIds = new Set(current.departments.map((department) => department.id));
  const currentPeople = new Map(current.people.map((person) => [person.id, person]));
  const moves: StructureMove[] = [];
  for (const department of baseline.departments) {
    if (currentIds.has(department.id) || department.path.length < 2) continue;
    const members = peopleOnPath(baseline.people, department.path);
    if (members.length === 0) continue;
    const destinations = new Map<string, number>();
    for (const member of members) {
      const now = currentPeople.get(member.id);
      const destination = now?.departmentPath.at(-1);
      if (!destination || destination === department.name) continue;
      destinations.set(destination, (destinations.get(destination) ?? 0) + 1);
    }
    const top = [...destinations.entries()].sort((left, right) => right[1] - left[1])[0];
    if (!top) continue;
    moves.push({
      name: department.name,
      from: department.path[department.path.length - 2] ?? department.path[0],
      to: top[0],
      people: members.length,
    });
  }
  return moves;
}

/** 只记这次新超过建议上限的幅度，并且只写部门，不写人。 */
export function newlyWideSpans(baseline: OrgSnapshot, current: OrgSnapshot, limit: number): SpanShift[] {
  const before = spanCounts(baseline);
  const after = spanCounts(current);
  const seen = new Set<string>();
  const shifts: SpanShift[] = [];
  for (const person of current.people) {
    const next = after.get(person.id) ?? 0;
    const previous = before.get(person.id) ?? 0;
    if (next <= limit || previous > limit) continue;
    const department = person.departmentPath.at(-1);
    if (!department || seen.has(department)) continue;
    seen.add(department);
    shifts.push({ department, span: next, limit });
  }
  return shifts;
}

function scrubMove(move: StructureMove, secrets: string[]): StructureMove {
  return {
    name: scrubText(move.name, secrets),
    from: scrubText(move.from, secrets),
    to: scrubText(move.to, secrets),
    people: move.people,
  };
}

/** 决策说明的离线预填。背景、意图、预期效果各写一件事，再过一遍 scrub。 */
export function buildDecisionPrefill(input: {
  changes: HeadcountChange[];
  reviewDate: string;
  secrets: string[];
  moves?: StructureMove[];
  spans?: SpanShift[];
}): DecisionPrefill {
  const secrets = input.secrets;
  const moves = (input.moves ?? []).map((move) => scrubMove(move, secrets));
  const spans = (input.spans ?? []).map((span) => ({ ...span, department: scrubText(span.department, secrets) }));
  const changed = changedOnly(input.changes);
  const joined = changed.map(headcountChangePhrase).join("；");
  const background = moves.length
    ? moves.map((move) => `${move.name} ${move.people} 人原在${move.from}，和${move.to}不在同一个部门。`).join("")
    : changed.length
      ? changed
          .map((change) =>
            change.before < SMALL_GROUP || change.after < SMALL_GROUP ? `${change.name}有人员调整。` : `${change.name}调整前是 ${change.before} 人。`,
          )
          .join("")
      : "相对基线，部门人数和结构都没有变化。";
  const intent = moves.length
    ? moves.map((move) => `把${move.name}并入${move.to}，让原先在${move.from}的这一组归到${move.to}。`).join("")
    : changed.length
      ? `用意是调整编制：${changed
          .map((change) => {
            if (change.before < SMALL_GROUP || change.after < SMALL_GROUP) return `${change.name}有人员调整`;
            if (change.after > change.before) return `${change.name}增加人数`;
            return `${change.name}减少人数`;
          })
          .join("，")}。`
      : "结构没有变化，可以先不提交说明。";
  const effectParts: string[] = [];
  if (joined) effectParts.push(`可核对的人数变化是：${joined}。`);
  for (const span of spans) {
    effectParts.push(`${span.department}的管理幅度变为 ${span.span}，超过建议上限 ${span.limit}，需要后续跟进。`);
  }
  const expectedEffect = effectParts.join("") || "复盘时确认部门人数仍与基线一致。";
  const scrub = (text: string) => scrubText(text, secrets);
  return {
    background: scrub(background),
    intent: scrub(intent),
    expectedEffect: scrub(expectedEffect),
    reviewDate: scrub(input.reviewDate),
  };
}

function maskedMove(move: StructureMove): string {
  const who = move.people < SMALL_GROUP ? `${move.name}有人员调整` : `${move.name} ${move.people} 人`;
  return `${who}，原在${move.from}，并入${move.to}`;
}

/** 发给模型的决策说明提示。少于 5 人的移动不写具体人数，并且先脱敏。 */
export function buildDecisionPrefillMessages(input: {
  changes: HeadcountChange[];
  reviewDate: string;
  secrets: string[];
  moves?: StructureMove[];
  spans?: SpanShift[];
}): ChatTurn[] {
  const facts = changedOnly(input.changes).map(headcountChangePhrase).join("；") || "没有部门人数变化";
  const moveFacts = (input.moves ?? []).map((move) => maskedMove(scrubMove(move, input.secrets))).join("；");
  const spanFacts = (input.spans ?? [])
    .map((span) => `${scrubText(span.department, input.secrets)}的管理幅度变为 ${span.span}，建议上限 ${span.limit}`)
    .join("；");
  const lines = [
    moveFacts ? `结构调整：${moveFacts}。` : "",
    `人数变化：${facts}。`,
    spanFacts ? `管理幅度：${spanFacts}。` : "",
    `建议复盘日 ${input.reviewDate}。`,
  ].filter(Boolean);
  return [
    {
      role: "system",
      content:
        "你帮 OD 起草决策说明。只根据用户给出的事实写三段，且各写各的：背景只写调整前的位置和分开的原因；意图只写要归到哪里；预期效果只写可核对的人数变化，以及超过建议上限的管理幅度。人数变化只写在预期效果里，三段不要用同一句开头。不要写姓名、工号、薪酬、绩效，也不要写负责人去留或调岗。少于 5 人写成「有人员调整」，不要追问具体人数。不要把写作要求写进正文。只输出 JSON：{\"background\",\"intent\",\"expectedEffect\",\"reviewDate\"}。",
    },
    { role: "user", content: scrubText(lines.join(""), input.secrets) },
  ];
}

export function reviewDateMonthsAhead(today: Date, months = 6): string {
  const next = new Date(today.getTime());
  next.setMonth(next.getMonth() + months);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
