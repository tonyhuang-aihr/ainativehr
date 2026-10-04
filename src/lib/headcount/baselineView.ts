import { deptStat, type PlanResult } from "@/lib/headcount/engine";
import { formatSignedWan, formatWan } from "@/lib/headcount/money";

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
  yearTotal: string;
  yearOneOff: string;
};

function depthOf(id: string): number {
  if (id === "rd") return 0;
  if (id.startsWith("plat-")) return 2;
  return 1;
}

export function buildBaselineRows(result: PlanResult): BaselineRow[] {
  const byId = new Map(result.departments.map((department) => [department.id, department]));
  return ORDER.filter((id) => byId.has(id)).map((id) => {
    const stat = deptStat(result, id);
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
      yearTotal: formatWan(stat.yearTotalYuan),
      yearOneOff: formatSignedWan(stat.yearOneOffYuan),
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
    yearOneOff: formatSignedWan(stat.yearOneOffYuan),
    yearTotal: formatWan(stat.yearTotalYuan),
    companyBudget: formatWan(result.plan.companyBudget),
    oneOffBudget: result.plan.oneOffBudget == null ? null : formatWan(result.plan.oneOffBudget),
  };
}
