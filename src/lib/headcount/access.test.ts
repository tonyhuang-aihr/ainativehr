import { describe, expect, it } from "vitest";
import { buildClosure, can, visibleDepartmentIds, type HeadcountUser } from "@/lib/headcount/authz";
import { buildLeaderView, forbiddenLeaderPaths } from "@/lib/headcount/leaderView";
import { leaderColumnsAreSafe } from "@/lib/headcount/leaderQuery";
import { passwordIssue, nextLock, LOCK_THRESHOLD } from "@/lib/headcount/password";
import { logExpired, MIN_LOG_RETENTION_DAYS } from "@/lib/headcount/retention";
import { aggregateTenure, buildUpload, departureMark, type Matrix } from "@/lib/headcount/import/prepare";
import { computePlan } from "@/lib/headcount/engine";
import { DEPT, samplePlan } from "@/lib/headcount/sample";

const plan = samplePlan();
const closure = buildClosure(plan.departments);
const zhao: HeadcountUser = { id: "zhao", role: "leader", departmentIds: [DEPT.plat] };
const fan: HeadcountUser = { id: "fan", role: "leader", departmentIds: [DEPT.prod1] };
const huang: HeadcountUser = { id: "huang", role: "od", departmentIds: [] };
const hr: HeadcountUser = { id: "hr", role: "hr_admin", departmentIds: [] };
const admin: HeadcountUser = { id: "admin", role: "sys_admin", departmentIds: [] };

describe("角色与部门树", () => {
  it("负责人只能看到绑定部门和下级，系统管理员看不到业务部门", () => {
    expect(visibleDepartmentIds(zhao, plan.departments, closure).sort()).toEqual([DEPT.plat, DEPT.platDirect, DEPT.infra, DEPT.data].sort());
    expect(visibleDepartmentIds(fan, plan.departments, closure)).toEqual([DEPT.prod1]);
    expect(visibleDepartmentIds(fan, plan.departments, closure)).not.toContain(DEPT.plat);
    expect(visibleDepartmentIds(huang, plan.departments, closure)).toHaveLength(plan.departments.length);
    expect(visibleDepartmentIds(admin, plan.departments, closure)).toEqual([]);
  });

  it("越权动作按角色拒绝", () => {
    expect(can(zhao, "import")).toBe(false);
    expect(can(zhao, "viewCompensation")).toBe(false);
    expect(can(zhao, "viewOneOff")).toBe(false);
    expect(can(zhao, "toggleExact")).toBe(false);
    expect(can(zhao, "wipe")).toBe(false);
    expect(can(huang, "import")).toBe(true);
    expect(can(huang, "toggleExact")).toBe(false);
    expect(can(hr, "toggleExact")).toBe(true);
    expect(can(hr, "viewCompensation")).toBe(true);
    expect(can(hr, "manageUsers")).toBe(false);
    expect(can(admin, "viewBusiness")).toBe(false);
    expect(can(admin, "wipe")).toBe(true);
    expect(can(admin, "viewLogs")).toBe(true);
  });

  it("登录失败会锁定，密码要有字母和数字，日志至少留 6 个月", () => {
    expect(passwordIssue("short1")).toMatch(/8/);
    expect(passwordIssue("longpassword")).toMatch(/字母/);
    expect(passwordIssue("Demo2026!")).toBeNull();
    const now = Date.parse("2026-10-04T00:00:00Z");
    let failures = 0;
    let locked: number | null = null;
    for (let index = 0; index < LOCK_THRESHOLD; index += 1) {
      const next = nextLock(failures, now);
      failures = next.failures;
      locked = next.lockedUntil;
    }
    expect(locked).toBe(now + 15 * 60 * 1000);
    expect(logExpired(now, now + (MIN_LOG_RETENTION_DAYS - 1) * 86_400_000)).toBe(false);
    expect(logExpired(now, now + MIN_LOG_RETENTION_DAYS * 86_400_000)).toBe(true);
  });
});

