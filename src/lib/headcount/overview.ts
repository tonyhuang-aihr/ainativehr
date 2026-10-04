import { conclusionFacts, templateConclusion } from "@/lib/headcount/conclusion";
import { deptStat, subtreeIds, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan, roundToHalfWan, roundingGapNote, roundingGapWan, yearBand } from "@/lib/headcount/money";
import { DEMO_AI_RATIO } from "@/lib/headcount/sample";

const SMALL = 5;

export type AlertSeverity = "高" | "中" | "低";

export type AlertItem = {
  severity: AlertSeverity;
  kind: "超预算" | "超编" | "空缺偏多" | "在途集中";
  title: string;
  detail: string;
  departmentId: string;
};

export type OverviewDepartment = {
  id: string;
  name: string;
  owner: string | null;
  quota: number;
  onBoard: number;
  inTransit: number;
  vacancy: number;
  agents: string;
  annual: string;
  budget: string | null;
  gap: string;
  usage: number | null;
  status: string;
  href: string;
};

export type OverviewCard = { label: string; value: string; sub: string; roundingNote?: string | null; extra?: string | null };

export type ConclusionOrigin = "template" | "model" | "cache";

export function conclusionSourceLabel(origin: ConclusionOrigin): string {
  if (origin === "model") return "结论来自模型";
  if (origin === "cache") return "结论来自缓存";
  return "结论来自模板";
}

export type ScopeOverview = {
  audience: "od" | "leader";
  title: string;
  eyebrow: string;
  asOf: string;
  year: number;
  conclusion: string;
  conclusionOrigin: ConclusionOrigin;
  note: string;
  rangeNote: string | null;
  cards: OverviewCard[];
  alerts: AlertItem[];
  departments: OverviewDepartment[];
  footer: string | null;
  total: { label: string; annual: string; budget: string; gap: string; roundingNote: string | null } | null;
  oneOff: { amount: string; budget: string; gap: string } | null;
};

type DeptLike = { id: string; name: string; parentId: string | null };

export function scopeRoots(departments: DeptLike[], visibleIds: string[]): string[] {
  const visible = new Set(visibleIds);
  return departments.filter((department) => visible.has(department.id) && (!department.parentId || !visible.has(department.parentId))).map((department) => department.id);
}

export function scopeHasSmallGroup(result: PlanResult, scopeIds: string[]): boolean {
  return scopeIds.some((id) => {
    const stat = deptStat(result, id);
    return stat.occupied > 0 && stat.occupied < SMALL;
  });
}

/** 范围合计页保持精确。从总览点进的小组页才改成区间。 */
export function maskPageCosts(result: PlanResult, scopeIds: string[], pageId: string): boolean {
  if (!scopeHasSmallGroup(result, scopeIds)) return false;
  const roots = scopeRoots(result.plan.departments, scopeIds);
  return !(roots.length === 1 && roots[0] === pageId);
}

export function pageKind(departmentId: string, departments: DeptLike[], visibleIds: string[]): "overview" | "detail" {
  const visible = new Set(visibleIds);
  const children = departments.filter((department) => department.parentId === departmentId && visible.has(department.id));
  return children.length > 0 ? "overview" : "detail";
}

/** 公司四个季度含一次性，各自取整。和全年合计取整可能差 0.5 万。 */
export function companyQuarterRollup(stat: ReturnType<typeof deptStat>): { wan: number[]; label: string; note: string | null } {
  const wan = [0, 1, 2, 3].map((index) =>
    roundToHalfWan(stat.quarterFormal[index] + stat.quarterOther[index] + stat.quarterAgent[index] + stat.quarterSeverance[index] + stat.quarterAgentOneOff[index]),
  );
  const total = roundToHalfWan(stat.yearTotalYuan);
  return {
    wan,
    label: wan.map((value, index) => `Q${index + 1} ${formatWan(value * 10_000)}`).join(" · ") + " 万 · 含一次性",
    note: roundingGapNote(roundingGapWan(total, wan)),
  };
}

function gapWan(actualYuan: number, budgetYuan: number): number {
  return Number((roundToHalfWan(actualYuan) - roundToHalfWan(budgetYuan)).toFixed(1));
}

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function movementsOf(result: PlanResult, departmentId: string) {
  const ids = subtreeIds(result.plan, departmentId);
  const rows = result.movements.filter((movement) => ids.has(movement.departmentId));
  const year = String(result.plan.year);
  const q1 = rows.filter((movement) => movement.effectiveDate >= `${year}-01-01` && movement.effectiveDate < `${year}-04-01`).length;
  return { total: rows.length, q1 };
}

