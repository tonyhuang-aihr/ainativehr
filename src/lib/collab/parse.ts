import type { CollabBundle, CollabPair, PersonGoal, PersonOkr, SheetTable } from "@/lib/model/types";
import { normalizeHeader } from "@/lib/import/matchColumns";

const CONTENT_HEADER = /内容|纪要|聊天|正文|原文|transcript|messagebody|meetingnote|摘要|记录正文/;
const RANK_HEADER = /排名|名次|排行|评级|评分|等级|leaderboard|rank/;

function findHeader(headers: string[], aliases: string[]): number {
  const normalized = headers.map((header) => normalizeHeader(header));
  for (const alias of aliases) {
    const index = normalized.indexOf(normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function parseCount(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (!text || text === "-" || text === "—" || text === "未提供" || text === "无") return null;
  const n = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function contentHeaders(headers: string[]): string[] {
  return headers.filter((header) => CONTENT_HEADER.test(normalizeHeader(header)) || CONTENT_HEADER.test(header));
}

export function parseCollabSheet(table: SheetTable): { pairs: CollabPair[]; ignoredContentHeaders: string[] } {
  const ignoredContentHeaders = contentHeaders(table.headers);
  const personA = findHeader(table.headers, ["人A", "人员A", "员工A"]);
  const personB = findHeader(table.headers, ["人B", "人员B", "员工B"]);
  const messages = findHeader(table.headers, ["消息次数", "IM次数", "消息数"]);
  const meetings = findHeader(table.headers, ["共同会议次数", "会议次数", "共同会议数"]);
  const okr = findHeader(table.headers, ["OKR对齐次数", "OKR次数", "对齐次数"]);
  if (personA < 0 || personB < 0) return { pairs: [], ignoredContentHeaders };
  const pairs: CollabPair[] = [];
  for (const row of table.rows) {
    const a = (row[personA] ?? "").trim();
    const b = (row[personB] ?? "").trim();
    if (!a || !b || a === b) continue;
    pairs.push({
      personA: a,
      personB: b,
      messages: messages < 0 ? null : parseCount(row[messages]),
      meetings: meetings < 0 ? null : parseCount(row[meetings]),
      okrAlignments: okr < 0 ? null : parseCount(row[okr]),
    });
  }
  return { pairs, ignoredContentHeaders };
}

function splitDepts(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[、,，/|;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseOkrSheet(table: SheetTable): PersonOkr[] {
  const name = findHeader(table.headers, ["姓名", "负责人", "员工姓名"]);
  const objective = findHeader(table.headers, ["目标", "O", "目标O"]);
  const aligned = findHeader(table.headers, ["对齐的上级目标", "上级目标", "对齐上级"]);
  const unaligned = findHeader(table.headers, ["未对齐部门", "未对齐协作部门"]);
  if (name < 0 || objective < 0) return [];
  const krs = [1, 2, 3].map((index) => ({
    title: findHeader(table.headers, [`KR${index}`, `关键结果${index}`]),
    progress: findHeader(table.headers, [`KR${index}进度`, `关键结果${index}进度`]),
  }));
  return table.rows.flatMap((row) => {
    const personName = (row[name] ?? "").trim();
    const text = (row[objective] ?? "").trim();
    if (!personName || !text) return [];
    const keyResults = krs.flatMap((kr) => {
      const title = kr.title < 0 ? "" : (row[kr.title] ?? "").trim();
      if (!title) return [];
      const progress = kr.progress < 0 ? null : parseCount(row[kr.progress]);
      return [{ title, progress: progress == null ? null : Math.max(0, Math.min(100, progress)) }];
    });
    return [
      {
        personName,
        objective: text,
        alignedTo: aligned < 0 ? "" : (row[aligned] ?? "").trim(),
        keyResults,
        unalignedDepartments: unaligned < 0 ? [] : splitDepts(row[unaligned]),
      },
    ];
  });
}

export function parseGoalSheet(table: SheetTable): PersonGoal[] {
  const name = findHeader(table.headers, ["姓名", "负责人", "员工姓名"]);
  const goal = findHeader(table.headers, ["目标名称", "绩效目标", "指标"]);
  const weight = findHeader(table.headers, ["权重", "权重百分比"]);
  if (name < 0 || goal < 0 || weight < 0) return [];
  return table.rows.flatMap((row) => {
    const personName = (row[name] ?? "").trim();
    const label = (row[goal] ?? "").trim();
    const parsed = parseCount(row[weight]);
    if (!personName || !label || parsed == null) return [];
    return [{ personName, name: label, weight: parsed }];
  });
}

export function ignoredRankHeaders(tables: SheetTable[]): string[] {
  const found: string[] = [];
  for (const table of tables) {
    for (const header of table.headers) {
      if (RANK_HEADER.test(normalizeHeader(header)) || RANK_HEADER.test(header)) found.push(header);
    }
  }
  return found;
}

export function collabBundleFromSheets(
  sheets: SheetTable[],
  meta: { sample: boolean; updatedAt: string; windowDays?: number },
): CollabBundle {
  let pairs: CollabPair[] = [];
  let okrs: PersonOkr[] = [];
  let goals: PersonGoal[] = [];
  const ignored = new Set<string>();
  for (const sheet of sheets) {
    const collab = parseCollabSheet(sheet);
    if (collab.pairs.length > pairs.length) pairs = collab.pairs;
    for (const header of collab.ignoredContentHeaders) ignored.add(header);
    const nextOkrs = parseOkrSheet(sheet);
    if (nextOkrs.length > okrs.length) okrs = nextOkrs;
    const nextGoals = parseGoalSheet(sheet);
    if (nextGoals.length > goals.length) goals = nextGoals;
  }
  return {
    sample: meta.sample,
    windowDays: meta.windowDays ?? 90,
    updatedAt: meta.updatedAt,
    pairs,
    okrs,
    goals,
    ignoredContentHeaders: [...ignored],
    ignoredRankHeaders: ignoredRankHeaders(sheets),
  };
}
