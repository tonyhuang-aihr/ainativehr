"use client";

import { InfoMark } from "@/components/headcount/info-mark";
import { RoundingMark } from "@/components/headcount/rounding-mark";
import { AGENT_COST_NOTE, AGENT_COST_NOTE_OD, AGENT_STATUS_NOTE, AGENT_STATUS_NOTE_OD, COMP_MARK_NOTE, EMPLOYMENT_NOTE, PERSON_COST_HEADER, PERSON_COST_NOTE, PERSON_COST_NOTE_OD, PERSON_IMPACT_NOTE, PERSON_IMPACT_NOTE_OD, PERSON_SORT_NOTE, PERSON_STATUS_NOTE, PERSON_STATUS_NOTE_OD, SEAT_NOTE, TRANSIT_SUM_NOTE, YEAR_FORECAST_LEADER } from "@/lib/headcount/copy";
import type { LeaderView } from "@/lib/headcount/leaderView";
import { AGENT_TRANSIT, EMPLOYMENT_TYPES, PERSON_TRANSIT, detailHref } from "@/lib/headcount/rosterPage";

const PEOPLE_CHIPS = ["全部", "在岗无变动", "在途", "待入职", "待转入", "待离职", "待转出"] as const;
const AGENT_CHIPS = ["全部", "在用无变动", "在途", "待新增", "待扩容或调整", "待下线"] as const;
const TYPE_CHIPS = ["全部", ...EMPLOYMENT_TYPES] as const;

function toggleList(current: string[], chip: string, transit: readonly string[]): string[] {
  if (chip === "全部") return [];
  if (chip === "在途") {
    const on = transit.every((status) => current.includes(status));
    return on ? current.filter((status) => !transit.includes(status)) : [...new Set([...current.filter((status) => status !== "全部"), ...transit])];
  }
  const next = current.includes(chip) ? current.filter((status) => status !== chip) : [...current, chip];
  return next.filter((status) => status !== "全部");
}

function chipOn(current: string[], chip: string, transit: readonly string[]): boolean {
  if (chip === "全部") return current.length === 0;
  if (chip === "在途") return transit.every((status) => current.includes(status));
  return current.includes(chip);
}

