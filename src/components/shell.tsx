"use client";

import { Badge, Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { parseScenarioFile, serializeScenarioFile } from "@/lib/data/scenarioFile";
import { formatWhen } from "@/lib/format";
import type { ViewerRole, Workspace } from "@/lib/model/types";
import { DEFAULT_SETTINGS } from "@/lib/model/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const LINKS = [
  { href: "/", label: "导入" },
  { href: "/sandbox", label: "沙盘" },
  { href: "/roles", label: "岗位拆解" },
];

function downloadScenario(workspace: Workspace) {
  const blob = new Blob([serializeScenarioFile(workspace)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "组织沙盘-场景.json";
  link.click();
  URL.revokeObjectURL(url);
}

const ROLES: { id: ViewerRole; label: string }[] = [
  { id: "od", label: "OD 专家" },
  { id: "approver", label: "业务负责人" },
  { id: "admin", label: "系统管理员" },
];

export function Shell({ crumb, children }: { crumb: string; children: ReactNode }) {
  const pathname = usePathname();
  const { workspace, ai, canUndo, canRedo, undo, redo, commit, replaceWorkspace, setViewerRole } = useWorkspace();
  const [auditOpen, setAuditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileNote, setFileNote] = useState("");
  const role = workspace?.settings.viewerRole ?? "od";
  const headerRef = useRef<HTMLElement>(null);
  const sampleLabel = workspace?.importMeta.sampleLabel;

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty("--app-header", `${el.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sampleLabel, role]);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header ref={headerRef} className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 lg:gap-4 lg:px-4 xl:h-14 xl:flex-nowrap xl:py-0">
          <Link href="/" className="order-1 inline-flex min-h-10 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-white">织</span>
            <span className="hidden text-sm font-semibold sm:inline">组织设计沙盘</span>
          </Link>
          <span className="order-2 hidden min-w-0 truncate text-sm text-muted md:block">{crumb}</span>
          <nav className="order-3 flex flex-wrap items-center gap-1 lg:ml-auto">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  "inline-flex min-h-10 items-center rounded-lg px-3 text-sm",
                  pathname === link.href ? "bg-primarySoft font-medium text-primary" : "text-muted hover:bg-[#F4F5F9]",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="order-5 flex flex-wrap items-center gap-1 xl:order-4">
            <Button variant="ghost" className="px-2.5" disabled={!canUndo} onClick={undo} title="撤销">
              撤销
            </Button>
            <Button variant="ghost" className="px-2.5" disabled={!canRedo} onClick={redo} title="重做">
              重做
            </Button>
            <Button variant="ghost" className="px-2.5" disabled={!workspace} onClick={() => setAuditOpen(true)}>
              记录
            </Button>
            <Button variant="ghost" className="px-2.5" disabled={!workspace} onClick={() => setSettingsOpen(true)}>
              口径
            </Button>
          </div>
          <label className="order-6 flex min-h-10 min-w-0 items-center gap-2 text-xs text-muted xl:order-5">
            <span className="hidden sm:inline">查看身份</span>
            <select
              aria-label="查看身份"
              className="min-h-10 max-w-[9.5rem] rounded-lg border border-line bg-white px-2 text-sm text-ink"
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
          <span className="order-4 max-xl:ml-auto xl:order-6">
            <Badge tone={ai.mode === "llm" ? "good" : "info"}>{ai.mode === "llm" ? `模型 · ${ai.model}` : "离线演示"}</Badge>
          </span>
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
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#F8F9FD] px-3 py-2 text-xs leading-5 text-muted">
          <span className="min-w-0 flex-1">花名册和方案只保存在这台浏览器里，不会上传到服务器。换设备或清理缓存前，请导出场景文件。</span>
          <Button variant="secondary" className="px-3" disabled={!workspace} onClick={() => workspace && downloadScenario(workspace)}>
            导出场景
          </Button>
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink">
            导入场景
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const next = parseScenarioFile(String(reader.result ?? ""));
                  if (!next) {
                    setFileNote("这个文件不是本沙盘导出的场景。请选择导出的 JSON。");
                    return;
                  }
                  replaceWorkspace(next);
                  setFileNote("已从场景文件恢复。数据仍只在这台浏览器里。");
                };
                reader.readAsText(file);
              }}
            />
          </label>
          {fileNote && <span className="text-ink">{fileNote}</span>}
        </div>
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
          <button className="inline-flex min-h-10 items-center px-2 text-sm text-muted" onClick={onClose}>
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
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
        className="mt-1 min-h-10 w-full rounded-xl border border-line px-3 py-2 disabled:bg-[#F8F9FD]"
      />
    </label>
  );
}

export function ScenarioSwitcher() {
  const { workspace, touch } = useWorkspace();
  if (!workspace) return null;
  return (
    <div className="flex flex-nowrap gap-0.5 overflow-x-auto rounded-xl bg-[#EEF0F6] p-1 lg:flex-wrap">
      {workspace.scenarios.map((scenario) => {
        const active = scenario.id === workspace.activeScenarioId;
        return (
          <button
            key={scenario.id}
            className={cx("min-h-10 shrink-0 rounded-lg px-3 text-sm", active ? "bg-white font-medium text-ink shadow-sm" : "text-muted")}
            onClick={() => touch((current) => ({ ...current, activeScenarioId: scenario.id }))}
          >
            {scenario.name}
          </button>
        );
      })}
    </div>
  );
}
