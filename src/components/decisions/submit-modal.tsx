"use client";

import { Badge, Button } from "@/components/ui";
import { useNarrow } from "@/components/use-narrow";
import { prefillDecisionWithAi, type AiMode } from "@/lib/ai/provider";
import { changeEnds, reviewDateMonthsAhead, type DecisionPrefill, type HeadcountChange } from "@/lib/ai/desensitize";
import { guardIssues, stripGuardedText } from "@/lib/decisions/guard";
import type { DecisionFieldKey, DecisionRecord, FieldOrigin, Person } from "@/lib/model/types";
import { useEffect, useState } from "react";

const FIELDS: { key: DecisionFieldKey; label: string; multiline: boolean }[] = [
  { key: "background", label: "背景", multiline: true },
  { key: "intent", label: "意图", multiline: true },
  { key: "expectedEffect", label: "预期效果", multiline: true },
  { key: "reviewDate", label: "复盘时间", multiline: false },
];

export function SubmitDecisionModal({
  departmentName,
  departmentId,
  changes,
  lead,
  people,
  secrets,
  mode,
  onClose,
  onSubmit,
}: {
  departmentName: string;
  departmentId: string;
  changes: HeadcountChange[];
  lead?: string;
  people: Person[];
  secrets: string[];
  mode: AiMode;
  onClose: () => void;
  onSubmit: (record: DecisionRecord) => void;
}) {
  const narrow = useNarrow();
  const [prefill, setPrefill] = useState<DecisionPrefill | null>(null);
  const [origin, setOrigin] = useState<Record<DecisionFieldKey, FieldOrigin>>({
    background: "ai",
    intent: "ai",
    expectedEffect: "ai",
    reviewDate: "ai",
  });
  const [sourceMode, setSourceMode] = useState<AiMode>(mode);
  const [busy, setBusy] = useState(true);
  const secretsRef = useState(() => secrets)[0];
  const changeKey = changes.map((change) => `${change.name}\u0001${change.before}\u0001${change.after}`).join("\n");
  const changed = changes.filter((change) => change.before !== change.after);
  const ends = changeEnds(changes);

  useEffect(() => {
    let cancelled = false;
    const reviewDate = reviewDateMonthsAhead(new Date(), 6);
    const parsed: HeadcountChange[] = changeKey
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, before, after] = line.split("\u0001");
        return { name, before: Number(before), after: Number(after) };
      });
    prefillDecisionWithAi({ changes: parsed, reviewDate, secrets: secretsRef, mode, lead }).then((result) => {
      if (cancelled) return;
      setPrefill(result.prefill);
      setSourceMode(result.mode);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [changeKey, lead, mode, secretsRef]);

  const joined = prefill ? FIELDS.map((field) => prefill[field.key]).join("\n") : "";
  const issues = prefill ? guardIssues(joined, people) : [];

  function edit(key: DecisionFieldKey, value: string) {
    setPrefill((current) => (current ? { ...current, [key]: value } : current));
    setOrigin((current) => ({ ...current, [key]: "user" }));
  }

  function strip() {
    if (!prefill) return;
    const next = { ...prefill };
    for (const field of FIELDS) next[field.key] = stripGuardedText(next[field.key], people);
    setPrefill(next);
    setOrigin({ background: "user", intent: "user", expectedEffect: "user", reviewDate: "user" });
  }

  function confirm() {
    if (!prefill || guardIssues(FIELDS.map((field) => prefill[field.key]).join("\n"), people).length > 0) return;
    const filing = changed.find((change) => change.id === departmentId) ?? changed[0];
    onSubmit({
      id: `dec-${Date.now().toString(36)}`,
      departmentId: filing?.id || departmentId,
      title: lead || `${filing?.name ?? departmentName}结构调整`,
      date: new Date().toISOString().slice(0, 10),
      status: "pending",
      initiatorRole: "HRBP",
      approverRole: null,
      beforeText: ends.beforeText,
      afterText: ends.afterText,
      fields: FIELDS.map((field) => ({ key: field.key, text: prefill[field.key], origin: origin[field.key] })),
      opinion: "",
    });
  }

  return (
    <div className={narrow ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-card" : "fixed inset-0 z-50 grid place-items-center bg-[#101828]/40 p-4"} data-testid="submit-modal">
      <div
        className={narrow ? "flex min-h-0 flex-1 flex-col" : "flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-card"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">提交审批 · 确认决策说明</h2>
            <p className="mt-1 text-xs leading-5 text-muted">确认前只是建议，不写入任何日志。AI 预填背景、意图、预期效果和复盘时间，你改过的会标成用户改写。</p>
          </div>
          <button type="button" className="inline-flex min-h-10 items-center px-2 text-sm text-muted" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
          <p className="text-xs text-muted">
            来源：{sourceMode === "llm" ? "模型预填，已按脱敏汇总生成" : "离线预填"}
            {lead ? ` · ${lead}` : changed.length > 0 ? ` · ${changed.map((change) => change.name).join("、")}` : ""}
          </p>
          {(lead || changed.length > 0) && (
            <ul data-testid="change-summary" className="rounded-xl bg-[#F8F9FD] px-3 py-2 text-xs leading-5 text-muted">
              {lead && <li>{lead}</li>}
              {changed.slice(0, 6).map((diff) => (
                <li key={diff.name}>
                  {diff.name} {diff.before} → {diff.after}
                </li>
              ))}
            </ul>
          )}
          {busy && <p className="text-sm text-muted">正在准备预填…</p>}
          {prefill &&
            FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 flex items-center gap-2">
                  {field.label}
                  <Badge tone={origin[field.key] === "ai" ? "info" : "purple"}>{origin[field.key] === "ai" ? "AI预填" : "用户改写"}</Badge>
                </span>
                {field.multiline ? (
                  <textarea
                    value={prefill[field.key]}
                    onChange={(event) => edit(field.key, event.target.value)}
                    className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm leading-6"
                  />
                ) : (
                  <input
                    value={prefill[field.key]}
                    onChange={(event) => edit(field.key, event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-xl border border-line px-3 text-sm"
                  />
                )}
              </label>
            ))}
          {issues.length > 0 && (
            <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs leading-5 text-[#B91C1C]">
              <div>检测到人员安置或花名册里的姓名、工号。去掉之后才能提交，这些内容不会写入决策轨迹。</div>
              <ul className="mt-1 list-disc pl-4">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              <Button variant="secondary" className="mt-2" onClick={strip}>
                一键移除
              </Button>
            </div>
          )}
          <p className="text-[11px] leading-5 text-muted">决策轨迹不记录人员安置，例如负责人更换、具体人员的去留或调岗。审批还没开通，提交后记为待审批，不计入「决策轨迹（N）」。</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={confirm} disabled={busy || issues.length > 0 || !prefill}>
            确认并提交
          </Button>
        </div>
      </div>
    </div>
  );
}
