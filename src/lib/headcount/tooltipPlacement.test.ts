import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLTIPS } from "@/lib/headcount/copy";
import { ROUNDING_GAP_NOTE } from "@/lib/headcount/money";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const source = files(join(process.cwd(), "src")).map((path) => readFileSync(path, "utf8")).join("\n");

describe("悬停文案都挂在页面上", () => {
  it("每条都有 slot，取整句与页面上的说明相同", () => {
    const missing: string[] = [];
    for (const item of TOOLTIPS) {
      if (item.page === "OD 底座 · 部门页" && item.metric === "≈ ① + ②") {
        expect(item.text).toBe(ROUNDING_GAP_NOTE);
        expect(source).toContain(ROUNDING_GAP_NOTE);
      }
      const call = `slot(${JSON.stringify(item.page)}, ${JSON.stringify(item.metric)})`;
      if (!source.includes(call)) missing.push(`${item.page} / ${item.metric}`);
    }
    expect(missing).toEqual([]);
  });
});
