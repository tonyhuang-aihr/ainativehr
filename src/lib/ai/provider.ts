import { decomposeRoleOffline } from "@/lib/ai/templates";
import { answerOffline } from "@/lib/ai/offlineChat";
import { matchColumns } from "@/lib/import/matchColumns";
import type { ColumnMatch, OrgIssue, RoleTask } from "@/lib/model/types";
import type { OrgMetrics } from "@/lib/org/metrics";

export type AiMode = "offline" | "llm";

export type AiStatus = {
  mode: AiMode;
  model: string | null;
};

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

/**
 * 所有模型调用都从这里出去。没配密钥、接口失败或返回无法解析时，退回确定性结果。
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

export async function matchColumnsWithAi(headers: string[], mode: AiMode): Promise<{ matches: ColumnMatch[]; mode: AiMode }> {
  if (mode === "llm") {
    const text = await complete(
      [
        {
          role: "system",
          content:
            "你是组织数据清洗助手。只输出 JSON 对象 {\"matches\":[...]}，不要解释。每项包含 field, header, confidence, reason。field 只能是 name, department, title, manager, employeeId, level, annualCost, hireDate, location, performance, email, status。一列最多一个字段。",
        },
        { role: "user", content: `列名：${headers.join(" | ")}` },
      ],
      true,
    );
    const parsed = text ? parseMatches(text, headers) : null;
    if (parsed && parsed.length > 0) return { matches: parsed, mode: "llm" };
  }
  return { matches: matchColumns(headers), mode: "offline" };
}

export async function decomposeRoleWithAi(
  title: string,
  mode: AiMode,
): Promise<{ tasks: RoleTask[]; mode: AiMode }> {
  if (mode === "llm") {
    const text = await complete(
      [
        {
          role: "system",
          content:
            "你帮助 OD 把岗位拆成任务。只输出 JSON 对象 {\"tasks\":[...]}。每项包含 name, timeShare(0到1), frequency, mode(human|ai|collab), reason, confidence(0到1)。timeShare 相加为 1。不要评价个人，不要输出排名。",
        },
        { role: "user", content: `岗位名称：${title}。请给 5 到 8 条任务。` },
      ],
      true,
    );
    const tasks = text ? parseTasks(text) : null;
    if (tasks) return { tasks, mode: "llm" };
  }
  return { tasks: decomposeRoleOffline(title), mode: "offline" };
}

export async function chatWithAi(
  question: string,
  context: string,
  mode: AiMode,
  issues: OrgIssue[],
  metrics: OrgMetrics,
): Promise<{ text: string; mode: AiMode }> {
  if (mode === "llm") {
    const text = await complete([
      {
        role: "system",
        content:
          "你是组织设计沙盘里的 OD 助手。用简体中文，短一些，先给结论。你只提建议，不宣称已经改了架构。不要做个人绩效排名，不要评价某个员工好不好。敏感薪酬只讨论汇总数。",
      },
      { role: "user", content: `${context}\n\n用户问题：${question}` },
    ]);
    if (text) return { text, mode: "llm" };
  }
  return { text: answerOffline(question, issues, metrics), mode: "offline" };
}

async function complete(messages: ChatTurn[], json = false): Promise<string | null> {
  try {
    const response = await fetch("/api/ai/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, json }),
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
