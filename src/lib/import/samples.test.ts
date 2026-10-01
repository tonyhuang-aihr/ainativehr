import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { findDataIssues } from "@/lib/import/dataIssues";
import { inferOrg } from "@/lib/import/inferTree";
import { choosePeopleSheet, headerFor, matchColumns } from "@/lib/import/matchColumns";
import { parseWorkbook } from "@/lib/import/parseWorkbook";
import { tableToPeople } from "@/lib/import/rows";
import { evaluateRules } from "@/lib/rules/engine";

const dir = path.resolve(process.cwd(), "sample-data");

function load(filename: string) {
  const buffer = fs.readFileSync(path.join(dir, filename));
  return parseWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

describe("示例数据", () => {
  it("星澜科技大约 120 人，并正好埋了四类结构问题", () => {
    const sheets = load("01-星澜科技-花名册.xlsx");
    expect(sheets).toHaveLength(1);
    const mapping = matchColumns(sheets[0].headers);
    expect(headerFor(mapping, "manager")).toBe("直属上级");
    expect(headerFor(mapping, "annualCost")).toBe("年度人力成本");
    const { people } = tableToPeople(sheets[0], mapping);
    expect(people.length).toBeGreaterThanOrEqual(110);
    expect(people.length).toBeLessThanOrEqual(140);
    expect(findDataIssues(people)).toHaveLength(0);
    const started = Date.now();
    const org = inferOrg(people);
    const issues = evaluateRules(org);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(issues.filter((issue) => issue.code === "span_wide").map((issue) => issue.message).join(" ")).toContain("何清");
    expect(issues.filter((issue) => issue.code === "span_wide")).toHaveLength(1);
    expect(issues.filter((issue) => issue.code === "span_narrow")).toHaveLength(1);
    expect(issues.find((issue) => issue.code === "span_narrow")?.message).toContain("马修远");
    expect(issues.find((issue) => issue.code === "layers_deep")?.message).toContain("7");
    expect(issues.filter((issue) => issue.code === "single_person_dept")).toHaveLength(1);
    expect(issues.find((issue) => issue.code === "single_person_dept")?.message).toContain("战略部");
    expect(issues.some((issue) => issue.code === "reporting_cycle" || issue.code === "missing_manager" || issue.code === "empty_dept")).toBe(false);
    expect(org.people.find((person) => person.name === "郑一楠")?.departmentPath).toEqual([
      "星澜科技",
      "研发中心",
      "平台部",
      "数据组",
      "指标平台组",
      "采集小组",
      "实时链路小组",
    ]);
  });

  it("混乱花名册能对上奇异列名，飞书导出是同一批人", () => {
    const messySheets = load("02-凌川贸易-混乱花名册.csv");
    const messyMap = matchColumns(messySheets[0].headers);
    expect(headerFor(messyMap, "name")).toBe("员工姓名");
    expect(headerFor(messyMap, "department")).toBe("组织单元");
    expect(headerFor(messyMap, "title")).toBe("担任岗位");
    expect(headerFor(messyMap, "manager")).toBe("汇报人");
    const messy = tableToPeople(messySheets[0], messyMap).people;
    const messyCodes = findDataIssues(messy).map((issue) => issue.code);
    expect(messyCodes).toEqual(
      expect.arrayContaining(["missing_manager", "reporting_cycle", "duplicate_name", "ambiguous_manager"]),
    );

    const feishuSheets = load("03-凌川贸易-飞书通讯录导出.xlsx");
    const peopleSheet = choosePeopleSheet(feishuSheets);
    expect(peopleSheet.name).toBe("成员列表");
    const feishuMap = matchColumns(peopleSheet.headers);
    expect(headerFor(feishuMap, "manager")).toBe("直线经理");
    expect(headerFor(feishuMap, "title")).toBe("职务");
    const feishu = tableToPeople(peopleSheet, feishuMap).people;
    expect(feishu).toHaveLength(messy.length);
    expect(feishu.map((person) => person.originalName).sort()).toEqual(messy.map((person) => person.originalName).sort());
    expect(findDataIssues(feishu).map((issue) => issue.code).sort()).toEqual([...messyCodes].sort());

    let current = messy;
    for (let i = 0; i < 8 && findDataIssues(current).length > 0; i += 1) {
      current = findDataIssues(current)[0].apply(current);
    }
    expect(findDataIssues(current)).toHaveLength(0);
    const org = inferOrg(current);
    expect(evaluateRules(org).some((issue) => issue.code === "reporting_cycle" || issue.code === "missing_manager")).toBe(false);
  });
});
