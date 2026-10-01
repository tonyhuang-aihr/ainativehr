import { deptIdFromPath } from "@/lib/format";
import type { Department, OrgSnapshot, Person } from "@/lib/model/types";
import { directReports } from "@/lib/org/metrics";

export type MutateResult = { ok: true; snapshot: OrgSnapshot } | { ok: false; message: string };

export type StructurePlan = {
  id: "deputy" | "split";
  title: string;
  detail: string;
  snapshot: OrgSnapshot;
};

function pathKey(path: string[]): string {
  return path.join("/");
}

function isUnder(path: string[], ancestor: string[]): boolean {
  const key = pathKey(path);
  const root = pathKey(ancestor);
  return key === root || key.startsWith(`${root}/`);
}

export function reparentDepartment(snapshot: OrgSnapshot, deptId: string, newParentId: string): MutateResult {
  const dept = snapshot.departments.find((item) => item.id === deptId);
  const parent = snapshot.departments.find((item) => item.id === newParentId);
  if (!dept || !parent) return { ok: false, message: "找不到要调整的部门。" };
  if (dept.id === parent.id) return { ok: false, message: "不能把部门挂到自己下面。" };
  if (isUnder(parent.path, dept.path)) return { ok: false, message: "不能把部门挂到它自己的下级下面。" };
  if (dept.parentId === parent.id) return { ok: false, message: "它已经在这个部门下面。" };
  const newPath = [...parent.path, dept.name];
  const clash = snapshot.departments.some((item) => item.id !== dept.id && pathKey(item.path) === pathKey(newPath));
  if (clash) return { ok: false, message: "目标部门下面已经有同名部门。" };
  return { ok: true, snapshot: rewriteDepartmentPath(snapshot, dept, newPath, parent.id) };
}

function rewriteDepartmentPath(snapshot: OrgSnapshot, dept: Department, newPath: string[], newParentId: string): OrgSnapshot {
  const oldPath = dept.path;
  const departments = snapshot.departments.map((item) => {
    if (!isUnder(item.path, oldPath)) return item;
    const suffix = item.path.slice(oldPath.length);
    const path = [...newPath, ...suffix];
    return {
      ...item,
      path,
      parentId: item.id === dept.id ? newParentId : item.parentId,
    };
  });
  const people = snapshot.people.map((person) => {
    if (!isUnder(person.departmentPath, oldPath)) return person;
    const suffix = person.departmentPath.slice(oldPath.length);
    const departmentPath = [...newPath, ...suffix];
    return { ...person, departmentPath, departmentRaw: departmentPath.join("/") };
  });
  return { people, departments };
}

function refreshHeads(snapshot: OrgSnapshot): Department[] {
  return snapshot.departments.map((department) => {
    if (!department.headId) return department;
    const head = snapshot.people.find((person) => person.id === department.headId);
    if (!head || pathKey(head.departmentPath) !== pathKey(department.path)) return { ...department, headId: null };
    return department;
  });
}

export function movePeople(snapshot: OrgSnapshot, personIds: string[], targetDeptId: string): MutateResult {
  const target = snapshot.departments.find((item) => item.id === targetDeptId);
  if (!target) return { ok: false, message: "找不到目标部门。" };
  const moving = new Set(personIds);
  if (moving.size === 0) return { ok: false, message: "没有选中要移动的人。" };
  const already = snapshot.people.filter((person) => moving.has(person.id)).every((person) => pathKey(person.departmentPath) === pathKey(target.path));
  if (already) return { ok: false, message: "这些人已经在这个部门里。" };
  const head = snapshot.people.find((person) => person.id === target.headId) ?? null;
  const people = snapshot.people.map((person) => {
    if (!moving.has(person.id)) return person;
    const next: Person = {
      ...person,
      departmentPath: [...target.path],
      departmentRaw: target.path.join("/"),
    };
    if (head && head.id !== person.id && !moving.has(head.id)) {
      next.managerId = head.id;
      next.managerName = head.name;
    }
    return next;
  });
  return { ok: true, snapshot: { people, departments: refreshHeads({ people, departments: snapshot.departments }) } };
}

