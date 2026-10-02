import {
  buildChatMessages,
  buildDecisionPrefill,
  collectPersonalSecrets,
  desensitizeMessages,
  scrubText,
  type ChatTurn,
  type DecisionPrefill,
} from "@/lib/ai/desensitize";
import { decomposeRoleOffline } from "@/lib/ai/templates";
import { answerOffline } from "@/lib/ai/offlineChat";
import { matchColumns } from "@/lib/import/matchColumns";
import type { CollabBundle, ColumnMatch, OrgIssue, OrgSnapshot, RoleTask } from "@/lib/model/types";
import type { OrgMetrics } from "@/lib/org/metrics";

export type AiMode = "offline" | "llm";

export type AiStatus = {
  mode: AiMode;
  model: string | null;
};

/**
 * 所有模型调用都从这里出去，并先经过脱敏。没配密钥、接口失败或返回无法解析时，退回确定性结果。
 * 界面必须标明当时用的是模型还是离线规则。
 */
export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const response = await fetch("/api/ai/status");
    if (!response.ok) return { mode: "offline", model: null };
    const body = (await response.json()) as { enabled?: boolean; model?: string | null };
    if (!body.enabled) return { mode: "offline", model: null };
    return { mode: "llm", model: body.model ?? null };
  } catch {
    return { mode: "offline", model: null };
  }
}

export async function matchColumnsWithAi(
  headers: string[],
  mode: AiMode,
  secrets: string[] = [],
): Promise<{ matches: ColumnMatch[]; mode: AiMode }> {
  if (mode === "llm") {
    const text = await complete(
      [
        {
          role: "system",
          content:
            "你是组织数据清洗助手。只根据列名给出对应关系，不要猜测单元格里的内容。只输出 JSON 对象 {\"matches\":[...]}，不要解释。每项包含 field, header, confidence, reason。field 只能是 name, department, title, manager, employeeId, level, annualCost, hireDate, location, performance, email, status。一列最多一个字段。",
        },
        { role: "user", content: `列名：${headers.map((header) => scrubText(header, secrets)).join(" | ")}` },
      ],
      true,
      secrets,
    );
    const parsed = text ? parseMatches(text, headers) : null;
    if (parsed && parsed.length > 0) return { matches: parsed, mode: "llm" };
  }
  return { matches: matchColumns(headers), mode: "offline" };
}

export async function decomposeRoleWithAi(
  title: string,
  mode: AiMode,
  secrets: string[] = [],
): Promise<{ tasks: RoleTask[]; mode: AiMode }> {
  const roleTitle = scrubText(title, secrets).trim();
  if (mode === "llm" && roleTitle) {
    const text = await complete(
      [
        {
          role: "system",
          content:
            "你帮助 OD 把岗位拆成任务。只根据岗位名称输出，不要假设员工是谁。只输出 JSON 对象 {\"tasks\":[...]}。每项包含 name, timeShare(0到1), frequency, mode(human|ai|collab), reason, confidence(0到1)。timeShare 相加为 1。不要评价个人，不要输出排名、薪酬或绩效。",
        },
        { role: "user", content: `岗位名称：${roleTitle}。请给 5 到 8 条任务。` },
      ],
      true,
      secrets,
    );
    const tasks = text ? parseTasks(text) : null;
    if (tasks) return { tasks, mode: "llm" };
  }
  return { tasks: decomposeRoleOffline(title), mode: "offline" };
}

export async function chatWithAi(input: {
  question: string;
  mode: AiMode;
  snapshot: OrgSnapshot | null;
  collab?: CollabBundle | null;
  issues: OrgIssue[];
  metrics: OrgMetrics;
}): Promise<{ text: string; mode: AiMode }> {
  const secrets = collectPersonalSecrets(input.snapshot, input.collab);
  if (input.mode === "llm") {
    const text = await complete(
      buildChatMessages({
        question: input.question,
        snapshot: input.snapshot,
        issues: input.issues,
        metrics: input.metrics,
        secrets,
      }),
      false,
      secrets,
    );
    if (text) return { text, mode: "llm" };
  }
  return { text: answerOffline(input.question, input.issues, input.metrics), mode: "offline" };
}

