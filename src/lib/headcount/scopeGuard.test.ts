import { describe, expect, it } from "vitest";
import { visibleDepartmentIds } from "@/lib/headcount/authz";
import { createMemoryDb } from "@/lib/headcount/db/client";
import { loadClosure, loadDepartments, loadPlan } from "@/lib/headcount/db/queries";
import { seedSample } from "@/lib/headcount/db/seed";
import { buildRdCenterWorkspace } from "@/lib/demo/rdCenter";
import { computePlan, deptStat } from "@/lib/headcount/engine";
import { formatWan } from "@/lib/headcount/money";
import { DEPT } from "@/lib/headcount/sample";
import { scenarioFromSandbox } from "@/lib/headcount/sandboxImport";
import { presetScenarios } from "@/lib/headcount/scenario";
import { assertDepartmentVisible, ScopeDenied, selectScenariosForUser } from "@/lib/headcount/scopeGuard";

const lin = { id: "lin", role: "hrbp" as const, departmentIds: [DEPT.prod1] };
const huang = { id: "huang", role: "od" as const, departmentIds: [] as string[] };

describe("HRBP 只看本事业部", () => {
  it("另一部门、公司场景和示例沙盘都拒绝，本部门数字仍在", async () => {
    const db = await createMemoryDb();
    await seedSample(db);
    const departments = await loadDepartments(db);
    const closure = await loadClosure(db);
    const visible = visibleDepartmentIds(lin, departments, closure);
    expect(visible).toEqual([DEPT.prod1]);
    expect(() => assertDepartmentVisible(visible, DEPT.qa)).toThrow(ScopeDenied);
    expect(() => assertDepartmentVisible(visible, DEPT.center)).toThrow(ScopeDenied);
    expect(() => assertDepartmentVisible(visible, DEPT.prod1)).not.toThrow();
    const plan = await loadPlan(db, { departmentIds: visible, sensitive: false });
    expect(plan.people.every((person) => person.departmentId === DEPT.prod1)).toBe(true);
    expect(plan.agents.every((agent) => agent.departmentId === DEPT.prod1)).toBe(true);
    expect(plan.departments.map((department) => department.id)).toEqual([DEPT.prod1]);
    const scoped = computePlan(plan);
    expect(formatWan(deptStat(scoped, DEPT.prod1).yearDailyYuan)).toBe("4,845.5");
    const company = computePlan(await loadPlan(db, { departmentIds: null, sensitive: true }));
    expect(formatWan(deptStat(company, DEPT.center).yearDailyYuan)).toBe("16,071.0");
    expect(formatWan(deptStat(company, DEPT.center).yearTotalYuan)).toBe("16,095.5");
    const names = departments.map((department) => department.name);
    for (const id of ["jz", "jj", "bs", "fa"]) {
      expect(() => selectScenariosForUser(presetScenarios(), lin, departments, visible, id)).toThrow(ScopeDenied);
    }
    expect(selectScenariosForUser(presetScenarios(), lin, departments, visible, null).definitions).toEqual([]);
    const sample = scenarioFromSandbox(buildRdCenterWorkspace(), 2);
    expect(sample.id).toBe("fa");
    expect(sample.structureNote ?? "").toContain("数据智能部");
    expect(() => selectScenariosForUser([sample], lin, departments, visible, sample.id)).toThrow(ScopeDenied);
    const own = {
      ...presetScenarios()[0],
      id: "lin-own",
      source: "copy" as const,
      hires: [{ departmentName: "产品研发一部", grade: "P6", count: 1, effectiveDate: "2027-04-01" }],
      agents: [],
      cuts: [],
      structureNote: null,
      spanAlert: null,
    };
    expect(selectScenariosForUser([own], lin, departments, visible, own.id).definitions.map((item) => item.id)).toEqual(["lin-own"]);
    const odVisible = visibleDepartmentIds(huang, departments, closure);
    expect(selectScenariosForUser(presetScenarios(), huang, departments, odVisible, null).definitions).toHaveLength(4);
    expect(names).toContain("产品研发一部");
  }, 60_000);
});
