import { dateParts, parseIsoDate, utcDate } from "@/lib/headcount/calendar";

export type CompMark = "不计" | "N" | "N+1";

export class SeveranceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeveranceInputError";
  }
}

export type SeveranceResult = {
  amount: number;
  compensationMonths: number;
  monthlyBase: number;
  capped: boolean;
  warning: string | null;
};

const DAY_MS = 86_400_000;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsUtc(ms: number, months: number): number {
  const parts = dateParts(ms);
  const index = parts.month - 1 + months;
  const year = parts.year + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return utcDate(year, month, Math.min(parts.day, lastDayOfMonth(year, month)));
}

/**
 * 口径 B，已定。整年、整月和满 6 个月都看这个届满日。
 * 起算日是入职日前一天。满 k 个整月的日子，是起算日在第 k 个月的对应日；该月没有这一天，就取该月最后一天。
 * 生效日大于等于届满日，即满 k 个月。
 */
export function fullMonthBoundary(hireMs: number, months: number): number {
  return addMonthsUtc(hireMs - DAY_MS, months);
}

/** 入职日到生效日的完整日历月，用来汇总部门平均司龄。零头天数不进这个整数。 */
export function completeMonths(hireDate: string, effectiveDate: string): number {
  const hire = parseIsoDate(hireDate);
  const effective = parseIsoDate(effectiveDate);
  if (effective < hire) throw new SeveranceInputError("入职日期晚于生效日");
  const from = dateParts(hire);
  const to = dateParts(effective);
  let months = (to.year - from.year) * 12 + (to.month - from.month);
  if (to.day < from.day) months -= 1;
  if (months < 0) throw new SeveranceInputError("入职日期晚于生效日");
  return months;
}

export type ServiceLength = { years: number; remainderMonths: number; remainderDays: number };

/** 入职日到生效日，含两端。整月数全部由 fullMonthBoundary 判定。 */
export function serviceLength(hireDate: string, effectiveDate: string): ServiceLength {
  const hire = parseIsoDate(hireDate);
  const effective = parseIsoDate(effectiveDate);
  if (effective < hire) throw new SeveranceInputError("入职日期晚于生效日");
  let complete = 0;
  while (effective >= fullMonthBoundary(hire, complete + 1)) {
    complete += 1;
    if (complete > 12 * 80) break;
  }
  const years = Math.floor(complete / 12);
  const remainderMonths = complete % 12;
  const remainderDays = Math.max(0, Math.round((effective - fullMonthBoundary(hire, complete)) / DAY_MS));
  return { years, remainderMonths, remainderDays };
}

/** 第 47 条折月：整年各计 1 个月；零头满 6 个月再计 1 年；零头不满 6 个月但多出几天也计半个月。 */
export function compensationMonthsFromDates(hireDate: string, effectiveDate: string): number {
  const service = serviceLength(hireDate, effectiveDate);
  if (service.remainderMonths >= 6) return service.years + 1;
  if (service.remainderMonths > 0 || service.remainderDays > 0) return service.years + 0.5;
  return service.years;
}

/** 满 1 年 1 个月；6 个月以上不满 1 年按 1 年；不满 6 个月按半个月。正好 6 个月算「6 个月以上」。 */
export function compensationMonths(complete: number): number {
  const years = Math.floor(complete / 12);
  const rest = complete % 12;
  if (rest >= 6) return years + 1;
  if (rest > 0) return years + 0.5;
  return years;
}

/** 平均司龄先四舍五入到整月，再套第 47 条的月数。 */
export function compensationMonthsFromAverage(averageMonths: number): number {
  return compensationMonths(Math.round(averageMonths));
}

export type TenureRow = {
  departmentId: string;
  grade: string;
  averageMonths: number;
  count: number;
};

/**
 * 场景减员没有具体的人，用部门 × 职级平均司龄。
 * 该组合不足 5 人（或没有这一行）时，改用上一级部门。
 */
export function resolveTenureMonths(
  rows: TenureRow[],
  departmentId: string,
  grade: string,
  parentOf: (id: string) => string | null,
): number {
  let current: string | null = departmentId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = rows.find((item) => item.departmentId === current && item.grade === grade && item.count >= 5);
    if (row) return row.averageMonths;
    current = parentOf(current);
  }
  throw new SeveranceInputError("缺少可用的部门职级平均司龄");
}

/** 代通知金多出来的那一个月，用封顶后的月基数，还是用未封顶的月工资基数。产品只改这一处。 */
export type NoticePayBase = "capped" | "uncapped";

/**
 * 第 40 条代通知金（N+1 里的「+1」）按月工资基数加一个月，不吃 3 倍封顶。
 * 3 倍当地月平均工资只封第 47 条经济补偿（N）。
 */
export const NOTICE_PAY_BASE: NoticePayBase = "uncapped";

/** 职级表填了月工资基数就用它；空着则退回年成本 ÷ 12。 */
export function monthlyWage(gradeAnnual: number, monthlyWageBase?: number | null): number {
  if (monthlyWageBase == null) return gradeAnnual / 12;
  return monthlyWageBase;
}

export function noticePayMonthly(uncappedMonthly: number, cappedMonthly: number, choice: NoticePayBase = NOTICE_PAY_BASE): number {
  return choice === "uncapped" ? uncappedMonthly : cappedMonthly;
}

/**
 * 《劳动合同法》第 47 条经济补偿，外加可选的第 40 条代通知金。输入是补偿标记，不是离职类型。
 * 月工资基数高于当地上年度职工月平均工资 3 倍时，第 47 条的基数按 3 倍封顶，年限最多 12 年。
 * 正好等于 3 倍时不封顶。没有城市工资配置时不封顶，并给出提示。
 * 代通知金用未封顶的月工资基数，不随第 47 条的封顶走。
 */
export function estimateSeverance(input: {
  mark: CompMark;
  gradeAnnual: number;
  /** 职级成本表上的月工资基数。空着则用年成本 ÷ 12。 */
  monthlyWageBase?: number | null;
  hireDate?: string | null;
  effectiveDate?: string;
  averageMonths?: number;
  cityMonthly?: number | null;
  noticePay?: boolean;
  noticePayBase?: NoticePayBase;
}): SeveranceResult {
  if (input.mark === "不计") {
    return { amount: 0, compensationMonths: 0, monthlyBase: 0, capped: false, warning: null };
  }
  let months: number;
  if (input.averageMonths != null) {
    months = compensationMonths(Math.round(input.averageMonths));
  } else {
    if (!input.hireDate) throw new SeveranceInputError("缺入职日期");
    if (!input.effectiveDate) throw new SeveranceInputError("缺生效日");
    months = compensationMonthsFromDates(input.hireDate, input.effectiveDate);
  }
  const wage = monthlyWage(input.gradeAnnual, input.monthlyWageBase);
  let base = wage;
  let capped = false;
  let warning: string | null = null;
  if (input.cityMonthly == null) {
    warning = "未配置该城市上年度职工月平均工资，经济补偿按未封顶计算";
  } else {
    const cap = input.cityMonthly * 3;
    if (base > cap) {
      base = cap;
      months = Math.min(months, 12);
      capped = true;
    }
  }
  let amount = base * months;
  if (input.mark === "N+1" || input.noticePay) amount += noticePayMonthly(wage, base, input.noticePayBase);
  return { amount, compensationMonths: months, monthlyBase: base, capped, warning };
}
