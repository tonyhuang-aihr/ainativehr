"use client";

import { Shell } from "@/components/shell";
import { Badge, Button, Card, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { collabBundleFromSheets } from "@/lib/collab/parse";
import { buildImportStory } from "@/lib/import/story";
import { findDataIssues, type DataIssue } from "@/lib/import/dataIssues";
import { inferOrg } from "@/lib/import/inferTree";
import { choosePeopleSheet, headerFor, matchColumns } from "@/lib/import/matchColumns";
import { parsePastedTable, parseWorkbook } from "@/lib/import/parseWorkbook";
import { tableToPeople } from "@/lib/import/rows";
import { orgMetrics, peopleInDepartment } from "@/lib/org/metrics";
import { FIELD_LABEL, REQUIRED_FIELDS, type CollabBundle, type ColumnField, type ColumnMatch, type RawPerson, type SheetTable } from "@/lib/model/types";
import { createWorkspace } from "@/lib/workspace/create";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const SAMPLES = [
  {
    id: "xinglan",
    file: "/sample-data/01-星澜科技-花名册-示例数据.xlsx",
    download: "/sample-data/01-星澜科技-花名册-示例数据.xlsx",
    csv: "/sample-data/01-星澜科技-花名册-示例数据.csv",
    collab: "/sample-data/04-星澜科技-协作与目标-示例数据.xlsx",
    label: "星澜科技（示例数据）",
    title: "星澜科技 · 完整花名册",
    meta: "示例数据 · 约 120 人",
    detail: "多级部门、职级和年度人力成本。故意留了幅度 12、幅度 2、一人部门和 7 层汇报。",
  },
  {
    id: "messy",
    file: "/sample-data/02-凌川贸易-混乱花名册-示例数据.csv",
    download: "/sample-data/02-凌川贸易-混乱花名册-示例数据.csv",
    label: "凌川贸易 · 混乱表（示例数据）",
    title: "凌川贸易 · 混乱花名册",
    meta: "示例数据 · 列名不规范",
    detail: "列名是「汇报人」「组织单元」「担任岗位」。含缺上级、互相汇报、两个张伟。",
  },
  {
    id: "feishu",
    file: "/sample-data/03-凌川贸易-飞书通讯录导出-示例数据.xlsx",
    download: "/sample-data/03-凌川贸易-飞书通讯录导出-示例数据.xlsx",
    label: "凌川贸易 · 飞书导出（示例数据）",
    title: "凌川贸易 · 飞书通讯录",
    meta: "示例数据 · 同一批人",
    detail: "飞书导出样式。上级列叫「直线经理」，文件里还有一张部门表。",
  },
];

const FIELD_OPTIONS: Array<ColumnField | ""> = ["", ...Object.keys(FIELD_LABEL) as ColumnField[]];

type Loaded = {
  filename: string;
  sheets: SheetTable[];
  sheetName: string;
  sampleId: string | null;
  sampleLabel: string | null;
  collab: CollabBundle | null;
};

export function ImportPage() {
  const router = useRouter();
  const { workspace, ai, replaceWorkspace } = useWorkspace();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMatch[]>([]);
  const [people, setPeople] = useState<RawPerson[] | null>(null);
  const [skippedIssueIds, setSkippedIssueIds] = useState<string[]>([]);
  const [skippedRows, setSkippedRows] = useState<{ rowNumber: number; reason: string }[]>([]);
  const [fixLog, setFixLog] = useState<string[]>([]);
  const [phase, setPhase] = useState<"choose" | "map" | "preview">("choose");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [expandTree, setExpandTree] = useState(false);

  const table = loaded?.sheets.find((sheet) => sheet.name === loaded.sheetName) ?? loaded?.sheets[0];
  const issues = useMemo(() => {
    if (!people) return [];
    return findDataIssues(people).filter((issue) => !skippedIssueIds.includes(issue.id));
  }, [people, skippedIssueIds]);
  const org = useMemo(() => (people ? inferOrg(people) : null), [people]);
  const metrics = org ? orgMetrics(org) : null;

  const story = buildImportStory({
    phase: phase === "choose" ? "idle" : phase === "map" ? "map" : "preview",
    filename: loaded?.filename,
    sampleLabel: loaded?.sampleLabel,
    sheetName: table?.name,
    sheetCount: loaded?.sheets.length,
    mapping,
    peopleCount: org?.people.length,
    departmentCount: org?.departments.length,
    layers: metrics?.layers,
    openIssues: issues.length,
    fixedCount: fixLog.filter((item) => !item.startsWith("跳过")).length,
    skippedCount: skippedIssueIds.length,
    skippedRows: skippedRows.length,
    aiMode: ai.mode,
  });

  async function openWorkbook(filename: string, buffer: ArrayBuffer, sample: { id: string; label: string } | null, collab: CollabBundle | null = null) {
    const sheets = parseWorkbook(buffer);
    if (sheets.length === 0) {
      setError("没有读到表格。请确认第一行是列名。");
      return;
    }
    const chosen = choosePeopleSheet(sheets);
    setLoaded({ filename, sheets, sheetName: chosen.name, sampleId: sample?.id ?? null, sampleLabel: sample?.label ?? null, collab });
    setMapping(matchColumns(chosen.headers));
    setPeople(null);
    setSkippedIssueIds([]);
    setSkippedRows([]);
    setFixLog([]);
    setPhase("map");
    setError("");
  }

  async function onFile(file: File) {
    setBusy("正在读取文件");
    try {
      await openWorkbook(file.name, await file.arrayBuffer(), null);
    } catch {
      setError("这个文件解析失败。请换 xlsx、xls 或 csv。");
    } finally {
      setBusy("");
    }
  }

  async function loadSample(sample: (typeof SAMPLES)[number]) {
    setBusy(`正在载入${sample.label}`);
    try {
      const response = await fetch(sample.file);
      if (!response.ok) throw new Error("missing");
      let collab: CollabBundle | null = null;
      const collabFile = "collab" in sample ? sample.collab : undefined;
      if (collabFile) {
        const extra = await fetch(collabFile);
        if (extra.ok) {
          collab = collabBundleFromSheets(parseWorkbook(await extra.arrayBuffer()), { sample: true, updatedAt: "2026-09-30" });
        }
      }
      await openWorkbook(
        sample.file.split("/").pop() ?? sample.file,
        await response.arrayBuffer(),
        { id: sample.id, label: sample.label },
        collab,
      );
    } catch {
      setError("示例文件没有载入。请确认已执行 npm run dev（它会把 sample-data 复制到站点里）。");
    } finally {
      setBusy("");
    }
  }

  function selectSheet(name: string) {
    if (!loaded) return;
    const sheet = loaded.sheets.find((item) => item.name === name);
    if (!sheet) return;
    setLoaded({ ...loaded, sheetName: name });
    setMapping(matchColumns(sheet.headers));
    setPeople(null);
    setPhase("map");
  }

  function assign(header: string, field: ColumnField | "") {
    setMapping((current) => {
      const rest = current.filter((match) => match.header !== header && match.field !== field);
      if (!field) return current.filter((match) => match.header !== header);
      return [...rest, { field, header, confidence: 1, reason: "你手工指定的对应关系" }];
    });
  }

  function confirmMapping() {
    if (!table) return;
    const missing = REQUIRED_FIELDS.filter((field) => !mapping.some((match) => match.field === field));
    if (missing.length > 0) {
      setError(`还差这些列：${missing.map((field) => FIELD_LABEL[field]).join("、")}。可以在下拉框里改对应关系。`);
      return;
    }
    const parsed = tableToPeople(table, mapping);
    if (parsed.people.length === 0) {
      setError("没有读到员工。请检查姓名列是不是对上了。");
      return;
    }
    setPeople(parsed.people);
    setSkippedRows(parsed.skipped);
    setPhase("preview");
    setError("");
  }

  function enterSandbox() {
    if (!org || !loaded || !metrics) return;
    const reds = issues.filter((issue) => issue.severity === "red");
    if (reds.length > 0) {
      const ok = window.confirm(`还有 ${reds.length} 个问题没处理。仍然把当前结果存成基线并进入沙盘？`);
      if (!ok) return;
    }
    const settings = workspace?.settings;
    const next = createWorkspace(
      org,
      {
        filename: loaded.filename,
        importedAt: new Date().toISOString(),
        sampleId: loaded.sampleId,
        sampleLabel: loaded.sampleLabel,
        sheetName: loaded.sheetName,
        peopleCount: org.people.length,
        departmentCount: org.departments.length,
        aiMode: ai.mode,
      },
      settings,
      loaded.collab,
    );
    replaceWorkspace(next);
    router.push("/sandbox");
  }

  return (
    <Shell crumb="新建沙盘 · 导入数据">
      <div className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {error && <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">{error}</div>}
          {busy && <div className="rounded-2xl bg-primarySoft px-4 py-3 text-sm text-primary">{busy}</div>}

          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">从一张花名册开始</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  不用先改列名。至少要有姓名、部门、岗位、直属上级。部门可以写成「研发中心/平台部/数据组」，也可以只写末级名称。
                </p>
              </div>
              <a className="text-sm font-medium text-primary" href="/sample-data/00-导入模板-示例数据.csv" download>
                下载空白模板
              </a>
            </div>
            <div
              className="mt-4 rounded-2xl border border-dashed border-[#C7D2FE] bg-primarySoft/60 px-4 py-6 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) onFile(file);
              }}
            >
              <p className="text-sm text-ink">把 xlsx、xls 或 csv 拖到这里</p>
              <label className="mt-3 inline-flex cursor-pointer rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white">
                选择文件
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onFile(file);
                  }}
                />
              </label>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">或者粘贴表格</div>
              <textarea
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                placeholder="从 Excel 复制一块区域，连表头一起贴过来"
                className="h-24 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  const sheets = parsePastedTable(paste);
                  if (sheets.length === 0 || sheets[0].rows.length === 0) {
                    setError("没有解析出表格。请连同表头一起粘贴。");
                    return;
                  }
                  setLoaded({ filename: "粘贴的表格", sheets, sheetName: sheets[0].name, sampleId: null, sampleLabel: null, collab: null });
                  setMapping(matchColumns(sheets[0].headers));
                  setPeople(null);
                  setPhase("map");
                  setError("");
                }}
              >
                解析粘贴内容
              </Button>
            </div>
          </Card>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold">示例数据</h2>
              <Badge tone="info">虚构，可直接点开</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {SAMPLES.map((sample) => (
                <Card key={sample.id} className="flex flex-col p-4">
                  <div className="text-xs font-medium text-primary">{sample.meta}</div>
                  <h3 className="mt-1 text-sm font-semibold">{sample.title}</h3>
                  <p className="mt-2 flex-1 text-xs leading-5 text-muted">{sample.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="px-2.5 py-1.5 text-xs" onClick={() => loadSample(sample)}>
                      载入
                    </Button>
                    <a className="rounded-xl border border-line px-2.5 py-1.5 text-xs" href={sample.download} download>
                      下载
                    </a>
                    {sample.csv && (
                      <a className="rounded-xl border border-line px-2.5 py-1.5 text-xs" href={sample.csv} download>
                        CSV
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {phase !== "choose" && table && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">列名对应</h2>
                  <p className="mt-1 text-sm text-muted">
                    自动匹配的结果请看一眼。不对就改下拉框。未使用的列会忽略。
                    {loaded && loaded.sheets.length > 1 ? ` 这个文件有 ${loaded.sheets.length} 张表。` : ""}
                  </p>
                </div>
                {loaded && loaded.sheets.length > 1 && (
                  <select
                    className="rounded-xl border border-line px-3 py-2 text-sm"
                    value={loaded.sheetName}
                    onChange={(event) => selectSheet(event.target.value)}
                  >
                    {loaded.sheets.map((sheet) => (
                      <option key={sheet.name} value={sheet.name}>
                        {sheet.name}（{sheet.rows.length} 行）
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-2 font-medium">表头</th>
                      <th className="py-2 font-medium">对应字段</th>
                      <th className="py-2 font-medium">把握</th>
                      <th className="py-2 font-medium">样例</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.headers.map((header) => {
                      const match = mapping.find((item) => item.header === header);
                      const sampleCell = table.rows[0]?.[table.headers.indexOf(header)] ?? "";
                      return (
                        <tr key={header} className="border-t border-line">
                          <td className="py-2 pr-3 font-medium">{header}</td>
                          <td className="py-2 pr-3">
                            <select
                              className="w-full rounded-lg border border-line px-2 py-1.5"
                              value={match?.field ?? ""}
                              onChange={(event) => assign(header, event.target.value as ColumnField | "")}
                            >
                              {FIELD_OPTIONS.map((field) => (
                                <option key={field || "ignore"} value={field}>
                                  {field ? FIELD_LABEL[field] : "不导入"}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted">
                            {!match ? "—" : match.confidence >= 0.95 ? "高" : match.reason.includes("手工") ? "手工" : "中"}
                          </td>
                          <td className="max-w-[180px] truncate py-2 text-xs text-muted">{sampleCell}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={confirmMapping}>确认字段，预览架构</Button>
                <span className="self-center text-xs text-muted">
                  已对应：{REQUIRED_FIELDS.map((field) => `${FIELD_LABEL[field]} ← ${headerFor(mapping, field) ?? "未指定"}`).join(" · ")}
                </span>
              </div>
            </Card>
          )}

          {phase === "preview" && org && (
            <>
              <Card className="p-5">
                <h2 className="text-base font-semibold">导入前要处理的问题</h2>
                <p className="mt-1 text-sm text-muted">用大白话写在这里。可以一键修，也可以跳过。跳过不会卡住。</p>
                {issues.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-[#ECFDF3] px-3 py-3 text-sm text-[#067647]">
                    没有缺上级、汇报成环或重名。管理幅度和层级会到沙盘里再看。
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {issues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onFix={() => {
                          setPeople((current) => (current ? issue.apply(current) : current));
                          setFixLog((log) => [...log, issue.fixLabel]);
                        }}
                        onSkip={() => {
                          setSkippedIssueIds((ids) => [...ids, issue.id]);
                          setFixLog((log) => [...log, `跳过：${issue.title}`]);
                        }}
                      />
                    ))}
                  </div>
                )}
                {skippedRows.length > 0 && (
                  <p className="mt-3 text-xs text-muted">{skippedRows.length} 行没有进入：{skippedRows.slice(0, 3).map((row) => row.reason).join("；")}</p>
                )}
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">架构预览</h2>
                    <p className="mt-1 text-sm text-muted">
                      {org.people.length} 人 · {org.departments.length} 个部门 · 最深 {metrics?.layers} 层
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => setExpandTree((value) => !value)}>
                    {expandTree ? "只看前两层" : "展开全部"}
                  </Button>
                </div>
                <div className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-[#F8F9FD] p-3">
                  {org.departments
                    .filter((department) => !department.parentId)
                    .map((department) => (
                      <TreeNode key={department.id} id={department.id} org={org} depth={0} expandAll={expandTree} />
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={enterSandbox}>确认，进入沙盘</Button>
                  <Button variant="secondary" onClick={() => setPhase("map")}>
                    返回改列
                  </Button>
                  {workspace && (
                    <span className="self-center text-xs text-muted">进入后会替换当前基线。</span>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
        <Card className="p-5 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">AI 做了什么</h2>
            <Badge tone={ai.mode === "llm" ? "good" : "info"}>{ai.mode === "llm" ? "模型" : "离线"}</Badge>
          </div>
          <ol className="mt-4 space-y-4">
            {story.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span
                  className={cx(
                    "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                    item.tone === "good" ? "bg-[#12B76A]" : item.tone === "warn" ? "bg-[#F79009]" : "bg-[#C7D2FE]",
                  )}
                />
                <div>
                  <div className="text-sm font-medium">{item.title}</div>
                  <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {fixLog.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="text-xs font-medium text-muted">刚才的处理</div>
              <ul className="mt-2 space-y-1 text-xs text-[#344054]">
                {fixLog.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function IssueCard({ issue, onFix, onSkip }: { issue: DataIssue; onFix: () => void; onSkip: () => void }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <Badge tone={issue.severity === "red" ? "bad" : "warn"}>{issue.severity === "red" ? "建议先处理" : "可以稍后"}</Badge>
        <span className="text-sm font-medium">{issue.title}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#344054]">{issue.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="px-2.5 py-1.5 text-xs" onClick={onFix}>
          {issue.fixLabel}
        </Button>
        <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={onSkip}>
          {issue.skipLabel}
        </Button>
      </div>
    </div>
  );
}

function TreeNode({
  id,
  org,
  depth,
  expandAll,
}: {
  id: string;
  org: ReturnType<typeof inferOrg>;
  depth: number;
  expandAll: boolean;
}) {
  const department = org.departments.find((item) => item.id === id);
  const [open, setOpen] = useState(depth < 2);
  if (!department) return null;
  const children = org.departments.filter((item) => item.parentId === id);
  const expanded = expandAll || open;
  const count = peopleInDepartment(org.people, department.path).length;
  const head = org.people.find((person) => person.id === department.headId);
  return (
    <div className="mt-1">
      <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white" onClick={() => setOpen((value) => !value)} style={{ paddingLeft: 8 + depth * 16 }}>
        <span className="w-4 text-xs text-muted">{children.length > 0 ? (expanded ? "▾" : "▸") : "·"}</span>
        <span className="text-sm font-medium">{department.name}</span>
        <span className="text-xs text-muted">
          {count} 人{head ? ` · ${head.name}` : ""}
        </span>
      </button>
      {expanded && children.map((child) => <TreeNode key={child.id} id={child.id} org={org} depth={depth + 1} expandAll={expandAll} />)}
    </div>
  );
}
