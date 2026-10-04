import { completeMonths } from "@/lib/headcount/severance";
import type { CompMark } from "@/lib/headcount/severance";

export type Matrix = { name: string; headers: string[]; rows: string[][] };

const SENSITIVE = [/薪/, /工资/, /绩效/, /离职原因/, /身份证/, /手机/, /银行/, /补偿金额/, /年终/, /奖金/];

export function isSensitiveHeader(header: string): boolean {
  return SENSITIVE.some((pattern) => pattern.test(header));
}

/** 浏览器按离职类型表换成补偿标记。类型本身不上传。 */
export function departureMark(type: string): CompMark | null {
  const text = type.trim();
  if (!text) return null;
  if (/无过失|不胜任|医疗期|客观情况|第\s*40/.test(text)) {
    return /未提前|代通知金|\+1/.test(text) ? "N+1" : "N";
  }
  if (/员工提出|主动辞职|过失性|试用期不符合|退休|维持或提高/.test(text)) return "不计";
  const counts = /公司提出|公司过错|欠薪|未缴社保|经济性裁员|裁员|不续签|降低条件|第\s*36|第\s*38|第\s*41/.test(text);
  if (!counts) return null;
  if (/未提前|代通知金|\+1/.test(text)) return "N+1";
  return "N";
}

export type RosterDraft = {
  row: number;
  name: string;
  employeeNo: string;
  department: string;
  title: string;
  grade: string;
  manager: string;
  employmentType: string;
  city: string;
  hireDate: string;
};

export type MovementDraft = {
  row: number;
  kind: string;
  name: string;
  employeeNo: string;
  department: string;
  fromDepartment: string;
  toDepartment: string;
  title: string;
  grade: string;
  employmentType: string;
  effectiveDate: string;
  confirmStatus: string;
  hireDate: string;
  city: string;
  compMark: CompMark | null;
  departureTypeDropped: boolean;
  agentInstances: string;
  seatMonthly: string;
  computeMonthly: string;
  oneOff: string;
};

export type TenureDraft = {
  department: string;
  grade: string;
  averageMonths: number;
  count: number;
};

export type ImportIssue = {
  id: string;
  level: "error" | "warn";
  sheet: string;
  row: number;
  message: string;
};

export type ImportContext = {
  departments: string[];
  grades: string[];
  cities: string[];
  year: number;
  asOf: string;
  parentOf: (department: string) => string | null;
};

const CONFIRMED = new Set(["已接受的 offer", "已审批的调动", "已提交的离职", "已确认"]);

function indexHeaders(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => map.set(header.trim(), index));
  return map;
}

function cell(row: string[], headers: Map<string, number>, names: string[]): string {
  for (const name of names) {
    const index = headers.get(name);
    if (index != null && row[index]) return row[index].trim();
  }
  return "";
}

export function dropSensitive(matrix: Matrix): { matrix: Matrix; dropped: string[] } {
  const kept: number[] = [];
  const dropped: string[] = [];
  matrix.headers.forEach((header, index) => {
    if (isSensitiveHeader(header)) dropped.push(header);
    else kept.push(index);
  });
  return {
    dropped,
    matrix: {
      name: matrix.name,
      headers: kept.map((index) => matrix.headers[index] ?? ""),
      rows: matrix.rows.map((row) => kept.map((index) => row[index] ?? "")),
    },
  };
}

export function readRoster(matrix: Matrix): RosterDraft[] {
  const headers = indexHeaders(matrix.headers);
  return matrix.rows.map((row, index) => ({
    row: index + 2,
    name: cell(row, headers, ["姓名"]),
    employeeNo: cell(row, headers, ["工号"]),
    department: cell(row, headers, ["部门"]),
    title: cell(row, headers, ["岗位"]),
    grade: cell(row, headers, ["职级"]),
    manager: cell(row, headers, ["直属上级"]),
    employmentType: cell(row, headers, ["用工类型"]),
    city: cell(row, headers, ["工作地"]),
    hireDate: cell(row, headers, ["入职日期"]),
  }));
}

