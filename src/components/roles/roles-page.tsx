"use client";

import { AiPanel } from "@/components/ai-panel";
import { ScenarioSwitcher, Shell } from "@/components/shell";
import { useNarrow } from "@/components/use-narrow";
import { Badge, Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { collectPersonalSecrets } from "@/lib/ai/desensitize";
import { decomposeRoleWithAi } from "@/lib/ai/provider";
import {
  formatHumanAiPair,
  releasedHoursPerMonth,
  roleAnnualCost,
  rollupCosts,
  splitTime,
  taskShareTotal,
} from "@/lib/cost/math";
import { uid, formatCny, formatPercent, round1 } from "@/lib/format";
import { canSeeIndividualPay, canSeePlanMarkers, type ExecutionMode, type Person, type RoleDecomposition, type RoleTask } from "@/lib/model/types";
import { APP_CELL_NAME, presentRdCenterIssues, RD_CENTER_SAMPLE_ID } from "@/lib/demo/rdCenter";
import { rolePosture, summarizePostures, neutralExcludedNote, peopleIncludedInRollup } from "@/lib/roles/posture";
import { orgMetrics, scenarioRollup, topDepartment } from "@/lib/org/metrics";
import { evaluateRules } from "@/lib/rules/engine";
import { activeScenario, baselineScenario, updateScenario } from "@/lib/workspace/create";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

const FREQUENCIES = ["每日", "每周", "每双周", "每月", "每季度", "按需"];
const MODES: { id: ExecutionMode; label: string; color: string }[] = [
  { id: "human", label: "由人做", color: "#4F46E5" },
  { id: "collab", label: "人机协同", color: "#8B5CF6" },
  { id: "ai", label: "由 AI 做", color: "#10B981" },
];

export function RolesPage() {
  return (
    <Suspense fallback={<Shell crumb="岗位任务拆解"><p className="p-6 text-sm text-muted">正在打开岗位拆解…</p></Shell>}>
      <RolesBody />
    </Suspense>
  );
}

function RolesBody() {
  const params = useSearchParams();
  const { ready, workspace, ai, commit } = useWorkspace();
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [panelOpen, setPanelOpen] = useState(true);
  const narrow = useNarrow();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<RoleTask[] | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const draftRef = useRef<RoleTask[] | null>(null);

  useEffect(() => {
    if (narrow) setPanelOpen(false);
  }, [narrow]);

  const scenario = workspace ? activeScenario(workspace) : null;
  const roles = useMemo(() => {
    if (!scenario) return [];
    const map = new Map<string, { title: string; count: number; depts: Set<string> }>();
    for (const person of scenario.snapshot.people) {
      const current = map.get(person.title) ?? { title: person.title, count: 0, depts: new Set<string>() };
      current.count += 1;
      current.depts.add(topDepartment(person));
      map.set(person.title, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "zh-CN"));
  }, [scenario]);

  const filtered = roles.filter((role) => {
    if (reviewOnly && scenario && rolePosture(scenario.decompositions[role.title]) !== "pending_review") return false;
    const needle = query.trim();
    if (!needle) return true;
    return role.title.includes(needle) || [...role.depts].some((dept) => dept.includes(needle));
  });
  const grouped = new Map<string, typeof filtered>();
  for (const role of filtered) {
    const key = [...role.depts].sort().join("、") || "未分配";
    const list = grouped.get(key) ?? [];
    list.push(role);
    grouped.set(key, list);
  }

  if (!ready) {
    return (
      <Shell crumb="岗位任务拆解">
        <p className="p-6 text-sm text-muted">正在打开岗位拆解…</p>
      </Shell>
    );
  }
  if (!workspace || !scenario) {
    return (
      <Shell crumb="岗位任务拆解">
        <div className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-xl font-semibold">还没有可拆的岗位</h1>
          <p className="mt-2 text-sm text-muted">先导入花名册，再回来选一个岗位。</p>
          <Link href="/" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm text-white">
            去导入
          </Link>
        </div>
      </Shell>
    );
  }

  const incumbents = scenario.snapshot.people.filter((person) => person.title === title);
  const decomposition = title ? scenario.decompositions[title] : undefined;
  const syncKey = `${scenario.id}|${title}|${decomposition?.updatedAt ?? "none"}`;
  if (draftKey !== syncKey) {
    setDraftKey(syncKey);
    setDraft(decomposition ? decomposition.tasks.map((task) => ({ ...task })) : null);
  }
  const tasksForView = draftKey === syncKey ? draft : decomposition ? decomposition.tasks.map((task) => ({ ...task })) : null;
  draftRef.current = tasksForView;
  const seePay = canSeeIndividualPay(workspace.settings.viewerRole);
  const seeMarkers = canSeePlanMarkers(workspace.settings.viewerRole);
  const peopleByDept = new Map<string, Person[]>();
  for (const person of scenario.snapshot.people) {
    const key = topDepartment(person);
    const list = peopleByDept.get(key) ?? [];
    list.push(person);
    peopleByDept.set(key, list);
  }
  const focusDept = [...peopleByDept.entries()].find(([, list]) => summarizePostures(list, scenario.decompositions).pendingRoles > 0);
  const focusSummary = focusDept ? summarizePostures(focusDept[1], scenario.decompositions) : null;
  const baselinePeople = baselineScenario(workspace).snapshot.people;
  const focusCost = focusDept
    ? rollupCosts(peopleIncludedInRollup(focusDept[1], scenario.decompositions), scenario.decompositions, workspace.settings)
    : null;
  const excludedPeople = [...peopleByDept.values()].reduce((sum, list) => {
    const summary = summarizePostures(list, scenario.decompositions);
    return sum + summary.draftPeople + summary.pendingPeople;
  }, 0);
  const approverNote = neutralExcludedNote(excludedPeople, seeMarkers);
  const rawIssues = evaluateRules(scenario.snapshot, workspace.settings.thresholds, scenario.ignoredCodes);
  const issues = workspace.importMeta.sampleId === RD_CENTER_SAMPLE_ID ? presentRdCenterIssues(rawIssues) : rawIssues;
  const metrics = orgMetrics(scenario.snapshot);
  const scenarioCost = scenarioRollup(scenario, workspace.settings);
  const planNote = neutralExcludedNote(scenario.snapshot.people.length - scenarioCost.headcount, seeMarkers);
  const representative = incumbents.find((person) => person.annualCost != null) ?? incumbents[0];
  const annualLabor = representative?.annualCost ?? 0;
  const laborKnown = representative?.annualCost != null;

  function writeRole(tasks: RoleTask[], source: RoleDecomposition["source"], label: string) {
    const draftId = scenario && scenario.kind === "baseline" ? "scenario-a" : scenario?.id;
    if (!draftId || !workspace) return;
    const redirected = scenario?.kind === "baseline";
    const nextDecomposition: RoleDecomposition = {
      roleTitle: title,
      tasks,
      updatedAt: new Date().toISOString(),
      source,
      posture: scenario?.decompositions[title]?.posture,
    };
    const base = redirected ? { ...workspace, activeScenarioId: draftId } : workspace;
    commit(
      updateScenario(base, draftId, (current) => ({
        ...current,
        decompositions: { ...current.decompositions, [title]: nextDecomposition },
      })),
      `${redirected ? "基线只读，已写入方案 A。" : ""}${label}`,
    );
    if (redirected) setNote("基线不会被改。这次试算已经写到方案 A，可以随时撤销。");
  }

  async function generate() {
    if (!title) return;
    if (decomposition && !window.confirm("重新生成会覆盖当前清单。刚才的修改可以通过撤销找回来。")) return;
    setPending(true);
    const result = await decomposeRoleWithAi(title, ai.mode, scenario ? collectPersonalSecrets(scenario.snapshot, workspace?.collab) : []);
    writeRole(result.tasks, result.mode === "llm" ? "ai" : "template", `生成了「${title}」的任务清单`);
    setPending(false);
  }

  function updateTasks(recipe: (tasks: RoleTask[]) => RoleTask[], label: string, commitNow: boolean) {
    const current = draftRef.current;
    if (!current) return;
    const next = recipe(current);
    draftRef.current = next;
    setDraft(next);
    if (commitNow) writeRole(next, "user", label);
  }
  function commitDraft(label: string) {
    if (!draftRef.current || !decomposition) return;
    if (JSON.stringify(draftRef.current) === JSON.stringify(decomposition.tasks)) return;
    writeRole(draftRef.current, "user", label);
  }

  const split = tasksForView ? splitTime(tasksForView, workspace.settings.collabAiShare) : null;
  const perPerson = tasksForView ? roleAnnualCost(laborKnown ? annualLabor : 0, tasksForView, workspace.settings) : null;
  const released = tasksForView
    ? releasedHoursPerMonth(tasksForView, workspace.settings.collabAiShare, workspace.settings.monthlyHours)
    : 0;
  const shareTotal = tasksForView ? taskShareTotal(tasksForView) : 0;
  const templates = Object.values(workspace.templates);

  return (
    <Shell crumb="岗位任务拆解">
      <div className="flex min-h-0 flex-col pb-14 lg:h-[calc(100dvh-var(--app-header,7.5rem))] lg:min-h-[680px] lg:flex-row lg:pb-0">
        <aside className="max-h-[42vh] w-full shrink-0 overflow-auto border-b border-line bg-white p-3 lg:max-h-none lg:w-[280px] lg:border-b-0 lg:border-r">
          <ScenarioSwitcher />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜岗位或部门"
            className="mt-3 min-h-10 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-3 space-y-3">
            {[...grouped.entries()].map(([dept, list]) => {
              const summary = summarizePostures(peopleByDept.get(dept) ?? [], scenario.decompositions);
              return (
              <div key={dept}>
                <div className="px-1 text-[11px] font-medium text-muted">{dept}</div>
                {seeMarkers && summary.pendingRoles > 0 && (
                  <button
                    type="button"
                    className="mt-1 px-1 text-left text-[11px] leading-5 text-[#B54708]"
                    onClick={() => setReviewOnly(true)}
                  >
                    {dept} {summary.people} 人，计入汇总 {summary.includedPeople} 人、{summary.includedRoles} 个岗位。草稿 {summary.draftPeople} 人未计入。不含 {summary.pendingRoles} 个待复核岗位 · 查看清单
                  </button>
                )}
                {neutralExcludedNote(summary.draftPeople + summary.pendingPeople, seeMarkers) && (
                  <p className="mt-1 px-1 text-[11px] leading-5 text-muted">{neutralExcludedNote(summary.draftPeople + summary.pendingPeople, seeMarkers)}</p>
                )}
                <div className="mt-1 space-y-1">
                  {list.map((role) => {
                    const active = role.title === title;
                    const done = Boolean(scenario.decompositions[role.title]);
                    const posture = rolePosture(scenario.decompositions[role.title]);
                    const pendingMark = seeMarkers && (posture === "draft" || posture === "pending_review");
                    return (
                      <button
                        key={role.title}
                        onClick={() => setTitle(role.title)}
                        className={cx(
                          "flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left text-sm",
                          active ? "bg-primarySoft text-primary" : "hover:bg-[#F6F7FB]",
                        )}
                      >
                        <span>
                          {role.title}
                          <span className="mt-0.5 block text-[11px] text-muted">{role.count} 人{seeMarkers && posture === "draft" ? " · 草稿" : ""}</span>
                          {seeMarkers && fromAppCell(baselinePeople, scenario.snapshot.people.filter((person) => person.title === role.title)) && (
                            <span className="mt-0.5 block text-[11px] text-muted">
                              {role.title} {role.count} 人，来自原应用分析小组
                            </span>
                          )}
                          {pendingMark && <span className="mt-0.5 block text-[11px] text-[#B54708]">调整中，待确认岗位</span>}
                        </span>
                        {done && posture === "active" && <Badge tone="good">已拆</Badge>}
                        {pendingMark && <Badge tone="warn">{posture === "draft" ? "草稿" : "待复核"}</Badge>}
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-4 lg:p-5">
          {approverNote && (
            <p data-testid="roles-excluded-note" className="mb-4 text-sm text-muted">
              {approverNote}
            </p>
          )}
          {seeMarkers && focusSummary && focusDept && (
            <div data-testid="roles-review-note" className="mb-4 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm leading-6 text-[#92400E]">
              {focusDept[0]} {focusSummary.people} 人，计入人机比和成本的是 {focusSummary.includedPeople} 人、{focusSummary.includedRoles} 个岗位（{focusSummary.people} − {focusSummary.draftPeople} − {focusSummary.pendingPeople}）。草稿和待复核都不计入汇总。
              {focusCost && focusCost.covered > 0 ? (
                <>
                  {" "}
                  人 : AI <span className="whitespace-nowrap">{formatHumanAiPair(focusCost.aiShare, focusCost.humanShare)}</span>。
                </>
              ) : null}
              <button type="button" className="ml-1 font-medium text-primary" onClick={() => setReviewOnly((value) => !value)}>
                {reviewOnly ? "显示全部岗位" : `不含 ${focusSummary.pendingRoles} 个待复核岗位 · 查看清单`}
              </button>
            </div>
          )}
          {!title && (
            <div className="mx-auto max-w-xl pt-10">
              <h1 className="text-xl font-semibold">选一个岗位，决定哪些交给 AI</h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                清单按岗位名称共用。比如 12 位客户成功顾问会用同一份任务，成本和释放工时再按人数汇总。建议先看「客户成功顾问」。
              </p>
            </div>
          )}
          {title && (
            <div className="mx-auto max-w-5xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">{scenario.name}{scenario.kind === "baseline" ? " · 只读，生成后会写入方案 A" : ""}</div>
                  <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
                  {seeMarkers && decomposition && rolePosture(decomposition) !== "active" && (
                    <p className="mt-1 text-sm text-[#B54708]">
                      调整中，待确认岗位{rolePosture(decomposition) === "draft" ? " · 草稿不计入人机比和成本" : " · 待复核，复核前不计入人机比和成本"}
                    </p>
                  )}
                  {seeMarkers && fromAppCell(baselinePeople, incumbents) && (
                    <p data-testid="role-origin" className="mt-1 text-sm text-muted">
                      {title} {incumbents.length} 人，来自原应用分析小组
                    </p>
                  )}
                  {seeMarkers && incumbents.some((person) => person.pendingRoleConfirm) && (
                    <p className="mt-1 text-sm text-[#B54708]">
                      {incumbents
                        .filter((person) => person.pendingRoleConfirm)
                        .map((person) => person.name)
                        .join("、")}
                      {" · 调整中，待确认岗位"}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-muted">
                    {incumbents.length} 人在岗
                    {incumbents.length > 0 ? ` · ${[...new Set(incumbents.map((person) => person.departmentPath.at(-1)))].slice(0, 3).join("、")}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={generate} disabled={pending}>
                    {pending ? "正在生成…" : decomposition ? "重新生成" : "生成任务清单"}
                  </Button>
                  {decomposition && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        commit(
                          {
                            ...workspace,
                            templates: {
                              ...workspace.templates,
                              [title]: { ...decomposition, tasks: decomposition.tasks.map((task) => ({ ...task, id: uid("task") })) },
                            },
                          },
                          `把「${title}」存成岗位模板`,
                        );
                        setNote(`已存为模板「${title}」，同类岗位可以套用。`);
                      }}
                    >
                      存为模板
                    </Button>
                  )}
                </div>
              </div>
              {note && <p className="mt-3 rounded-xl bg-primarySoft px-3 py-2 text-sm text-[#3730A3]">{note}</p>}
              {!decomposition && (
                <div className="mt-6 rounded-2xl border border-dashed border-line bg-white p-8 text-sm leading-6 text-muted">
                  还没有任务清单。点「生成任务清单」后，每一项都会标上由人做、由 AI 做或人机协同，并写上理由和置信度。你可以改，改完再汇总到部门和方案。
                  {ai.mode === "offline" && " 当前没有模型密钥，会用内置模板，并在每条上标明。"}
                </div>
              )}
              {decomposition && split && perPerson && (
                <>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted">
                    <Badge tone={decomposition.source === "ai" ? "good" : decomposition.source === "user" ? "purple" : "info"}>
                      {decomposition.source === "ai" ? "模型生成" : decomposition.source === "user" ? "含人工修改" : "离线模板"}
                    </Badge>
                    <span>协同任务默认把 {Math.round(workspace.settings.collabAiShare * 100)}% 工时算给 AI。算力单价 {workspace.settings.computeUnitPrice} 元/任务/月。</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <SummaryCard testId="role-ratio" label="人 : AI" value={formatHumanAiPair(split.ai, split.human)} hint="人在前 · 人工时 : AI 工时" />
                    <SummaryCard label="释放工时" value={`${round1(released)} 小时/月`} hint="单人，含协同分摊" />
                    <SummaryCard label="人力成本" value={seePay && laborKnown ? formatCny(annualLabor) : seePay ? "未提供" : "已隐藏"} hint={seePay ? "单人年度，不因 AI 自动减编" : "个人薪酬仅授权角色可见"} />
                    <SummaryCard label="算力成本" value={formatCny(perPerson.compute)} hint="单人每年" />
                    <SummaryCard label="岗位总成本" value={seePay && laborKnown ? formatCny(perPerson.total) : seePay ? formatCny(perPerson.compute) : "薪酬已隐藏"} hint="人力 + 算力" />
                  </div>
                  <div className="mt-4 rounded-2xl border border-line bg-white p-4">
                    <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted">
                      {MODES.map((mode) => (
                        <span key={mode.id} className="inline-flex items-center gap-1">
                          <i className="inline-block h-2 w-2 rounded-full" style={{ background: mode.color }} />
                          {mode.label} {formatPercent((tasksForView ?? []).filter((task) => task.mode === mode.id).reduce((sum, task) => sum + task.timeShare, 0))}
                        </span>
                      ))}
                      {Math.abs(shareTotal - 1) > 0.02 && <span className="text-[#B54708]">工时合计 {formatPercent(shareTotal)}，建议调到 100%</span>}
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-full bg-[#EEF0F6]">
                      {MODES.map((mode) => {
                        const width = (tasksForView ?? []).filter((task) => task.mode === mode.id).reduce((sum, task) => sum + task.timeShare, 0);
                        if (width <= 0) return null;
                        return <div key={mode.id} style={{ width: `${Math.min(100, width * 100)}%`, background: mode.color }} />;
                      })}
                    </div>
                  </div>
                  <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-line bg-white">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-[#F8F9FD] text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">任务</th>
                          <th className="px-3 py-2 font-medium">工时%</th>
                          <th className="px-3 py-2 font-medium">频率</th>
                          <th className="px-3 py-2 font-medium">执行方式</th>
                          <th className="px-3 py-2 font-medium">理由</th>
                          <th className="px-3 py-2 font-medium">置信度</th>
                          <th className="px-3 py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {(tasksForView ?? []).map((task) => (
                          <tr key={task.id} className="border-t border-line align-top">
                            <td className="px-3 py-2">
                              <input
                                value={task.name}
                                className="w-full rounded-lg border border-transparent px-1 py-1 hover:border-line focus:border-primary"
                                onChange={(event) =>
                                  updateTasks(
                                    (tasks) => tasks.map((item) => (item.id === task.id ? { ...item, name: event.target.value, edited: true } : item)),
                                    "",
                                    false,
                                  )
                                }
                                onBlur={() => commitDraft(`修改了「${title}」的任务名称`)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={Math.round(task.timeShare * 1000) / 10}
                                className="min-h-10 w-16 rounded-lg border border-line px-2 py-1"
                                onChange={(event) =>
                                  updateTasks(
                                    (tasks) =>
                                      tasks.map((item) =>
                                        item.id === task.id ? { ...item, timeShare: Number(event.target.value) / 100, edited: true } : item,
                                      ),
                                    "",
                                    false,
                                  )
                                }
                                onBlur={() => commitDraft(`调整了「${title}」的工时占比`)}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={task.frequency}
                                className="min-h-10 rounded-lg border border-line px-2 py-1"
                                onChange={(event) =>
                                  updateTasks(
                                    (tasks) => tasks.map((item) => (item.id === task.id ? { ...item, frequency: event.target.value, edited: true } : item)),
                                    `调整了「${title}」的任务频率`,
                                    true,
                                  )
                                }
                              >
                                {[...new Set([task.frequency, ...FREQUENCIES])].map((frequency) => (
                                  <option key={frequency}>{frequency}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                {MODES.map((mode) => (
                                  <button
                                    key={mode.id}
                                    className={cx(
                                      "min-h-10 rounded-lg px-2 text-left text-xs",
                                      task.mode === mode.id ? "bg-primarySoft font-medium text-primary" : "text-muted hover:bg-[#F6F7FB]",
                                    )}
                                    onClick={() =>
                                      updateTasks(
                                        (tasks) => tasks.map((item) => (item.id === task.id ? { ...item, mode: mode.id, edited: true } : item)),
                                        `把「${task.name}」改成${mode.label}`,
                                        true,
                                      )
                                    }
                                  >
                                    {mode.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <textarea
                                value={task.reason}
                                className="h-20 w-full rounded-lg border border-line px-2 py-1 text-xs leading-5"
                                onChange={(event) =>
                                  updateTasks(
                                    (tasks) => tasks.map((item) => (item.id === task.id ? { ...item, reason: event.target.value, edited: true } : item)),
                                    "",
                                    false,
                                  )
                                }
                                onBlur={() => commitDraft(`改了「${task.name}」的理由`)}
                              />
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <div>{Math.round(task.confidence * 100)}%</div>
                              {task.confidence < 0.7 && <div className="mt-1 text-[#B54708]">建议复核</div>}
                              <div className="mt-1 text-muted">{task.edited ? "已人工改" : task.source === "ai" ? "模型" : "模板"}</div>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                className="inline-flex min-h-10 items-center text-xs text-[#B42318]"
                                onClick={() => updateTasks((tasks) => tasks.filter((item) => item.id !== task.id), `删除了任务「${task.name}」`, true)}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        updateTasks(
                          (tasks) => [
                            ...tasks,
                            {
                              id: uid("task"),
                              name: "新任务",
                              timeShare: 0.05,
                              frequency: "每周",
                              mode: "human",
                              reason: "人工添加，尚未写判断理由。",
                              confidence: 1,
                              source: "user",
                              edited: true,
                            },
                          ],
                          `给「${title}」加了一条任务`,
                          true,
                        )
                      }
                    >
                      加一条任务
                    </Button>
                    {templates.length > 0 && (
                      <label className="text-xs text-muted">
                        套用模板
                        <select
                          className="ml-2 min-h-10 rounded-lg border border-line px-2 text-sm text-ink"
                          defaultValue=""
                          onChange={(event) => {
                            const picked = workspace.templates[event.target.value];
                            if (!picked) return;
                            writeRole(
                              picked.tasks.map((task) => ({ ...task, id: uid("task"), edited: false })),
                              "template",
                              `把模板「${picked.roleTitle}」套到「${title}」`,
                            );
                          }}
                        >
                          <option value="">选择已保存的岗位</option>
                          {templates.map((item) => (
                            <option key={item.roleTitle} value={item.roleTitle}>
                              {item.roleTitle}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-line bg-white p-4 text-sm">
                      <div className="font-medium">这个岗位的在岗汇总</div>
                      <p className="mt-2 leading-6 text-muted">
                        {incumbents.length} 人共用这份清单。释放工时合计 {round1(released * incumbents.length)} 小时/月，年算力 {formatCny(perPerson.compute * incumbents.length)}
                        {seePay && laborKnown ? `，人力 ${formatCny(incumbents.reduce((sum, person) => sum + (person.annualCost ?? 0), 0))}` : ""}
                        。人数不会因为释放工时自动变化。
                      </p>
                    </div>
                    <div data-testid="plan-summary" className="rounded-2xl border border-line bg-white p-4 text-sm">
                      <div className="font-medium">当前方案汇总</div>
                      {planNote && <p className="mt-1 text-xs text-muted">{planNote}</p>}
                      <p className="mt-2 leading-6 text-muted">
                        已拆 {scenarioCost.covered}/{scenarioCost.headcount} 人。综合人机比 人 : AI{" "}
                        <span className="whitespace-nowrap">{formatHumanAiPair(scenarioCost.aiShare, scenarioCost.humanShare)}</span>
                        ，释放工时 {round1(scenarioCost.releasedHours)} 小时/月，算力 {formatCny(scenarioCost.compute)}
                        ，人力加算力 {seePay || scenarioCost.laborKnown === 0 ? formatCny(scenarioCost.total) : "薪酬按部门汇总另计"}。
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
        <AiPanel issues={issues} metrics={metrics} collapsed={!panelOpen} onToggle={() => setPanelOpen((value) => !value)} />
      </div>
    </Shell>
  );
}

function fromAppCell(baseline: Person[], current: Person[]): boolean {
  if (current.length === 0) return false;
  const previous = new Map(baseline.map((person) => [person.id, person]));
  return current.every((person) => previous.get(person.id)?.departmentPath.at(-1) === APP_CELL_NAME);
}

function SummaryCard({ label, value, hint, testId }: { label: string; value: string; hint: string; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-line bg-white px-3 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 whitespace-nowrap text-lg font-semibold">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-muted">{hint}</div>
    </div>
  );
}
