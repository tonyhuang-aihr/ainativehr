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
        "你是组织设计沙盘里的 OD 助手。用简体中文，短一些，先给结论。你只看到部门名称、部门 ID、人数、层级、岗位和汇总指标。少于 5 人的单位会写成「有人员调整」，不要追问具体人数或姓名。不要点名员工，不要要工号、薪酬或绩效，不要做个人排名。你只提建议，不宣称已经改了架构。",
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

/** 决策说明的离线预填。调用方传入的已经是部门汇总，这里再过一遍 scrub。 */
export function buildDecisionPrefill(input: {
  departmentName: string;
  beforePhrase: string;
  afterPhrase: string;
  reviewDate: string;
  secrets: string[];
}): DecisionPrefill {
  const background = `${input.departmentName}当前的结构承接口径不统一。调整前规模 ${input.beforePhrase}，调整后规模 ${input.afterPhrase}。`;
  const intent = "把同一类交付收到一套结构里，缩短交付周期，并把管理幅度收回到建议区间。";
  const expectedEffect = "核心服务的可用性维持在现有目标附近，管理幅度回到建议区间。复盘时只对照当初写的结构预期。";
  const scrub = (text: string) => scrubText(text, input.secrets);
  return {
    background: scrub(background),
    intent: scrub(intent),
    expectedEffect: scrub(expectedEffect),
    reviewDate: scrub(input.reviewDate),
  };
}

export function reviewDateMonthsAhead(today: Date, months = 6): string {
  const next = new Date(today.getTime());
  next.setMonth(next.getMonth() + months);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
