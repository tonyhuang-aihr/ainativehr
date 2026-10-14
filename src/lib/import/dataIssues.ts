import type { DataIssueCode, RawPerson, Severity } from "@/lib/model/types";
import { chooseRoot, cycleMemberIndexes, leafDepartment, resolveManager } from "@/lib/import/resolve";

export type DataIssue = {
  id: string;
  code: DataIssueCode;
  severity: Severity;
  title: string;
  message: string;
  fixLabel: string;
  skipLabel: string;
  apply: (people: RawPerson[]) => RawPerson[];
};

function clone(people: RawPerson[]): RawPerson[] {
  return people.map((person) => ({ ...person }));
}

function sameDeptHead(person: RawPerson, people: RawPerson[]): RawPerson | null {
  const leaf = leafDepartment(person.departmentRaw);
  const peers = people.filter(
    (item) => item.rowNumber !== person.rowNumber && leafDepartment(item.departmentRaw) === leaf,
  );
  const titled = peers.filter((item) => /经理|总监|负责人|主管|组长|总裁|总经理|主任/.test(item.title));
  if (titled.length === 1) return titled[0];
  return null;
}

export function findDataIssues(people: RawPerson[]): DataIssue[] {
  const issues: DataIssue[] = [];
  const root = chooseRoot(people);
  const blanks = people.filter((person) => !person.managerRaw.trim());

  if (blanks.length > 1 && root) {
    for (const person of blanks) {
      if (person.rowNumber === root.rowNumber) continue;
      issues.push({
        id: `missing-blank-${person.rowNumber}`,
        code: "missing_manager",
        severity: "red",
        title: "没有填写上级",
        message: `「${person.name}」没有填直属上级。花名册里已经有最高负责人「${root.name}」，多出来的人会变成第二个顶点。`,
        fixLabel: `把「${person.name}」挂到「${root.name}」下面`,
        skipLabel: "先跳过，照常导入",
        apply: (rows) =>
          clone(rows).map((item) =>
            item.rowNumber === person.rowNumber ? { ...item, managerRaw: root.employeeId || root.name } : item,
          ),
      });
    }
  }

  for (const person of people) {
    const resolved = resolveManager(person, people);
    if (resolved.status === "missing") {
      const peer = sameDeptHead(person, people);
      const target = peer ?? root;
      const targetLabel = target ? target.name : "最高负责人";
      issues.push({
        id: `missing-${person.rowNumber}`,
        code: "missing_manager",
        severity: "red",
        title: "上级不在花名册里",
        message: `「${person.name}」的上级写成了「${person.managerRaw.trim()}」，但这张表里找不到这个人。`,
        fixLabel: target
          ? peer
            ? `改挂到同部门的「${peer.name}」`
            : `改挂到最高负责人「${target.name}」`
          : "暂时无法自动修",
        skipLabel: "先跳过，这个人先单独放着",
        apply: (rows) => {
          if (!target) return rows;
          return clone(rows).map((item) =>
            item.rowNumber === person.rowNumber ? { ...item, managerRaw: target.employeeId || target.name } : item,
          );
        },
      });
      void targetLabel;
    }
    if (resolved.status === "ambiguous") {
      const names = resolved.candidates.map((item) => item.name).join("、");
      const leaf = leafDepartment(person.departmentRaw);
      const same = resolved.candidates.filter((item) => leafDepartment(item.departmentRaw) === leaf);
      const picked = same.length === 1 ? same[0] : null;
      issues.push({
        id: `ambiguous-${person.rowNumber}`,
        code: "ambiguous_manager",
        severity: "red",
        title: "上级名字对不上",
        message: `「${person.name}」的上级只写了「${person.managerRaw.trim()}」，表里有 ${resolved.candidates.length} 个同名的人（${names}），不知道该跟谁。`,
        fixLabel: picked ? `先按同部门，挂到「${picked.name}」（${leaf}）` : "先用部门后缀把重名分开",
        skipLabel: "先跳过",
        apply: (rows) => {
          if (!picked) return disambiguate(rows, person.managerRaw.trim());
          return clone(rows).map((item) =>
            item.rowNumber === person.rowNumber ? { ...item, managerRaw: picked.employeeId || picked.name } : item,
          );
        },
      });
    }
  }

  const nameGroups = new Map<string, RawPerson[]>();
  for (const person of people) {
    const list = nameGroups.get(person.name) ?? [];
    list.push(person);
    nameGroups.set(person.name, list);
  }
  for (const [name, group] of nameGroups) {
    if (group.length < 2) continue;
    const where = group.map((person) => leafDepartment(person.departmentRaw)).join("、");
    issues.push({
      id: `duplicate-${name}`,
      code: "duplicate_name",
      severity: "yellow",
      title: "有人重名",
      message: `有 ${group.length} 位员工都叫「${name}」（${where}）。上级如果只写名字，会对不上人。`,
      fixLabel: "在姓名后加上部门，并按同部门重连上级",
      skipLabel: "先跳过",
      apply: (rows) => disambiguate(rows, name),
    });
  }

  for (const cycle of cycleMemberIndexes(people)) {
    const members = cycle.map((index) => people[index]).filter(Boolean);
    if (members.length === 0 || !root) continue;
    const label = members.map((person) => person.name).join(" → ");
    const broken = members[members.length - 1];
    const ids = members
      .map((person) => person.rowNumber)
      .sort((a, b) => a - b)
      .join("-");
    issues.push({
      id: `cycle-${ids}`,
      code: "reporting_cycle",
      severity: "red",
      title: "汇报线成环了",
      message:
        members.length === 1
          ? `「${members[0].name}」的上级写成了自己，汇报线转回了原点。`
          : `${label} → ${members[0].name}。这几个人互相汇报，组织树画不出来。`,
      fixLabel: `把「${broken.name}」改挂到「${root.name}」，先把环断开`,
      skipLabel: "先跳过，进入沙盘后再看",
      apply: (rows) =>
        clone(rows).map((item) =>
          item.rowNumber === broken.rowNumber ? { ...item, managerRaw: root.employeeId || root.name } : item,
        ),
    });
  }

  const order: Record<Severity, number> = { red: 0, yellow: 1, blue: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id, "zh-CN"));
}

function disambiguate(people: RawPerson[], name: string): RawPerson[] {
  const targets = people.filter((person) => person.name === name || person.originalName === name);
  if (targets.length < 2) return people;
  const rename = new Map<number, string>();
  for (const person of targets) {
    let next = `${person.originalName}（${leafDepartment(person.departmentRaw)}）`;
    const clash = targets.filter(
      (item) => `${item.originalName}（${leafDepartment(item.departmentRaw)}）` === next,
    );
    if (clash.length > 1) next = `${next}#${person.rowNumber}`;
    rename.set(person.rowNumber, next);
  }
  return people.map((person) => {
    const nextName = rename.get(person.rowNumber) ?? person.name;
    let managerRaw = person.managerRaw;
    if (managerRaw.trim() === name || targets.some((item) => item.originalName === managerRaw.trim() && rename.has(item.rowNumber))) {
      const myLeaf = leafDepartment(person.departmentRaw);
      const same = targets.filter((item) => leafDepartment(item.departmentRaw) === myLeaf && item.rowNumber !== person.rowNumber);
      if (same.length === 1) managerRaw = same[0].employeeId || rename.get(same[0].rowNumber) || same[0].name;
    }
    return { ...person, name: nextName, managerRaw };
  });
}
