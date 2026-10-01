import { describe, expect, it } from "vitest";
import { departmentLinks, normalizeCounts, rollupLinksToVisible, scorePairs, strengthFromNormalized } from "@/lib/collab/strength";
import { leaderCollaborators } from "@/lib/collab/view";
import type { OrgSnapshot } from "@/lib/model/types";

describe("协作强度", () => {
  it("三项都在时按 0.4 / 0.4 / 0.2 合成，并四舍五入", () => {
    const scored = strengthFromNormalized({ messages: 82, meetings: 76, okr: 40 });
    expect(scored.score).toBe(71);
    expect(scored.missing).toEqual([]);
    expect(scored.usedWeights.messages).toBeCloseTo(0.4);
    expect(scored.usedWeights.meetings).toBeCloseTo(0.4);
    expect(scored.usedWeights.okr).toBeCloseTo(0.2);
  });

  it("缺消息次数时，用会议和 OKR 的原权重重新归一", () => {
    const scored = strengthFromNormalized({ messages: null, meetings: 60, okr: 30 });
    expect(scored.missing).toEqual(["messages"]);
    expect(scored.usedWeights.messages).toBe(0);
    expect(scored.usedWeights.meetings).toBeCloseTo(0.4 / 0.6);
    expect(scored.usedWeights.okr).toBeCloseTo(0.2 / 0.6);
    expect(scored.score).toBe(Math.round(60 * (0.4 / 0.6) + 30 * (0.2 / 0.6)));
  });

  it("三项都缺失时没有分数", () => {
    expect(strengthFromNormalized({ messages: null, meetings: null, okr: null }).score).toBeNull();
  });

  it("次数按本批最大值归一到 0–100，空值保持为空", () => {
    expect(normalizeCounts([50, 100, null, 0])).toEqual([50, 100, null, 0]);
  });

  it("画布只保留跨部门连线，同一部门的配对不出现", () => {
    const scored = scorePairs([
      { aId: "a", bId: "b", aDeptId: "d1", bDeptId: "d2", messages: 10, meetings: 4, okr: 1 },
      { aId: "a", bId: "c", aDeptId: "d1", bDeptId: "d1", messages: 80, meetings: 10, okr: 4 },
    ]);
    const links = departmentLinks(scored);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ aId: "d1", bId: "d2" });
    expect(links.some((link) => link.aId === link.bId)).toBe(false);
  });

  it("折叠后把连线收到可见部门，两端变成同一个部门就不再画", () => {
    const links = rollupLinksToVisible(
      [{ aId: "child", bId: "other", score: 80, pairCount: 2 }],
      [
        { id: "root", parentId: null },
        { id: "child", parentId: "root" },
        { id: "other", parentId: null },
      ],
      new Set(["root", "other"]),
    );
    expect(links).toEqual([{ aId: "other", bId: "root", score: 80, pairCount: 2 }]);
    const hidden = rollupLinksToVisible(
      [{ aId: "child", bId: "sibling", score: 40, pairCount: 1 }],
      [
        { id: "root", parentId: null },
        { id: "child", parentId: "root" },
        { id: "sibling", parentId: "root" },
      ],
      new Set(["root"]),
    );
    expect(hidden).toEqual([]);
  });

  it("负责人卡片按人展示协作，但不带名次", () => {
    const snapshot: OrgSnapshot = {
      departments: [
        { id: "d1", name: "平台部", path: ["公司", "平台部"], parentId: null, headId: "p1" },
        { id: "d2", name: "数据智能部", path: ["公司", "数据智能部"], parentId: null, headId: "p2" },
      ],
      people: [
        {
          id: "p1",
          rowNumber: 1,
          name: "林知夏",
          originalName: "林知夏",
          employeeId: "1",
          departmentRaw: "公司/平台部",
          departmentPath: ["公司", "平台部"],
          title: "平台总监",
          managerName: "",
          managerId: null,
          level: "",
          annualCost: null,
          hireDate: "",
          location: "",
          performance: "",
          email: "",
        },
        {
          id: "p2",
          rowNumber: 2,
          name: "顾清和",
          originalName: "顾清和",
          employeeId: "2",
          departmentRaw: "公司/数据智能部",
          departmentPath: ["公司", "数据智能部"],
          title: "数据智能负责人",
          managerName: "",
          managerId: null,
          level: "",
          annualCost: null,
          hireDate: "",
          location: "",
          performance: "",
          email: "",
        },
      ],
    };
    const cards = leaderCollaborators(
      snapshot,
      "p1",
      scorePairs([{ aId: "p1", bId: "p2", aDeptId: "d1", bDeptId: "d2", messages: 10, meetings: 4, okr: 1 }]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].relation).toBe("跨部门");
    expect(JSON.stringify(cards)).not.toMatch(/名次|排名|rank/);
    expect(cards[0]).not.toHaveProperty("rank");
  });
});
