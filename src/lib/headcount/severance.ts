import { dateParts, parseIsoDate } from "@/lib/headcount/calendar";

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

/** 入职日到生效日的完整月数。生效日当天若还没到入职的「日」，不满一个月。 */
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

/**
 * 《劳动合同法》第 47 条。输入是补偿标记，不是离职类型。
 * 月基数高于当地上年度职工月平均工资 3 倍时，基数按 3 倍封顶，年限最多 12 年。
 * 正好等于 3 倍时不封顶。没有城市工资配置时不封顶，并给出提示。
 * 代通知金沿用封顶之后的月基数（待确认事项里的暂按）。
 */
export function estimateSeverance(input: {
  mark: CompMark;
  gradeAnnual: number;
  hireDate?: string | null;
  effectiveDate?: string;
  averageMonths?: number;
  cityMonthly?: number | null;
  noticePay?: boolean;
}): SeveranceResult {
  if (input.mark === "不计") {
    return { amount: 0, compensationMonths: 0, monthlyBase: 0, capped: false, warning: null };
  }
  let complete: number;
  if (input.averageMonths != null) {
    complete = Math.round(input.averageMonths);
  } else {
    if (!input.hireDate) throw new SeveranceInputError("缺入职日期");
    if (!input.effectiveDate) throw new SeveranceInputError("缺生效日");
    complete = completeMonths(input.hireDate, input.effectiveDate);
  }
  let months = compensationMonths(complete);
  let base = input.gradeAnnual / 12;
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
  if (input.mark === "N+1" || input.noticePay) amount += base;
  return { amount, compensationMonths: months, monthlyBase: base, capped, warning };
}
