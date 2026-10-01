import type { OrgIssue } from "@/lib/model/types";
import type { OrgMetrics } from "@/lib/org/metrics";
import { formatCny, round1 } from "@/lib/format";

export function answerOffline(question: string, issues: OrgIssue[], metrics: OrgMetrics): string {
  const text = question.trim();
  const lines: string[] = [];
  const related = pickIssues(text, issues);
  if (/成本|算力|单价/.test(text)) {
    lines.push(
      `现在花名册里能算到的年度人力成本是 ${metrics.laborCost == null ? "还没有（表里没有成本列）" : formatCny(metrics.laborCost)}。`,
    );
    lines.push("岗位总成本 = 仍在编的人力成本 + 算力成本。算力按「每个用到 AI 的任务 × 单价 × 12 个月」计，纯人工任务不计费。释放出来的工时会单独显示，不会自动把人减掉。");
  } else if (/人机|任务|拆解/.test(text)) {
    lines.push("人机比是「交给 AI 的工时 : 仍由人做的工时」。人机协同默认各算一半，管理员可以改这个比例。");
    lines.push("要看某个岗位，打开「岗位任务拆解」，选中岗位后生成清单，再逐条改执行方式。基线不会被改，试算写在方案里。");
  } else if (related.length > 0) {
    lines.push("和你问的相关，当前组织里有这些提醒：");
    related.slice(0, 4).forEach((issue, index) => lines.push(`${index + 1}. ${issue.message}`));
  } else if (issues.length > 0) {
    lines.push(
      `现在共 ${metrics.headcount} 人，最深 ${metrics.layers} 层，平均管理幅度 ${round1(metrics.avgSpan)}。我先把最需要看的几条放在这里：`,
    );
    issues.slice(0, 3).forEach((issue, index) => lines.push(`${index + 1}. ${issue.message}`));
  } else {
    lines.push(
      `现在共 ${metrics.headcount} 人，最深 ${metrics.layers} 层，平均管理幅度 ${round1(metrics.avgSpan)}。规则引擎没有发现必须处理的结构问题。`,
    );
  }
  lines.push("我不会直接改架构。你确认之前，任何调整都只是建议，而且可以撤销。");
  lines.push("当前没有配置大模型，这段回答来自规则和模板。");
  return lines.join("\n");
}

function pickIssues(question: string, issues: OrgIssue[]): OrgIssue[] {
  if (/幅度|管理宽度|管得太多|管得太少|单点/.test(question)) {
    return issues.filter((issue) => issue.code === "span_wide" || issue.code === "span_narrow");
  }
  if (/层级|层数|太深/.test(question)) return issues.filter((issue) => issue.code === "layers_deep");
  if (/一人|空部门|空挂/.test(question)) {
    return issues.filter((issue) => issue.code === "single_person_dept" || issue.code === "empty_dept");
  }
  if (/环|上级|汇报/.test(question)) {
    return issues.filter((issue) => issue.code === "reporting_cycle" || issue.code === "missing_manager");
  }
  const named = issues.filter((issue) => question && issue.message.includes(question.replace(/[？?]/g, "").slice(0, 8)));
  return named;
}