export function readMovements(matrix: Matrix): { rows: MovementDraft[]; departureTypesDropped: number } {
  const headers = indexHeaders(matrix.headers);
  const hasType = headers.has("离职类型");
  const rows = matrix.rows.map((row, index) => {
    const departureType = cell(row, headers, ["离职类型"]);
    return {
      row: index + 2,
      kind: cell(row, headers, ["变动类型"]),
      name: cell(row, headers, ["姓名", "姓名 / Agent 名称", "Agent 名称"]),
      employeeNo: cell(row, headers, ["工号"]),
      department: cell(row, headers, ["部门", "目标部门"]),
      fromDepartment: cell(row, headers, ["来源部门"]),
      toDepartment: cell(row, headers, ["目标部门"]),
      title: cell(row, headers, ["岗位"]),
      grade: cell(row, headers, ["职级"]),
      employmentType: cell(row, headers, ["用工类型"]),
      effectiveDate: cell(row, headers, ["生效日"]),
      confirmStatus: cell(row, headers, ["确认状态"]),
      hireDate: cell(row, headers, ["入职日期"]),
      city: cell(row, headers, ["工作地"]),
      compMark: departureMark(departureType),
      departureTypeDropped: Boolean(departureType),
      agentInstances: cell(row, headers, ["Agent 实例数", "实例数"]),
      seatMonthly: cell(row, headers, ["席位费"]),
      computeMonthly: cell(row, headers, ["算力"]),
      oneOff: cell(row, headers, ["一次性成本", "一次性"]),
    };
  });
  return { rows, departureTypesDropped: hasType ? rows.filter((row) => row.departureTypeDropped).length : 0 };
}

export function aggregateTenure(
  people: { department: string; grade: string; hireDate: string }[],
  asOf: string,
  parentOf: (department: string) => string | null,
): TenureDraft[] {
  const buckets = new Map<string, { department: string; grade: string; total: number; count: number }>();
  const add = (department: string, grade: string, total: number, count: number) => {
    const key = `${department}\u0000${grade}`;
    const current = buckets.get(key) ?? { department, grade, total: 0, count: 0 };
    current.total += total;
    current.count += count;
    buckets.set(key, current);
  };
  for (const person of people) {
    if (!person.hireDate || !person.department || !person.grade) continue;
    add(person.department, person.grade, completeMonths(person.hireDate, asOf), 1);
  }
  let moved = true;
  while (moved) {
    moved = false;
    for (const bucket of [...buckets.values()]) {
      if (bucket.count <= 0 || bucket.count >= 5) continue;
      const parent = parentOf(bucket.department);
      if (!parent) continue;
      add(parent, bucket.grade, bucket.total, bucket.count);
      bucket.count = 0;
      bucket.total = 0;
      moved = true;
    }
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.count >= 5)
    .map((bucket) => ({
      department: bucket.department,
      grade: bucket.grade,
      averageMonths: Math.round((bucket.total / bucket.count) * 10) / 10,
      count: bucket.count,
    }));
}

function inYear(iso: string, year: number): "before" | "inside" | "after" | "bad" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "bad";
  const value = Number(iso.slice(0, 4));
  if (value < year) return "before";
  if (value > year) return "after";
  return "inside";
}

export function validateImport(roster: RosterDraft[], movements: MovementDraft[], context: ImportContext): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  const numbers = new Set(roster.map((row) => row.employeeNo).filter(Boolean));
  const names = new Set(roster.map((row) => row.name).filter(Boolean));
  roster.forEach((row) => {
    if (row.employeeNo && seen.has(row.employeeNo)) {
      issues.push({ id: `dup-${row.row}`, level: "error", sheet: "花名册", row: row.row, message: `工号 ${row.employeeNo} 重复` });
    }
    if (row.employeeNo) seen.add(row.employeeNo);
    if (row.manager && !numbers.has(row.manager) && !names.has(row.manager)) {
      issues.push({ id: `mgr-${row.row}`, level: "error", sheet: "花名册", row: row.row, message: `直属上级「${row.manager}」在表里找不到` });
    }
    if (row.department && !context.departments.includes(row.department)) {
      issues.push({ id: `dept-${row.row}`, level: "error", sheet: "花名册", row: row.row, message: `部门「${row.department}」不在部门树里` });
    }
    if (row.grade && !context.grades.includes(row.grade)) {
      issues.push({ id: `grade-${row.row}`, level: "warn", sheet: "花名册", row: row.row, message: `${row.name || "该行"} 的职级没有均值，不计入合计` });
    }
    if (row.city && !context.cities.includes(row.city)) {
      issues.push({ id: `city-${row.row}`, level: "warn", sheet: "花名册", row: row.row, message: `工作地「${row.city}」没有城市平均工资，经济补偿将按未封顶计算` });
    }
  });
  movements.forEach((row) => {
    if (!CONFIRMED.has(row.confirmStatus)) {
      issues.push({ id: `status-${row.row}`, level: "error", sheet: "在途变动", row: row.row, message: `确认状态不是已接受的 offer、已审批的调动或已提交的离职，已跳过` });
    }
    if (row.kind === "离职" && !row.compMark) {
      issues.push({ id: `mark-${row.row}`, level: "error", sheet: "在途变动", row: row.row, message: "离职行缺少可识别的离职类型，不导入" });
    }
    if (row.kind !== "入职" && row.employeeNo && !numbers.has(row.employeeNo) && !row.kind.startsWith("Agent")) {
      issues.push({ id: `missing-${row.row}`, level: "error", sheet: "在途变动", row: row.row, message: `工号 ${row.employeeNo} 不在花名册里` });
    }
    const when = inYear(row.effectiveDate, context.year);
    if (when === "before") issues.push({ id: `early-${row.row}`, level: "warn", sheet: "在途变动", row: row.row, message: "生效日早于规划周期，请确认是否已经生效" });
    if (when === "after") issues.push({ id: `late-${row.row}`, level: "warn", sheet: "在途变动", row: row.row, message: "生效日晚于本周期，不计入本周期" });
    if (when === "bad") issues.push({ id: `date-${row.row}`, level: "error", sheet: "在途变动", row: row.row, message: "生效日无法识别" });
  });
  return issues;
}

