"use client";

import type { CollaboratorCard } from "@/lib/collab/view";
import type { PersonGoal, PersonOkr } from "@/lib/model/types";
import { useState } from "react";

export function LeaderCard({
  sample,
  title,
  name,
  department,
  okr,
  goals,
  collaborators,
  updatedAt,
  windowDays,
  locked,
}: {
  sample: boolean;
  title: string;
  name: string;
  department: string;
  okr: PersonOkr | null;
  goals: PersonGoal[];
  collaborators: CollaboratorCard[];
  updatedAt: string;
  windowDays: number;
  locked: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (locked) {
    return (
      <section className="rounded-2xl border border-line bg-white p-3 shadow-card">
        <div className="text-sm font-semibold">负责人卡片</div>
        <p className="mt-2 text-xs leading-5 text-muted">仅授权角色可见。当前身份只能看部门之间的协作线，不能看个人协作次数。</p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-line bg-white p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] text-muted">{department}</div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted">{name}</div>
        </div>
        {sample && <span className="rounded-full bg-primarySoft px-2 py-0.5 text-[11px] font-medium text-primary">示例数据</span>}
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium text-muted">目标</div>
        {okr ? (
          <div className="mt-1">
            <p className="text-sm leading-5 text-ink">{okr.objective}</p>
            {okr.alignedTo && <p className="mt-1 text-[11px] text-muted">对齐上级：{okr.alignedTo}</p>}
            <ul className="mt-2 space-y-1.5">
              {okr.keyResults.map((item) => (
                <li key={item.title}>
                  <div className="flex justify-between text-[11px] text-[#344054]">
                    <span className="truncate pr-2">{item.title}</span>
                    <span>{item.progress == null ? "—" : `${item.progress}%`}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[#EEF2FF]">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${item.progress ?? 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {okr.unalignedDepartments.length > 0 && (
              <p className="mt-2 text-[11px] leading-5 text-[#B54708]">未与协作方 {okr.unalignedDepartments.join("、")} 对齐</p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">还没有这个负责人的目标。</p>
        )}
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium text-muted">绩效目标权重</div>
        <p className="text-[11px] text-muted">只展示权重，不展示绩效评级。</p>
        {goals.length === 0 ? (
          <p className="mt-1 text-xs text-muted">尚未提供。</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {goals.map((goal) => (
              <li key={goal.name} className="flex justify-between text-xs">
                <span>{goal.name}</span>
                <span className="text-muted">{goal.weight}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3">
        <div className="text-xs font-medium text-muted">协作对象</div>
        <p className="text-[11px] leading-5 text-muted">按协作强度查看，不是个人排名，也没有名次。</p>
        {collaborators.length === 0 && <p className="mt-1 text-xs text-muted">近 {windowDays} 天没有可计算的协作次数。</p>}
        <ul className="mt-1 space-y-1">
          {collaborators.map((item) => (
            <li key={item.personId} className="rounded-xl bg-[#F8F9FD]">
              <button className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left" onClick={() => setOpenId((current) => (current === item.personId ? null : item.personId))}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-ink">
                    {item.name}
                    <span className="font-normal text-muted"> · {item.departmentName}</span>
                  </span>
                  <span className="text-[11px] text-muted">
                    {item.title} · {item.relation}
                  </span>
                </span>
                <span className="text-sm font-semibold text-[#6D28D9]">{item.score ?? "—"}</span>
              </button>
              {openId === item.personId && (
                <div className="space-y-0.5 px-2 pb-2 text-[11px] leading-5 text-[#344054]">
                  <CountLine label="消息" count={item.counts.messages} norm={item.norm.messages} missing={item.missing.includes("messages")} />
                  <CountLine label="会议" count={item.counts.meetings} norm={item.norm.meetings} missing={item.missing.includes("meetings")} />
                  <CountLine label="OKR 对齐" count={item.counts.okr} norm={item.norm.okr} missing={item.missing.includes("okr")} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted">
        强度 = 0.4×消息次数 + 0.4×共同会议次数 + 0.2×OKR 对齐次数，各项先归一到 0–100。缺一项就用剩下的权重重新归一。只统计次数，不含消息或会议内容。近 {windowDays} 天
        {updatedAt ? ` · 更新于 ${updatedAt}` : ""}。仅授权角色可见。
      </p>
    </section>
  );
}

function CountLine({ label, count, norm, missing }: { label: string; count: number | null; norm: number | null; missing: boolean }) {
  if (missing || count == null) return <div>{label}：本项数据未提供</div>;
  return (
    <div>
      {label} {count} 次 · 归一 {norm ?? "—"}
    </div>
  );
}
