import { deptIdFromPath, personIdFor } from "@/lib/format";
import type { Department, OrgSnapshot, Person, RawPerson } from "@/lib/model/types";
import { cycleMemberIndexes, resolveManager } from "@/lib/import/resolve";

export function parseDepartmentPath(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return ["未分配部门"];
  const parts = trimmed
    .split(/[/\\>＞｜|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ["未分配部门"];
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((part, index) => part === b[index]);
}

export function inferOrg(rows: RawPerson[]): OrgSnapshot {
  const drafts = rows.map((row) => ({
    row,
    dept: parseDepartmentPath(row.departmentRaw),
  }));
  const cycleRows = new Set(cycleMemberIndexes(rows).flat().map((index) => rows[index]?.rowNumber));

  for (let round = 0; round < rows.length + 2; round += 1) {
    let changed = false;
    for (const draft of drafts) {
      if (draft.dept.length > 1) continue;
      if (cycleRows.has(draft.row.rowNumber)) continue;
      const resolved = resolveManager(draft.row, rows);
      if (resolved.status !== "unique") continue;
      const manager = drafts.find((item) => item.row.rowNumber === resolved.person.rowNumber);
      if (!manager || manager.dept.length === 0) continue;
      const leaf = draft.dept[draft.dept.length - 1];
      const managerLeaf = manager.dept[manager.dept.length - 1];
      if (managerLeaf === leaf) {
        if (manager.dept.length > draft.dept.length) {
          draft.dept = [...manager.dept];
          changed = true;
        }
      } else if (!manager.dept.includes(leaf)) {
        draft.dept = [...manager.dept, leaf];
        changed = true;
      }
    }
    const longest = new Map<string, string[]>();
    for (const draft of drafts) {
      const leaf = draft.dept[draft.dept.length - 1];
      const previous = longest.get(leaf);
      if (!previous || draft.dept.length > previous.length) longest.set(leaf, draft.dept);
    }
    for (const draft of drafts) {
      if (draft.dept.length !== 1) continue;
      const better = longest.get(draft.dept[0]);
      if (better && better.length > 1 && !samePath(better, draft.dept)) {
        draft.dept = [...better];
        changed = true;
      }
    }
    if (!changed) break;
  }

  const usedIds = new Set<string>();
  const people: Person[] = drafts.map((draft) => {
    let id = personIdFor(draft.row.rowNumber, draft.row.employeeId);
    if (usedIds.has(id)) id = `${id}-${draft.row.rowNumber}`;
    usedIds.add(id);
    return {
      id,
      rowNumber: draft.row.rowNumber,
      name: draft.row.name,
      originalName: draft.row.originalName,
      employeeId: draft.row.employeeId,
      departmentRaw: draft.row.departmentRaw,
      departmentPath: draft.dept,
      title: draft.row.title || "未命名岗位",
      managerName: draft.row.managerRaw.trim(),
      managerId: null,
      level: draft.row.level,
      annualCost: draft.row.annualCost,
      hireDate: draft.row.hireDate,
      location: draft.row.location,
      performance: draft.row.performance,
      email: draft.row.email,
    };
  });

  const byRow = new Map(people.map((person) => [person.rowNumber, person]));
  for (const person of people) {
    const raw = rows.find((row) => row.rowNumber === person.rowNumber);
    if (!raw) continue;
    const resolved = resolveManager(raw, rows);
    if (resolved.status === "unique") {
      const manager = byRow.get(resolved.person.rowNumber);
      person.managerId = manager && manager.id !== person.id ? manager.id : null;
      if (manager && manager.id === person.id) person.managerId = null;
    }
  }
  // Self-loops and cycles still need to be visible to the rule engine.
  // Unique resolution above drops self links. Restore cycle edges explicitly,
  // including a person whose manager is themselves.
  for (const person of people) {
    const raw = rows.find((row) => row.rowNumber === person.rowNumber);
    if (!raw) continue;
    const resolved = resolveManager(raw, rows);
    if (resolved.status === "unique" && resolved.person.rowNumber === person.rowNumber) {
      person.managerId = person.id;
    }
  }

  const deptMap = new Map<string, Department>();
  for (const person of people) {
    for (let depth = 1; depth <= person.departmentPath.length; depth += 1) {
      const path = person.departmentPath.slice(0, depth);
      const id = deptIdFromPath(path);
      if (deptMap.has(id)) continue;
      const parentPath = path.slice(0, -1);
      deptMap.set(id, {
        id,
        name: path[path.length - 1] ?? "未命名部门",
        path,
        parentId: parentPath.length > 0 ? deptIdFromPath(parentPath) : null,
        headId: null,
      });
    }
  }

  for (const department of deptMap.values()) {
    const key = department.path.join("/");
    const members = people.filter((person) => person.departmentPath.join("/") === key);
    const outside = members.filter((person) => {
      if (!person.managerId || person.managerId === person.id) return true;
      const manager = people.find((item) => item.id === person.managerId);
      return !manager || manager.departmentPath.join("/") !== key;
    });
    if (outside.length === 1) {
      department.headId = outside[0].id;
      continue;
    }
    const reports = new Map(people.map((person) => [person.id, 0]));
    for (const person of people) {
      if (person.managerId && reports.has(person.managerId)) {
        reports.set(person.managerId, (reports.get(person.managerId) ?? 0) + 1);
      }
    }
    const ranked = [...members].sort((a, b) => (reports.get(b.id) ?? 0) - (reports.get(a.id) ?? 0));
    department.headId = ranked[0]?.id ?? null;
  }

  return {
    people,
    departments: [...deptMap.values()].sort((a, b) => a.path.join("/").localeCompare(b.path.join("/"), "zh-CN")),
  };
}
