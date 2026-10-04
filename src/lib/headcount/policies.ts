/**
 * PRD 第 10 节已拍板的默认值。每一条都收在这里，计算别处只调用函数。
 * 示例成本仍按设计师脚本的右端点（生效日当天不计）折算，见 SAMPLE_FOLLOWS_DESIGNER_END。
 */

/** 规划年度是自然年，按四个自然季度拆开。 */
export const PLANNING_CYCLE = "calendar-year-quarters" as const;

/**
 * 离职生效日 = 最后工作日，成本算到这一天（含当天）。
 * 转出、转入的生效日仍是区间右端点：当天起算在新部门。
 */
export const DEPARTURE_COUNTS_THROUGH_LAST_WORKING_DAY = true;

/**
 * 设计师脚本把离职生效日当成区间右端点，当天不计入。
 * 含当天大约多 0.49 万元，会带动 0.5 万取整，原型上的 2,075.5 / 16,095.0 就会变。
 * 示例路径因此仍走设计师日历；产品开关打开后用 exclusiveServiceEnd。
 */
export const SAMPLE_FOLLOWS_DESIGNER_END = true;

export function exclusiveServiceEnd(lastWorkingDay: string, countsThrough = DEPARTURE_COUNTS_THROUGH_LAST_WORKING_DAY): string {
  if (!countsThrough) return lastWorkingDay;
  const [year, month, day] = lastWorkingDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  const next = date.toISOString().slice(0, 10);
  return next;
}

/** 外包、实习、顾问：OD 设定的元/人/月，年成本按 12 个月。 */
export function annualFromMonthlyRate(yuanPerPersonMonth: number): number {
  return yuanPerPersonMonth * 12;
}

/** 已发未接受的 offer 不进编制，也不进成本。 */
export function offerIsPending(status: string): boolean {
  return status.includes("未接受");
}

export function offerIsAccepted(status: string): boolean {
  if (offerIsPending(status)) return false;
  return status === "已接受的 offer" || status === "已审批的调动" || status === "已提交的离职" || status === "已确认";
}

/** Agent 变动在上线批准之后才算已确认。 */
export function agentChangeConfirmed(status: string): boolean {
  return status === "上线已批准" || status === "已确认" || status === "已审批";
}
