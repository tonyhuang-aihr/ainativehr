/**
 * PRD v1.0 第 10 节已拍板的默认值。每一条都收在这里，计算别处只调用函数。
 * 离职成本含最后工作日。示例计算和产品口径一致。
 */

/** 规划年度是自然年，按四个自然季度拆开。 */
export const PLANNING_CYCLE = "calendar-year-quarters" as const;

/**
 * 离职生效日 = 最后工作日，成本算到这一天（含当天）。
 * 转出、转入的生效日仍是区间右端点：当天起算在新部门。
 */
export const DEPARTURE_COUNTS_THROUGH_LAST_WORKING_DAY = true;

/**
 * 折算区间是左闭右开。成本算到最后工作日，右端点就是次日。
 * 转出、转入不走这个函数：生效日当天起算在新部门。
 */
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

/** 新人上手期只留作假设，P0 不改变成本。 */
export const RAMP_UP_AFFECTS_COST = false;

/** 场景里的 N+1 开关做在场景层，默认关。场景页是第二批。 */
export const SCENARIO_NOTICE_PAY_DEFAULT = false;
