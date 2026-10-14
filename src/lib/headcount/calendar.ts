/** 规划年度按自然季度。「当季」在示例公司里是 2027 年第一季度。 */

export const PLAN_YEAR = 2027;
export const AS_OF = "2026-10-04";
export const CURRENT_QUARTER_INDEX = 0;

export function utcDate(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

export function parseIsoDate(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) throw new Error(`无法识别的日期：${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatIsoDate(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function dateParts(ms: number): { year: number; month: number; day: number } {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function yearStart(year: number): number {
  return utcDate(year, 1, 1);
}

export function yearEnd(year: number): number {
  return utcDate(year + 1, 1, 1);
}

export function yearDays(year: number): number {
  return Math.round((yearEnd(year) - yearStart(year)) / 86_400_000);
}

/** 四个季度，区间为左闭右开。 */
export function quarterBounds(year: number): [number, number][] {
  return [
    [utcDate(year, 1, 1), utcDate(year, 4, 1)],
    [utcDate(year, 4, 1), utcDate(year, 7, 1)],
    [utcDate(year, 7, 1), utcDate(year, 10, 1)],
    [utcDate(year, 10, 1), utcDate(year + 1, 1, 1)],
  ];
}

export function quarterDayCounts(year: number): number[] {
  return quarterBounds(year).map(([start, end]) => Math.round((end - start) / 86_400_000));
}

export function overlapDays(rangeStart: number, rangeEnd: number, start: number, end: number): number {
  const from = Math.max(rangeStart, start);
  const to = Math.min(rangeEnd, end);
  if (to <= from) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function quarterIndex(year: number, ms: number): number {
  const bounds = quarterBounds(year);
  return bounds.findIndex(([start, end]) => ms >= start && ms < end);
}
