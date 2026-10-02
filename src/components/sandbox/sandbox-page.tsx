"use client";

import { AiPanel } from "@/components/ai-panel";
import { ScenarioSwitcher, Shell } from "@/components/shell";
import { CollabEdge, type CollabEdgeData } from "@/components/sandbox/collab-edge";
import { DeptNode, type DeptBubble, type DeptNodeData } from "@/components/sandbox/dept-node";
import { LeaderCard } from "@/components/sandbox/leader-card";
import { useNarrow } from "@/components/use-narrow";
import { Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { collabBundleFromSheets } from "@/lib/collab/parse";
import { canvasLinks, goalsFor, leaderCollaborators, okrFor, scoredCollaboration } from "@/lib/collab/view";
import { readCollabView, writeCollabView } from "@/lib/collab/viewPreference";
import { readMobileEditHintDismissed, writeMobileEditHintDismissed } from "@/lib/ui/mobileHint";
import { formatCny, formatDeltaMoney, formatDeltaNumber, round1 } from "@/lib/format";
import { canSeeIndividualPay, canSeeLeaderCard, type CollabBundle, type OrgIssue, type OrgSnapshot } from "@/lib/model/types";
import { departmentAccent, scaleAccent, type ColorMode } from "@/lib/org/color";
import { childIds, layoutDepartments, NODE_H, NODE_W } from "@/lib/org/layout";
import { mergeDepartments, movePeople, proposeSpanRelief, reparentDepartment, type StructurePlan } from "@/lib/org/mutate";
import { diffMetrics, directReports, orgMetrics, peopleInDepartment, scenarioRollup, type OrgMetrics } from "@/lib/org/metrics";
import { parseWorkbook } from "@/lib/import/parseWorkbook";
import { evaluateRules } from "@/lib/rules/engine";
import { activeScenario, baselineScenario, ensureDraft, updateScenario } from "@/lib/workspace/create";
import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const nodeTypes = { dept: DeptNode };
const edgeTypes = { collab: CollabEdge };

type Impact = { before: OrgMetrics; after: OrgMetrics; label: string };
type DeptPending = { sourceId: string; targetId: string };
type PeoplePending = { personIds: string[]; targetDeptId: string; snapshot: OrgSnapshot };

export function SandboxPage() {
  const { ready, workspace, commit } = useWorkspace();
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("dept");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [instance, setInstance] = useState<ReactFlowInstance<Node<DeptNodeData>, Edge> | null>(null);
  const [collabOn, setCollabOn] = useState(false);
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [deptPending, setDeptPending] = useState<DeptPending | null>(null);
  const [peoplePending, setPeoplePending] = useState<PeoplePending | null>(null);
  const [preview, setPreview] = useState<{ snapshot: OrgSnapshot; label: string } | null>(null);
  const [plans, setPlans] = useState<StructurePlan[]>([]);
  const [planManagerId, setPlanManagerId] = useState<string | null>(null);
  const [noticeIds, setNoticeIds] = useState<string[]>([]);
  const [dismissedBubbles, setDismissedBubbles] = useState<string[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [banner, setBanner] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [chatSeed, setChatSeed] = useState<{ id: number; text: string } | null>(null);
  const [mobileSheet, setMobileSheet] = useState<null | "tools" | "dept" | "alerts">(null);
  const [showEditHint, setShowEditHint] = useState(false);
  const narrow = useNarrow();

  const scenario = workspace ? activeScenario(workspace) : null;
  const baseline = workspace ? baselineScenario(workspace) : null;
  const displaySnapshot = preview?.snapshot ?? scenario?.snapshot ?? null;

  useEffect(() => {
    setCollabOn(readCollabView(window.localStorage));
  }, []);

  useEffect(() => {
    if (!narrow) {
      setShowEditHint(false);
      return;
    }
    setShowEditHint(!readMobileEditHintDismissed(window.localStorage));
  }, [narrow]);

  function dismissEditHint() {
    writeMobileEditHintDismissed(window.localStorage);
    setShowEditHint(false);
  }

  function fitCanvas() {
    instance?.fitView({ padding: 0.2, duration: 400 });
  }

  function setCollabView(visible: boolean) {
    setCollabOn(visible);
    writeCollabView(window.localStorage, visible);
  }

  const importedAt = workspace?.importMeta.importedAt ?? "";
  useEffect(() => {
    setCollapsed(null);
    setSelectedId(null);
    setFocusId(null);
    setPreview(null);
    setPlans([]);
    setImpact(null);
    setPicked([]);
    if (!workspace) return;
    const current = activeScenario(workspace);
    const wide = evaluateRules(current.snapshot, workspace.settings.thresholds, current.ignoredCodes).find((issue) => issue.code === "span_wide");
    setNoticeIds(wide?.departmentIds[0] ? [wide.departmentIds[0]] : []);
    // 只在换了一份花名册时重置视图。workspace 跟着 importedAt 一起变。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDeptPending(null);
      setPeoplePending(null);
      setPreview(null);
      setDragPositions({});
      setHoverId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const defaultCollapsed = useMemo(
    () => new Set((displaySnapshot?.departments ?? []).filter((department) => department.path.length >= 3).map((department) => department.id)),
    [displaySnapshot],
  );
  const collapsedIds = collapsed ?? defaultCollapsed;

  const issues = useMemo(() => {
    if (!displaySnapshot || !workspace || !scenario) return [];
    return evaluateRules(displaySnapshot, workspace.settings.thresholds, scenario.ignoredCodes);
  }, [displaySnapshot, workspace, scenario]);

  const metrics = scenario ? orgMetrics(scenario.snapshot) : null;
  const baseMetrics = baseline ? orgMetrics(baseline.snapshot) : null;
  const delta = metrics && baseMetrics ? diffMetrics(metrics, baseMetrics) : null;
  const rollup = scenario && workspace ? scenarioRollup(scenario, workspace.settings) : null;
  const baseRollup = baseline && workspace ? scenarioRollup(baseline, workspace.settings) : null;
  const collabPairs = useMemo(
    () => (workspace && displaySnapshot ? scoredCollaboration(workspace.collab, displaySnapshot) : []),
    [workspace, displaySnapshot],
  );

  const graph = useMemo(() => {
    if (!scenario || !workspace || !displaySnapshot) return { nodes: [] as Node<DeptNodeData>[], edges: [] as Edge[] };
    const boxes = layoutDepartments(displaySnapshot.departments, collapsedIds);
    const visible = new Set(boxes.map((box) => box.id));
    const headcounts = displaySnapshot.departments.map((department) => peopleInDepartment(displaySnapshot.people, department.path).length);
    const costs = displaySnapshot.departments.map((department) =>
      peopleInDepartment(displaySnapshot.people, department.path).reduce((sum, person) => sum + (person.annualCost ?? 0), 0),
    );
    const maxHeadcount = Math.max(1, ...headcounts);
    const maxCost = Math.max(1, ...costs);
    const needle = query.trim();
    const nodes: Node<DeptNodeData>[] = boxes.map((box) => {
      const department = displaySnapshot.departments.find((item) => item.id === box.id)!;
      const members = peopleInDepartment(displaySnapshot.people, department.path);
      const head = displaySnapshot.people.find((person) => person.id === department.headId);
      const span = head ? directReports(displaySnapshot, head.id).length : null;
      const labor = members.reduce((sum, person) => sum + (person.annualCost ?? 0), 0);
      const hasCost = members.some((person) => person.annualCost != null);
      const matched =
        !needle ||
        department.name.includes(needle) ||
        (head?.name.includes(needle) ?? false) ||
        members.some((person) => person.name.includes(needle) || person.title.includes(needle));
      const badges = issues
        .filter((issue) => issue.departmentIds.includes(department.id))
        .slice(0, 2)
        .map((issue) => ({
          label: issue.title,
          tone: issue.severity === "red" ? ("bad" as const) : issue.severity === "yellow" ? ("warn" as const) : ("info" as const),
        }));
      const accent =
        colorMode === "dept"
          ? departmentAccent(department.path)
          : scaleAccent(colorMode, colorMode === "headcount" ? members.length : labor, colorMode === "headcount" ? maxHeadcount : maxCost);
      const issueHere = issues.find((issue) => issue.departmentIds.includes(department.id) && !dismissedBubbles.includes(issue.id));
      const showBubble = noticeIds.includes(department.id) && issueHere;
      const bubble: DeptBubble | null = showBubble
        ? {
            tone: issueHere.severity,
            kicker: issueHere.severity === "red" ? "必须处理" : issueHere.severity === "yellow" ? "建议关注" : "提示信息",
            message: issueHere.message,
            canSplit: issueHere.code === "span_wide",
            onSplit: () => openSplit(issueHere),
            onIgnore: () => ignore(issueHere),
            onChat: () => talkAbout(issueHere),
          }
        : null;
      const dragged = dragPositions[department.id];
      return {
        id: department.id,
        type: "dept",
        position: dragged ?? { x: box.x, y: box.y },
        width: NODE_W,
        height: NODE_H,
        zIndex: bubble ? 20 : hoverId === department.id ? 5 : 1,
        style: { overflow: "visible" },
        data: {
          name: department.name,
          head: head ? `负责人 ${head.name} · ${head.title}` : "暂无负责人",
          headcount: members.length,
          span: span == null ? "—" : String(span),
          cost: !hasCost ? "成本未提供" : `人力 ${formatCny(labor)}`,
          accent,
          active: selectedId === department.id || focusId === department.id,
          dimmed: Boolean(needle) && !matched,
          collapsed: collapsedIds.has(department.id),
          childCount: childIds(displaySnapshot.departments, department.id).length,
          dropHover: hoverId === department.id,
          badges,
          bubble,
          onToggle: () =>
            setCollapsed((current) => {
              const next = new Set(current ?? collapsedIds);
              if (next.has(department.id)) next.delete(department.id);
              else next.add(department.id);
              return next;
            }),
          onDropPeople: (personIds) => stagePeople(personIds, department.id),
        },
      };
    });
    const edges: Edge[] = displaySnapshot.departments
      .filter((department) => department.parentId && visible.has(department.id) && visible.has(department.parentId))
      .map((department) => ({
        id: `${department.parentId}-${department.id}`,
        source: department.parentId!,
        target: department.id,
        type: "smoothstep",
        style: { stroke: "#C7D2FE", strokeWidth: 1.5 },
      }));
    if (collabOn && workspace.collab) {
      for (const link of canvasLinks(displaySnapshot, collabPairs, visible)) {
        if (!visible.has(link.aId) || !visible.has(link.bId) || link.aId === link.bId) continue;
            edges.push({
              id: `collab-${link.aId}-${link.bId}`,
              source: link.aId,
              target: link.bId,
              type: "collab",
              zIndex: 5,
              data: { score: link.score } satisfies CollabEdgeData,
            });
      }
    }
    return { nodes, edges };
    // openSplit / ignore / talkAbout / stagePeople 都读最新的 workspace，跟着这次渲染走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, workspace, displaySnapshot, collapsedIds, colorMode, query, selectedId, focusId, issues, collabOn, collabPairs, dragPositions, hoverId, noticeIds, dismissedBubbles]);

  function locate(issue: OrgIssue) {
    const departmentId = issue.departmentIds[0];
    if (!departmentId || !displaySnapshot) return;
    setCollapsed((current) => {
      const next = new Set(current ?? collapsedIds);
      let cursor = displaySnapshot.departments.find((department) => department.id === departmentId);
      const guard = new Set<string>();
      while (cursor?.parentId && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        next.delete(cursor.parentId);
        cursor = displaySnapshot.departments.find((department) => department.id === cursor?.parentId);
      }
      return next;
    });
    setSelectedId(departmentId);
    setFocusId(departmentId);
    setNoticeIds((current) => (current.includes(departmentId) ? current : [...current, departmentId]));
  }

  function ignore(issue: OrgIssue) {
    if (!workspace || !scenario) return;
    commit(
      updateScenario(workspace, scenario.id, (current) => ({
        ...current,
        ignoredCodes: current.ignoredCodes.includes(issue.code) ? current.ignoredCodes : [...current.ignoredCodes, issue.code],
      })),
      `忽略了「${issue.title}」这类提醒`,
    );
    setDismissedBubbles((current) => [...current, issue.id]);
  }

  function talkAbout(issue: OrgIssue) {
    setPanelOpen(true);
    setChatSeed({ id: Date.now(), text: `请用口语解释这条结构提醒（${issue.title}），并说明我可以怎么改、改完如何撤销。不要点名个人。` });
    locate(issue);
  }

  function openSplit(issue: OrgIssue) {
    if (!displaySnapshot) return;
    const managerId = issue.personIds[0];
    if (!managerId) return;
    const next = proposeSpanRelief(displaySnapshot, managerId);
    setPlanManagerId(managerId);
    setPlans(next);
    setPanelOpen(true);
    if (next.length === 0) setBanner("直接下级太少，没有可以预览的拆分。");
    locate(issue);
  }

  function writeSnapshot(label: string, snapshot: OrgSnapshot, affected: string[]) {
    if (!workspace || !scenario) return;
    const drafted = ensureDraft(workspace);
    const current = drafted.workspace.scenarios.find((item) => item.id === drafted.scenarioId) ?? scenario;
    const before = orgMetrics(current.snapshot);
    const after = orgMetrics(snapshot);
    const next = updateScenario(drafted.workspace, drafted.scenarioId, (item) => ({ ...item, snapshot }));
    commit(next, drafted.redirected ? `${label}（基线只读，已写入方案 A）` : label);
    setImpact({ before, after, label });
    setNoticeIds(affected);
    setPreview(null);
    setPlans([]);
    setDeptPending(null);
    setPeoplePending(null);
    setDragPositions({});
    setHoverId(null);
    setBanner("");
  }

  function applyDept(mode: "reparent" | "merge") {
    if (!deptPending || !displaySnapshot) return;
    const result =
      mode === "reparent"
        ? reparentDepartment(displaySnapshot, deptPending.sourceId, deptPending.targetId)
        : mergeDepartments(displaySnapshot, deptPending.sourceId, deptPending.targetId);
    if (!result.ok) {
      setBanner(result.message);
      setDeptPending(null);
      setDragPositions({});
      return;
    }
    const source = displaySnapshot.departments.find((item) => item.id === deptPending.sourceId);
    const target = displaySnapshot.departments.find((item) => item.id === deptPending.targetId);
    const verb = mode === "reparent" ? "挂到" : "并入";
    writeSnapshot(`把${source?.name ?? "部门"}${verb}${target?.name ?? "部门"}`, result.snapshot, [deptPending.sourceId, deptPending.targetId]);
  }

  function stagePeople(personIds: string[], targetDeptId: string) {
    if (!displaySnapshot || preview) {
      setBanner("先确认或取消当前预览，再调整人员。");
      return;
    }
    const result = movePeople(displaySnapshot, personIds, targetDeptId);
    if (!result.ok) {
      setBanner(result.message);
      return;
    }
    setPeoplePending({ personIds, targetDeptId, snapshot: result.snapshot });
    setBanner("");
  }

  function onNodesChange(changes: NodeChange<Node<DeptNodeData>>[]) {
    setDragPositions((current) => {
      let changed = false;
      const next = { ...current };
      for (const change of changes) {
        if (change.type !== "position" || !change.position || !change.dragging) continue;
        const prev = next[change.id];
        if (prev && prev.x === change.position.x && prev.y === change.position.y) continue;
        next[change.id] = change.position;
        changed = true;
      }
      return changed ? next : current;
    });
  }

  function onNodeDrag(_event: unknown, node: Node) {
    const cx = node.position.x + NODE_W / 2;
    const cy = node.position.y + NODE_H / 2;
    const hit = graph.nodes.find((other) => {
      if (other.id === node.id) return false;
      return cx >= other.position.x && cx <= other.position.x + NODE_W && cy >= other.position.y && cy <= other.position.y + NODE_H;
    });
    setHoverId(hit?.id ?? null);
  }

  function onNodeDragStop(_event: unknown, node: Node) {
    const cx = node.position.x + NODE_W / 2;
    const cy = node.position.y + NODE_H / 2;
    const hit = graph.nodes.find((other) => {
      if (other.id === node.id) return false;
      const origin = dragPositions[other.id] ? other.position : other.position;
      return cx >= origin.x && cx <= origin.x + NODE_W && cy >= origin.y && cy <= origin.y + NODE_H;
    });
    setDragPositions({});
    setHoverId(null);
    if (hit) setDeptPending({ sourceId: node.id, targetId: hit.id });
  }

  async function onCollabFile(file: File) {
    if (!workspace) return;
    try {
      const sheets = parseWorkbook(await file.arrayBuffer());
      const bundle: CollabBundle = collabBundleFromSheets(sheets, {
        sample: file.name.includes("示例数据"),
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      if (bundle.pairs.length === 0 && bundle.okrs.length === 0 && bundle.goals.length === 0) {
        setBanner("没有读到协作次数或目标。请使用人A、人B、消息次数、共同会议次数、OKR对齐次数。");
        return;
      }
      const ignored = [...bundle.ignoredContentHeaders, ...bundle.ignoredRankHeaders];
      commit({ ...workspace, collab: bundle }, `导入协作统计${ignored.length ? `，已忽略 ${ignored.join("、")}` : ""}`);
      setCollabView(true);
      setBanner(ignored.length ? `已忽略内容或评级列：${ignored.join("、")}。这些内容没有保存。` : "");
    } catch {
      setBanner("协作文件解析失败。");
    }
  }

  if (!ready) {
    return (
      <Shell crumb="沙盘">
        <p className="p-6 text-sm text-muted">正在打开沙盘…</p>
      </Shell>
    );
  }

  if (!workspace || !scenario || !displaySnapshot || !metrics || !delta || !rollup || !baseRollup) {
    return (
      <Shell crumb="沙盘">
        <div className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-xl font-semibold">还没有基线</h1>
          <p className="mt-2 text-sm leading-6 text-muted">先导入花名册，或直接载入星澜科技示例。确认架构后就会回到这里。</p>
          <Link href="/" className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-white">
            去导入
          </Link>
        </div>
      </Shell>
    );
  }

  const selected = displaySnapshot.departments.find((department) => department.id === selectedId) ?? null;
  const selectedPeople = selected ? displaySnapshot.people.filter((person) => person.departmentPath.join("/") === selected.path.join("/")) : [];
  const seePay = canSeeIndividualPay(workspace.settings.viewerRole);
  const seeCard = canSeeLeaderCard(workspace.settings.viewerRole);
  const head = selected ? displaySnapshot.people.find((person) => person.id === selected.headId) : undefined;
  const collaborators = head ? leaderCollaborators(displaySnapshot, head.id, collabPairs) : [];
  const sourceDept = deptPending ? displaySnapshot.departments.find((item) => item.id === deptPending.sourceId) : null;
  const targetDept = deptPending ? displaySnapshot.departments.find((item) => item.id === deptPending.targetId) : null;
  const peopleTarget = peoplePending ? displaySnapshot.departments.find((item) => item.id === peoplePending.targetDeptId) : null;
  const previewMetrics = preview ? orgMetrics(preview.snapshot) : null;

  return (
    <Shell crumb="沙盘主页">
      <div className="flex h-[calc(100dvh-var(--app-header,7.5rem))] min-h-0 flex-col lg:min-h-[680px]">
        <div className="flex flex-col gap-2 border-b border-line bg-white px-3 py-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3 lg:px-4 lg:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <ScenarioSwitcher />
            </div>
          <button
            type="button"
            aria-pressed={collabOn}
            onClick={() => setCollabView(!collabOn)}
            className={cx(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-medium",
              collabOn ? "border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]" : "border-line bg-white text-ink",
            )}
          >
            <span className={cx("relative h-5 w-9 rounded-full", collabOn ? "bg-collab" : "bg-[#E6E8F0]")} aria-hidden>
              <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow", collabOn ? "left-4" : "left-0.5")} />
            </span>
            协作视图
          </button>
          </div>
          <div className="flex gap-2 overflow-x-auto lg:min-w-0 lg:flex-1 lg:flex-wrap">
            <Metric label="总人数" value={String(metrics.headcount)} delta={formatDeltaNumber(delta.headcount)} />
            <Metric label="层级数" value={String(metrics.layers)} delta={formatDeltaNumber(delta.layers)} />
            <Metric label="平均管理幅度" value={round1(metrics.avgSpan).toString()} delta={formatDeltaNumber(delta.avgSpan, 1)} />
            <Metric
              label="人力成本"
              value={metrics.laborCost == null ? "未提供" : formatCny(metrics.laborCost)}
              delta={formatDeltaMoney(delta.laborCost)}
            />
            <Metric label="算力成本" value={formatCny(rollup.compute)} delta={formatDeltaMoney(rollup.compute - baseRollup.compute)} />
          </div>
          {scenario.kind === "draft" && (
            <Button
              variant="secondary"
              onClick={() => {
                const base = baselineScenario(workspace);
                commit(
                  updateScenario(workspace, scenario.id, (current) => ({
                    ...current,
                    snapshot: structuredClone(base.snapshot),
                    decompositions: {},
                    ignoredCodes: [],
                  })),
                  `把${scenario.name}重置为基线`,
                );
                setPreview(null);
                setNoticeIds([]);
                setImpact(null);
              }}
            >
              重置此方案
            </Button>
          )}
        </div>
        <div className="flex min-h-0 flex-1">
          <div
            className={cx(
              "flex-col gap-3 overflow-auto bg-white p-3 lg:flex lg:w-[220px] lg:shrink-0 lg:border-r lg:border-line",
              mobileSheet === "tools"
                ? "fixed inset-x-0 bottom-12 z-40 flex max-h-[52vh] rounded-t-2xl border border-line shadow-card lg:static lg:bottom-auto lg:z-auto lg:max-h-none lg:rounded-none lg:shadow-none"
                : "hidden",
            )}
          >
            <div className="flex items-center justify-between lg:hidden">
              <div className="text-sm font-semibold">画布工具</div>
              <button type="button" className="inline-flex min-h-10 items-center px-2 text-sm text-muted" onClick={() => setMobileSheet(null)}>
                关闭
              </button>
            </div>
            <label className="text-xs font-medium text-muted">
              搜索部门、姓名或岗位
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如 客户成功"
                className="mt-1 min-h-10 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <div>
              <div className="mb-1 text-xs font-medium text-muted">着色</div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4F5F9] p-1 text-xs">
                {(
                  [
                    ["dept", "部门"],
                    ["headcount", "人数"],
                    ["cost", "成本"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={cx("min-h-10 rounded-lg", colorMode === mode ? "bg-white font-medium text-ink shadow-sm" : "text-muted")}
                    onClick={() => setColorMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="secondary" onClick={fitCanvas}>
              适应画布
            </Button>
            <Button variant="secondary" onClick={() => setCollapsed(new Set())}>
              展开全部
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setCollapsed(new Set(displaySnapshot.departments.filter((department) => department.path.length >= 3).map((department) => department.id)))
              }
            >
              收起到中心
            </Button>
            <label className="text-xs text-muted">
              导入协作统计
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="mt-1 block w-full max-w-full text-[11px]"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onCollabFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <div className="space-y-1 text-[11px] leading-5">
              <a className="block text-primary" href="/sample-data/04-星澜科技-协作与目标-示例数据.xlsx" download>
                下载星澜科技协作示例
              </a>
              <a className="block text-primary" href="/sample-data/00-协作统计模板-示例数据.csv" download>
                协作次数模板
              </a>
              <a className="block text-primary" href="/sample-data/00-目标OKR模板-示例数据.csv" download>
                OKR 模板
              </a>
              <a className="block text-primary" href="/sample-data/00-绩效目标权重模板-示例数据.csv" download>
                绩效权重模板
              </a>
            </div>
            <p className="mt-auto hidden text-xs leading-5 text-muted lg:block">拖部门到另一个部门上，可以选择挂到下面或合并。把人拖到部门上，会先预览再确认。Esc 取消。</p>
            <p className="text-xs leading-5 text-muted lg:hidden">手机上可以查看、切换方案和处理提醒。拖拽改架构请用电脑。</p>
          </div>
          <div className="relative min-h-0 min-w-0 flex-1 bg-[#F8F9FD]">
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-col items-start gap-2">
              {workspace.importMeta.sampleLabel && (
                <div className="rounded-full bg-primarySoft px-2.5 py-1 text-[11px] font-medium text-primary">
                  示例数据 · {workspace.importMeta.sampleLabel}
                </div>
              )}
              {showEditHint && (
                <div className="pointer-events-auto max-w-sm rounded-2xl border border-line bg-white px-3 py-2 text-xs leading-5 text-ink shadow-card lg:hidden">
                  在手机上适合查看、切换方案和处理提醒。拖拽调整架构，用电脑更合适。
                  <button type="button" className="ml-2 inline-flex min-h-10 items-center font-medium text-primary" onClick={dismissEditHint}>
                    知道了
                  </button>
                </div>
              )}
            </div>
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(flow) => {
                setInstance(flow);
                flow.fitView({ padding: 0.18 });
              }}
              minZoom={0.12}
              maxZoom={1.4}
              panOnDrag
              zoomOnPinch
              zoomOnScroll
              preventScrolling
              selectionOnDrag={false}
              nodesDraggable={!narrow && !preview && !deptPending && !peoplePending}
              nodesConnectable={false}
              elementsSelectable
              onNodesChange={onNodesChange}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_, node) => {
                setSelectedId(node.id);
                setFocusId(node.id);
                if (narrow) setMobileSheet("dept");
              }}
              proOptions={{ hideAttribution: false }}
            >
              <Background gap={22} color="#E7E9F2" />
              <FocusOnNode focusId={focusId} />
            </ReactFlow>
            {selected && (
              <div
                className={cx(
                  "flex-col gap-2 overflow-auto bg-white lg:absolute lg:bottom-3 lg:left-3 lg:top-12 lg:z-10 lg:flex lg:w-[320px] lg:bg-transparent lg:pr-1",
                  mobileSheet === "dept"
                    ? "fixed inset-x-0 bottom-12 z-40 flex max-h-[52vh] rounded-t-2xl border border-line p-3 shadow-card lg:bottom-3 lg:right-auto lg:top-12 lg:z-10 lg:max-h-none lg:w-[320px] lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none"
                    : "hidden",
                )}
              >
                <div className="flex items-center justify-between lg:hidden">
                  <div className="text-sm font-semibold">部门与负责人</div>
                  <button type="button" className="inline-flex min-h-10 items-center px-2 text-sm text-muted" onClick={() => setMobileSheet(null)}>
                    关闭
                  </button>
                </div>
                <LeaderCard
                  sample={Boolean(workspace.collab?.sample || workspace.importMeta.sampleLabel)}
                  locked={!seeCard}
                  title={head?.title ?? "暂无负责人"}
                  name={head?.name ?? "未指定"}
                  department={selected.name}
                  okr={head && seeCard ? okrFor(workspace.collab, head.name) : null}
                  goals={head && seeCard ? goalsFor(workspace.collab, head.name) : []}
                  collaborators={seeCard ? collaborators : []}
                  updatedAt={workspace.collab?.updatedAt ?? ""}
                  windowDays={workspace.collab?.windowDays ?? 90}
                />
                <div className="rounded-2xl border border-line bg-white p-3 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{selected.name}</div>
                      <div className="text-xs text-muted">{selected.path.join(" / ")}</div>
                    </div>
                    <button className="inline-flex min-h-10 items-center px-2 text-xs text-muted" onClick={() => setSelectedId(null)}>
                      关闭
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted">按住卡片拖到别的部门。下面的人也可以拖过去，Shift 点选多人。子树共 {peopleInDepartment(displaySnapshot.people, selected.path).length} 人。</p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                    {selectedPeople.map((person) => (
                      <li
                        key={person.id}
                        draggable
                        onDragStart={(event) => {
                          const ids = picked.includes(person.id) ? picked : [person.id];
                          event.dataTransfer.setData("application/x-people", JSON.stringify(ids));
                          event.dataTransfer.setData("text/plain", ids.join(","));
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={(event) => {
                          if (!event.shiftKey) return;
                          setPicked((current) => (current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]));
                        }}
                        className={cx(
                          "flex min-h-10 cursor-grab items-center justify-between gap-2 rounded-lg px-2",
                          picked.includes(person.id) ? "bg-primarySoft" : "bg-[#F8F9FD]",
                        )}
                      >
                        <span>
                          {person.name}
                          <span className="text-muted"> · {person.title}</span>
                        </span>
                        {seePay && person.annualCost != null && <span className="text-muted">{formatCny(person.annualCost)}</span>}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/roles?title=${encodeURIComponent(head?.title || selectedPeople[0]?.title || "")}`}
                    className="mt-2 inline-flex min-h-10 items-center text-xs font-medium text-primary"
                  >
                    拆解这个部门的岗位
                  </Link>
                </div>
              </div>
            )}
            {collabOn && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-3 py-2 text-[11px] leading-5 text-[#6D28D9] shadow-card">
                部门协作线 {canvasLinks(displaySnapshot, collabPairs, new Set(graph.nodes.map((node) => node.id))).length} 条 · 线越粗越强 · 仅部门间 · 近 {workspace.collab?.windowDays ?? 90} 天
                {workspace.importMeta.sampleLabel ? " · 示例数据" : ""}
              </div>
            )}
            {(preview || impact) && (
              <div className="absolute left-1/2 top-12 z-10 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-white px-4 py-3 shadow-card">
                <div className="text-xs font-medium text-primary">{preview ? `正在预览：${preview.label}` : impact?.label}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-4">
                  <ImpactCell label="人数" before={impact?.before.headcount ?? metrics.headcount} after={(previewMetrics ?? impact?.after)?.headcount ?? metrics.headcount} />
                  <ImpactCell label="层级" before={impact?.before.layers ?? metrics.layers} after={(previewMetrics ?? impact?.after)?.layers ?? metrics.layers} />
                  <ImpactCell
                    label="平均幅度"
                    before={round1(impact?.before.avgSpan ?? metrics.avgSpan)}
                    after={round1((previewMetrics ?? impact?.after)?.avgSpan ?? metrics.avgSpan)}
                  />
                  <ImpactCell
                    label="人力成本"
                    before={formatCny((impact?.before.laborCost ?? metrics.laborCost) ?? null)}
                    after={formatCny(((previewMetrics ?? impact?.after)?.laborCost ?? metrics.laborCost) ?? null)}
                  />
                </div>
                {preview && (
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setPreview(null)}>
                      取消预览
                    </Button>
                    <Button
                      className="px-2 py-1 text-xs"
                      onClick={() => {
                        const managerDept = displaySnapshot.people.find((person) => person.id === planManagerId);
                        const deptId = displaySnapshot.departments.find((item) => item.path.join("/") === managerDept?.departmentPath.join("/"))?.id;
                        writeSnapshot(preview.label, preview.snapshot, deptId ? [deptId] : []);
                      }}
                    >
                      应用到方案
                    </Button>
                  </div>
                )}
              </div>
            )}
            {banner && <div className="absolute bottom-16 left-4 z-10 max-w-sm rounded-xl bg-[#111827] px-3 py-2 text-xs text-white">{banner}</div>}
            {deptPending && sourceDept && targetDept && (
              <div className="absolute left-1/2 top-1/2 z-30 w-[min(320px,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="text-sm font-semibold">调整「{sourceDept.name}」</div>
                <p className="mt-1 text-xs leading-5 text-muted">放到「{targetDept.name}」。可以挂成下级，也可以把人和子部门并进去。取消不会改架构。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => applyDept("reparent")}>挂到下面</Button>
                  <Button variant="secondary" onClick={() => applyDept("merge")}>
                    合并进来
                  </Button>
                  <Button variant="ghost" onClick={() => setDeptPending(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}
            {peoplePending && peopleTarget && (
              <div className="absolute left-1/2 top-1/2 z-30 w-[min(320px,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="text-sm font-semibold">调整 {peoplePending.personIds.length} 人的归属</div>
                <p className="mt-1 text-xs leading-5 text-muted">将进入「{peopleTarget.name}」，直属上级改为该部门负责人。确认后写入当前方案，可以撤销。</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => writeSnapshot(`把 ${peoplePending.personIds.length} 人调整到${peopleTarget.name}`, peoplePending.snapshot, [peoplePending.targetDeptId])}>
                    确认
                  </Button>
                  <Button variant="ghost" onClick={() => setPeoplePending(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
          <AiPanel
            issues={issues}
            metrics={previewMetrics ?? metrics}
            collapsed={narrow ? mobileSheet !== "alerts" : !panelOpen}
            mobileChrome="none"
            onToggle={() => {
              if (narrow) setMobileSheet((current) => (current === "alerts" ? null : "alerts"));
              else setPanelOpen((value) => !value);
            }}
            onLocate={locate}
            onIgnore={ignore}
            onSplit={openSplit}
            plans={plans}
            chatSeed={chatSeed}
            onPreviewPlan={(plan) => {
              setPreview({ snapshot: plan.snapshot, label: plan.title });
              setImpact({ before: orgMetrics(scenario.snapshot), after: orgMetrics(plan.snapshot), label: plan.title });
              const fresh = evaluateRules(plan.snapshot, workspace.settings.thresholds, scenario.ignoredCodes);
              setNoticeIds([...new Set(fresh.map((issue) => issue.departmentIds[0]).filter((id): id is string => Boolean(id)))].slice(0, 4));
            }}
            onApplyPlan={(plan) => writeSnapshot(plan.title, plan.snapshot, noticeIds)}
          />
        </div>
        {mobileSheet && mobileSheet !== "alerts" && (
          <button type="button" className="fixed inset-0 z-30 bg-[#101828]/30 lg:hidden" aria-label="关闭面板" onClick={() => setMobileSheet(null)} />
        )}
        <nav className="relative z-50 grid h-12 shrink-0 grid-cols-4 border-t border-line bg-white lg:hidden" aria-label="沙盘操作">
          <button type="button" className="min-h-12 text-sm font-medium text-ink" onClick={fitCanvas}>
            适应画布
          </button>
          <button
            type="button"
            aria-pressed={mobileSheet === "tools"}
            className={cx("min-h-12 text-sm font-medium", mobileSheet === "tools" ? "text-primary" : "text-ink")}
            onClick={() => setMobileSheet((current) => (current === "tools" ? null : "tools"))}
          >
            工具
          </button>
          <button
            type="button"
            aria-pressed={mobileSheet === "dept"}
            disabled={!selected}
            className={cx("min-h-12 truncate px-1 text-sm font-medium disabled:text-[#D0D5DD]", mobileSheet === "dept" ? "text-primary" : "text-ink")}
            onClick={() => setMobileSheet((current) => (current === "dept" ? null : "dept"))}
          >
            {selected ? selected.name : "部门"}
          </button>
          <button
            type="button"
            aria-pressed={mobileSheet === "alerts"}
            className={cx("min-h-12 text-sm font-medium", mobileSheet === "alerts" ? "text-primary" : "text-ink")}
            onClick={() => setMobileSheet((current) => (current === "alerts" ? null : "alerts"))}
          >
            提醒 {issues.length}
          </button>
        </nav>
      </div>
    </Shell>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="min-w-[120px] shrink-0 rounded-xl border border-line px-3 py-1.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{delta}</div>
    </div>
  );
}

function ImpactCell({ label, before, after }: { label: string; before: string | number; after: string | number }) {
  return (
    <div className="rounded-xl bg-[#F8F9FD] px-2 py-1.5">
      <div className="text-muted">{label}</div>
      <div className="text-ink">
        {before} → {after}
      </div>
    </div>
  );
}

function FocusOnNode({ focusId }: { focusId: string | null }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!focusId) return;
    const timer = window.setTimeout(() => {
      fitView({ nodes: [{ id: focusId }], duration: 450, padding: 0.45, maxZoom: 1.05 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focusId, fitView]);
  return null;
}