export type UploadBundle = {
  droppedColumns: string[];
  departureTypesDropped: number;
  roster: { name: string; employeeNo: string; department: string; title: string; grade: string; manager: string; employmentType: string; city: string; hireDate?: string }[];
  movements: {
    kind: string;
    name: string;
    employeeNo: string;
    department: string;
    fromDepartment: string;
    toDepartment: string;
    title: string;
    grade: string;
    employmentType: string;
    effectiveDate: string;
    compMark?: CompMark;
    hireDate?: string;
    city?: string;
  }[];
  tenure: TenureDraft[];
  issues: ImportIssue[];
};

/** 上传包里没有离职类型。入职日期只留给补偿标记不是「不计」的人。 */
export function buildUpload(rosterMatrix: Matrix, movementMatrix: Matrix, context: ImportContext, skipped: string[] = []): UploadBundle {
  const rosterClean = dropSensitive(rosterMatrix);
  const movementClean = dropSensitive(movementMatrix);
  const roster = readRoster(rosterClean.matrix);
  const parsed = readMovements(movementClean.matrix);
  const issues = validateImport(roster, parsed.rows, context).filter((issue) => !skipped.includes(issue.id));
  const blocked = new Set(issues.filter((issue) => issue.level === "error").map((issue) => `${issue.sheet}:${issue.row}`));
  const keptRoster = roster.filter((row) => !blocked.has(`花名册:${row.row}`));
  const compensated = new Set(
    parsed.rows.filter((row) => row.kind === "离职" && row.compMark && row.compMark !== "不计").map((row) => row.employeeNo),
  );
  const tenure = aggregateTenure(
    keptRoster.map((row) => ({ department: row.department, grade: row.grade, hireDate: row.hireDate })),
    context.asOf,
    context.parentOf,
  );
  return {
    droppedColumns: [...rosterClean.dropped, ...movementClean.dropped],
    departureTypesDropped: parsed.departureTypesDropped,
    roster: keptRoster.map((row) => ({
      name: row.name,
      employeeNo: row.employeeNo,
      department: row.department,
      title: row.title,
      grade: row.grade,
      manager: row.manager,
      employmentType: row.employmentType,
      city: row.city,
      ...(compensated.has(row.employeeNo) && row.hireDate ? { hireDate: row.hireDate } : {}),
    })),
    movements: parsed.rows
      .filter((row) => !blocked.has(`在途变动:${row.row}`))
      .map((row) => ({
        kind: row.kind,
        name: row.name,
        employeeNo: row.employeeNo,
        department: row.department,
        fromDepartment: row.fromDepartment,
        toDepartment: row.toDepartment,
        title: row.title,
        grade: row.grade,
        employmentType: row.employmentType,
        effectiveDate: row.effectiveDate,
        ...(row.kind === "离职" && row.compMark ? { compMark: row.compMark } : {}),
        ...(row.kind === "离职" && row.compMark && row.compMark !== "不计" && row.hireDate ? { hireDate: row.hireDate } : {}),
        ...(row.city ? { city: row.city } : {}),
      })),
    tenure,
    issues,
  };
}
