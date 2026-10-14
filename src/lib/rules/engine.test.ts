import { describe, expect, it } from "vitest";
import { deptIdFromPath } from "@/lib/format";
import type { Department, OrgSnapshot, Person } from "@/lib/model/types";
import { evaluateRules } from "@/lib/rules/engine";

function person(partial: Partial<Person> & Pick<Person, "id" | "name" | "departmentPath">): Person {
  return {
    rowNumber: 0,
    originalName: partial.name,
    employeeId: partial.id,
    departmentRaw: partial.departmentPath.join("/"),
    title: "专员",
    managerName: "",
    managerId: null,
    level: "",
    annualCost: null,
    hireDate: "",
    location: "",
    performance: "",
    email: "",
    ...partial,
  };
}

function tree(paths: string[][], links: [string, string | null][]): OrgSnapshot {
  const people = links.map(([id, managerId], index) => {
    const path = paths[index] ?? paths[0];
    return person({
      id,
      name: id,
      departmentPath: path,
      managerId,
      managerName: managerId ? managerId : "",
    });
  });
  const deptMap = new Map<string, Department>();
  for (const path of paths) {
    for (let depth = 1; depth <= path.length; depth += 1) {
      const slice = path.slice(0, depth);
      const id = deptIdFromPath(slice);
      if (!deptMap.has(id)) {
        deptMap.set(id, {
          id,
          name: slice[slice.length - 1],
          path: slice,
          parentId: slice.length > 1 ? deptIdFromPath(slice.slice(0, -1)) : null,
          headId: null,
        });
      }
    }
  }
  return { people, departments: [...deptMap.values()] };
}

describe("evaluateRules", () => {
  it("标出幅度过宽、过窄、层级过深和一人部门", () => {
    const deep = ["公司", "中心", "部", "组", "小组", "小队", "班"];
    const wideReports = Array.from({ length: 12 }, (_, index) => `ic${index}`);
    const paths = [
      ["公司"],
      ["公司", "客户成功部"],
      ...wideReports.map(() => ["公司", "客户成功部"]),
      ["公司", "质量部"],
      ["公司", "质量部"],
      ["公司", "质量部"],
      ["公司", "战略部"],
      deep,
    ];
    const links: [string, string | null][] = [
      ["ceo", null],
      ["heqing", "ceo"],
      ...wideReports.map((id) => [id, "heqing"] as [string, string]),
      ["ma", "ceo"],
      ["qa1", "ma"],
      ["qa2", "ma"],
      ["solo", "ceo"],
      ["bottom", "ceo"],
    ];
    const issues = evaluateRules(tree(paths, links));
    const wide = issues.find((issue) => issue.code === "span_wide");
    const narrow = issues.find((issue) => issue.code === "span_narrow");
    expect(wide?.personIds).toEqual(["heqing"]);
    expect(wide?.message).toContain("12");
    expect(narrow?.personIds).toEqual(["ma"]);
    expect(issues.some((issue) => issue.code === "layers_deep" && issue.message.includes("7"))).toBe(true);
    expect(issues.some((issue) => issue.code === "single_person_dept" && issue.message.includes("战略部"))).toBe(true);
    expect(issues.some((issue) => issue.code === "missing_manager" || issue.code === "reporting_cycle")).toBe(false);
  });

  it("唯一顶点不算没有上级，成环、找不到的上级和空部门要标出", () => {
    const snapshot = tree(
      [
        ["公司"],
        ["公司", "甲部"],
        ["公司", "乙部"],
      ],
      [
        ["ceo", null],
        ["a", "b"],
        ["b", "a"],
      ],
    );
    snapshot.people.push(
      person({
        id: "lost",
        name: "周宁",
        departmentPath: ["公司", "甲部"],
        managerName: "钱多多",
        managerId: null,
      }),
    );
    snapshot.departments.push({
      id: deptIdFromPath(["公司", "空部"]),
      name: "空部",
      path: ["公司", "空部"],
      parentId: deptIdFromPath(["公司"]),
      headId: null,
    });
    const issues = evaluateRules(snapshot);
    expect(issues.some((issue) => issue.code === "reporting_cycle")).toBe(true);
    expect(issues.some((issue) => issue.code === "missing_manager" && issue.message.includes("钱多多"))).toBe(true);
    expect(issues.some((issue) => issue.code === "empty_dept" && issue.message.includes("空部"))).toBe(true);
    expect(issues.some((issue) => issue.personIds.includes("ceo") && issue.code === "missing_manager")).toBe(false);
  });

  it("忽略某一类后不再返回", () => {
    const snapshot = tree(
      [
        ["公司"],
        ["公司", "质量部"],
        ["公司", "质量部"],
        ["公司", "质量部"],
      ],
      [
        ["ceo", null],
        ["ma", "ceo"],
        ["qa1", "ma"],
        ["qa2", "ma"],
      ],
    );
    const before = evaluateRules(snapshot);
    expect(before.some((issue) => issue.code === "span_narrow")).toBe(true);
    const after = evaluateRules(snapshot, undefined, ["span_narrow"]);
    expect(after.some((issue) => issue.code === "span_narrow")).toBe(false);
  });
});
