import { Button } from "@/components/ui";
import { Importer } from "@/components/headcount/importer";
import { budgetAction, cityAction, gradeAction, oneOffBudgetAction, quotaAction } from "@/lib/headcount/actions";
import { can } from "@/lib/headcount/authz";
import { importContext } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (!can(user, "import")) redirect("/headcount");
  const query = await searchParams;
  const context = await importContext(user);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">导入与配置</h1>
        <p className="mt-1 text-sm text-muted">部门预算由 OD 按部门手工录入或批量导入。来源系统确定之前，先记在这里。</p>
        {query.notice ? <p className="mt-3 rounded-xl bg-primarySoft px-3 py-2 text-sm text-primary">{query.notice}</p> : null}
      </div>
      <Importer
        context={{
          departments: context.departments,
          grades: context.grades,
          cities: context.cities,
          year: context.year,
          asOf: context.asOf,
          parentNames: context.parentNames,
        }}
      />
      <section className="grid gap-4 md:grid-cols-2">
        <form action={budgetAction} className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">部门预算（元）</h2>
          <select name="departmentId" className="w-full rounded-xl border border-line px-3 py-2">
            {context.departmentRows.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {context.budgets[department.id] ? ` · 已设 ${context.budgets[department.id]}` : ""}
              </option>
            ))}
          </select>
          <input name="amount" inputMode="numeric" placeholder="金额，单位元" className="w-full rounded-xl border border-line px-3 py-2" />
          <Button type="submit" variant="secondary">
            保存预算
          </Button>
        </form>
        <form action={quotaAction} className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">编制</h2>
          <select name="departmentId" className="w-full rounded-xl border border-line px-3 py-2">
            {context.departmentRows.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name} · 人 {department.quotaFormal} · Agent {department.quotaAgent}
              </option>
            ))}
          </select>
          <input name="formal" inputMode="numeric" placeholder="正式编制" className="w-full rounded-xl border border-line px-3 py-2" />
          <input name="agent" inputMode="numeric" placeholder="Agent 编制" className="w-full rounded-xl border border-line px-3 py-2" />
          <Button type="submit" variant="secondary">
            保存编制
          </Button>
        </form>
        <form action={gradeAction} className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">职级年成本（元）</h2>
          <input name="grade" placeholder="例如 P6" className="w-full rounded-xl border border-line px-3 py-2" />
          <input name="amount" inputMode="numeric" placeholder="年成本" className="w-full rounded-xl border border-line px-3 py-2" />
          <Button type="submit" variant="secondary">
            保存职级
          </Button>
        </form>
        <form action={cityAction} className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">城市上年度月平均工资（元）</h2>
          <input name="city" placeholder="城市" className="w-full rounded-xl border border-line px-3 py-2" />
          <input name="amount" inputMode="numeric" placeholder="月均" className="w-full rounded-xl border border-line px-3 py-2" />
          <Button type="submit" variant="secondary">
            保存城市
          </Button>
        </form>
        <form action={oneOffBudgetAction} className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm md:col-span-2">
          <h2 className="font-medium">一次性费用预算池（元）</h2>
          <p className="text-muted">留空表示未设置。当前：{context.oneOffBudget == null ? "未设置" : context.oneOffBudget}</p>
          <input name="amount" inputMode="numeric" placeholder="留空则清空" className="w-full rounded-xl border border-line px-3 py-2" />
          <Button type="submit" variant="secondary">
            保存预算池
          </Button>
        </form>
      </section>
    </div>
  );
}
