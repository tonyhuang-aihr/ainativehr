import type { ColumnField, ColumnMatch } from "@/lib/model/types";

const FIELDS: ColumnField[] = [
  "name",
  "department",
  "title",
  "manager",
  "employeeId",
  "level",
  "annualCost",
  "hireDate",
  "location",
  "performance",
  "email",
  "status",
];

const ALIASES: Record<ColumnField, string[]> = {
  name: ["姓名", "名字", "员工姓名", "员工名称", "人员姓名", "员工名", "name", "employeename", "fullname"],
  department: [
    "部门",
    "所属部门",
    "部门名称",
    "部门路径",
    "部门全称",
    "组织单元",
    "组织架构",
    "所在部门",
    "所属组织",
    "组织路径",
    "department",
    "dept",
  ],
  title: ["岗位", "职位", "职务", "岗位名称", "担任岗位", "职位名称", "title", "position", "jobtitle"],
  manager: [
    "直属上级",
    "直接上级",
    "上级姓名",
    "汇报人",
    "汇报对象",
    "直线经理",
    "直属领导",
    "直接领导",
    "汇报上级",
    "leader",
    "manager",
    "linemanager",
    "reportingmanager",
  ],
  employeeId: ["工号", "员工号", "员工工号", "员工编号", "用户id", "userid", "员工id", "employeeid", "工卡号"],
  level: ["职级", "职等", "grade", "joblevel", "级别"],
  annualCost: ["年度人力成本", "人力成本", "年度成本", "年薪", "薪酬", "薪资", "annualcost", "salary"],
  hireDate: ["入职时间", "入职日期", "hiredate", "entrydate", "入职"],
  location: ["工作地点", "办公城市", "工作城市", "地点", "城市", "location", "city"],
  performance: ["绩效结果", "绩效等级", "绩效", "performance"],
  email: ["企业邮箱", "邮箱", "email", "mail"],
  status: ["帐号状态", "账号状态", "员工状态", "在职状态", "status"],
};

const EXCLUSIONS: Partial<Record<ColumnField, string[]>> = {
  name: ["类型", "状态", "邮箱", "工号", "编号", "id"],
  manager: ["邮箱", "email", "部门", "工号", "id"],
  department: ["上级", "负责人", "id"],
  title: ["职级", "级别", "id"],
  employeeId: ["邮箱", "姓名", "部门"],
  annualCost: ["中心", "部门"],
  status: ["绩效"],
};

export function normalizeHeader(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()【】[\]_\-—·,，.。:：/\\]/g, "");
}

function scoreHeader(header: string, field: ColumnField): { score: number; reason: string } {
  const normalized = normalizeHeader(header);
  if (!normalized) return { score: 0, reason: "" };
  const excluded = EXCLUSIONS[field] ?? [];
  if (excluded.some((word) => normalized.includes(normalizeHeader(word)))) {
    return { score: 0, reason: "" };
  }
  let best = 0;
  let reason = "";
  for (const alias of ALIASES[field]) {
    const key = normalizeHeader(alias);
    if (!key) continue;
    if (normalized === key) {
      return { score: 100, reason: `列名「${header}」与「${alias}」一致` };
    }
    if (key.length >= 2 && normalized.includes(key)) {
      const score = 72 + Math.min(key.length, 12);
      if (score > best) {
        best = score;
        reason = `列名「${header}」包含「${alias}」`;
      }
    } else if (normalized.length >= 2 && key.includes(normalized) && normalized.length >= key.length - 1) {
      const score = 64 + normalized.length;
      if (score > best) {
        best = score;
        reason = `列名「${header}」接近「${alias}」`;
      }
    }
  }
  if (field === "manager" && normalized === "上级") {
    return { score: 78, reason: "列名「上级」按直属上级理解" };
  }
  if (field === "department" && normalized === "组织") {
    return { score: 76, reason: "列名「组织」按部门理解" };
  }
  return { score: best, reason };
}

/** 按列名打分后贪心分配，一列只对应一个字段。不确定的列留空，交给用户改。 */
export function matchColumns(headers: string[]): ColumnMatch[] {
  const pairs: { header: string; field: ColumnField; score: number; reason: string }[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    const label = header.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    for (const field of FIELDS) {
      const scored = scoreHeader(label, field);
      if (scored.score >= 70) {
        pairs.push({ header: label, field, score: scored.score, reason: scored.reason });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.header.length - b.header.length);
  const usedHeaders = new Set<string>();
  const usedFields = new Set<ColumnField>();
  const matches: ColumnMatch[] = [];
  for (const pair of pairs) {
    if (usedHeaders.has(pair.header) || usedFields.has(pair.field)) continue;
    usedHeaders.add(pair.header);
    usedFields.add(pair.field);
    matches.push({
      field: pair.field,
      header: pair.header,
      confidence: Math.min(1, pair.score / 100),
      reason: pair.reason,
    });
  }
  return matches;
}

export function headerFor(matches: ColumnMatch[], field: ColumnField): string | undefined {
  return matches.find((match) => match.field === field)?.header;
}

export function scoreSheet(headers: string[]): number {
  const matches = matchColumns(headers);
  const weight: Partial<Record<ColumnField, number>> = {
    name: 4,
    department: 3,
    title: 2,
    manager: 4,
    employeeId: 1,
  };
  return matches.reduce((sum, match) => sum + (weight[match.field] ?? 0) * match.confidence, 0);
}

export function choosePeopleSheet<T extends { name: string; headers: string[] }>(sheets: T[]): T {
  let best = sheets[0];
  let bestScore = -1;
  for (const sheet of sheets) {
    const score = scoreSheet(sheet.headers);
    if (score > bestScore) {
      best = sheet;
      bestScore = score;
    }
  }
  return best;
}
