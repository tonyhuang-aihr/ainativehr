"use client";

import { Badge } from "@/components/ui";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

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
  badges: { label: string; tone: "bad" | "warn" | "info" }[];
  onToggle: () => void;
};

export function DeptNode({ data }: NodeProps<Node<DeptNodeData, "dept">>) {
  return (
    <div
      className="w-[252px] overflow-hidden rounded-2xl border bg-white text-left shadow-card"
      style={{
        borderColor: data.active ? "#4F46E5" : "#E6E8F0",
        boxShadow: data.active ? "0 0 0 4px #EEF2FF" : undefined,
        opacity: data.dimmed ? 0.38 : 1,
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
  );
}
