import { readFileSync } from "node:fs";
import { join } from "node:path";

export type TooltipFileRow = { page: string; metric: string; text: string };

export const TOOLTIP_FILE = join(process.cwd(), "src/lib/headcount/tooltips-v1.1.md");

export function loadTooltipFile(path = TOOLTIP_FILE): TooltipFileRow[] {
  const rows: TooltipFileRow[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3 || cells[0] === "页面" || cells[0] === "位置" || cells[2] === "悬停文案" || cells[0].startsWith("-")) continue;
    rows.push({ page: cells[0], metric: cells[1], text: cells[2] });
  }
  return rows;
}
