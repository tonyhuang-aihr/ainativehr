"use client";

import { answerOffline } from "@/lib/ai/offlineChat";
import { chatWithAi } from "@/lib/ai/provider";
import { Badge, Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { formatCny, round1 } from "@/lib/format";
import type { OrgIssue } from "@/lib/model/types";
import type { StructurePlan } from "@/lib/org/mutate";
import type { OrgMetrics } from "@/lib/org/metrics";
import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = ["哪些管理幅度不合适？", "层级是不是太深？", "人机比怎么算？", "成本口径是什么？"];

export function AiPanel({
  issues,
  metrics,
  onLocate,
  onIgnore,
  onSplit,
  plans,
  onPreviewPlan,
  onApplyPlan,
  chatSeed,
  collapsed,
  onToggle,
}: {
  issues: OrgIssue[];
  metrics: OrgMetrics;
  onLocate?: (issue: OrgIssue) => void;
  onIgnore?: (issue: OrgIssue) => void;
  onSplit?: (issue: OrgIssue) => void;
  plans?: StructurePlan[];
  onPreviewPlan?: (plan: StructurePlan) => void;
  onApplyPlan?: (plan: StructurePlan) => void;
  chatSeed?: { id: number; text: string } | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { ai } = useWorkspace();
  const [messages, setMessages] = useState<{ role: "assistant" | "user"; text: string; mode?: "offline" | "llm" }[]>([
    {
      role: "assistant",
      text: "我会看着这张架构提建议，但不会自己改。点提醒可以定位到部门；你也可以直接问幅度、层级、人机比或成本。",
      mode: "offline",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const seenSeed = useRef<number | null>(null);

  useEffect(() => {
    if (!chatSeed || seenSeed.current === chatSeed.id) return;
    seenSeed.current = chatSeed.id;
    void ask(chatSeed.text);
    // 只在新的种子到来时发问。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSeed]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    setInput("");
    setMessages((current) => [...current, { role: "user", text }]);
    setPending(true);
    const context = [
      `人数 ${metrics.headcount}，层级 ${metrics.layers}，平均管理幅度 ${round1(metrics.avgSpan)}。`,
      `人力成本 ${metrics.laborCost == null ? "未提供" : formatCny(metrics.laborCost)}。`,
      `提醒：${issues.slice(0, 6).map((issue) => issue.message).join(" / ") || "无"}`,
    ].join("\n");
    const result = await chatWithAi(text, context, ai.mode, issues, metrics);
    const reply = result.mode === "llm" ? result.text : result.text || answerOffline(text, issues, metrics);
    setMessages((current) => [...current, { role: "assistant", text: reply, mode: result.mode }]);
    setPending(false);
  }

  if (collapsed) {
    return (
      <button className="flex h-full w-12 flex-col items-center justify-center border-l border-line bg-white text-sm text-primary" onClick={onToggle}>
        <span className="[writing-mode:vertical-rl]">AI 助手</span>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-sm font-semibold">AI 助手</div>
          <div className="text-xs text-muted">{ai.mode === "llm" ? "已连接模型，失败时退回规则" : "离线演示 · 规则引擎"}</div>
        </div>
        <button className="text-sm text-muted" onClick={onToggle}>
          收起
        </button>
      </div>
      <div className="border-b border-line px-4 py-3">
        <div className="mb-2 text-xs font-medium text-muted">主动提醒</div>
        {issues.length === 0 && <p className="text-sm text-muted">目前没有要处理的结构问题。</p>}
        <div className="max-h-64 space-y-2 overflow-auto">
          {issues.slice(0, 6).map((issue) => (
            <div key={issue.id} className="rounded-xl border border-line p-2.5">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone={issue.severity === "red" ? "bad" : issue.severity === "yellow" ? "warn" : "info"}>
                  {issue.severity === "red" ? "必须处理" : issue.severity === "yellow" ? "风险" : "建议"}
                </Badge>
                <span className="text-xs font-medium">{issue.title}</span>
              </div>
              <p className="text-xs leading-5 text-[#344054]">{issue.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {onLocate && (
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onLocate(issue)}>
                    定位
                  </Button>
                )}
                {onSplit && issue.code === "span_wide" && (
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onSplit(issue)}>
                    帮我拆分
                  </Button>
                )}
                {onIgnore && (
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onIgnore(issue)}>
                    忽略
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {plans && plans.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-muted">拆分预览 · 确认后才写入</div>
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-xl border border-line p-2.5">
                <div className="text-xs font-medium">{plan.title}</div>
                <p className="mt-1 text-xs leading-5 text-muted">{plan.detail}</p>
                <div className="mt-2 flex gap-2">
                  {onPreviewPlan && (
                    <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onPreviewPlan(plan)}>
                      预览到画布
                    </Button>
                  )}
                  {onApplyPlan && (
                    <Button className="px-2 py-1 text-xs" onClick={() => onApplyPlan(plan)}>
                      应用
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-auto px-4 py-3">
        {messages.map((message, index) => (
          <div key={index} className={cx("text-sm leading-6", message.role === "user" ? "text-right" : "")}>
            <div
              className={cx(
                "inline-block max-w-full whitespace-pre-wrap rounded-2xl px-3 py-2 text-left",
                message.role === "user" ? "bg-primary text-white" : "bg-[#F4F5FB] text-ink",
              )}
            >
              {message.text}
            </div>
            {message.role === "assistant" && message.mode && (
              <div className="mt-1 text-[11px] text-muted">{message.mode === "llm" ? "来自模型" : "来自离线规则"}</div>
            )}
          </div>
        ))}
        {pending && <div className="text-xs text-muted">正在组织回答…</div>}
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((item) => (
            <button key={item} className="rounded-full bg-primarySoft px-2 py-1 text-[11px] text-primary" onClick={() => ask(item)}>
              {item}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="问问这个组织"
            className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" disabled={pending}>
            发送
          </Button>
        </form>
      </div>
    </aside>
  );
}