export async function prefillDecisionWithAi(input: {
  departmentName: string;
  beforePhrase: string;
  afterPhrase: string;
  reviewDate: string;
  secrets: string[];
  mode: AiMode;
}): Promise<{ prefill: DecisionPrefill; mode: AiMode }> {
  const offline = buildDecisionPrefill(input);
  if (input.mode !== "llm") return { prefill: offline, mode: "offline" };
  const text = await complete(
    [
      {
        role: "system",
        content:
          "你帮 OD 起草决策说明。只根据给出的部门汇总写背景、意图、预期效果和复盘日期。不要写姓名、工号、薪酬、绩效，也不要写负责人去留或调岗。只输出 JSON：{\"background\",\"intent\",\"expectedEffect\",\"reviewDate\"}。",
      },
      {
        role: "user",
        content: `部门：${input.departmentName}。调整前 ${input.beforePhrase}。调整后 ${input.afterPhrase}。建议复盘日 ${input.reviewDate}。`,
      },
    ],
    true,
    input.secrets,
  );
  const parsed = text ? parsePrefill(text) : null;
  if (!parsed) return { prefill: offline, mode: "offline" };
  return {
    prefill: {
      background: scrubText(parsed.background, input.secrets),
      intent: scrubText(parsed.intent, input.secrets),
      expectedEffect: scrubText(parsed.expectedEffect, input.secrets),
      reviewDate: scrubText(parsed.reviewDate, input.secrets) || offline.reviewDate,
    },
    mode: "llm",
  };
}

function parsePrefill(text: string): DecisionPrefill | null {
  const data = readJson(text);
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const background = String(record.background ?? "").trim();
  const intent = String(record.intent ?? "").trim();
  const expectedEffect = String(record.expectedEffect ?? "").trim();
  const reviewDate = String(record.reviewDate ?? "").trim();
  if (!background || !intent || !expectedEffect) return null;
  return { background, intent, expectedEffect, reviewDate };
}

async function complete(messages: ChatTurn[], json = false, secrets: string[] = []): Promise<string | null> {
  const safe = desensitizeMessages(messages, secrets);
  try {
    const response = await fetch("/api/ai/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: safe, json }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { text?: string };
    return body.text?.trim() || null;
  } catch {
    return null;
  }
}

function parseMatches(text: string, headers: string[]): ColumnMatch[] | null {
  const data = unwrapList(readJson(text), "matches");
  if (!Array.isArray(data)) return null;
  const allowed = new Set(headers);
  const fields = new Set<string>();
  const matches: ColumnMatch[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const field = String((item as { field?: string }).field ?? "");
    const header = String((item as { header?: string }).header ?? "");
    if (!allowed.has(header) || fields.has(field)) continue;
    fields.add(field);
    const confidence = Number((item as { confidence?: number }).confidence ?? 0.6);
    matches.push({
      field: field as ColumnMatch["field"],
      header,
      confidence: Number.isFinite(confidence) ? confidence : 0.6,
      reason: String((item as { reason?: string }).reason ?? "模型建议的对应关系"),
    });
  }
  const required = ["name", "department", "title", "manager"];
  if (!required.every((field) => matches.some((match) => match.field === field))) return null;
  return matches;
}

function parseTasks(text: string): RoleTask[] | null {
  const data = unwrapList(readJson(text), "tasks");
  if (!Array.isArray(data) || data.length < 3) return null;
  const tasks: RoleTask[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const mode = String((item as { mode?: string }).mode ?? "");
    if (mode !== "human" && mode !== "ai" && mode !== "collab") return null;
    const timeShare = Number((item as { timeShare?: number }).timeShare);
    const confidence = Number((item as { confidence?: number }).confidence ?? 0.6);
    if (!Number.isFinite(timeShare) || timeShare < 0) return null;
    tasks.push({
      id: `ai-${tasks.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      name: String((item as { name?: string }).name ?? "未命名任务"),
      timeShare,
      frequency: String((item as { frequency?: string }).frequency ?? "每周"),
      mode,
      reason: String((item as { reason?: string }).reason ?? ""),
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.6,
      source: "ai",
      edited: false,
    });
  }
  const total = tasks.reduce((sum, task) => sum + task.timeShare, 0);
  if (total <= 0) return null;
  if (Math.abs(total - 1) > 0.05) {
    tasks.forEach((task) => {
      task.timeShare = task.timeShare / total;
    });
  }
  return tasks;
}

function unwrapList(data: unknown, key: string): unknown {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key];
  }
  return data;
}

function readJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
