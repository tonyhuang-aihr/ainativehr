import { describe, expect, it } from "vitest";
import { collabBundleFromSheets, parseCollabSheet } from "@/lib/collab/parse";
import type { SheetTable } from "@/lib/model/types";

describe("协作表解析", () => {
  it("只保留次数，内容列和评级列的格子不会进入结果", () => {
    const table: SheetTable = {
      name: "协作次数-示例数据",
      headers: ["人A", "人B", "消息次数", "共同会议次数", "OKR对齐次数", "消息内容", "会议纪要", "数据标记"],
      rows: [["林知夏", "顾清和", "180", "", "4", "这是不该保存的聊天原文", "会议里谈了薪资", "示例数据"]],
    };
    const parsed = parseCollabSheet(table);
    expect(parsed.ignoredContentHeaders).toEqual(expect.arrayContaining(["消息内容", "会议纪要"]));
    expect(parsed.pairs).toEqual([
      { personA: "林知夏", personB: "顾清和", messages: 180, meetings: null, okrAlignments: 4 },
    ]);
    expect(JSON.stringify(parsed.pairs)).not.toContain("聊天原文");
    expect(JSON.stringify(parsed.pairs)).not.toContain("薪资");
    expect(Object.keys(parsed.pairs[0]).sort()).toEqual(["meetings", "messages", "okrAlignments", "personA", "personB"]);
  });

  it("目标表只留下权重，排名和评级列被丢掉", () => {
    const sheets: SheetTable[] = [
      {
        name: "绩效目标权重-示例数据",
        headers: ["姓名", "目标名称", "权重", "绩效等级", "排名"],
        rows: [["林知夏", "稳定性", "40", "S", "1"]],
      },
    ];
    const bundle = collabBundleFromSheets(sheets, { sample: true, updatedAt: "2026-09-30" });
    expect(bundle.goals).toEqual([{ personName: "林知夏", name: "稳定性", weight: 40 }]);
    expect(bundle.ignoredRankHeaders).toEqual(expect.arrayContaining(["绩效等级", "排名"]));
    expect(JSON.stringify(bundle.goals)).not.toContain("S");
    expect(JSON.stringify(bundle)).not.toMatch(/"rank"/);
  });
});
