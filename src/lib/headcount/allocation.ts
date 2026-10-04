/** 最大余额法。余数用整数分子比较，不转成小数。 */

export type RemainderShare = {
  id: string;
  /** 年初在岗正式员工，分配权重。 */
  base: number;
};

/**
 * 把已经取整的总人数分到各部门。
 * 先给整数部分，剩下的名额按余数从大到小。
 * 余数相同给年初人数更多的部门；人数也相同，则按传入顺序（组织架构顺序）靠前的部门。
 */
export function allocateLargestRemainder(total: number, shares: readonly RemainderShare[]): Map<string, number> {
  if (!Number.isInteger(total) || total < 0) throw new Error("分配人数必须是非负整数");
  const weight = shares.reduce((sum, share) => sum + share.base, 0);
  if (weight <= 0 || total === 0 || shares.length === 0) return new Map(shares.map((share) => [share.id, 0]));
  const floors = shares.map((share) => Math.floor((total * share.base) / weight));
  const numerators = shares.map((share) => (total * share.base) % weight);
  let leftover = total - floors.reduce((sum, value) => sum + value, 0);
  const order = shares
    .map((share, index) => ({ index, numerator: numerators[index] ?? 0, base: share.base }))
    .sort((left, right) => right.numerator - left.numerator || right.base - left.base || left.index - right.index);
  const counts = [...floors];
  for (const pick of order) {
    if (leftover <= 0) break;
    counts[pick.index] = (counts[pick.index] ?? 0) + 1;
    leftover -= 1;
  }
  return new Map(shares.map((share, index) => [share.id, counts[index] ?? 0]));
}

/** 余数分子。分母是权重之和，两边相同，所以分子相等就是分数相等。 */
export function remainderNumerator(total: number, base: number, weight: number): number {
  if (weight <= 0) return 0;
  return (total * base) % weight;
}
