import { describe, expect, it } from "vitest";
import { formatBeijing } from "@/lib/headcount/clock";

describe("北京时间", () => {
  it("把 UTC 换成 YYYY-MM-DD HH:mm", () => {
    expect(formatBeijing(Date.parse("2026-10-04T02:15:00Z"))).toBe("2026-10-04 10:15");
    expect(formatBeijing(Date.parse("2026-01-01T16:30:00Z"))).toBe("2026-01-02 00:30");
  });
});
