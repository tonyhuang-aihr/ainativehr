import type { ColumnMatch } from "@/lib/model/types";
import { FIELD_LABEL } from "@/lib/model/types";

export type StoryItem = {
  title: string;
  detail: string;
  tone: "neutral" | "good" | "warn";
};

export function buildImportStory(input: {
  filename?: string;
  sampleLabel?: string | null;
  sheetName?: string;
  sheetCount?: number;
  mapping?: ColumnMatch[];
  peopleCount?: number;
  departmentCount?: number;
  layers?: number;
  openIssues?: number;
  fixedCount?: number;
  skippedCount?: number;
  skippedRows?: number;
  aiMode: "offline" | "llm";
  phase: "idle" | "map" | "preview";
}): StoryItem[] {
  if (input.phase === "idle") {
    return [
      {
        title: "先认表格",
        detail: "上传、粘贴，或点开一套示例。有多张表时，会选出最像花名册的那一张。",
        tone: "neutral",
      },
      {
        title: "再对列名",
        detail: "姓名、部门、岗位、直属上级会自动对上，哪怕列名叫「汇报人」或 Leader。对完给你看一眼。",
        tone: "neutral",
      },
      {
        title: "然后长成组织树",
        detail: "部门可以是「研发中心/平台部/数据组」，也可以只写末级名称，再靠上下级把树补全。",
        tone: "neutral",
      },
      {
        title: "问题用大白话",
        detail: "缺上级、汇报成环、重名都会列出来，可以一键修，也可以跳过，不会卡死导入。",
        tone: "neutral",
      },
    ];
  }

  const items: StoryItem[] = [];
  const source = input.sampleLabel ? `示例「${input.sampleLabel}」` : input.filename || "这份表格";
  items.push({
    title: input.sampleLabel ? "读入了示例数据" : "读入了表格",
    detail:
      input.sheetCount && input.sheetCount > 1
        ? `${source}里有 ${input.sheetCount} 张表，人员表用的是「${input.sheetName ?? "第一张"}」。`
        : `${source}已读入${input.sheetName ? `，工作表「${input.sheetName}」` : ""}。`,
    tone: "good",
  });

  if (input.mapping && input.mapping.length > 0) {
    const required = input.mapping.filter((match) =>
      ["name", "department", "title", "manager"].includes(match.field),
    );
    const pairs = required.map((match) => `${FIELD_LABEL[match.field]} ← ${match.header}`).join("，");
    items.push({
      title: input.aiMode === "llm" ? "模型对过列名" : "按列名规则对上了字段",
      detail: pairs || "还没有对上必填列。",
      tone: required.length >= 4 ? "good" : "warn",
    });
    if (input.mapping.some((match) => match.field === "performance")) {
      items.push({
        title: "绩效列只存档",
        detail: "表里有绩效，但沙盘不展示个人绩效，也不做排名。",
        tone: "neutral",
      });
    }
    if (!input.mapping.some((match) => match.field === "annualCost")) {
      items.push({
        title: "这张表没有人力成本",
        detail: "没有成本列时，沙盘不估算工资，成本显示为未提供。",
        tone: "neutral",
      });
    }
  }

  if (input.phase === "preview") {
    items.push({
      title: "推出了部门树",
      detail: `共 ${input.peopleCount ?? 0} 人，${input.departmentCount ?? 0} 个部门，最深 ${input.layers ?? 0} 层。确认后会把这份原始数据存成基线。`,
      tone: "good",
    });
    const open = input.openIssues ?? 0;
    if (open === 0 && (input.fixedCount ?? 0) === 0) {
      items.push({
        title: "没有拦住导入的数据问题",
        detail: "缺上级、成环、重名这几类没有发现。管理幅度和层级会在沙盘里继续看。",
        tone: "good",
      });
    } else {
      items.push({
        title: open > 0 ? "还有问题没处理" : "数据问题已处理",
        detail: `修复 ${input.fixedCount ?? 0} 条，跳过 ${input.skippedCount ?? 0} 条，还开着 ${open} 条。跳过也不会挡住进入沙盘。`,
        tone: open > 0 ? "warn" : "good",
      });
    }
    if ((input.skippedRows ?? 0) > 0) {
      items.push({
        title: "有的行没进来",
        detail: `${input.skippedRows} 行因为没有姓名，或状态是离职，没有进入组织树。`,
        tone: "neutral",
      });
    }
  }

  items.push({
    title: input.aiMode === "llm" ? "模型可用" : "现在是离线演示",
    detail:
      input.aiMode === "llm"
        ? "已配置大模型。匹配和拆解会先问模型，失败时自动退回规则。"
        : "没有配置模型密钥。列名、提醒和任务拆解用的是内置规则，结果可预期，也可以撤销。",
    tone: "neutral",
  });
  return items;
}
