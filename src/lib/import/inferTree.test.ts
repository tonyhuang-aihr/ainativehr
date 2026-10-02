import { describe, expect, it } from "vitest";
import { findDataIssues } from "@/lib/import/dataIssues";
import { inferOrg } from "@/lib/import/inferTree";
import type { RawPerson } from "@/lib/model/types";
import { evaluateRules } from "@/lib/rules/engine";

function row(partial: Partial<RawPerson> & Pick<RawPerson, "rowNumber" | "name">): RawPerson {
  return {
    originalName: partial.name,
    employeeId: "",
    departmentRaw: "",
    title: "专员",
    managerRaw: "",
    level: "",
    annualCost: null,
    hireDate: "",
    location: "",
    performance: "",
    email: "",
    status: "",
    ...partial,
  };
}

describe("inferOrg", () => {
  it("保留斜杠路径，并连上上级", () => {
    const org = inferOrg([
      row({ rowNumber: 2, name: "陈启明", employeeId: "E1", departmentRaw: "星澜科技", title: "CEO" }),
      row({
        rowNumber: 3,
        name: "周衡",
        employeeId: "E2",
        departmentRaw: "星澜科技/研发中心",
        title: "CTO",
        managerRaw: "陈启明",
      }),
      row({
        rowNumber: 4,
        name: "林知夏",
        employeeId: "E3",
        departmentRaw: "星澜科技/研发中心/平台部",
        title: "平台总监",
        managerRaw: "周衡",
      }),
    ]);
    const lin = org.people.find((person) => person.name === "林知夏");
    const zhou = org.people.find((person) => person.name === "周衡");
    expect(lin?.departmentPath).toEqual(["星澜科技", "研发中心", "平台部"]);
    expect(lin?.managerId).toBe(zhou?.id);
    expect(org.departments.map((department) => department.name)).toEqual(
      expect.arrayContaining(["星澜科技", "研发中心", "平台部"]),
    );
    const platform = org.departments.find((department) => department.name === "平台部");
    expect(platform?.headId).toBe(lin?.id);
    expect(platform?.parentId).toBe(org.departments.find((department) => department.name === "研发中心")?.id);
  });

  it("只写末级部门时，用上级的部门把路径补全", () => {
    const org = inferOrg([
      row({ rowNumber: 2, name: "陈建国", departmentRaw: "凌川贸易", title: "总经理" }),
      row({ rowNumber: 3, name: "刘芳", departmentRaw: "销售部", title: "销售总监", managerRaw: "陈建国" }),
      row({ rowNumber: 4, name: "黄丽", departmentRaw: "销售部", title: "销售专员", managerRaw: "刘芳" }),
    ]);
    expect(org.people.find((person) => person.name === "刘芳")?.departmentPath).toEqual(["凌川贸易", "销售部"]);
    expect(org.people.find((person) => person.name === "黄丽")?.departmentPath).toEqual(["凌川贸易", "销售部"]);
  });

  it("重名时不随便连上级", () => {
    const people = [
      row({ rowNumber: 2, name: "陈建国", departmentRaw: "凌川贸易", title: "总经理" }),
      row({ rowNumber: 3, name: "张伟", employeeId: "A", departmentRaw: "销售部", title: "销售经理", managerRaw: "陈建国" }),
      row({ rowNumber: 4, name: "张伟", employeeId: "B", departmentRaw: "仓储部", title: "仓储主管", managerRaw: "陈建国" }),
      row({ rowNumber: 5, name: "周凯", departmentRaw: "销售部", title: "销售助理", managerRaw: "张伟" }),
    ];
    const org = inferOrg(people);
    expect(org.people.find((person) => person.name === "周凯")?.managerId).toBeNull();
    const issues = findDataIssues(people);
    expect(issues.some((issue) => issue.code === "duplicate_name")).toBe(true);
    expect(issues.some((issue) => issue.code === "ambiguous_manager")).toBe(true);
  });

  it("汇报成环时不会把部门路径无限加长", () => {
    const people = [
      row({ rowNumber: 2, name: "陈建国", departmentRaw: "凌川贸易", title: "总经理" }),
      row({ rowNumber: 3, name: "王磊", departmentRaw: "渠道部", title: "渠道经理", managerRaw: "李娜" }),
      row({ rowNumber: 4, name: "李娜", departmentRaw: "渠道部", title: "渠道主管", managerRaw: "王磊" }),
    ];
    const org = inferOrg(people);
    for (const person of org.people) {
      expect(person.departmentPath.length).toBeLessThan(6);
    }
    const rules = evaluateRules(org);
    expect(rules.some((issue) => issue.code === "reporting_cycle")).toBe(true);
  });
});

describe("数据问题一键修复", () => {
  const people = [
    row({ rowNumber: 2, name: "陈建国", employeeId: "E1", departmentRaw: "凌川贸易", title: "总经理" }),
    row({ rowNumber: 3, name: "孙婷", employeeId: "E2", departmentRaw: "市场部", title: "市场经理", managerRaw: "陈建国" }),
    row({ rowNumber: 4, name: "周宁", employeeId: "E3", departmentRaw: "市场部", title: "市场专员", managerRaw: "钱多多" }),
    row({ rowNumber: 5, name: "张伟", employeeId: "E4", departmentRaw: "销售部", title: "销售经理", managerRaw: "陈建国" }),
    row({ rowNumber: 6, name: "张伟", employeeId: "E5", departmentRaw: "仓储部", title: "仓储主管", managerRaw: "陈建国" }),
    row({ rowNumber: 7, name: "周凯", employeeId: "E6", departmentRaw: "销售部", title: "销售助理", managerRaw: "张伟" }),
    row({ rowNumber: 8, name: "王磊", employeeId: "E7", departmentRaw: "渠道部", title: "渠道经理", managerRaw: "李娜" }),
    row({ rowNumber: 9, name: "李娜", employeeId: "E8", departmentRaw: "渠道部", title: "渠道主管", managerRaw: "王磊" }),
  ];

  it("缺上级、重名、成环都可以修掉", () => {
    let current = people;
    const codes = () => findDataIssues(current).map((issue) => issue.code);
    expect(codes()).toEqual(expect.arrayContaining(["missing_manager", "duplicate_name", "ambiguous_manager", "reporting_cycle"]));

    const missing = findDataIssues(current).find((issue) => issue.code === "missing_manager");
    current = missing!.apply(current);
    expect(current.find((person) => person.name === "周宁")?.managerRaw).toBe("E2");

    const duplicate = findDataIssues(current).find((issue) => issue.code === "duplicate_name");
    current = duplicate!.apply(current);
    expect(new Set(current.map((person) => person.name)).size).toBe(current.length);
    expect(findDataIssues(current).some((issue) => issue.code === "ambiguous_manager")).toBe(false);

    const cycle = findDataIssues(current).find((issue) => issue.code === "reporting_cycle");
    current = cycle!.apply(current);
    expect(findDataIssues(current).filter((issue) => issue.severity === "red")).toHaveLength(0);

    const org = inferOrg(current);
    expect(evaluateRules(org).some((issue) => issue.code === "reporting_cycle" || issue.code === "missing_manager")).toBe(false);
    expect(org.people.find((person) => person.originalName === "周宁")?.managerId).toBeTruthy();
  });
});
