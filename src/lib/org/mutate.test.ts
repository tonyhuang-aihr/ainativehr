import { describe, expect, it } from "vitest";
import { appointDeputy, mergeDepartments, movePeople, reparentDepartment, splitTeam } from "@/lib/org/mutate";
import { directReports } from "@/lib/org/metrics";
import { evaluateRules } from "@/lib/rules/engine";
import type { OrgSnapshot, Person } from "@/lib/model/types";

function person(partial: Pick<Person, "id" | "name" | "title" | "departmentPath" | "managerId" | "managerName">): Person {
  return {
    rowNumber: 1,
    originalName: partial.name,
    employeeId: partial.id,
    departmentRaw: partial.departmentPath.join("/"),
    level: "",
    annualCost: 100000,
    hireDate: "",
    location: "",
    performance: "S",
    email: "",
    ...partial,
  };
}

function org(): OrgSnapshot {
  return {
    departments: [
      { id: "root", name: "公司", path: ["公司"], parentId: null, headId: "ceo" },
      { id: "a", name: "平台部", path: ["公司", "平台部"], parentId: "root", headId: "lead" },
      { id: "b", name: "数据组", path: ["公司", "平台部", "数据组"], parentId: "a", headId: "d1" },
      { id: "c", name: "销售部", path: ["公司", "销售部"], parentId: "root", headId: "sales" },
    ],
    people: [
      person({ id: "ceo", name: "陈启明", title: "首席执行官", departmentPath: ["公司"], managerId: null, managerName: "" }),
      person({ id: "lead", name: "林知夏", title: "平台总监", departmentPath: ["公司", "平台部"], managerId: "ceo", managerName: "陈启明" }),
      person({ id: "d1", name: "赵启年", title: "数据组长", departmentPath: ["公司", "平台部", "数据组"], managerId: "lead", managerName: "林知夏" }),
      person({ id: "p1", name: "甲", title: "工程师", departmentPath: ["公司", "平台部", "数据组"], managerId: "d1", managerName: "赵启年" }),
      person({ id: "p2", name: "乙", title: "工程师", departmentPath: ["公司", "平台部", "数据组"], managerId: "d1", managerName: "赵启年" }),
      person({ id: "sales", name: "江晚吟", title: "销售经理", departmentPath: ["公司", "销售部"], managerId: "ceo", managerName: "陈启明" }),
      person({ id: "s1", name: "丙", title: "销售", departmentPath: ["公司", "销售部"], managerId: "sales", managerName: "江晚吟" }),
    ],
  };
}

describe("架构调整", () => {
  it("把部门挂到新的上级下面，路径跟着改，不能挂到自己的下级", () => {
    const moved = reparentDepartment(org(), "b", "c");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.snapshot.departments.find((item) => item.id === "b")?.path).toEqual(["公司", "销售部", "数据组"]);
    expect(moved.snapshot.people.find((item) => item.id === "p1")?.departmentPath).toEqual(["公司", "销售部", "数据组"]);
    expect(reparentDepartment(org(), "a", "b").ok).toBe(false);
  });

  it("把人拖进部门后，上级改为该部门负责人", () => {
    const moved = movePeople(org(), ["s1"], "a");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const person = moved.snapshot.people.find((item) => item.id === "s1");
    expect(person?.departmentPath).toEqual(["公司", "平台部"]);
    expect(person?.managerId).toBe("lead");
    expect(person?.managerName).toBe("林知夏");
  });

  it("合并会把人和子部门收进目标，并删掉源部门", () => {
    const merged = mergeDepartments(org(), "a", "c");
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.snapshot.departments.some((item) => item.id === "a")).toBe(false);
    expect(merged.snapshot.departments.find((item) => item.id === "b")?.parentId).toBe("c");
    expect(merged.snapshot.people.find((item) => item.id === "lead")?.departmentPath).toEqual(["公司", "销售部"]);
  });

  it("幅度过宽时，副组长和拆组都会把直接下级分走", () => {
    const base = org();
    const extras = ["u1", "u2", "u3", "u4"].map((id, index) =>
      person({
        id,
        name: `成员${index}`,
        title: "顾问",
        departmentPath: ["公司", "销售部"],
        managerId: "sales",
        managerName: "江晚吟",
      }),
    );
    base.people.push(...extras);
    expect(directReports(base, "sales")).toHaveLength(5);
    const deputy = appointDeputy(base, "sales");
    expect(deputy.ok).toBe(true);
    if (!deputy.ok) return;
    expect(directReports(deputy.snapshot, "sales").length).toBeLessThan(5);
    const split = splitTeam(base, "sales");
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(directReports(split.snapshot, "sales")).toHaveLength(2);
    expect(split.snapshot.departments.some((item) => item.name === "一组")).toBe(true);
    const started = Date.now();
    evaluateRules(split.snapshot);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
