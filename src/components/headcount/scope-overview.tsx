import { InfoMark } from "@/components/headcount/info-mark";
import { RoundingMark } from "@/components/headcount/rounding-mark";
import { YEAR_FORECAST_LEADER, YEAR_FORECAST_OD } from "@/lib/headcount/copy";
import { conclusionSourceLabel, type ScopeOverview } from "@/lib/headcount/overview";
import Link from "next/link";

const SEVERITY = { 高: "bg-[#FEE2E2] text-[#B91C1C]", 中: "bg-[#FEF3C7] text-[#92400E]", 低: "bg-[#F3F4F6] text-[#4B5563]" };

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
        {overview.rangeNote ? <p className="mt-2 text-sm text-[#92400E]">{overview.rangeNote}</p> : null}
      </section>
      <section className="grid gap-3 md:grid-cols-5">
        {overview.cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {card.value}
              {card.roundingNote ? <RoundingMark note={card.roundingNote} /> : null}
            </p>
            <p className="mt-1 text-sm text-muted">{card.sub}</p>
            {card.extra ? <p className="mt-1 text-xs text-muted">{card.extra}</p> : null}
          </article>
        ))}
      </section>
      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-medium">异常部门提示</h2>
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
              <Link href={overview.audience === "od" ? `/headcount/baseline/${alert.departmentId}` : `/headcount/leader?dept=${alert.departmentId}`} className="ml-auto text-primary">
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
              <th>在途</th>
              <th>空缺</th>
              <th>Agent</th>
              <th>
                全年预计
                <InfoMark note={overview.audience === "od" ? YEAR_FORECAST_OD : YEAR_FORECAST_LEADER} />
              </th>
              <th>部门预算</th>
              <th>差额</th>
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
                <td className={row.gap.startsWith("+") ? "text-[#B91C1C]" : "text-[#15803D]"}>{row.gap}</td>
                <td>{row.status}</td>
                <td>
                  <Link href={row.href} className="text-primary">
                    进入部门
                  </Link>
                </td>
              </tr>
            ))}
            {overview.total ? (
              <tr className="border-t border-line bg-[#F9FAFB] font-medium">
                <td className="px-3 py-2">{overview.total.label}</td>
                {overview.audience === "leader" ? <td /> : null}
                <td colSpan={5} />
                <td>
                  {overview.total.annual}
                  {overview.total.roundingNote ? <RoundingMark note={overview.total.roundingNote} /> : null}
                </td>
                <td>{overview.total.budget}</td>
                <td>{overview.total.gap}</td>
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
