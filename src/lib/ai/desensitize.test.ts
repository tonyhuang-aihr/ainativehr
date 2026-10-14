import { describe, expect, it } from "vitest";
import {
  buildChatMessages,
  collectPersonalSecrets,
  desensitizeMessages,
  groupSizePhrase,
  stripForbiddenJsonValues,
} from "@/lib/ai/desensitize";
import type { OrgSnapshot } from "@/lib/model/types";
import type { OrgMetrics } from "@/lib/org/metrics";

function person(partial: {
  id: string;
  name: string;
  employeeId: string;
  departmentPath: string[];
  annualCost: number;
  performance: string;
  email: string;
  managerId?: string | null;
}): OrgSnapshot["people"][number] {
  return {
    id: partial.id,
    rowNumber: 1,
    name: partial.name,
    originalName: partial.name,
    employeeId: partial.employeeId,
    departmentRaw: partial.departmentPath.at(-1) ?? "",
    departmentPath: partial.departmentPath,
    title: "顾问",
    managerName: "",
    managerId: partial.managerId ?? null,
    level: "P6",
    annualCost: partial.annualCost,
    hireDate: "2020-01-01",
    location: "上海",
    performance: partial.performance,
    email: partial.email,
  };
}

const snapshot: OrgSnapshot = {
  departments: [
    { id: "dept-strategy", name: "战略部", path: ["星澜科技", "战略部"], parentId: "dept-root", headId: "p1" },
    { id: "dept-cs", name: "客户成功部", path: ["星澜科技", "客户成功部"], parentId: "dept-root", headId: "p4" },
  ],
  people: [
    person({ id: "p1", name: "何清", employeeId: "E10086", departmentPath: ["星澜科技", "战略部"], annualCost: 286000, performance: "超出预期", email: "heqing@example.com" }),
    person({ id: "p2", name: "周宁", employeeId: "E10087", departmentPath: ["星澜科技", "战略部"], annualCost: 190000, performance: "符合预期", email: "zhou@example.com", managerId: "p1" }),
    person({ id: "p3", name: "钱多多", employeeId: "E10088", departmentPath: ["星澜科技", "战略部"], annualCost: 175000, performance: "待改进", email: "qian@example.com", managerId: "p1" }),
    ...Array.from({ length: 8 }, (_, index) =>
      person({
        id: `c${index}`,
        name: `客户${index}`,
        employeeId: `C2000${index}`,
        departmentPath: ["星澜科技", "客户成功部"],
        annualCost: 120000 + index,
        performance: "稳定发挥",
        email: `cs${index}@example.com`,
        managerId: index === 0 ? null : "c0",
      }),
    ),
  ],
};

const metrics: OrgMetrics = {
  headcount: snapshot.people.length,
  layers: 2,
  avgSpan: 3.4,
  managerCount: 2,
  laborCost: 999999,
  costedPeople: snapshot.people.length,
};

const secrets = collectPersonalSecrets(snapshot, {
  sample: true,
  windowDays: 90,
  updatedAt: "2026-09-30",
  pairs: [{ personA: "何清", personB: "周宁", messages: 3, meetings: 1, okrAlignments: 1 }],
  okrs: [],
  goals: [],
  ignoredContentHeaders: [],
  ignoredRankHeaders: [],
});

describe("模型请求脱敏", () => {
  it("少于 5 人写成有人员调整，满 5 人保留人数", () => {
    expect(groupSizePhrase(0)).toBe("有人员调整");
    expect(groupSizePhrase(4)).toBe("有人员调整");
    expect(groupSizePhrase(4)).not.toMatch(/\d/);
    expect(groupSizePhrase(5)).toBe("5 人");
    expect(groupSizePhrase(8)).toBe("8 人");
  });

  it("个人字段不会进入发给模型的 payload", () => {
    const messages = buildChatMessages({
      question: "何清的工资是 286000 吗？工号 E10086，绩效 超出预期，邮箱 heqing@example.com",
      snapshot,
      issues: [
        {
          id: "span:p1",
          code: "span_narrow",
          severity: "blue",
          title: "管理幅度偏低",
          message: "「何清」只直接带 2 个人",
          personIds: ["p1"],
          departmentIds: ["dept-strategy"],
        },
        {
          id: "span:c0",
          code: "span_wide",
          severity: "yellow",
          title: "管理幅度过宽",
          message: "「客户0」直接带了 7 个人",
          personIds: ["c0"],
          departmentIds: ["dept-cs"],
        },
      ],
      metrics,
      secrets,
    });
    const payload = JSON.stringify({ messages: desensitizeMessages(messages, secrets) });
    for (const secret of ["何清", "周宁", "钱多多", "E10086", "E10087", "286000", "190000", "175000", "超出预期", "符合预期", "待改进", "heqing@example.com", "zhou@example.com", "qian@example.com"]) {
      expect(payload).not.toContain(secret);
    }
    expect(payload).toContain("战略部");
    expect(payload).toContain("dept-strategy");
    expect(payload).toContain("有人员调整");
    expect(payload).not.toMatch(/战略部[^。\n]*3 人/);
    expect(payload).toContain("客户成功部");
    expect(payload).toContain("8 人");
    expect(payload).not.toContain("只直接带 2");
  });

  it("就算调用方把人员 JSON 拼进消息，姓名工号薪酬和绩效也会被去掉", () => {
    const raw = JSON.stringify({
      name: "何清",
      employeeId: "E10086",
      annualCost: 286000,
      performance: "超出预期",
      email: "heqing@example.com",
    });
    const cleaned = desensitizeMessages([{ role: "user", content: raw }], secrets);
    const payload = JSON.stringify(cleaned);
    expect(payload).not.toContain("何清");
    expect(payload).not.toContain("E10086");
    expect(payload).not.toContain("286000");
    expect(payload).not.toContain("超出预期");
    expect(payload).not.toContain("heqing@example.com");
    expect(stripForbiddenJsonValues(raw)).not.toContain("何清");
  });
});
