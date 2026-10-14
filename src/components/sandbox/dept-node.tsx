"use client";

import { Badge } from "@/components/ui";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type DeptBubble = {
  tone: "red" | "yellow" | "blue";
  kicker: string;
  message: string;
  canSplit: boolean;
  onSplit: () => void;
  onIgnore: () => void;
  onChat: () => void;
};

export type DeptNodeData = {
  name: string;
  head: string;
  headcount: number;
  span: string;
  cost: string;
  accent: string;
  active: boolean;
  dimmed: boolean;
  collapsed: boolean;
  childCount: number;
  dropHover: boolean;
  badges: { label: string; tone: "bad" | "warn" | "info" }[];
  bubble: DeptBubble | null;
  onToggle: () => void;
  onDropPeople: (personIds: string[]) => void;
};

export function DeptNode({ data }: NodeProps<Node<DeptNodeData, "dept">>) {
  return (
    <div
      className="relative w-[252px] text-left"
      style={{ opacity: data.dimmed ? 0.38 : 1 }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-people")) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData("application/x-people");
        if (!raw) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          const ids = JSON.parse(raw) as string[];
          if (Array.isArray(ids) && ids.length > 0) data.onDropPeople(ids);
        } catch {
          /* 拖拽数据损坏时直接忽略 */
        }
      }}
    >
      <div
        className="overflow-hidden rounded-2xl border bg-white shadow-card"
        style={{
          borderColor: data.dropHover ? "#8B5CF6" : data.active ? "#4F46E5" : "#E6E8F0",
          boxShadow: data.dropHover ? "0 0 0 4px #F5F3FF" : data.active ? "0 0 0 4px #EEF2FF" : undefined,
        }}
      >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-[#C7D2FE]" />
      <div className="h-1.5" style={{ background: data.accent }} />
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold leading-5 text-ink">{data.name}</div>
          {data.childCount > 0 && (
            <button
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-primary hover:bg-primarySoft"
              onClick={(event) => {
                event.stopPropagation();
                data.onToggle();
              }}
            >
              {data.collapsed ? `展开 ${data.childCount}` : "收起"}
            </button>
          )}
        </div>
        <div className="mt-1 truncate text-xs text-muted">{data.head}</div>
        <div className="mt-2 flex items-center justify-between text-xs text-[#344054]">
          <span>{data.headcount} 人</span>
          <span>幅度 {data.span}</span>
        </div>
        <div className="mt-1 text-xs text-muted">{data.cost}</div>
        {data.badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.badges.slice(0, 2).map((badge) => (
              <Badge key={badge.label} tone={badge.tone}>
                {badge.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-[#C7D2FE]" />
      </div>
      {data.bubble && (
        <div
          className="nodrag nopan absolute left-[calc(100%+12px)] top-0 z-20 hidden w-[240px] rounded-2xl border bg-white p-3 text-left shadow-card lg:block"
          style={{
            borderColor: data.bubble.tone === "red" ? "#FDA29B" : data.bubble.tone === "yellow" ? "#FCD34D" : "#C7D2FE",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="text-[11px] font-medium text-muted">{data.bubble.kicker}</div>
          <p className="mt-1 text-xs leading-5 text-[#344054]">{data.bubble.message}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.bubble.canSplit && (
              <button className="rounded-lg bg-primary px-2 py-1 text-[11px] text-white" onClick={data.bubble.onSplit}>
                帮我拆分
              </button>
            )}
            <button className="rounded-lg border border-line px-2 py-1 text-[11px]" onClick={data.bubble.onIgnore}>
              忽略
            </button>
            <button className="rounded-lg border border-line px-2 py-1 text-[11px]" onClick={data.bubble.onChat}>
              跟 Agent 聊聊
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