describe("负责人接口没有补偿和一次性费用", () => {
  it("查询列和返回体都不含补偿标记、一次性费用", () => {
    expect(leaderColumnsAreSafe()).toBe(true);
    const view = buildLeaderView(computePlan(plan), DEPT.plat, { exact: false });
    expect(forbiddenLeaderPaths(view)).toEqual([]);
    const blob = JSON.stringify(view);
    for (const word of ["compMark", "补偿标记", "oneOff", "one_off", "N+1", "协商解除", "离职类型", "hireDate"]) {
      expect(blob).not.toContain(word);
    }
    expect(view.movements.some((row) => row.typeLabel === "离职 · 2027-02-28")).toBe(true);
    expect(view.movements.some((row) => row.typeLabel === "离职 · 2027-03-31")).toBe(true);
    expect(view.conclusion.text).toContain("2,075.5");
    expect(view.groups[0]?.rows[0]?.year).toMatch(/–|—/);
    const exact = buildLeaderView(computePlan(plan), DEPT.plat, { exact: true });
    expect(exact.groups.flatMap((group) => group.rows).every((row) => !row.year.includes("–"))).toBe(true);
  });
});

describe("浏览器端导入", () => {
  const context = {
    departments: ["平台部", "基础架构组"],
    grades: ["P6", "P5"],
    cities: ["北京"],
    year: 2027,
    asOf: "2027-01-01",
    parentOf: (department: string) => (department === "基础架构组" ? "平台部" : null),
  };

  it("离职类型换成补偿标记，敏感列丢掉，不足 5 人的司龄并到上级", () => {
    expect(departureMark("员工主动辞职")).toBe("不计");
    expect(departureMark("公司提出、双方协商解除")).toBe("N");
    expect(departureMark("无过失性辞退，未提前 30 天通知")).toBe("N+1");
    expect(departureMark("过失性辞退")).toBe("不计");
    const roster: Matrix = {
      name: "花名册",
      headers: ["姓名", "工号", "部门", "岗位", "职级", "直属上级", "用工类型", "入职日期", "工作地", "月薪资", "绩效"],
      rows: [
        ["钱二", "E1", "基础架构组", "组长", "P6", "", "正式", "2020-01-01", "北京", "30000", "A"],
        ["甲", "E2", "基础架构组", "工程师", "P6", "E1", "正式", "2021-01-01", "北京", "1", "B"],
        ["乙", "E3", "基础架构组", "工程师", "P6", "E1", "正式", "2022-01-01", "北京", "1", "C"],
        ["丙", "E4", "基础架构组", "工程师", "P5", "E1", "正式", "2023-06-01", "北京", "1", "D"],
      ],
    };
    const movements: Matrix = {
      name: "在途",
      headers: ["变动类型", "姓名", "工号", "部门", "岗位", "职级", "用工类型", "生效日", "确认状态", "离职类型", "入职日期", "工作地"],
      rows: [["离职", "丙", "E4", "基础架构组", "工程师", "P5", "正式", "2027-03-01", "已提交的离职", "公司提出协商解除", "2023-06-01", "北京"]],
    };
    const upload = buildUpload(roster, movements, context);
    expect(upload.droppedColumns).toEqual(["月薪资", "绩效"]);
    expect(JSON.stringify(upload)).not.toContain("协商解除");
    expect(JSON.stringify(upload)).not.toContain("离职类型");
    expect(upload.movements[0]?.compMark).toBe("N");
    expect(upload.movements[0]?.hireDate).toBe("2023-06-01");
    expect(upload.roster.find((row) => row.employeeNo === "E1")).not.toHaveProperty("hireDate");
    expect(upload.roster.find((row) => row.employeeNo === "E4")?.hireDate).toBe("2023-06-01");
    const tenure = aggregateTenure(
      [
        ...Array.from({ length: 4 }, () => ({ department: "基础架构组", grade: "P6", hireDate: "2024-01-01" })),
        ...Array.from({ length: 3 }, () => ({ department: "平台部", grade: "P6", hireDate: "2020-01-01" })),
      ],
      "2027-01-01",
      context.parentOf,
    );
    expect(tenure.map((row) => row.department)).toEqual(["平台部"]);
    expect(tenure[0]?.count).toBe(7);
    expect(tenure.find((row) => row.department === "基础架构组")).toBeUndefined();
  });
});
