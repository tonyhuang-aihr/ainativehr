"use client";

import { answerOffline } from "@/lib/ai/offlineChat";
import { chatWithAi } from "@/lib/ai/provider";
import { useNarrow } from "@/components/use-narrow";
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
  mobileChrome = "bar",
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
  /** 沙盘自己有底栏时传 none，避免再叠一条。岗位页用默认的 bar。 */
  mobileChrome?: "bar" | "none";
}) {
  const { ai } = useWorkspace();
  const narrow = useNarrow();
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

  if (collapsed && narrow && mobileChrome === "none") return null;

  if (collapsed && narrow) {
    return (
      <button
        type="button"
        className="fixed inset-x-0 bottom-0 z-40 flex h-12 items-center justify-between border-t border-line bg-white px-4 text-sm font-medium text-primary"
        onClick={onToggle}
      >
        <span>提醒 {issues.length}</span>
        <span>打开 AI 助手</span>
      </button>
    );
  }

  if (collapsed) {
    return (
      <button type="button" className="flex h-full w-12 flex-col items-center justify-center border-l border-line bg-white text-sm text-primary" onClick={onToggle}>
        <span className="[writing-mode:vertical-rl]">AI 助手</span>
      </button>
    );
  }

  const sheet = narrow;

  return (
    <>
      {sheet && <button type="button" className="fixed inset-0 z-40 bg-[#101828]/30 lg:hidden" aria-label="关闭 AI 助手" onClick={onToggle} />}
      <aside
        className={cx(
          "flex flex-col bg-white",
          sheet
            ? cx(
                "fixed inset-x-0 z-50 max-h-[52vh] overflow-hidden rounded-t-2xl border-t border-line shadow-card",
                mobileChrome === "none" ? "bottom-12" : "bottom-0",
              )
            : "h-full w-[360px] shrink-0 border-l border-line max-lg:hidden",
        )}
      >
      {sheet && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#E6E8F0]" aria-hidden />}
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <div>
          <div className="text-sm font-semibold">AI 助手</div>
          <div className="text-xs text-muted">{ai.mode === "llm" ? "已连接模型，失败时退回规则" : "离线演示 · 规则引擎"}</div>
        </div>
        <button type="button" className="inline-flex min-h-10 items-center px-2 text-sm text-muted" onClick={onToggle}>
          收起
        </button>
      </div>
      <div className="border-b border-line px-4 py-3">
        <div className="mb-2 text-xs font-medium text-muted">主动提醒</div>
        {issues.length === 0 && <p className="text-sm text-muted">目前没有要处理的结构问题。</p>}
        <div className={cx("space-y-2 overflow-auto", sheet ? "max-h-40" : "max-h-72")}>
          {[...issues]
            .sort((a, b) => Number(b.code === "span_wide") - Number(a.code === "span_wide"))
            .slice(0, 6)
            .map((issue) => (
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
                  <Button variant="secondary" onClick={() => onLocate(issue)}>
                    定位
                  </Button>
                )}
                {onSplit && issue.code === "span_wide" && (
                  <Button variant="secondary" onClick={() => onSplit(issue)}>
                    帮我拆分
                  </Button>
                )}
                {onIgnore && (
                  <Button variant="ghost" onClick={() => onIgnore(issue)}>
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
                    <Button variant="secondary" onClick={() => onPreviewPlan(plan)}>
                      预览到画布
                    </Button>
                  )}
                  {onApplyPlan && (
                    <Button onClick={() => onApplyPlan(plan)}>
                      应用
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
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
            <button key={item} type="button" className="inline-flex min-h-10 items-center rounded-full bg-primarySoft px-3 text-xs text-primary" onClick={() => ask(item)}>
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
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" disabled={pending}>
            发送
          </Button>
        </form>
      </div>
    </aside>
    </>
  );
}
