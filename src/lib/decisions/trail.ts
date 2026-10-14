import type { DecisionRecord } from "@/lib/model/types";
import { hasPlacement, stripGuardedText } from "@/lib/decisions/guard";

const EMPTY_PEOPLE: { name: string; originalName: string; employeeId: string }[] = [];

function cleanPiece(text: string): string {
  if (!hasPlacement(text)) return text.trim();
  return stripGuardedText(text, EMPTY_PEOPLE);
}

/** 人员安置句子从轨迹里拿掉。整条都是安置内容时不展示、也不计数。 */
export function sanitizeDecision(record: DecisionRecord): DecisionRecord | null {
  const fields = record.fields
    .map((field) => ({ ...field, text: cleanPiece(field.text) }))
    .filter((field) => field.text);
  const beforeText = cleanPiece(record.beforeText);
  const afterText = cleanPiece(record.afterText);
  const title = cleanPiece(record.title);
  const opinion = cleanPiece(record.opinion);
  if (!title && fields.length === 0 && !beforeText && !afterText) return null;
  return { ...record, title, fields, beforeText, afterText, opinion };
}

export function visibleDecisions(records: DecisionRecord[]): DecisionRecord[] {
  return records.flatMap((record) => {
    const clean = sanitizeDecision(record);
    return clean ? [clean] : [];
  });
}

export function countExecuted(records: DecisionRecord[], departmentId?: string): number {
  return visibleDecisions(records).filter(
    (record) => record.status === "executed" && (departmentId == null || record.departmentId === departmentId),
  ).length;
}
