"use client";

import { AiPanel } from "@/components/ai-panel";
import { ScenarioSwitcher, Shell } from "@/components/shell";
import { DeptNode, type DeptNodeData } from "@/components/sandbox/dept-node";
import { Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { formatCny, formatDeltaMoney, formatDeltaNumber, round1 } from "@/lib/format";
import { canSeeIndividualPay, type OrgIssue } from "@/lib/model/types";
import { departmentAccent, scaleAccent, type ColorMode } from "@/lib/org/color";
import { childIds, layoutDepartments, NODE_H, NODE_W } from "@/lib/org/layout";
import { diffMetrics, directReports, orgMetrics, peopleInDepartment, scenarioRollup } from "@/lib/org/metrics";
import { evaluateRules } from "@/lib/rules/engine";
import { activeScenario, baselineScenario, updateScenario } from "@/lib/workspace/create";
import { Background, ReactFlow, type Edge, type Node, type ReactFlowInstance, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const nodeTypes = { dept: DeptNode };

export function SandboxPage() {
  const { ready, workspace, commit } = useWorkspace();
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("dept");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [instance, setInstance] = useState<ReactFlowInstance<Node<DeptNodeData>, Edge> | null>(null);

  const scenario = workspace ? activeScenario(workspace) : null;
  const baseline = workspace ? baselineScenario(workspace) : null;

  const importedAt = workspace?.importMeta.importedAt ?? "";
  useEffect(() => {
    setCollapsed(null);
    setSelectedId(null);
    setFocusId(null);
  }, [importedAt]);

  const defaultCollapsed = useMemo(
    () => new Set((scenario?.snapshot.departments ?? []).filter((department) => department.path.length >= 3).map((department) => department.id)),
    [scenario],
  );
  const collapsedIds = collapsed ?? defaultCollapsed;

  const issues = useMemo(() => {
    if (!scenario || !workspace) return [];
    return evaluateRules(scenario.snapshot, workspace.settings.thresholds, scenario.ignoredCodes);
  }, [scenario, workspace]);

  const metrics = scenario ? orgMetrics(scenario.snapshot) : null;
  const baseMetrics = baseline ? orgMetrics(baseline.snapshot) : null;
  const delta = metrics && baseMetrics ? diffMetrics(metrics, baseMetrics) : null;
  const rollup = scenario && workspace ? scenarioRollup(scenario, workspace.settings) : null;
  const baseRollup = baseline && workspace ? scenarioRollup(baseline, workspace.settings) : null;

  const graph = useMemo(() => {
    if (!scenario || !workspace) return { nodes: [] as Node<DeptNodeData>[], edges: [] as Edge[] };
    const { snapshot } = scenario;
    const boxes = layoutDepartments(snapshot.departments, collapsedIds);
    const visible = new Set(boxes.map((box) => box.id));
    const headcounts = snapshot.departments.map((department) => peopleInDepartment(snapshot.people, department.path).length);
    const costs = snapshot.departments.map((department) =>
      peopleInDepartment(snapshot.people, department.path).reduce((sum, person) => sum + (person.annualCost ?? 0), 0),
    );
    const maxHeadcount = Math.max(1, ...headcounts);
    const maxCost = Math.max(1, ...costs);
    const needle = query.trim();
    const nodes: Node<DeptNodeData>[] = boxes.map((box) => {
      const department = snapshot.departments.find((item) => item.id === box.id)!;
      const members = peopleInDepartment(snapshot.people, department.path);
      const head = snapshot.people.find((person) => person.id === department.headId);
      const span = head ? directReports(snapshot, head.id).length : null;
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
      return {
        id: department.id,
        type: "dept",
        position: { x: box.x, y: box.y },
        width: NODE_W,
        height: NODE_H,
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
          childCount: childIds(snapshot.departments, department.id).length,
          badges,
          onToggle: () =>
            setCollapsed((current) => {
              const next = new Set(current ?? collapsedIds);
              if (next.has(department.id)) next.delete(department.id);
              else next.add(department.id);
              return next;
            }),
        },
      };
    });
    const edges: Edge[] = snapshot.departments
      .filter((department) => department.parentId && visible.has(department.id) && visible.has(department.parentId))
      .map((department) => ({
        id: `${department.parentId}-${department.id}`,
        source: department.parentId!,
        target: department.id,
        type: "smoothstep",
        style: { stroke: "#C7D2FE", strokeWidth: 1.5 },
      }));
    return { nodes, edges };
  }, [scenario, workspace, collapsedIds, colorMode, query, selectedId, focusId, issues]);

  function locate(issue: OrgIssue) {
    const departmentId = issue.departmentIds[0];
    if (!departmentId || !scenario) return;
    setCollapsed((current) => {
      const next = new Set(current ?? collapsedIds);
      let cursor = scenario.snapshot.departments.find((department) => department.id === departmentId);
      const guard = new Set<string>();
      while (cursor?.parentId && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        next.delete(cursor.parentId);
        cursor = scenario.snapshot.departments.find((department) => department.id === cursor?.parentId);
      }
      return next;
    });
    setSelectedId(departmentId);
    setFocusId(departmentId);
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
  }

  if (!ready) {
    return (
      <Shell crumb="沙盘">
        <p className="p-6 text-sm text-muted">正在打开沙盘…</p>
      </Shell>
    );
  }

  if (!workspace || !scenario || !metrics || !delta || !rollup || !baseRollup) {
    return (
      <Shell crumb="沙盘">
        <div className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-xl font-semibold">还没有基线</h1>
          <p className="mt-2 text-sm leading-6 text-muted">先导入花名册，或直接载入星澜科技示例。确认架构后就会回到这里。</p>
          <Link href="/" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white">
            去导入
          </Link>
        </div>
      </Shell>
    );
  }

  const selected = scenario.snapshot.departments.find((department) => department.id === selectedId);
  const selectedPeople = selected ? peopleInDepartment(scenario.snapshot.people, selected.path) : [];
  const seePay = canSeeIndividualPay(workspace.settings.viewerRole);
  const topIssue = issues[0];

  return (
    <Shell crumb="沙盘主页">
      <div className="flex h-[calc(100vh-7.5rem)] min-h-[680px] flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
          <ScenarioSwitcher />
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <Metric label="总人数" value={String(metrics.headcount)} delta={formatDeltaNumber(delta.headcount)} />
            <Metric label="层级数" value={String(metrics.layers)} delta={formatDeltaNumber(delta.layers)} />
            <Metric label="平均管理幅度" value={round1(metrics.avgSpan).toString()} delta={formatDeltaNumber(delta.avgSpan, 1)} />
            <Metric
              label="人力成本"
              value={metrics.laborCost == null ? "未提供" : formatCny(metrics.laborCost)}
              delta={formatDeltaMoney(delta.laborCost)}
            />
            <Metric
              label="算力成本"
              value={formatCny(rollup.compute)}
              delta={formatDeltaMoney(rollup.compute - baseRollup.compute)}
            />
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
              }}
            >
              重置此方案
            </Button>
          )}
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[220px] shrink-0 flex-col gap-3 border-r border-line bg-white p-3">
            <label className="text-xs font-medium text-muted">
              搜索部门、姓名或岗位
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如 客户成功"
                className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary"
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
                    className={cx("rounded-lg py-1.5", colorMode === mode ? "bg-white font-medium text-ink shadow-sm" : "text-muted")}
                    onClick={() => setColorMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="secondary" onClick={() => instance?.fitView({ padding: 0.2, duration: 400 })}>
              适应画布
            </Button>
            <Button variant="secondary" onClick={() => setCollapsed(new Set())}>
              展开全部
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setCollapsed(new Set(scenario.snapshot.departments.filter((department) => department.path.length >= 3).map((department) => department.id)))
              }
            >
              收起到中心
            </Button>
            <p className="mt-auto text-xs leading-5 text-muted">拖拽改架构、合并和虚线汇报会在下一版接上。现在可以定位问题、切换方案，再去拆岗位。</p>
          </div>
          <div className="relative min-w-0 flex-1 bg-[#F8F9FD]">
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              onInit={(flow) => {
                setInstance(flow);
                flow.fitView({ padding: 0.18 });
              }}
              minZoom={0.12}
              maxZoom={1.4}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={(_, node) => {
                setSelectedId(node.id);
                setFocusId(node.id);
              }}
              proOptions={{ hideAttribution: false }}
            >
              <Background gap={22} color="#E7E9F2" />
              <FocusOnNode focusId={focusId} />
            </ReactFlow>
            {selected && (
              <div className="absolute left-3 top-3 z-10 w-[280px] rounded-2xl border border-line bg-white p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{selected.name}</div>
                    <div className="text-xs text-muted">{selected.path.join(" / ")}</div>
                  </div>
                  <button className="text-xs text-muted" onClick={() => setSelectedId(null)}>
                    关闭
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted">
                  子树 {selectedPeople.length} 人 · 人力 {selectedPeople.some((person) => person.annualCost != null) ? formatCny(selectedPeople.reduce((sum, person) => sum + (person.annualCost ?? 0), 0)) : "未提供"}
                </div>
                <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
                  {selectedPeople.slice(0, 12).map((person) => (
                    <li key={person.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#F8F9FD] px-2 py-1">
                      <span>
                        {person.name}
                        <span className="text-muted"> · {person.title}</span>
                      </span>
                      {seePay && person.annualCost != null && <span className="text-muted">{formatCny(person.annualCost)}</span>}
                    </li>
                  ))}
                </ul>
                {selectedPeople.length > 12 && <p className="mt-1 text-[11px] text-muted">还有 {selectedPeople.length - 12} 人，搜索可以定位。</p>}
                <Link
                  href={`/roles?title=${encodeURIComponent(scenario.snapshot.people.find((person) => person.id === selected.headId)?.title || selectedPeople[0]?.title || "")}`}
                  className="mt-2 inline-flex text-xs font-medium text-primary"
                >
                  拆解这个部门的岗位
                </Link>
              </div>
            )}
            {topIssue && (
              <button
                className="absolute bottom-4 left-4 z-10 max-w-sm rounded-2xl border border-line bg-white px-4 py-3 text-left shadow-card"
                onClick={() => locate(topIssue)}
              >
                <div className="text-xs font-medium text-primary">主动提醒 · 点击定位</div>
                <p className="mt-1 text-sm leading-6 text-[#344054]">{topIssue.message}</p>
              </button>
            )}
          </div>
          <AiPanel
            issues={issues}
            metrics={metrics}
            collapsed={!panelOpen}
            onToggle={() => setPanelOpen((value) => !value)}
            onLocate={locate}
            onIgnore={ignore}
          />
        </div>
      </div>
    </Shell>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="min-w-[120px] rounded-xl border border-line px-3 py-1.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{delta}</div>
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
