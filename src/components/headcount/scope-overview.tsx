import type { ScopeOverview } from "@/lib/headcount/overview";
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
        <p className="text-xs text-primary">AI 生成 · 依据可查</p>
        <p className="mt-3 text-lg leading-8">{overview.conclusion}</p>
        <p className="mt-3 text-sm text-muted">{overview.note}</p>
        {overview.rangeNote ? <p className="mt-2 text-sm text-[#92400E]">{overview.rangeNote}</p> : null}
      </section>
      <section className="grid gap-3 md:grid-cols-5">
        {overview.cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-1 text-sm text-muted">{card.sub}</p>
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
          <p className="text-sm text-muted">全年预计 = 人工 + Agent，不含一次性 · 万元</p>
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
              <th>全年预计</th>
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
                <td>{row.vacancy}</td>
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
            {overview.oneOff ? (
              <tr className="border-t border-line bg-[#FCFCFD]">
                <td className="px-3 py-2">一次性费用</td>
                {overview.audience === "leader" ? <td /> : null}
                <td colSpan={5} className="text-muted">
                  HR / OD 统一管理，不摊到部门
                </td>
                <td>{overview.oneOff.amount}</td>
                <td>{overview.oneOff.budget}</td>
                <td>{overview.oneOff.gap}</td>
                <td colSpan={2} />
              </tr>
            ) : null}
            {overview.total ? (
              <tr className="border-t border-line bg-[#F9FAFB] font-medium">
                <td className="px-3 py-2">{overview.total.label}</td>
                {overview.audience === "leader" ? <td /> : null}
                <td colSpan={5} />
                <td>{overview.total.annual}</td>
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