function ownerOf(result: PlanResult, departmentId: string): string | null {
  const person = result.plan.people.find((item) => item.departmentId === departmentId && item.isManager);
  return person?.name ?? null;
}

function severityRank(severity: AlertSeverity): number {
  if (severity === "高") return 0;
  if (severity === "中") return 1;
  return 2;
}

const KIND_RANK = { 超预算: 0, 超编: 1, 空缺偏多: 2, 在途集中: 3 };

export function collectAlerts(result: PlanResult, rootId: string, mode: "company" | "leader"): AlertItem[] {
  const alerts: AlertItem[] = [];
  const children = result.plan.departments.filter((department) => department.parentId === rootId);
  const consider = mode === "company" ? children : [result.plan.departments.find((department) => department.id === rootId)].filter((department) => department != null);

  for (const department of consider) {
    if (!department) continue;
    const stat = deptStat(result, department.id);
    const budget = result.plan.budgets[department.id];
    if (budget != null) {
      const gap = gapWan(stat.yearDailyYuan, budget);
      if (gap > 0) {
        const budgetWan = roundToHalfWan(budget);
        const ratio = gap / budgetWan;
        alerts.push({
          severity: ratio >= 0.02 ? "高" : "中",
          kind: "超预算",
          title: mode === "leader" ? `${department.name}（整体）` : department.name,
          detail: `全年预计 ${formatWan(stat.yearDailyYuan)} 万，超部门预算 ${gap.toFixed(1)} 万（${pct(gap, budgetWan)}）`,
          departmentId: department.id,
        });
      }
    }
    if (mode === "company") pushHeadcountAlerts(result, department.id, department.name, alerts, true);
  }

  const groups = mode === "leader" ? children : children.flatMap((department) => result.plan.departments.filter((child) => child.parentId === department.id));
  for (const group of groups) {
    const parent = result.plan.departments.find((department) => department.id === group.parentId);
    const title = mode === "company" && parent ? `${parent.name} / ${group.name}` : group.name;
    if (mode === "company") {
      const stat = deptStat(result, group.id);
      if (stat.vacancy < 0) {
        alerts.push({
          severity: "中",
          kind: "超编",
          title,
          detail: headcountDetail(stat, "超编"),
          departmentId: group.id,
        });
      }
    } else {
      pushHeadcountAlerts(result, group.id, title, alerts, false);
    }
  }

  return alerts.sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || KIND_RANK[left.kind] - KIND_RANK[right.kind]);
}

function headcountDetail(stat: ReturnType<typeof deptStat>, kind: "超编" | "空缺偏多" | "在途集中", moves?: { total: number; q1: number }): string {
  if (kind === "超编") return `编制 ${stat.quotaFormal}，在岗 ${stat.onBoard} + 在途 ${stat.inTransit} = ${stat.occupied}，超编 ${Math.abs(stat.vacancy)} 人`;
  if (kind === "空缺偏多") return `空缺 ${stat.vacancy} 个，占编制 ${stat.quotaFormal} 的 ${pct(stat.vacancy, stat.quotaFormal)}`;
  return `在途 ${moves?.total ?? 0} 笔，相当于在岗 ${stat.onBoard} 人的 ${pct(moves?.total ?? 0, stat.onBoard)}，其中 ${moves?.q1 ?? 0} 笔在 Q1 生效`;
}

function pushHeadcountAlerts(result: PlanResult, departmentId: string, title: string, alerts: AlertItem[], includeBudgetSiblings: boolean) {
  const stat = deptStat(result, departmentId);
  const moves = movementsOf(result, departmentId);
  if (stat.vacancy < 0) {
    alerts.push({ severity: "中", kind: "超编", title, detail: headcountDetail(stat, "超编"), departmentId });
  }
  if (stat.quotaFormal > 0 && stat.vacancy / stat.quotaFormal >= 0.05) {
    alerts.push({ severity: "低", kind: "空缺偏多", title, detail: headcountDetail(stat, "空缺偏多"), departmentId });
  }
  if (stat.onBoard > 0 && moves.total / stat.onBoard >= 0.1) {
    alerts.push({ severity: "低", kind: "在途集中", title, detail: headcountDetail(stat, "在途集中", moves), departmentId });
  }
  void includeBudgetSiblings;
}

