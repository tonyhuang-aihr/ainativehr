import { deptStat, type PlanResult } from "@/lib/headcount/engine";
import { formatWan, roundToHalfWan } from "@/lib/headcount/money";

const ORDER = ["rd", "prod1", "prod2", "qa", "ai", "plat", "plat-direct", "plat-infra", "plat-data", "rd-direct"];

export type BaselineRow = {
  id: string;
  name: string;
  depth: number;
  onBoard: number;
  quota: number;
  inTransit: number;
  occupied: number;
  vacancy: number;
  current: string;
  yearDaily: string;
  budget: string | null;
  budgetKind: "公司总包" | "部门预算" | null;
  dailyGap: string;
  yearOneOff: string;
  /** 只有公司行对照一次性费用预算池。 */
  oneOffNote: string | null;
};

function depthOf(id: string): number {
  if (id === "rd") return 0;
  if (id.startsWith("plat-")) return 2;
  return 1;
}

function gapLabel(actualYuan: number, budgetYuan: number | null): string {
  if (budgetYuan == null) return "未设置";
  const gap = Number((roundToHalfWan(actualYuan) - roundToHalfWan(budgetYuan)).toFixed(1));
  if (gap === 0) return "持平";
  if (gap > 0) return `多 ${gap.toFixed(1)} 万`;
  return `少 ${Math.abs(gap).toFixed(1)} 万`;
}

function oneOffPoolNote(amountYuan: number, poolYuan: number | null): string {
  if (poolYuan == null) return "未设置一次性费用预算池";
  const gap = Number((roundToHalfWan(amountYuan) - roundToHalfWan(poolYuan)).toFixed(1));
  if (gap === 0) return "与预算池持平";
  if (gap > 0) return `超出预算池 ${gap.toFixed(1)} 万`;
  return `低于预算池 ${Math.abs(gap).toFixed(1)} 万`;
}

export function buildBaselineRows(result: PlanResult): BaselineRow[] {
  const byId = new Map(result.departments.map((department) => [department.id, department]));
  return ORDER.filter((id) => byId.has(id)).map((id) => {
    const stat = deptStat(result, id);
    const company = id === "rd";
    const budgetYuan = company ? result.plan.companyBudget : (result.plan.budgets[id] ?? null);
    return {
      id,
      name: stat.name,
      depth: depthOf(id),
      onBoard: stat.onBoard,
      quota: stat.quotaFormal,
      inTransit: stat.inTransit,
      occupied: stat.occupied,
      vacancy: stat.vacancy,
      current: formatWan(stat.currentYuan),
      yearDaily: formatWan(stat.yearDailyYuan),
      budget: budgetYuan == null ? null : formatWan(budgetYuan),
      budgetKind: company ? "公司总包" : budgetYuan == null ? null : "部门预算",
      dailyGap: gapLabel(stat.yearDailyYuan, budgetYuan),
      yearOneOff: formatWan(stat.yearOneOffYuan),
      oneOffNote: company ? oneOffPoolNote(stat.yearOneOffYuan, result.plan.oneOffBudget) : null,
    };
  });
}

export function companyCards(result: PlanResult) {
  const stat = deptStat(result, "rd");
  return {
    name: stat.name,
    onBoard: stat.onBoard,
    quota: stat.quotaFormal,
    inTransit: stat.inTransit,
    occupied: stat.occupied,
    vacancy: stat.vacancy,
    agents: stat.agentInUse,
    agentQuota: stat.quotaAgent,
    current: formatWan(stat.currentYuan),
    yearDaily: formatWan(stat.yearDailyYuan),
    yearOneOff: formatWan(stat.yearOneOffYuan),
    yearTotal: formatWan(stat.yearTotalYuan),
    companyBudget: formatWan(result.plan.companyBudget),
    oneOffBudget: result.plan.oneOffBudget == null ? null : formatWan(result.plan.oneOffBudget),
    dailyGap: gapLabel(stat.yearDailyYuan, result.plan.companyBudget),
    oneOffNote: oneOffPoolNote(stat.yearOneOffYuan, result.plan.oneOffBudget),
  };
}
