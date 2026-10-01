"use client";

import { Badge, Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { formatWhen } from "@/lib/format";
import type { ViewerRole } from "@/lib/model/types";
import { DEFAULT_SETTINGS } from "@/lib/model/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const LINKS = [
  { href: "/", label: "导入" },
  { href: "/sandbox", label: "沙盘" },
  { href: "/roles", label: "岗位拆解" },
];

const ROLES: { id: ViewerRole; label: string }[] = [
  { id: "od", label: "OD 专家" },
  { id: "approver", label: "业务负责人" },
  { id: "admin", label: "系统管理员" },
];

export function Shell({ crumb, children }: { crumb: string; children: ReactNode }) {
  const pathname = usePathname();
  const { workspace, ai, canUndo, canRedo, undo, redo, commit, setViewerRole } = useWorkspace();
  const [auditOpen, setAuditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const role = workspace?.settings.viewerRole ?? "od";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">织</span>
            <span className="hidden text-sm font-semibold sm:block">组织设计沙盘</span>
          </Link>
          <span className="hidden text-sm text-muted md:block">{crumb}</span>
          <nav className="ml-auto flex items-center gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm",
                  pathname === link.href ? "bg-primarySoft font-medium text-primary" : "text-muted hover:bg-[#F4F5F9]",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="px-2" disabled={!canUndo} onClick={undo} title="撤销">
              撤销
            </Button>
            <Button variant="ghost" className="px-2" disabled={!canRedo} onClick={redo} title="重做">
              重做
            </Button>
            <Button variant="ghost" className="px-2" disabled={!workspace} onClick={() => setAuditOpen(true)}>
              记录
            </Button>
            <Button variant="ghost" className="px-2" disabled={!workspace} onClick={() => setSettingsOpen(true)}>
              口径
            </Button>
          </div>
          <label className="hidden items-center gap-2 text-xs text-muted lg:flex">
            查看身份
            <select
              className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink"
              value={role}
              disabled={!workspace}
              onChange={(event) => setViewerRole(event.target.value as ViewerRole)}
            >
              {ROLES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Badge tone={ai.mode === "llm" ? "good" : "info"}>{ai.mode === "llm" ? `模型 · ${ai.model}` : "离线演示"}</Badge>
        </div>
        {workspace?.importMeta.sampleLabel && (
          <div className="border-t border-[#E0E7FF] bg-primarySoft px-4 py-1.5 text-xs text-[#3730A3]">
            当前基线来自示例数据「{workspace.importMeta.sampleLabel}」，公司、姓名和成本都是虚构的，用来走查流程。
          </div>
        )}
        {role === "approver" && (
          <div className="border-t border-[#FDE68A] bg-[#FFFBEB] px-4 py-1.5 text-xs text-[#92400E]">
            当前以业务负责人查看：个人薪酬已隐藏，成本只显示到部门汇总。
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {auditOpen && workspace && (
        <Dialog title="变更记录" onClose={() => setAuditOpen(false)}>
          <p className="mb-3 text-sm text-muted">导入、修复、忽略提醒和任务修改都会记在这里。撤销会回到上一个状态。</p>
          <ul className="max-h-[50vh] space-y-2 overflow-auto">
            {workspace.audit.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                <div className="text-ink">{entry.label}</div>
                <div className="mt-1 text-xs text-muted">
                  {entry.source === "ai" ? "AI 建议" : "人工"} · {formatWhen(entry.at)}
                </div>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {settingsOpen && workspace && (
        <SettingsDialog
          admin={role === "admin"}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => {
            commit({ ...workspace, settings }, "更新了规则阈值或算力单价");
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#101828]/40 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="text-sm text-muted" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsDialog({
  admin,
  onClose,
  onSave,
}: {
  admin: boolean;
  onClose: () => void;
  onSave: (settings: typeof DEFAULT_SETTINGS) => void;
}) {
  const { workspace } = useWorkspace();
  const initial = workspace?.settings ?? DEFAULT_SETTINGS;
  const [spanWide, setSpanWide] = useState(initial.thresholds.spanWide);
  const [spanNarrow, setSpanNarrow] = useState(initial.thresholds.spanNarrow);
  const [maxLayers, setMaxLayers] = useState(initial.thresholds.maxLayers);
  const [price, setPrice] = useState(initial.computeUnitPrice);
  const [collab, setCollab] = useState(Math.round(initial.collabAiShare * 100));
  const [hours, setHours] = useState(initial.monthlyHours);
  return (
    <Dialog title="计算口径" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        {admin ? "你现在是系统管理员，可以改阈值和算力单价。改完立即重算，也可以撤销。" : "只有系统管理员能改这些数。把右上角身份换成「系统管理员」即可。"}
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="幅度过宽（直接下级多于）" value={spanWide} disabled={!admin} onChange={setSpanWide} />
        <Field label="幅度过窄（直接下级不多于）" value={spanNarrow} disabled={!admin} onChange={setSpanNarrow} />
        <Field label="层级上限" value={maxLayers} disabled={!admin} onChange={setMaxLayers} />
        <Field label="算力单价（元 / 任务 / 月）" value={price} disabled={!admin} onChange={setPrice} />
        <Field label="协同里算给 AI 的比例（%）" value={collab} disabled={!admin} onChange={setCollab} />
        <Field label="月标准工时" value={hours} disabled={!admin} onChange={setHours} />
      </div>
      {admin && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() =>
              onSave({
                ...initial,
                computeUnitPrice: price,
                collabAiShare: collab / 100,
                monthlyHours: hours,
                thresholds: { spanWide, spanNarrow, maxLayers },
              })
            }
          >
            保存口径
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-xl border border-line px-3 py-2 disabled:bg-[#F8F9FD]"
      />
    </label>
  );
}

export function ScenarioSwitcher() {
  const { workspace, touch } = useWorkspace();
  if (!workspace) return null;
  return (
    <div className="flex flex-wrap rounded-xl bg-[#EEF0F6] p-1">
      {workspace.scenarios.map((scenario) => {
        const active = scenario.id === workspace.activeScenarioId;
        return (
          <button
            key={scenario.id}
            className={cx("rounded-lg px-3 py-1.5 text-sm", active ? "bg-white font-medium text-ink shadow-sm" : "text-muted")}
            onClick={() => touch((current) => ({ ...current, activeScenarioId: scenario.id }))}
          >
            {scenario.name}
          </button>
        );
      })}
    </div>
  );
}
