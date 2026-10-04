import { describe, expect, it } from "vitest";
import { visibleDepartmentIds } from "@/lib/headcount/authz";
import { createMemoryDb } from "@/lib/headcount/db/client";
import { seedSample } from "@/lib/headcount/db/seed";
import { leaderProjectionKeys, loadClosure, loadDepartments, loadPlan } from "@/lib/headcount/db/queries";
import { computePlan, deptStat } from "@/lib/headcount/engine";
import { buildLeaderView, forbiddenLeaderPaths } from "@/lib/headcount/leaderView";
import { roundToHalfWan } from "@/lib/headcount/money";
import { DEPT } from "@/lib/headcount/sample";

describe("数据库里的负责人范围", () => {
  it("小部门人数不进模型列，负责人查询也不带补偿和一次性费用", async () => {
    const db = await createMemoryDb();
    await seedSample(db);
    const keys = leaderProjectionKeys();
    const joined = [...keys.people, ...keys.movements, ...keys.agents].join(" ");
    expect(joined).not.toMatch(/comp_mark|hire_date|one_off/);
    const departments = await loadDepartments(db);
    const closure = await loadClosure(db);
    const zhao = visibleDepartmentIds({ id: "zhao", role: "leader", departmentIds: [DEPT.plat] }, departments, closure);
    const fan = visibleDepartmentIds({ id: "fan", role: "leader", departmentIds: [DEPT.prod1] }, departments, closure);
    expect(zhao).not.toContain(DEPT.prod1);
    expect(fan).not.toContain(DEPT.plat);
    const plan = await loadPlan(db, { departmentIds: zhao, sensitive: false });
    expect(plan.people.every((person) => person.hireDate == null)).toBe(true);
    expect(plan.movements.every((movement) => movement.compMark == null && movement.oneOff == null && movement.hireDate == null)).toBe(true);
    expect(plan.people.some((person) => person.name === "赵一")).toBe(true);
    expect(plan.people.some((person) => person.departmentId === DEPT.prod1)).toBe(false);
    const result = computePlan(plan);
    expect(deptStat(result, DEPT.plat).yearOneOffYuan).toBe(0);
    expect(roundToHalfWan(deptStat(result, DEPT.plat).yearDailyYuan)).toBe(2075.5);
    const view = buildLeaderView(result, DEPT.plat, { exact: false });
    expect(forbiddenLeaderPaths(view)).toEqual([]);
    const fanPlan = await loadPlan(db, { departmentIds: fan, sensitive: false });
    expect(fanPlan.people.some((person) => person.name === "赵一")).toBe(false);
    expect(fanPlan.people.every((person) => person.departmentId === DEPT.prod1)).toBe(true);
  }, 60_000);
});