function statusFor(result: PlanResult, departmentId: string, alerts: AlertItem[]): string {
  const own = alerts.filter((alert) => alert.departmentId === departmentId || alert.title.includes(deptStat(result, departmentId).name));
  const parts: string[] = [];
  if (own.some((alert) => alert.kind === "超预算")) parts.push("超预算");
  const childOver = alerts.some((alert) => alert.kind === "超编" && alert.departmentId !== departmentId && result.plan.departments.find((department) => department.id === alert.departmentId)?.parentId === departmentId);
  if (childOver) parts.push("子部门超编");
  if (own.some((alert) => alert.kind === "超编" && alert.departmentId === departmentId)) parts.push("超编");
  if (own.some((alert) => alert.kind === "空缺偏多")) parts.push("空缺偏多");
  if (own.some((alert) => alert.kind === "在途集中" && alert.departmentId === departmentId)) parts.push("在途集中");
  return parts.length ? parts.join(" · ") : "正常";
}

export function buildScopeOverview(result: PlanResult, rootId: string, audience: "od" | "leader", ranges: boolean): ScopeOverview {
  const stat = deptStat(result, rootId);
  const mode = audience === "od" && rootId === "rd" ? "company" : "leader";
  const alerts = collectAlerts(result, rootId, mode);
  const children = result.plan.departments.filter((department) => department.parentId === rootId);
  const rows = children
    .map((department) => {
      const child = deptStat(result, department.id);
      const budget = result.plan.budgets[department.id] ?? null;
      const gap = budget == null ? null : gapWan(child.yearDailyYuan, budget);
      const annual = ranges ? yearBand(child.yearDailyYuan) : formatWan(child.yearDailyYuan);
      return {
        id: department.id,
        name: department.name,
        owner: ownerOf(result, department.id),
        quota: child.quotaFormal,
        onBoard: child.onBoard,
        inTransit: child.inTransit,
        vacancy: child.vacancy,
        agents: `${child.agentInUse} / ${child.quotaAgent}`,
        annual,
        budget: budget == null ? null : formatWan(budget),
        gap: gap == null ? "未设置" : formatSignedWan(gap * 10_000),
        usage: budget ? Math.round((roundToHalfWan(child.yearDailyYuan) / roundToHalfWan(budget)) * 1000) / 10 : null,
        status: statusFor(result, department.id, alerts),
        href: audience === "od" ? `/headcount/baseline/${department.id}` : `/headcount/leader?dept=${department.id}`,
        sortGap: gap ?? -999,
        sortAnnual: child.yearDailyYuan,
      };
    })
    .sort((left, right) => (mode === "company" ? right.sortGap - left.sortGap : right.sortAnnual - left.sortAnnual));

  const yearDaily = formatWan(stat.yearDailyYuan);
  const yearTotal = formatWan(stat.yearTotalYuan);
  const company = mode === "company";
  const budgetYuan = company ? result.plan.companyBudget : (result.plan.budgets[rootId] ?? null);
  const compared = company ? stat.yearTotalYuan : stat.yearDailyYuan;
  const gap = budgetYuan == null ? null : gapWan(compared, budgetYuan);
  const ratio = budgetYuan ? pct(roundToHalfWan(compared), roundToHalfWan(budgetYuan)) : null;
  const ai = DEMO_AI_RATIO[rootId] ?? "未拆解";
  const small = result.plan.departments.filter((department) => {
    const item = deptStat(result, department.id);
    return item.occupied > 0 && item.occupied < SMALL && (department.id === rootId || department.parentId === rootId || children.some((child) => child.id === department.parentId || child.id === department.id));
  });
  const rangeNote = ranges ? `各组成本为区间（${small.map((department) => department.name).join("、") || "有小组"}不足 5 人），合计精确` : null;
  const oneOffBudget = result.plan.oneOffBudget;
  const oneOffGap = oneOffBudget == null ? null : gapWan(stat.yearOneOffYuan, oneOffBudget);

  const cards: OverviewCard[] = [
    {
      label: "编制与人员",
      value: `${stat.quotaFormal}`,
      sub: `在岗 ${stat.onBoard} · 在途 ${stat.inTransit} · 空缺 ${stat.vacancy}`,
    },
    {
      label: "Agent",
      value: `${stat.agentInUse} / ${stat.quotaAgent}`,
      sub: "在用 / 编制",
    },
    {
      label: company ? "全年预计 vs 预算总包" : "全年预计 vs 部门预算",
      value: company ? yearTotal : yearDaily,
      sub: budgetYuan == null ? "未设置预算" : `${gap != null && gap > 0 ? "超" : "结余"} ${Math.abs(gap ?? 0).toFixed(1)} 万 · ${ratio}`,
    },
    { label: "人 : AI 按工时", value: ai, sub: ai === "未拆解" ? "沙盘尚未拆解" : "来自沙盘拆解" },
  ];
  if (company) {
    cards.push({
      label: "一次性 vs 预留",
      value: formatWan(stat.yearOneOffYuan),
      sub: oneOffBudget == null ? "未设置预留" : `预留 ${formatWan(oneOffBudget)} 万`,
    });
  } else {
    const moves = movementsOf(result, rootId);
    cards.push({
      label: "在途变动",
      value: `${moves.total} 笔`,
      sub: `全年 ${formatSignedWan(stat.inFlightYearDaily)} 万`,
    });
  }

  const facts = conclusionFacts(result, rootId);
  const conclusion = company ? companySentence(result, alerts) : templateConclusion(facts);
  const quarterRollup = company ? companyQuarterRollup(stat) : null;
  if (quarterRollup) {
    const yearCard = cards.find((card) => card.label.startsWith("全年"));
    if (yearCard) {
      yearCard.roundingNote = quarterRollup.note;
      yearCard.extra = quarterRollup.label;
    }
  }

  return {
    audience,
    title: audience === "od" ? `OD 底座 · ${stat.name}` : stat.name,
    eyebrow: audience === "od" ? `${children.length} 个部门 · 数据截至 ${result.plan.asOf}` : `${children.length} 个部门 · 截至 ${result.plan.asOf}`,
    asOf: result.plan.asOf,
    year: result.plan.year,
    conclusion,
    conclusionOrigin: "template",
    note: "不含一次性费用（经济补偿、Agent 实施 / 培训），由 HR 和 OD 统一管理，不摊到部门",
    rangeNote,
    cards,
    alerts,
    departments: rows.map((row) => ({
      id: row.id,
      name: row.name,
      owner: row.owner,
      quota: row.quota,
      onBoard: row.onBoard,
      inTransit: row.inTransit,
      vacancy: row.vacancy,
      agents: row.agents,
      annual: row.annual,
      budget: row.budget,
      gap: row.gap,
      usage: row.usage,
      status: row.status,
      href: row.href,
    })),
    footer: ranges ? "不足 5 人的组只显示区间。范围内有这样的组时，各组成本都是区间，合计精确。" : "示例数据",
    total: company
      ? {
          label: "研发中心合计",
          annual: yearTotal,
          budget: formatWan(result.plan.companyBudget),
          gap: formatSignedWan(gapWan(stat.yearTotalYuan, result.plan.companyBudget) * 10_000),
          roundingNote: quarterRollup?.note ?? null,
        }
      : {
          label: `${stat.name}合计`,
          annual: yearDaily,
          budget: budgetYuan == null ? "未设置" : formatWan(budgetYuan),
          gap: gap == null ? "未设置" : formatSignedWan(gap * 10_000),
          roundingNote: null,
        },
    oneOff:
      company && oneOffBudget != null
        ? {
            amount: formatWan(stat.yearOneOffYuan),
            budget: formatWan(oneOffBudget),
            gap: formatSignedWan((oneOffGap ?? 0) * 10_000),
          }
        : null,
  };
}

