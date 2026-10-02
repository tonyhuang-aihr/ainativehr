"use client";

import { Shell } from "@/components/shell";
import { Button, cx } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { canSeeIndividualPay } from "@/lib/model/types";
import { departmentRoster, personInDepartment } from "@/lib/roster/membership";
import { levelLabel, reportingLevel, sortRoster } from "@/lib/roster/order";
import { activeScenario, baselineScenario } from "@/lib/workspace/create";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import * as XLSX from "xlsx";

const PAGE_SIZE = 20;

export function RosterPage() {
  return (
    <Suspense fallback={<Shell crumb="花名册"><p className="p-6 text-sm text-muted">正在打开花名册…</p></Shell>}>
      <RosterBody />
    </Suspense>
  );
}

function RosterBody() {
  const params = useSearchParams();
  const { ready, workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [deptId, setDeptId] = useState(params.get("dept") ?? "");
  const [level, setLevel] = useState("");
  const [place, setPlace] = useState("");
  const [change, setChange] = useState("全部");
  const [compare, setCompare] = useState(true);
  const [page, setPage] = useState(1);

  const scenario = workspace ? activeScenario(workspace) : null;
  const baseline = workspace ? baselineScenario(workspace) : null;

  const rows = useMemo(() => {
    if (!scenario || !baseline) return [];
    const department = scenario.snapshot.departments.find((item) => item.id === deptId);
    const path = department?.path;
    const current = path ? scenario.snapshot.people.filter((person) => personInDepartment(person, path, true)) : scenario.snapshot.people;
    const roster = path
      ? departmentRoster(baseline.snapshot.people, scenario.snapshot.people, path, true)
      : null;
    const departed = compare && roster ? roster.departed : [];
    const universe = [...current, ...departed];
    const baseById = new Map(baseline.snapshot.people.map((person) => [person.id, person]));
    const nowById = new Map(scenario.snapshot.people.map((person) => [person.id, person]));
    return sortRoster(universe, universe).map((person) => {
      const previous = baseById.get(person.id);
      const now = nowById.get(person.id);
      const arrived = roster ? roster.arrivedIds.has(person.id) : previous && path ? !personInDepartment(previous, path, true) : false;
      const left = roster ? roster.departed.some((item) => item.id === person.id) : false;
      let movement = "—";
      if (left && now) movement = `调出 至 ${now.departmentPath.at(-1) ?? ""}`;
      else if (arrived && previous) movement = `调入 自 ${previous.departmentPath.at(-1) ?? ""}`;
      else if (previous && now && previous.managerId !== now.managerId) movement = "换上级";
      else if (previous && now && previous.title !== now.title) movement = "换岗位";
      return { person: now && !left ? now : person, movement, left, level: reportingLevel(universe, person) };
    });
  }, [scenario, baseline, deptId, compare]);

  if (!ready) {
    return (
      <Shell crumb="花名册">
        <p className="p-6 text-sm text-muted">正在打开花名册…</p>
      </Shell>
    );
  }
  if (!workspace || !scenario || !baseline) {
    return (
      <Shell crumb="花名册">
        <div className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-xl font-semibold">还没有花名册</h1>
          <Link href="/" className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm text-white">
            去导入
          </Link>
        </div>
      </Shell>
    );
  }

  const seePay = canSeeIndividualPay(workspace.settings.viewerRole);
  const department = scenario.snapshot.departments.find((item) => item.id === deptId);
  const levels = [...new Set(rows.map((row) => row.person.level).filter(Boolean))].sort();
  const places = [...new Set(rows.map((row) => row.person.location).filter(Boolean))].sort();
  const filtered = rows.filter((row) => {
    const needle = query.trim();
    if (needle && ![row.person.name, row.person.title, row.person.employeeId].some((value) => value.includes(needle))) return false;
    if (level && row.person.level !== level) return false;
    if (place && row.person.location !== place) return false;
    if (change === "调入" && !row.movement.startsWith("调入")) return false;
    if (change === "调出" && !row.movement.startsWith("调出")) return false;
    if (change === "无变动" && row.movement !== "—") return false;
    return true;
  });
  const counted = filtered.filter((row) => !row.left).length;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const inCount = rows.filter((row) => row.movement.startsWith("调入")).length;
  const outCount = rows.filter((row) => row.movement.startsWith("调出")).length;

  function exportFile() {
    const header = ["层级", "姓名", "工号", "部门", "岗位", "职级", "直属上级", "入职时间", "方案变动"];
    if (seePay) header.push("年度人力成本", "绩效");
    const body = filtered.map((row) => {
      const line = [
        levelLabel(row.level),
        row.person.name,
        row.person.employeeId,
        row.person.departmentPath.join("/"),
        row.person.title,
        row.person.level,
        row.person.managerName,
        row.person.hireDate,
        row.movement,
      ];
      if (seePay) line.push(row.person.annualCost == null ? "" : String(row.person.annualCost), row.person.performance);
      return line;
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...body]), "花名册");
    const sample = workspace?.importMeta.sampleLabel ? "-示例数据" : "";
    XLSX.writeFile(book, `花名册${sample}.xlsx`);
  }

  return (
    <Shell crumb="花名册">
      <div data-testid="roster-page" className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 lg:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/sandbox" className="text-xs font-medium text-primary">
              返回沙盘
            </Link>
            <h1 className="mt-1 text-xl font-semibold">花名册{workspace.importMeta.sampleLabel ? " · 示例数据" : ""}</h1>
            <p className="mt-1 text-sm text-muted">
              {department ? `${department.name}（含下级）` : "全公司"} · 当前 {counted} 人
              {compare && outCount > 0 ? ` · 另有调出 ${outCount} 人，灰色，不计入 ${counted} 人` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={compare}
              className={cx("inline-flex min-h-10 items-center rounded-xl border px-3 text-sm", compare ? "border-[#C7D2FE] bg-primarySoft text-primary" : "border-line")}
              onClick={() => {
                setCompare((value) => !value);
                setPage(1);
              }}
            >
              对照基线
            </button>
            <Button variant="secondary" onClick={exportFile}>
              导出 Excel
            </Button>
          </div>
        </div>
        {compare && department && (
          <p className="text-xs text-[#4C1D95]">
            {scenario.name}相对基线：调入 {inCount} 人 · 调出 {outCount} 人 · 净变化 {inCount - outCount}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="搜索姓名、岗位或工号"
            className="min-h-10 rounded-xl border border-line px-3 text-sm"
          />
          <select
            aria-label="部门"
            value={deptId}
            onChange={(event) => {
              setDeptId(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-xl border border-line px-2 text-sm"
          >
            <option value="">全部部门</option>
            {scenario.snapshot.departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.path.join(" / ")}
              </option>
            ))}
          </select>
          <select
            aria-label="职级"
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-xl border border-line px-2 text-sm"
          >
            <option value="">职级 全部</option>
            {levels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="工作地点"
            value={place}
            onChange={(event) => {
              setPlace(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-xl border border-line px-2 text-sm"
          >
            <option value="">工作地点 全部</option>
            {places.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="方案变动"
            value={change}
            onChange={(event) => {
              setChange(event.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-xl border border-line px-2 text-sm"
          >
            {["全部", "调入", "调出", "无变动"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="max-w-full overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F8F9FD] text-xs text-muted">
              <tr>
                {["层级", "姓名", "工号", "岗位", "职级", "直属上级", "入职时间", "方案变动", ...(seePay ? ["薪酬", "绩效"] : [])].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.person.id} className={cx("border-t border-line", row.left && "bg-[#F2F4F7] text-muted")}>
                  <td className="px-3 py-2">{levelLabel(row.level)}</td>
                  <td className="px-3 py-2 font-medium">{row.person.name}</td>
                  <td className="px-3 py-2">{row.person.employeeId}</td>
                  <td className="px-3 py-2">{row.person.title}</td>
                  <td className="px-3 py-2">{row.person.level || "—"}</td>
                  <td className="px-3 py-2">{row.person.managerName || "—"}</td>
                  <td className="px-3 py-2">{row.person.hireDate || "—"}</td>
                  <td className="px-3 py-2">{row.movement}</td>
                  {seePay && <td className="px-3 py-2">{row.person.annualCost == null ? "—" : row.person.annualCost}</td>}
                  {seePay && <td className="px-3 py-2">{row.person.performance || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            共 {filtered.length} 行 · 第 {safePage} / {pages} 页
            {!seePay && " · 薪酬、绩效按权限隐藏"}
            {" · 按汇报层级再按工号，不按绩效"}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              上一页
            </Button>
            <Button variant="secondary" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