export function mergeDepartments(snapshot: OrgSnapshot, sourceId: string, targetId: string): MutateResult {
  const source = snapshot.departments.find((item) => item.id === sourceId);
  const target = snapshot.departments.find((item) => item.id === targetId);
  if (!source || !target) return { ok: false, message: "找不到要合并的部门。" };
  if (source.id === target.id) return { ok: false, message: "不能把部门和自己合并。" };
  if (isUnder(target.path, source.path)) return { ok: false, message: "不能把上级部门并进它自己的下级。" };

  let current = snapshot;
  const children = current.departments.filter((item) => item.parentId === source.id);
  for (const child of children) {
    const moved = reparentDepartment(current, child.id, target.id);
    if (!moved.ok) return moved;
    current = moved.snapshot;
  }
  const directIds = current.people
    .filter((person) => pathKey(person.departmentPath) === pathKey(source.path))
    .map((person) => person.id);
  if (directIds.length > 0) {
    const moved = movePeople(current, directIds, target.id);
    if (!moved.ok) return moved;
    current = moved.snapshot;
  }
  return {
    ok: true,
    snapshot: {
      people: current.people,
      departments: refreshHeads({
        people: current.people,
        departments: current.departments.filter((item) => item.id !== source.id),
      }),
    },
  };
}

export function appointDeputy(snapshot: OrgSnapshot, managerId: string): MutateResult {
  const manager = snapshot.people.find((person) => person.id === managerId);
  if (!manager) return { ok: false, message: "找不到这个负责人。" };
  const reports = directReports(snapshot, managerId);
  if (reports.length < 4) return { ok: false, message: "直接下级少于 4 人，先不拆。" };
  const deputy = reports[0];
  const keep = Math.ceil(reports.length / 2);
  const handoff = reports.slice(keep);
  const ids = new Set(handoff.map((person) => person.id));
  const people = snapshot.people.map((person) => {
    if (!ids.has(person.id)) return person;
    return { ...person, managerId: deputy.id, managerName: deputy.name };
  });
  return { ok: true, snapshot: { people, departments: snapshot.departments } };
}

export function splitTeam(snapshot: OrgSnapshot, managerId: string): MutateResult {
  const manager = snapshot.people.find((person) => person.id === managerId);
  if (!manager) return { ok: false, message: "找不到这个负责人。" };
  const reports = directReports(snapshot, managerId);
  if (reports.length < 4) return { ok: false, message: "直接下级少于 4 人，先不拆。" };
  const dept = snapshot.departments.find((item) => pathKey(item.path) === pathKey(manager.departmentPath));
  if (!dept) return { ok: false, message: "负责人不在部门节点上，无法拆组。" };
  const mid = Math.ceil(reports.length / 2);
  const groups = [
    { name: "一组", members: reports.slice(0, mid) },
    { name: "二组", members: reports.slice(mid) },
  ];
  const created: Department[] = [];
  const assign = new Map<string, { path: string[]; head: Person }>();
  for (const group of groups) {
    const path = [...dept.path, group.name];
    const id = deptIdFromPath(path);
    if (snapshot.departments.some((item) => item.id === id)) return { ok: false, message: "下面已经有同名的组。" };
    const head = group.members[0];
    created.push({ id, name: group.name, path, parentId: dept.id, headId: head.id });
    for (const member of group.members) assign.set(member.id, { path, head });
  }
  const people = snapshot.people.map((person) => {
    const slot = assign.get(person.id);
    if (!slot) return person;
    const next: Person = { ...person, departmentPath: [...slot.path], departmentRaw: slot.path.join("/") };
    if (person.id !== slot.head.id) {
      next.managerId = slot.head.id;
      next.managerName = slot.head.name;
    }
    return next;
  });
  return { ok: true, snapshot: { people, departments: [...snapshot.departments, ...created] } };
}

export function proposeSpanRelief(snapshot: OrgSnapshot, managerId: string): StructurePlan[] {
  const plans: StructurePlan[] = [];
  const deputy = appointDeputy(snapshot, managerId);
  if (deputy.ok) {
    plans.push({
      id: "deputy",
      title: "提一位副组长承接一半下级",
      detail: "不新建部门。一半直接下级改向其中一位成员汇报，原负责人的幅度会降下来。确认前只是预览。",
      snapshot: deputy.snapshot,
    });
  }
  const split = splitTeam(snapshot, managerId);
  if (split.ok) {
    plans.push({
      id: "split",
      title: "拆成一组和二组",
      detail: "在当前部门下新建两个组，各由一位现有成员负责，其余人跟着进去。确认前只是预览。",
      snapshot: split.snapshot,
    });
  }
  return plans;
}
