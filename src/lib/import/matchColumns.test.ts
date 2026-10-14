import { describe, expect, it } from "vitest";
import { headerFor, matchColumns } from "@/lib/import/matchColumns";
import { parseCost } from "@/lib/format";

describe("matchColumns", () => {
  it("把汇报人、Leader、直线经理都认成直属上级", () => {
    expect(headerFor(matchColumns(["员工姓名", "组织单元", "担任岗位", "汇报人"]), "manager")).toBe("汇报人");
    expect(headerFor(matchColumns(["姓名", "部门", "岗位", "Leader"]), "manager")).toBe("Leader");
    expect(headerFor(matchColumns(["姓名", "部门", "职务", "直线经理"]), "manager")).toBe("直线经理");
    expect(headerFor(matchColumns(["姓名", "部门", "岗位", "直属上级"]), "manager")).toBe("直属上级");
  });

  it("认常见的中文花名册列，并避开容易混淆的列", () => {
    const matches = matchColumns([
      "员工姓名",
      "组织单元",
      "担任岗位",
      "汇报人",
      "工号",
      "职级",
      "年度人力成本",
      "入职时间",
      "工作地点",
      "员工类型",
      "上级部门",
      "Leader邮箱",
    ]);
    expect(headerFor(matches, "name")).toBe("员工姓名");
    expect(headerFor(matches, "department")).toBe("组织单元");
    expect(headerFor(matches, "title")).toBe("担任岗位");
    expect(headerFor(matches, "employeeId")).toBe("工号");
    expect(headerFor(matches, "level")).toBe("职级");
    expect(headerFor(matches, "annualCost")).toBe("年度人力成本");
    expect(headerFor(matches, "hireDate")).toBe("入职时间");
    expect(headerFor(matches, "location")).toBe("工作地点");
    expect(headerFor(matches, "name")).not.toBe("员工类型");
    expect(matches.some((match) => match.header === "员工类型")).toBe(false);
    expect(matches.some((match) => match.header === "上级部门")).toBe(false);
    expect(headerFor(matches, "email")).toBe("Leader邮箱");
  });

  it("同一字段只保留把握更高的列", () => {
    const matches = matchColumns(["汇报人", "Leader", "姓名", "部门", "岗位"]);
    const managers = matches.filter((match) => match.field === "manager");
    expect(managers).toHaveLength(1);
    expect(managers[0]?.header).toBe("汇报人");
  });
});

describe("parseCost", () => {
  it("解析数字、千分位和“万”", () => {
    expect(parseCost("320000")).toBe(320000);
    expect(parseCost("¥320,000")).toBe(320000);
    expect(parseCost("32万")).toBe(320000);
    expect(parseCost("")).toBeNull();
    expect(parseCost("面议")).toBeNull();
  });
});
