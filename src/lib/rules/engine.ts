import type { OrgIssue, OrgSnapshot, RuleCode, RuleThresholds, Severity } from "@/lib/model/types";
import { DEFAULT_THRESHOLDS } from "@/lib/model/types";

function childrenByManager(snapshot: OrgSnapshot): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const person of snapshot.people) {
    if (!person.managerId || person.managerId === person.id) continue;
    const list = map.get(person.managerId) ?? [];
    list.push(person.id);
    map.set(person.managerId, list);
  }
  return map;
}

function findCycles(snapshot: OrgSnapshot): string[][] {
  const byId = new Map(snapshot.people.map((person) => [person.id, person]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const dfs = (id: string) => {
    state.set(id, 1);
    stack.push(id);
    const managerId = byId.get(id)?.managerId;
    if (managerId && byId.has(managerId)) {
      const mark = state.get(managerId) ?? 0;
      if (mark === 1) {
        const at = stack.indexOf(managerId);
        cycles.push(stack.slice(at));
      } else if (mark === 0) {
        dfs(managerId);
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const person of snapshot.people) {
    if ((state.get(person.id) ?? 0) === 0) dfs(person.id);
  }
  return cycles;
}

function deptIdForPerson(snapshot: OrgSnapshot, personId: string): string | null {
  const person = snapshot.people.find((item) => item.id === personId);
  if (!person) return null;
  const key = person.departmentPath.join("/");
  return snapshot.departments.find((department) => department.path.join("/") === key)?.id ?? null;
}

function subtreeCount(snapshot: OrgSnapshot, path: string[]): number {
  const key = path.join("/");
  return snapshot.people.filter((person) => {
    const current = person.departmentPath.join("/");
    return current === key || current.startsWith(`${key}/`);
  }).length;
}

function issue(
  code: RuleCode,
  severity: Severity,
  title: string,
  message: string,
  personIds: string[],
  departmentIds: string[],
): OrgIssue {
  const anchor = personIds[0] ?? departmentIds[0] ?? "org";
  return {
    id: `${code}:${anchor}`,
    code,
    severity,
    title,
    message,
    personIds,
    departmentIds,
  };
}

/**
 * 纯函数规则引擎。给 P2 主动提示用，也给以后的 P3 拖拽用：
 * 每次放下后同步调用，百人规模应在 1 秒内返回。
 * AI 解释是另外一层，不放进这里。
 */
export function evaluateRules(
  snapshot: OrgSnapshot,
  thresholds: RuleThresholds = DEFAULT_THRESHOLDS,
  ignoredCodes: RuleCode[] = [],
): OrgIssue[] {
  const ignored = new Set(ignoredCodes);
  const issues: OrgIssue[] = [];
  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]));
  const reports = childrenByManager(snapshot);

  for (const person of snapshot.people) {
    const span = (reports.get(person.id) ?? []).length;
    const deptId = deptIdForPerson(snapshot, person.id);
    if (span > thresholds.spanWide) {
      issues.push(
        issue(
          "span_wide",
          "yellow",
          "管理幅度过宽",
          `「${person.name}」直接带了 ${span} 个人，超过建议上限 ${thresholds.spanWide} 人。人一多，辅导和现场决策容易跟不上。`,
          [person.id],
          deptId ? [deptId] : [],
        ),
      );
    } else if (span >= 1 && span <= thresholds.spanNarrow) {
      const single = span === 1;
      issues.push(
        issue(
          "span_narrow",
          "blue",
          single ? "单点汇报" : "管理幅度偏低",
          single
            ? `「${person.name}」只有 1 名直接下属。这种单点汇报通常可以并进相邻团队，少一层传达。`
            : `「${person.name}」只直接带 ${span} 个人，低于建议的 ${thresholds.spanNarrow + 1} 人。管理幅度偏低，可以看看要不要并组。`,
          [person.id],
          deptId ? [deptId] : [],
        ),
      );
    }
  }

  let deepest = snapshot.departments[0];
  for (const department of snapshot.departments) {
    if (!deepest || department.path.length > deepest.path.length) deepest = department;
  }
  if (deepest && deepest.path.length > thresholds.maxLayers) {
    issues.push(
      issue(
        "layers_deep",
        "yellow",
        "层级偏深",
        `从「${deepest.path[0]}」到「${deepest.name}」一共 ${deepest.path.length} 层（${deepest.path.join(" / ")}），超过建议的 ${thresholds.maxLayers} 层。层级多了，决策会变慢。`,
        [],
        [deepest.id],
      ),
    );
  }

  for (const department of snapshot.departments) {
    const count = subtreeCount(snapshot, department.path);
    if (count === 0) {
      issues.push(
        issue(
          "empty_dept",
          "yellow",
          "空部门",
          `「${department.name}」下面没有人。空部门会让架构图和编制对不上，建议合并或删除。`,
          [],
          [department.id],
        ),
      );
    } else if (count === 1) {
      const only = snapshot.people.find((person) => {
        const key = person.departmentPath.join("/");
        const deptKey = department.path.join("/");
        return key === deptKey || key.startsWith(`${deptKey}/`);
      });
      issues.push(
        issue(
          "single_person_dept",
          "blue",
          "一人部门",
          `「${department.name}」整个部门只有 ${only ? only.name : "1 个人"}。一人部门往往可以挂回上级，减少一个管理节点。`,
          only ? [only.id] : [],
          [department.id],
        ),
      );
    }
  }

  for (const cycle of findCycles(snapshot)) {
    const names = cycle.map((id) => peopleById.get(id)?.name ?? id);
    const label = names.join(" → ");
    const deptIds = cycle
      .map((id) => deptIdForPerson(snapshot, id))
      .filter((id): id is string => Boolean(id));
    issues.push(
      issue(
        "reporting_cycle",
        "red",
        "汇报关系成环",
        names.length === 1
          ? `「${names[0]}」的上级指向了自己，汇报线是环的。需要先断开。`
          : `${label} → ${names[0]}。这几个人的汇报关系成环了，架构无法成立。`,
        cycle,
        [...new Set(deptIds)],
      ),
    );
  }

  const blankRoots = snapshot.people.filter((person) => !person.managerId && !person.managerName.trim());
  const unresolved = snapshot.people.filter((person) => !person.managerId && person.managerName.trim() && person.managerId !== person.id);
  const missingPeople = [
    ...unresolved,
    ...(blankRoots.length > 1 ? blankRoots : []),
  ];
  const seen = new Set<string>();
  for (const person of missingPeople) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    if (person.managerId === person.id) continue;
    const deptId = deptIdForPerson(snapshot, person.id);
    const named = person.managerName.trim();
    issues.push(
      issue(
        "missing_manager",
        "red",
        named ? "上级不在组织里" : "没有上级",
        named
          ? `「${person.name}」填写的上级是「${named}」，当前组织里找不到这个人。`
          : `「${person.name}」没有上级，组织里会出现多个顶点。`,
        [person.id],
        deptId ? [deptId] : [],
      ),
    );
  }

  const severityOrder: Record<Severity, number> = { red: 0, yellow: 1, blue: 2 };
  return issues
    .filter((item) => !ignored.has(item.code))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.title.localeCompare(b.title, "zh-CN"));
}