function companySentence(result: PlanResult, alerts: AlertItem[]): string {
  const stat = deptStat(result, "rd");
  const gap = gapWan(stat.yearTotalYuan, result.plan.companyBudget);
  const overs = alerts.filter((alert) => alert.kind === "超预算");
  const overText = overs
    .map((alert) => {
      const budget = result.plan.budgets[alert.departmentId];
      const child = deptStat(result, alert.departmentId);
      const itemGap = budget == null ? 0 : gapWan(child.yearDailyYuan, budget);
      return `${alert.title}（超 ${itemGap.toFixed(1)} 万）`;
    })
    .join("和");
  const overstaff = alerts.find((alert) => alert.kind === "超编");
  const vacancy = alerts.find((alert) => alert.kind === "空缺偏多");
  const staff = overstaff ? `${overstaff.title}超编 ${Math.abs(deptStat(result, overstaff.departmentId).vacancy)} 人` : "";
  const empty = vacancy ? `${vacancy.title}空缺 ${deptStat(result, vacancy.departmentId).vacancy} 个` : "";
  const extra = [staff, empty].filter(Boolean).join("，");
  const direction = gap > 0 ? `超预算总包 ${gap.toFixed(1)} 万` : `低于预算总包 ${Math.abs(gap).toFixed(1)} 万`;
  return `${stat.name}预计${direction}，主要在${overText || "各部门"}。${extra ? `${extra}。` : ""}`.replace("。。", "。");
}
