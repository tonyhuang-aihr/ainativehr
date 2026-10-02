"use client";

import { Badge, cx } from "@/components/ui";
import { countExecuted, visibleDecisions } from "@/lib/decisions/trail";
import type { DecisionRecord, Department, Person } from "@/lib/model/types";
import { peopleInDepartment } from "@/lib/org/metrics";
import { departmentRoster } from "@/lib/roster/membership";
import { levelLabel, reportingLevel, sortRoster } from "@/lib/roster/order";
import Link from "next/link";
import { useState } from "react";

const ORIGIN: Record<string, string> = { ai: "AI预填", user: "用户改写" };
const FIELD_LABEL: Record<DecisionRecord["fields"][number]["key"], string> = {
  background: "背景",
  intent: "意图",
  expectedEffect: "预期效果",
  reviewDate: "复盘时间",
};

export function DeptPanel({
  department,
  departments,
  currentPeople,
  baselinePeople,
  decisions,
  seePay,
  onClose,
  onShowLeader,
}: {
  department: Department;
  departments: Department[];
  currentPeople: Person[];
  baselinePeople: Person[];
  decisions: DecisionRecord[];
  seePay: boolean;
  onClose: () => void;
  onShowLeader: () => void;
}) {
  const [tab, setTab] = useState<"roster" | "trail">("roster");
  const [deep, setDeep] = useState(true);
  const roster = departmentRoster(baselinePeople, currentPeople, department.path, deep);
  const preview = sortRoster(roster.current).slice(0, 10);
  const children = departments.filter((item) => item.parentId === department.id);
  const direct = currentPeople.filter((person) => person.departmentPath.join("/") === department.path.join("/"));
  const head = currentPeople.find((person) => person.id === department.headId);
  const directOthers = direct.filter((person) => person.id !== department.headId).length;
  const subtree = peopleInDepartment(currentPeople, department.path).length;
  const mine = visibleDecisions(decisions.filter((item) => item.departmentId === department.id));
  const executed = mine.filter((item) => item.status === "executed");
  const rejected = mine.filter((item) => item.status === "rejected");
  const pending = mine.filter((item) => item.status === "pending");
  const executedCount = countExecuted(decisions, department.id);
  const level = department.path.length;

  return (
    <div data-testid="dept-panel" className="rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-start gap-2 border-b border-line px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{department.name}</div>
          <div className="mt-0.5 text-[11px] text-muted">部门面板 · {department.path.join(" / ")} · {department.id}</div>
        </div>
        <button type="button" className="inline-flex min-h-10 items-center px-2 text-xs font-medium text-primary" onClick={onClose}>
          返回
        </button>
      </div>
      <div className="flex gap-1 border-b border-line px-2 py-1">
        {(
          [
            ["roster", "概况与花名册"],
            ["trail", `决策轨迹（${executedCount}）`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cx("min-h-10 flex-1 rounded-lg px-2 text-xs font-medium", tab === id ? "bg-primarySoft text-primary" : "text-muted")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "roster" ? (
        <div className="space-y-3 p-3">
          <section>
            <div className="text-xs font-semibold">部门概况</div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">人数（含下级）</dt>
                <dd className="font-semibold">{subtree} 人</dd>
              </div>
              <div>
                <dt className="text-muted">层级</dt>
                <dd className="font-semibold">第 {level} 级</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted">负责人</dt>
                <dd>
                  <button type="button" className="inline-flex min-h-10 items-center font-semibold text-primary" onClick={onShowLeader}>
                    {head ? `${head.name} · ${head.title}` : "未指定"}
                  </button>
                </dd>
              </div>
            </dl>
            {children.length > 0 && (
              <div className="mt-2 border-t border-dashed border-line pt-2">
                <div className="text-[11px] text-muted">下级部门 · {children.length}</div>
                <ul className="mt-1 space-y-1">
                  {children.map((child) => (
                    <li key={child.id} className="flex items-center justify-between text-xs">
                      <span>{child.name}</span>
                      <span className="font-semibold">{peopleInDepartment(currentPeople, child.path).length} 人</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-muted">
                  负责人 {head ? 1 : 0} + 直属 {directOthers}
                  {children.map((child) => ` + ${child.name} ${peopleInDepartment(currentPeople, child.path).length}`).join("")} = {subtree}
                </p>
              </div>
            )}
          </section>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#F4F5F9] p-1 text-xs">
            <button type="button" className={cx("min-h-10 rounded-lg", deep ? "bg-white font-medium text-primary" : "text-muted")} onClick={() => setDeep(true)}>
              含下级 {subtree}
            </button>
            <button type="button" className={cx("min-h-10 rounded-lg", !deep ? "bg-white font-medium text-primary" : "text-muted")} onClick={() => setDeep(false)}>
              仅本部门直属 {direct.length}
            </button>
          </div>
          <div className="rounded-xl bg-[#F5F3FF] px-2 py-1.5 text-[11px] text-[#4C1D95]">
            相对基线：调入 {roster.inCount} 人 · 调出 {roster.outCount} 人 · 净变化 {roster.net}
          </div>
          <div data-testid="dept-roster-preview" className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[11px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-normal">层级</th>
                  <th className="py-1 font-normal">姓名</th>
                  <th className="py-1 font-normal">岗位</th>
                  <th className="py-1 font-normal">职级</th>
                  <th className="py-1 font-normal">直属上级</th>
                  {seePay && <th className="py-1 font-normal">薪酬</th>}
                </tr>
              </thead>
              <tbody>
                {preview.map((person) => (
                  <tr key={person.id} className={roster.arrivedIds.has(person.id) ? "bg-[#F0FDF4]" : undefined}>
                    <td className="py-1 pr-1">{levelLabel(reportingLevel(roster.current, person))}</td>
                    <td className="py-1 pr-1 font-medium">
                      {person.name}
                      {roster.arrivedIds.has(person.id) && <span className="ml-1 text-[#067647]">调入</span>}
                    </td>
                    <td className="py-1 pr-1">{person.title}</td>
                    <td className="py-1 pr-1">{person.level || "—"}</td>
                    <td className="py-1 pr-1">{person.managerName || "—"}</td>
                    {seePay && <td className="py-1">{person.annualCost == null ? "—" : person.annualCost}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!seePay && <p className="mt-1 text-[11px] text-muted">薪酬和绩效按权限隐藏。</p>}
          </div>
          <Link
            href={`/roster?dept=${encodeURIComponent(department.id)}`}
            className="flex min-h-10 items-center justify-center rounded-xl border border-[#C7D2FE] text-sm font-medium text-primary"
          >
            查看全部 {roster.current.length} 人
          </Link>
          <p className="text-center text-[11px] text-muted">按汇报层级、再按工号。不按绩效排序。</p>
        </div>
      ) : (
        <div data-testid="decision-trail" className="space-y-3 p-3">
          <TrailList title="已执行" items={executed} />
          <TrailList title="待审批" items={pending} hint="还没审批通过，不计入上面的数字。" />
          <TrailList title="已驳回" items={rejected} hint="驳回单独列出，不计入决策轨迹的数字。" />
          {mine.length === 0 && <p className="text-xs text-muted">这个部门还没有决策轨迹。</p>}
          <p className="text-[11px] leading-5 text-muted">决策轨迹不记录人员安置信息 · 仅记录结构层决策。发起人和审批人只显示角色。</p>
        </div>
      )}
    </div>
  );
}

function TrailList({ title, items, hint }: { title: string; items: DecisionRecord[]; hint?: string }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="text-xs font-semibold">
        {title} · {items.length}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <ol className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-line px-2.5 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted">{item.date}</span>
              <Badge tone={item.status === "rejected" ? "bad" : item.status === "pending" ? "warn" : "good"}>
                {item.status === "rejected" ? "已驳回" : item.status === "pending" ? "待审批" : "已执行"}
              </Badge>
            </div>
            <div className="mt-1 font-medium">{item.title}</div>
            {item.sourceNote && <div className="mt-0.5 text-[11px] text-muted">{item.sourceNote}</div>}
            <p className="mt-1 text-muted">
              {item.beforeText} → {item.afterText}
            </p>
            <ul className="mt-1 space-y-1">
              {item.fields.map((field) => (
                <li key={field.key}>
                  <span className="text-muted">{FIELD_LABEL[field.key]}</span> {field.text}{" "}
                  <span className="text-primary">{ORIGIN[field.origin]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted">
              发起人 {item.initiatorRole}
              {item.approverRole ? ` · 审批人 ${item.approverRole}` : ""}
              {item.opinion ? ` · ${item.opinion}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
