"use client";

import { InfoMark } from "@/components/headcount/info-mark";
import { RoundingMark } from "@/components/headcount/rounding-mark";
import { PERSON_COST_HEADER, PERSON_COST_NOTE, YEAR_FORECAST_LEADER } from "@/lib/headcount/copy";
import type { LeaderView } from "@/lib/headcount/leaderView";
import { AGENT_TRANSIT, PERSON_TRANSIT, detailHref } from "@/lib/headcount/rosterPage";

const PEOPLE_CHIPS = ["全部", "在岗", "在途", "待入职", "待转入", "待离职", "待转出"] as const;
const AGENT_CHIPS = ["全部", "在用", "在途", "待新增", "待扩容或调整", "待下线"] as const;

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

export function LeaderBoard({ view }: { view: LeaderView }) {
  const origin = view.conclusion.origin === "model" ? "模型" : view.conclusion.origin === "cache" ? "缓存" : "模板";
  const peopleHref = (patch: Record<string, string | null>) => detailHref(view.listBase, { open: "people", ...patch });
  const agentHref = (patch: Record<string, string | null>) => detailHref(view.listBase, { open: "agents", ...patch });

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

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <h2 className="border-b border-line px-4 py-3 font-medium">季度成本</h2>
        <div className="px-4 py-4">
          <p className="mb-3 text-sm text-muted">{view.quarterSummary}</p>
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
      </section>

      <PeopleSection view={view} hrefFor={peopleHref} />
      <AgentSection view={view} hrefFor={agentHref} />

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

function PeopleSection({ view, hrefFor }: { view: LeaderView; hrefFor: (patch: Record<string, string | null>) => string }) {
  const page = view.people;
  return (
    <section id="people-detail" className="overflow-hidden rounded-2xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-3 font-medium">人员明细</h2>
      <div className="space-y-3 px-4 py-4">
        <ChipRow
          chips={PEOPLE_CHIPS}
          counts={page.counts}
          current={page.statuses}
          transit={PERSON_TRANSIT}
          hrefFor={(statuses) => hrefFor({ people: statuses.length ? statuses.join(",") : null, page: null, size: String(page.pageSize) })}
        />
        {page.summary ? (
          <p className="text-sm text-muted">
            在途 {page.summary.count} 笔 · 当季合计影响 {page.summary.quarter} 万 · 全年合计影响 {page.summary.year} 万
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">姓名</th>
                <th>岗位</th>
                <th>职级</th>
                <th>用工类型</th>
                <th>状态</th>
                <th>生效日</th>
                <th>
                  {view.exact ? "全年成本估算" : PERSON_COST_HEADER}
                  <InfoMark note={PERSON_COST_NOTE} />
                </th>
                <th>全年成本影响</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.id} className="border-t border-line" title={row.quarters}>
                  <td className="py-2">{row.name}</td>
                  <td>{row.title}</td>
                  <td>{row.grade}</td>
                  <td>{row.employmentType}</td>
                  <td>{row.status === "待离职" ? `待离职 · ${row.effectiveDate}` : row.status}</td>
                  <td>{row.effectiveDate || "—"}</td>
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
        <Pager totalLabel={`共 ${page.total} 人`} page={page.page} pageSize={page.pageSize} hrefFor={(nextPage, size) => hrefFor({ people: page.statuses.join(",") || null, page: String(nextPage), size: String(size) })} />
      </div>
    </section>
  );
}

function AgentSection({ view, hrefFor }: { view: LeaderView; hrefFor: (patch: Record<string, string | null>) => string }) {
  const page = view.agentsPage;
  return (
    <section id="agent-detail" className="overflow-hidden rounded-2xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-3 font-medium">Agent 明细</h2>
      <div className="space-y-3 px-4 py-4">
        <ChipRow
          chips={AGENT_CHIPS}
          counts={page.counts}
          current={page.statuses}
          transit={AGENT_TRANSIT}
          hrefFor={(statuses) => hrefFor({ agents: statuses.length ? statuses.join(",") : null, agentPage: null, agentSize: String(page.pageSize) })}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2">Agent 名称</th>
                <th>类型</th>
                <th>实例数</th>
                <th>席位费</th>
                <th>算力费</th>
                <th>状态</th>
                <th>生效日</th>
                <th>全年成本</th>
                <th>全年成本影响</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.id} className="border-t border-line" title={row.quarters}>
                  <td className="py-2">{row.name}</td>
                  <td>{row.agentType}</td>
                  <td>{row.instances}</td>
                  <td>{row.seat}</td>
                  <td>{row.compute}</td>
                  <td>{row.status}</td>
                  <td>{row.effectiveDate || "—"}</td>
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
        <Pager totalLabel={`共 ${page.total} 个`} page={page.page} pageSize={page.pageSize} hrefFor={(nextPage, size) => hrefFor({ agents: page.statuses.join(",") || null, agentPage: String(nextPage), agentSize: String(size) })} />
      </div>
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

function Pager({ totalLabel, page, pageSize, hrefFor }: { totalLabel: string; page: number; pageSize: number; hrefFor: (page: number, size: number) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
      <span>{totalLabel}</span>
      <a className="text-primary" href={hrefFor(Math.max(1, page - 1), pageSize)}>
        上一页
      </a>
      <span>第 {page} 页</span>
      <a className="text-primary" href={hrefFor(page + 1, pageSize)}>
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
