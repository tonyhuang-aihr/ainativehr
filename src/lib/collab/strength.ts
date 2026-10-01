/**
 * 协作强度：0.4×消息次数 + 0.4×共同会议次数 + 0.2×OKR 对齐次数。
 * 每一项先在全部配对里归一到 0–100，再按权重相加。
 * 某一项缺失时，用剩余项的原权重重新归一，使权重和为 1。
 * 这里只有分数，没有名次。
 */

export const COLLAB_WEIGHTS = {
  messages: 0.4,
  meetings: 0.4,
  okr: 0.2,
} as const;

export type MetricKey = keyof typeof COLLAB_WEIGHTS;

export type CountTriple = {
  messages: number | null;
  meetings: number | null;
  okr: number | null;
};

export type WeightTriple = Record<MetricKey, number>;

const METRICS: MetricKey[] = ["messages", "meetings", "okr"];

export function normalizeCounts(values: Array<number | null>): Array<number | null> {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (present.length === 0) return values.map(() => null);
  const max = Math.max(...present);
  if (max <= 0) return values.map((value) => (value == null ? null : 0));
  return values.map((value) => (value == null ? null : Math.round((Math.max(0, value) / max) * 100)));
}

export function strengthFromNormalized(norm: CountTriple): {
  score: number | null;
  usedWeights: WeightTriple;
  missing: MetricKey[];
} {
  const missing = METRICS.filter((key) => norm[key] == null);
  const present = METRICS.filter((key) => norm[key] != null);
  const usedWeights: WeightTriple = { messages: 0, meetings: 0, okr: 0 };
  if (present.length === 0) return { score: null, usedWeights, missing };
  const sum = present.reduce((total, key) => total + COLLAB_WEIGHTS[key], 0);
  let raw = 0;
  for (const key of present) {
    usedWeights[key] = COLLAB_WEIGHTS[key] / sum;
    raw += (norm[key] as number) * usedWeights[key];
  }
  return { score: Math.round(raw), usedWeights, missing };
}

export type ResolvedPair = CountTriple & {
  aId: string;
  bId: string;
  aDeptId: string;
  bDeptId: string;
};

export type ScoredPair = ResolvedPair & {
  norm: CountTriple;
  score: number | null;
  usedWeights: WeightTriple;
  missing: MetricKey[];
};

export function scorePairs(pairs: ResolvedPair[]): ScoredPair[] {
  const messages = normalizeCounts(pairs.map((pair) => pair.messages));
  const meetings = normalizeCounts(pairs.map((pair) => pair.meetings));
  const okr = normalizeCounts(pairs.map((pair) => pair.okr));
  return pairs.map((pair, index) => {
    const norm = { messages: messages[index], meetings: meetings[index], okr: okr[index] };
    return { ...pair, norm, ...strengthFromNormalized(norm) };
  });
}

export type DeptLink = {
  aId: string;
  bId: string;
  score: number;
  pairCount: number;
};

/** 画布只用部门对部门。同一部门内的配对不产生连线。 */
export function departmentLinks(pairs: ScoredPair[]): DeptLink[] {
  const buckets = new Map<string, { aId: string; bId: string; scores: number[] }>();
  for (const pair of pairs) {
    if (!pair.aDeptId || !pair.bDeptId || pair.aDeptId === pair.bDeptId || pair.score == null) continue;
    const [aId, bId] = pair.aDeptId < pair.bDeptId ? [pair.aDeptId, pair.bDeptId] : [pair.bDeptId, pair.aDeptId];
    const key = `${aId}|${bId}`;
    const bucket = buckets.get(key) ?? { aId, bId, scores: [] };
    bucket.scores.push(pair.score);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({
      aId: bucket.aId,
      bId: bucket.bId,
      score: Math.round(bucket.scores.reduce((sum, score) => sum + score, 0) / bucket.scores.length),
      pairCount: bucket.scores.length,
    }))
    .sort((a, b) => b.score - a.score || a.aId.localeCompare(b.aId));
}

type DeptParent = { id: string; parentId: string | null };

/** 折叠后的连线收到最近的可见部门。两端收到同一节点时不再画线。 */
export function rollupLinksToVisible(links: DeptLink[], departments: DeptParent[], visible: Set<string>): DeptLink[] {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const visibleAncestor = (id: string): string | null => {
    let cursor = byId.get(id);
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor.id)) {
      if (visible.has(cursor.id)) return cursor.id;
      guard.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return null;
  };
  const buckets = new Map<string, { aId: string; bId: string; scores: number[]; pairCount: number }>();
  for (const link of links) {
    const aId = visibleAncestor(link.aId);
    const bId = visibleAncestor(link.bId);
    if (!aId || !bId || aId === bId) continue;
    const [left, right] = aId < bId ? [aId, bId] : [bId, aId];
    const key = `${left}|${right}`;
    const bucket = buckets.get(key) ?? { aId: left, bId: right, scores: [], pairCount: 0 };
    bucket.scores.push(link.score);
    bucket.pairCount += link.pairCount;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({
      aId: bucket.aId,
      bId: bucket.bId,
      score: Math.round(bucket.scores.reduce((sum, score) => sum + score, 0) / bucket.scores.length),
      pairCount: bucket.pairCount,
    }))
    .sort((a, b) => b.score - a.score || a.aId.localeCompare(b.aId));
}
