import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { findDataIssues } from "@/lib/import/dataIssues";
import { inferOrg } from "@/lib/import/inferTree";
import { choosePeopleSheet, headerFor, matchColumns } from "@/lib/import/matchColumns";
import { parseWorkbook } from "@/lib/import/parseWorkbook";
import { tableToPeople } from "@/lib/import/rows";
import { collabBundleFromSheets } from "@/lib/collab/parse";
import { canvasLinks, scoredCollaboration } from "@/lib/collab/view";
import { evaluateRules } from "@/lib/rules/engine";

const dir = path.resolve(process.cwd(), "sample-data");

function load(filename: string) {
  const buffer = fs.readFileSync(path.join(dir, filename));
  return parseWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

describe("示例数据", () => {
  it("星澜科技大约 120 人，并正好埋了四类结构问题", () => {
    const filename = "01-星澜科技-花名册-示例数据.xlsx";
    expect(filename).toContain("示例数据");
    const sheets = load(filename);
    const sheet = sheets.find((item) => item.name.includes("花名册"));
    expect(sheet).toBeTruthy();
    expect(sheet?.name).toContain("示例数据");
    expect(sheet?.headers).toContain("数据标记");
    expect(sheet?.rows[0]).toContain("示例数据");
    const mapping = matchColumns(sheet!.headers);
    expect(headerFor(mapping, "manager")).toBe("直属上级");
    expect(headerFor(mapping, "annualCost")).toBe("年度人力成本");
    const { people } = tableToPeople(sheet!, mapping);
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
    const messyName = "02-凌川贸易-混乱花名册-示例数据.csv";
    expect(messyName).toContain("示例数据");
    const messySheets = load(messyName);
    expect(messySheets[0].headers).toContain("数据标记");
    expect(messySheets[0].rows[0]).toContain("示例数据");
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

    const feishuSheets = load("03-凌川贸易-飞书通讯录导出-示例数据.xlsx");
    const peopleSheet = choosePeopleSheet(feishuSheets);
    expect(peopleSheet.name).toBe("成员列表-示例数据");
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

  it("星澜科技协作示例只有次数，画布连线是部门对部门", () => {
    const filename = "04-星澜科技-协作与目标-示例数据.xlsx";
    expect(filename).toContain("示例数据");
    const sheets = load(filename);
    expect(sheets.every((sheet) => sheet.name.includes("示例数据"))).toBe(true);
    const bundle = collabBundleFromSheets(sheets, { sample: true, updatedAt: "2026-09-30" });
    expect(bundle.pairs.length).toBeGreaterThan(0);
    expect(bundle.ignoredContentHeaders).toEqual([]);
    expect(JSON.stringify(bundle.pairs)).not.toMatch(/内容|纪要/);
    expect(bundle.okrs.find((item) => item.personName === "林知夏")?.unalignedDepartments).toContain("数据智能部");
    expect(bundle.goals.filter((item) => item.personName === "林知夏").reduce((sum, item) => sum + item.weight, 0)).toBe(100);

    const roster = load("01-星澜科技-花名册-示例数据.xlsx").find((sheet) => sheet.name.includes("花名册"));
    const org = inferOrg(tableToPeople(roster!, matchColumns(roster!.headers)).people);
    const pairs = scoredCollaboration(bundle, org);
    const visible = new Set(org.departments.map((department) => department.id));
    const links = canvasLinks(org, pairs, visible);
    const platform = org.departments.find((department) => department.name === "平台部");
    const ai = org.departments.find((department) => department.name === "数据智能部");
    expect(platform && ai).toBeTruthy();
    expect(links.some((link) => [link.aId, link.bId].sort().join() === [platform!.id, ai!.id].sort().join())).toBe(true);
    expect(links.every((link) => link.aId !== link.bId)).toBe(true);
    const missingMessages = pairs.find((pair) => pair.messages == null);
    expect(missingMessages?.missing).toContain("messages");
    expect(missingMessages?.score).not.toBeNull();
  });
});
