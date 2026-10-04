import { openBaseline } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselinePage() {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "leader") redirect("/headcount/leader");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const data = await openBaseline(user);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">OD 底座 · {data.cards.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {data.year} 年 · 截至 {data.asOf}。表里的全年预计含一次性费用，用来对齐设计稿。上面的卡片把日常成本和一次性费用分开。
        </p>
      </div>
      <section className="grid gap-3 md:grid-cols-4">
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">在岗 / 编制 / 在途</p>
          <p className="mt-2 text-xl font-semibold">
            {data.cards.onBoard} / {data.cards.quota} / {data.cards.inTransit}
          </p>
          <p className="text-sm text-muted">
            占用 {data.cards.occupied} · 空缺 {data.cards.vacancy}
          </p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">当前成本</p>
          <p className="mt-2 text-xl font-semibold">{data.cards.current} 万</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">日常全年 / 公司总包</p>
          <p className="mt-2 text-xl font-semibold">{data.cards.yearDaily} 万</p>
          <p className="text-sm text-muted">总包 {data.cards.companyBudget} 万</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm text-muted">一次性 / 预算池</p>
          <p className="mt-2 text-xl font-semibold">{data.cards.yearOneOff} 万</p>
          <p className="text-sm text-muted">{data.cards.oneOffBudget ? `${data.cards.oneOffBudget} 万` : "未设置一次性费用预算池"}</p>
        </article>
      </section>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-3 py-3">部门</th>
              <th>在岗</th>
              <th>编制</th>
              <th>在途</th>
              <th>占用</th>
              <th>空缺</th>
              <th>当前</th>
              <th>日常全年</th>
              <th>全年预计（含一次性）</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-3 py-2" style={{ paddingLeft: 12 + row.depth * 16 }}>
                  {row.name}
                </td>
                <td>{row.onBoard}</td>
                <td>{row.quota}</td>
                <td>{row.inTransit}</td>
                <td>{row.occupied}</td>
                <td>{row.vacancy}</td>
                <td>{row.current}</td>
                <td>{row.yearDaily}</td>
                <td>{row.yearTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
