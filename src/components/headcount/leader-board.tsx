"use client";

import type { LeaderView } from "@/lib/headcount/leaderView";
import { useState } from "react";

const SECTIONS = [
  ["quarters", "季度成本"],
  ["moves", "在途变动"],
  ["people", "人员明细"],
  ["agents", "Agent 与外包 / 实习 / 顾问"],
] as const;

export function LeaderBoard({ view }: { view: LeaderView }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const anyOpen = Object.values(open).some(Boolean);
  const origin = view.conclusion.origin === "model" ? "模型" : view.conclusion.origin === "cache" ? "缓存" : "模板";

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {view.scopeLabel} · 截至 {view.asOf}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{view.departmentName}</h1>
        </div>
        <form action="/headcount/leader" method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="dept">部门</label>
          <select id="dept" name="dept" defaultValue={view.departmentId} className="min-h-10 rounded-xl border border-line bg-white px-3" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            {view.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </form>
      </div>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-primarySoft px-2 py-1 text-primary">人 : AI</span>
          <span>结论来自{origin}</span>
        </div>
        <p className="mt-4 text-lg leading-8">{view.conclusion.text}</p>
        <p className="mt-3 text-sm text-muted">不含经济补偿，由 HR 统一管理；Agent 实施、培训等一次性费用也不计入。</p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{view.year} 年日常成本</p>
            <p className="text-4xl font-semibold tracking-tight">{view.annualLabel} 万</p>
          </div>
          <div className="min-w-48 text-sm text-muted">
            <p>部门预算 {view.budgetYuanLabel ? `${view.budgetYuanLabel} 万` : "未设置"}</p>
            <p>{view.deltaLabel ?? "—"}</p>
            <p>{view.ratioLabel ?? ""}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">现在</p>
          <p className="mt-2 text-xl font-semibold">{view.now.currentLabel} 万</p>
          <p className="mt-2 text-sm text-muted">
            在岗 {view.now.people} 人 · Agent {view.now.agents}
          </p>
          <p className="text-sm text-muted">{view.now.quotaLine}</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">接下来会变</p>
          <p className="mt-2 text-xl font-semibold">{view.next.netLabel} 万</p>
          <p className="mt-2 text-sm text-muted">
            加入 {view.next.joins.count} 人 {view.next.joins.label} 万
          </p>
          <p className="text-sm text-muted">
            离开 {view.next.leaves.count} 人 {view.next.leaves.label} 万
          </p>
          <p className="text-sm text-muted">Agent {view.next.agents.label} 万</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">年底预计</p>
          <p className="mt-2 text-xl font-semibold">{view.yearEnd.annualLabel} 万</p>
          <p className="mt-2 text-sm text-muted">
            人员 {view.yearEnd.people} · Agent {view.yearEnd.agents}
          </p>
          <p className="text-sm text-muted">{view.yearEnd.budgetLine}</p>
        </article>
      </section>

      {SECTIONS.map(([key, label]) => (
        <section key={key} className="overflow-hidden rounded-2xl border border-line bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            aria-expanded={Boolean(open[key])}
            onClick={() => setOpen((current) => ({ ...current, [key]: !current[key] }))}
          >
            <span className="font-medium">{label}</span>
            <span className="text-sm text-muted">{open[key] ? "收起" : "展开"}</span>
          </button>
          {open[key] ? <div className="border-t border-line px-4 py-4">{sectionBody(key, view)}</div> : null}
        </section>
      ))}

      <section className="rounded-2xl bg-[#F8F9FD] px-4 py-3 text-sm text-muted">
        <p className="font-medium text-ink">依据可查</p>
        <ul className="mt-2 space-y-1">
          {view.basis.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {anyOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-6 text-sm">
            <span>当前 {view.now.currentLabel} 万</span>
            <span>全年 {view.annualLabel} 万</span>
            <span>{view.deltaLabel ?? "未设置部门预算"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sectionBody(key: (typeof SECTIONS)[number][0], view: LeaderView) {
  if (key === "quarters") {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">{view.quarterSummary}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2">季度</th>
              <th>人工</th>
              <th>Agent</th>
              <th>合计</th>
            </tr>
          </thead>
          <tbody>
            {view.quarters.map((quarter) => (
              <tr key={quarter.label} className="border-t border-line">
                <td className="py-2">{quarter.label}</td>
                <td>{quarter.labor}</td>
                <td>{quarter.agent}</td>
                <td>{quarter.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (key === "moves") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-2">姓名</th>
            <th>岗位</th>
            <th>类型</th>
            <th>当季</th>
            <th>全年</th>
          </tr>
        </thead>
        <tbody>
          {view.movements.map((row) => (
            <tr key={`${row.name}-${row.typeLabel}`} className="border-t border-line">
              <td className="py-2">{row.name}</td>
              <td>
                {row.title} · {row.grade}
              </td>
              <td>{row.typeLabel}</td>
              <td>{row.quarter}</td>
              <td>{row.year}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (key === "people") {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted">{view.peopleSummary}</p>
        {view.groups.map((group) => (
          <div key={group.name}>
            <p className="font-medium">
              {group.name} · 在岗 {group.onBoard} · 在途 {group.incoming} · 全年 {group.year} 万
            </p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2">姓名</th>
                  <th>岗位</th>
                  <th>状态</th>
                  <th>Q1</th>
                  <th>Q2</th>
                  <th>Q3</th>
                  <th>Q4</th>
                  <th>全年</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={`${group.name}-${row.name}-${row.title}`} className="border-t border-line">
                    <td className="py-2">{row.name}</td>
                    <td>
                      {row.title} · {row.grade}
                    </td>
                    <td>{row.status}</td>
                    {row.quarters.map((value, index) => (
                      <td key={index}>{value}</td>
                    ))}
                    <td>{row.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">{view.agentSummary}</p>
      {view.agents.map((agent) => (
        <p key={`${agent.name}-${agent.instances}`}>
          {agent.name} · {agent.agentType} · {agent.instances} 个 · {agent.status} · 全年 {agent.year} 万
        </p>
      ))}
      {view.others.map((other) => (
        <p key={other.type}>
          {other.type} {other.count} 人 · {other.year}
        </p>
      ))}
    </div>
  );
}
