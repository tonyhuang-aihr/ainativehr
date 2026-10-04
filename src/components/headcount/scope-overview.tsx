import { InfoMark } from "@/components/headcount/info-mark";
import { alertRuleNote, BUDGET_NOTE, DEPT_TOTAL_NOTE, GAP_NOTE, GROUP_PRIVACY_NOTE, OD_TRANSIT_NOTE, overviewCardNote, SCOPE_TOTAL_NOTE, VACANCY_NOTE, VACANCY_NOTE_LEADER, VACANCY_TOTAL_NOTE, YEAR_FORECAST_LEADER_DEPT, YEAR_FORECAST_OD } from "@/lib/headcount/copy";
import { conclusionSourceLabel, type ScopeOverview } from "@/lib/headcount/overview";
import Link from "next/link";

const SEVERITY = { 高: "bg-[#FEE2E2] text-[#B91C1C]", 中: "bg-[#FEF3C7] text-[#92400E]", 低: "bg-[#F3F4F6] text-[#4B5563]" };

function gapTone(gap: string): string {
  if (gap.startsWith("+")) return "text-[#B91C1C]";
  if (gap.startsWith("−") || gap.startsWith("-")) return "text-[#15803D]";
  return "text-muted";
}

export function ScopeOverviewBoard({ overview }: { overview: ScopeOverview }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{overview.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold">{overview.title}</h1>
      </div>
      <section className="rounded-3xl border border-line bg-white p-6 shadow-card">
        <p className="text-xs text-primary">{conclusionSourceLabel(overview.conclusionOrigin)}</p>
        <p className="mt-3 text-lg leading-8">{overview.conclusion}</p>
        {overview.rangeNote ? (
          <p className="mt-2 text-sm text-[#92400E]">
            {overview.rangeNote}
            {overview.audience === "leader" ? <InfoMark note={GROUP_PRIVACY_NOTE} /> : null}
          </p>
        ) : null}
      </section>
      <section className="grid gap-3 md:grid-cols-5">
        {overview.cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm text-muted">
              {card.label}
              {overviewCardNote(overview.audience, card.label) ? <InfoMark note={overviewCardNote(overview.audience, card.label)!} /> : null}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-1 text-sm text-muted">{card.sub}</p>
            {card.extra ? <p className="mt-1 text-xs text-muted">{card.extra}</p> : null}
          </article>
        ))}
      </section>
      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-medium">
            异常部门提示
            <InfoMark note={alertRuleNote(overview.audience)} />
          </h2>
          <p className="text-sm text-muted">
            {overview.alerts.length} 条 · 涉及 {new Set(overview.alerts.map((alert) => alert.title.split(" / ")[0])).size} 个部门
          </p>
        </div>
        <ul>
          {overview.alerts.map((alert) => (
            <li key={`${alert.kind}-${alert.title}`} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY[alert.severity]}`}>{alert.severity}</span>
              <span className="font-medium">{alert.kind}</span>
              <span>{alert.title}</span>
              <span className="text-muted">{alert.detail}</span>
              <Link href={overview.audience === "leader" ? `/headcount/leader?dept=${alert.departmentId}` : `/headcount/baseline/${alert.departmentId}`} className="ml-auto text-primary">
                进入部门
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="overflow-x-auto rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-medium">部门列表</h2>
        </div>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-3 py-2">部门</th>
              {overview.audience === "leader" ? <th>负责人</th> : null}
              <th>编制</th>
              <th>在岗</th>
              <th>
                在途
                {overview.audience === "od" ? <InfoMark note={OD_TRANSIT_NOTE} /> : null}
              </th>
              <th>
                空缺
                <InfoMark note={overview.audience === "od" ? VACANCY_NOTE : VACANCY_NOTE_LEADER} />
              </th>
              <th>Agent</th>
              <th>
                全年预计
                <InfoMark note={overview.audience === "od" ? YEAR_FORECAST_OD : YEAR_FORECAST_LEADER_DEPT} />
              </th>
              <th>
                部门预算
                <InfoMark note={BUDGET_NOTE} />
              </th>
              <th>
                差额
                <InfoMark note={GAP_NOTE} />
              </th>
              <th>状态</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {overview.departments.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                {overview.audience === "leader" ? <td>{row.owner ?? "—"}</td> : null}
                <td>{row.quota}</td>
                <td>{row.onBoard}</td>
                <td>{row.inTransit}</td>
                <td>
                  {row.vacancy}
                  {row.overstaff ? <span className="ml-1 rounded bg-[#FEE2E2] px-1.5 py-0.5 text-xs text-[#B91C1C]">{row.overstaff}</span> : null}
                </td>
                <td>{row.agents}</td>
                <td>{row.annual}</td>
                <td>{row.budget ?? "未设置"}</td>
                <td className={gapTone(row.gap)}>{row.gap}</td>
                <td>{row.status}</td>
                <td>
                  <Link href={row.href} className="text-primary">
                    进入部门
                  </Link>
                </td>
              </tr>
            ))}
            {overview.listTotal ? (
              <tr className="border-t border-line bg-[#F9FAFB] font-medium">
                <td className="px-3 py-2">
                  {overview.listTotal.label}
                  {overview.audience === "od" ? <InfoMark note={DEPT_TOTAL_NOTE} /> : null}
                  {overview.audience === "hrbp" ? <InfoMark note={SCOPE_TOTAL_NOTE} /> : null}
                </td>
                {overview.audience === "leader" ? <td /> : null}
                <td>{overview.listTotal.quota}</td>
                <td>{overview.listTotal.onBoard}</td>
                <td>{overview.listTotal.inTransit}</td>
                <td>
                  {overview.listTotal.vacancy}
                  {overview.listTotal.overstaff ? <span className="ml-1 rounded bg-[#FEE2E2] px-1.5 py-0.5 text-xs text-[#B91C1C]">{overview.listTotal.overstaff}</span> : null}
                  {overview.audience === "leader" ? <InfoMark note={VACANCY_TOTAL_NOTE} /> : null}
                </td>
                <td>{overview.listTotal.agents}</td>
                <td>{overview.listTotal.annual}</td>
                <td>{overview.listTotal.budget}</td>
                <td className={gapTone(overview.listTotal.gap)}>{overview.listTotal.gap}</td>
                <td colSpan={2} />
              </tr>
            ) : null}
          </tbody>
        </table>
        {overview.footer ? <p className="border-t border-line px-4 py-3 text-sm text-muted">{overview.footer}</p> : null}
      </section>
    </div>
  );
}