export function LeaderBoard({ view, variant = "full" }: { view: LeaderView; variant?: "full" | "roster" }) {
  const origin = view.conclusion.origin === "model" ? "模型" : view.conclusion.origin === "cache" ? "缓存" : "模板";
  const peopleHref = (patch: Record<string, string | null>) => detailHref(view.listBase, { open: "people", ...patch });
  const agentHref = (patch: Record<string, string | null>) => detailHref(view.listBase, { open: "agents", ...patch });

  const roster = (
    <>
      <QuarterSection view={view} />
      <PeopleSection view={view} hrefFor={peopleHref} />
      <AgentSection view={view} hrefFor={agentHref} />
    </>
  );
  if (variant === "roster") return <div className="space-y-4">{roster}</div>;

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {view.backHref ? (
            <a href={view.backHref} className="text-sm text-primary">
              返回总览
            </a>
          ) : (
            <p className="text-sm text-muted">{view.scopeLabel}</p>
          )}
          <h1 className="mt-1 text-2xl font-semibold">{view.departmentName}</h1>
          <p className="text-sm text-muted">截至 {view.asOf}</p>
        </div>
        {view.options.length > 1 && !view.backHref ? (
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
        ) : null}
      </div>

      <section className="rounded-3xl border border-line bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-primarySoft px-2 py-1 text-primary">人 : AI {view.aiRatio}</span>
          <span>结论来自{origin}</span>
        </div>
        <p className="mt-4 text-lg leading-8">{view.conclusion.text}</p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              全年预计
              <InfoMark note={YEAR_FORECAST_LEADER} />
            </p>
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
          <p className="text-sm text-muted">① 现在</p>
          <p className="mt-2 text-xl font-semibold">{view.now.currentLabel} 万</p>
          <p className="mt-2 text-sm text-muted">
            在岗 {view.now.people} 人 · Agent {view.now.agents}
          </p>
          <p className="text-sm text-muted">{view.now.quotaLine}</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">② 接下来会变</p>
          <p className="mt-2 text-xl font-semibold">{view.next.netLabel} 万</p>
          {view.drivers.map((line) => (
            <p key={line.detail} className="mt-2 text-sm text-muted">
              {line.detail} {line.label} 万
            </p>
          ))}
          <p className="mt-3 flex flex-wrap gap-3 text-sm">
            <a className="text-primary" href={peopleHref({ people: "在途", page: null, size: String(view.people.pageSize) })}>
              查看全部 {view.next.count} 条
            </a>
            <a className="text-primary" href={agentHref({ agents: "在途", agentPage: null })}>
              Agent 在途
            </a>
          </p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">③ 年底预计</p>
          <p className="mt-2 text-xl font-semibold">
            {view.yearEnd.annualLabel} 万
            {view.yearEnd.equation ? (
              <span className="ml-2 text-sm font-normal text-muted">
                {view.yearEnd.equation}
                {view.yearEnd.roundingNote ? <RoundingMark note={view.yearEnd.roundingNote} /> : null}
              </span>
            ) : null}
          </p>
          <p className="mt-2 text-sm text-muted">
            人员 {view.yearEnd.people} · Agent {view.yearEnd.agents}
          </p>
          <p className="text-sm text-muted">{view.yearEnd.budgetLine}</p>
        </article>
      </section>

      {roster}

      <section className="rounded-2xl bg-[#F8F9FD] px-4 py-3 text-sm text-muted">
        <p className="font-medium text-ink">依据可查</p>
        <ul className="mt-2 space-y-1">
          {view.basis.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function QuarterSection({ view }: { view: LeaderView }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white">
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <b>季度成本</b>
          <span className="text-muted">{view.quarterSummary}</span>
          <span className="ml-auto text-primary">展开</span>
        </summary>
        <div className="border-t border-line px-4 py-4">
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
      </details>
    </section>
  );
}

function peopleRosterLine(view: LeaderView): string {
  const counts = view.people.counts;
  const types = view.people.typeCounts;
  const parts = PERSON_TRANSIT.filter((status) => counts[status] > 0).map((status) => `${status} ${counts[status]}`);
  const typeText = EMPLOYMENT_TYPES.filter((type) => types[type] > 0).map((type) => `${type} ${types[type]}`).join(" · ");
  const cost = view.exact ? "OD 看精确估算" : "成本为区间";
  const mark = view.showMarks ? " · 补偿标记仅 OD / HR 可见" : "";
  return `${counts.全部} 人 · 在岗 ${counts.在岗无变动} · 在途 ${counts.在途}${parts.length ? `（${parts.join(" · ")}）` : ""} · ${typeText} · ${cost}${mark}`;
}

function agentRosterLine(view: LeaderView): string {
  const counts = view.agentsPage.counts;
  const parts = (["待新增", "待扩容或调整", "待下线"] as const).filter((status) => counts[status] > 0).map((status) => `${status} ${counts[status]}`);
  return `${counts.全部} 项 · 在用 ${counts.在用无变动} · 在途 ${counts.在途}${parts.length ? `（${parts.join(" · ")}）` : ""} · 全年 ${view.agentsPage.annualLabel} 万（席位 + 算力）`;
}

function PeopleSection({ view, hrefFor }: { view: LeaderView; hrefFor: (patch: Record<string, string | null>) => string }) {
  const page = view.people;
  const opened = view.openSection === "people" || page.statuses.length > 0;
  return (
    <section id="people-detail" className="overflow-hidden rounded-2xl border border-line bg-white">
      <details open={opened}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <b>人员明细</b>
          <span className="text-muted">{peopleRosterLine(view)}</span>
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-4">
          <ChipRow chips={PEOPLE_CHIPS} counts={page.counts} current={page.statuses} transit={PERSON_TRANSIT} hrefFor={(statuses) => hrefFor({ people: statuses.length ? statuses.join(",") : null, page: null, open: "people" })} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">
              用工类型
              <InfoMark note={EMPLOYMENT_NOTE} />
            </span>
            <ChipRow chips={TYPE_CHIPS} counts={page.typeCounts} current={page.types} transit={[]} hrefFor={(types) => hrefFor({ types: types.length ? types.join(",") : null, page: null, open: "people" })} />
          </div>
          <p className="text-xs text-muted">
            {page.sort === "effective" ? "按生效日排序" : "按汇报层级排序"}
            <InfoMark note={PERSON_SORT_NOTE} />
          </p>
          {page.summary ? (
            <div className="text-sm">
              <p>
                在途 {page.summary.count} 人 · 当季（Q1）合计 {page.summary.quarter} 万 · 全年合计 {page.summary.year} 万 · {page.summary.label}
                <InfoMark note={TRANSIT_SUM_NOTE} />
              </p>
              {view.transitNote ? <p className="text-muted">{view.transitNote}</p> : null}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2">姓名</th>
                  {view.showDepartment ? <th>部门</th> : null}
                  <th>岗位</th>
                  <th>职级</th>
                  <th>用工类型</th>
                  <th>
                    状态 · 生效日
                    <InfoMark note={view.showMarks ? PERSON_STATUS_NOTE_OD : PERSON_STATUS_NOTE} />
                  </th>
                  {view.showMarks ? (
                    <th>
                      补偿标记
                      <InfoMark note={COMP_MARK_NOTE} />
                    </th>
                  ) : null}
                  <th>
                    {view.exact ? "全年成本估算" : PERSON_COST_HEADER}
                    <InfoMark note={view.exact ? PERSON_COST_NOTE_OD : PERSON_COST_NOTE} />
                  </th>
                  <th>
                    全年成本影响
                    <InfoMark note={view.exact ? PERSON_IMPACT_NOTE_OD : PERSON_IMPACT_NOTE} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.id} className="border-t border-line" title={row.quarters}>
                    <td className="py-2">
                      {row.name}
                      {row.nameNote ? <InfoMark note={row.nameNote} /> : null}
                    </td>
                    {view.showDepartment ? <td>{row.departmentName}</td> : null}
                    <td>{row.title}</td>
                    <td>{row.grade}</td>
                    <td>{row.employmentType}</td>
                    <td>{row.statusLabel}</td>
                    {view.showMarks ? <td>{row.compMark}</td> : null}
                    <td>
                      {row.yearCost}
                      <InfoMark note={row.quarters} />
                    </td>
                    <td>{row.yearImpact || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager totalLabel={page.footer} page={page.page} pageCount={page.pageCount} pageSize={page.pageSize} hrefFor={(nextPage, size) => hrefFor({ people: page.statuses.join(",") || null, types: page.types.join(",") || null, page: String(nextPage), size: String(size), open: "people" })} />
        </div>
      </details>
    </section>
  );
}

function AgentSection({ view, hrefFor }: { view: LeaderView; hrefFor: (patch: Record<string, string | null>) => string }) {
  const page = view.agentsPage;
  const opened = view.openSection === "agents" || page.statuses.length > 0;
  return (
    <section id="agent-detail" className="overflow-hidden rounded-2xl border border-line bg-white">
      <details open={opened}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <b>Agent 明细</b>
          <span className="text-muted">{agentRosterLine(view)}</span>
          <span className="ml-auto text-xs text-muted">{page.sort === "cost" ? "按全年成本从高到低" : page.sort === "effective" ? "按生效日排序" : "按名称排序"}</span>
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-4">
          <ChipRow chips={AGENT_CHIPS} counts={page.counts} current={page.statuses} transit={AGENT_TRANSIT} hrefFor={(statuses) => hrefFor({ agents: statuses.length ? statuses.join(",") : null, agentPage: null, open: "agents" })} />
          <div className="flex gap-3 text-xs">
            <a className={page.sort === "cost" ? "text-ink" : "text-primary"} href={hrefFor({ agentSort: "cost", agentPage: null, open: "agents" })}>
              按全年成本从高到低
            </a>
            <a className={page.sort === "name" ? "text-ink" : "text-primary"} href={hrefFor({ agentSort: "name", agentPage: null, open: "agents" })}>
              按名称
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2">Agent 名称</th>
                  {view.showDepartment ? <th>部门</th> : null}
                  <th>类型</th>
                  <th>实例数</th>
                  <th>
                    席位费
                    <InfoMark note={SEAT_NOTE} />
                  </th>
                  <th>算力费</th>
                  <th>
                    状态 · 生效日
                    <InfoMark note={view.showMarks ? AGENT_STATUS_NOTE_OD : AGENT_STATUS_NOTE} />
                  </th>
                  <th>
                    全年成本
                    <InfoMark note={view.exact ? AGENT_COST_NOTE_OD : AGENT_COST_NOTE} />
                  </th>
                  <th>全年成本影响</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="py-2">{row.name}</td>
                    {view.showDepartment ? <td>{row.departmentName}</td> : null}
                    <td>{row.agentType}</td>
                    <td>{row.instancesLabel}</td>
                    <td>{row.seat}</td>
                    <td>{row.compute}</td>
                    <td>{row.statusLabel}</td>
                    <td>{row.yearCost}</td>
                    <td>{row.yearImpact || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager totalLabel={page.footer} page={page.page} pageCount={page.pageCount} pageSize={page.pageSize} hrefFor={(nextPage, size) => hrefFor({ agents: page.statuses.join(",") || null, agentSort: page.sort, agentPage: String(nextPage), agentSize: String(size), open: "agents" })} />
        </div>
      </details>
    </section>
  );
}

function ChipRow({
  chips,
  counts,
  current,
  transit,
  hrefFor,
}: {
  chips: readonly string[];
  counts: Record<string, number>;
  current: string[];
  transit: readonly string[];
  hrefFor: (statuses: string[]) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const on = chipOn(current, chip, transit);
        return (
          <a key={chip} href={hrefFor(toggleList(current, chip, transit))} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primarySoft text-primary" : "border-line text-muted"}`} aria-current={on ? "true" : undefined}>
            {chip} {counts[chip] ?? 0}
          </a>
        );
      })}
    </div>
  );
}

function Pager({ totalLabel, page, pageCount, pageSize, hrefFor }: { totalLabel: string; page: number; pageCount: number; pageSize: number; hrefFor: (page: number, size: number) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
      <span>{totalLabel}</span>
      <a className="text-primary" href={hrefFor(Math.max(1, page - 1), pageSize)}>
        上一页
      </a>
      <span>
        第 {page}/{pageCount} 页
      </span>
      <a className="text-primary" href={hrefFor(Math.min(pageCount, page + 1), pageSize)}>
        下一页
      </a>
      {([10, 20, 50] as const).map((size) => (
        <a key={size} href={hrefFor(1, size)} className={size === pageSize ? "text-ink" : "text-primary"}>
          {size} 条/页
        </a>
      ))}
    </div>
  );
}
