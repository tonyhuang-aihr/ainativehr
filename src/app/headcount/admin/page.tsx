import { Button } from "@/components/ui";
import { bindUserAction, createUserAction, exactAction, purgeLogsAction, restoreAction, wipeAction } from "@/lib/headcount/actions";
import { can } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
import { listAccessLogs, listOperationLogs, listUsers, loadDepartments, loadSettings } from "@/lib/headcount/db/queries";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string; q?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (!can(user, "manageUsers") && !can(user, "toggleExact") && !can(user, "viewLogs")) redirect("/headcount");
  const query = await searchParams;
  const db = await getDb();
  const settings = await loadSettings(db);
  const departments = await loadDepartments(db);
  const users = can(user, "manageUsers") ? await listUsers(db) : [];
  const access = can(user, "viewLogs") ? await listAccessLogs(db, { name: query.q }) : [];
  const operations = can(user, "viewLogs") ? await listOperationLogs(db) : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">管理</h1>
        <p className="mt-1 text-sm text-muted">这一页不展示成本表。数据版本 {settings.dataVersion}。</p>
        {query.notice ? <p className="mt-3 rounded-xl bg-primarySoft px-3 py-2 text-sm text-primary">{query.notice}</p> : null}
      </div>
      {can(user, "toggleExact") ? (
        <form action={exactAction} className="rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">负责人视图的精确估算</h2>
          <p className="mt-1 text-muted">关闭时人员行显示区间。部门和 Agent 合计始终是精确值。开关会写入日志。</p>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={settings.exactForLeaders} />
            让负责人看到精确估算
          </label>
          <div className="mt-3">
            <Button type="submit" variant="secondary">
              保存开关
            </Button>
          </div>
        </form>
      ) : null}
      {can(user, "manageUsers") ? (
        <section className="space-y-4">
          <form action={createUserAction} className="grid gap-2 rounded-2xl border border-line bg-white p-4 text-sm md:grid-cols-2">
            <h2 className="font-medium md:col-span-2">新建账号</h2>
            <input name="username" placeholder="用户名" className="rounded-xl border border-line px-3 py-2" />
            <input name="name" placeholder="姓名" className="rounded-xl border border-line px-3 py-2" />
            <input name="password" type="password" placeholder="密码，至少 8 位且含字母和数字" className="rounded-xl border border-line px-3 py-2" />
            <select name="role" className="rounded-xl border border-line px-3 py-2">
              <option value="leader">业务负责人</option>
              <option value="od">OD / HRBP</option>
              <option value="hr_admin">HR 管理员</option>
              <option value="sys_admin">系统管理员</option>
            </select>
            <select name="departmentId" className="rounded-xl border border-line px-3 py-2">
              <option value="">不绑定部门</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              创建
            </Button>
          </form>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-3 py-3">账号</th>
                  <th>角色</th>
                  <th>绑定</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      {account.name} · {account.username}
                    </td>
                    <td>{account.role}</td>
                    <td>
                      <form action={bindUserAction} className="flex gap-2">
                        <input type="hidden" name="userId" value={account.id} />
                        <select name="departmentId" defaultValue={account.departmentIds[0] ?? ""} className="rounded-lg border border-line px-2 py-1">
                          <option value="">不绑定</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                        <button className="text-primary" type="submit">
                          保存
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {can(user, "viewLogs") ? (
        <section className="space-y-3">
          <form className="flex gap-2" action="/headcount/admin">
            <input name="q" defaultValue={query.q ?? ""} placeholder="按姓名或部门查访问日志" className="rounded-xl border border-line px-3 py-2 text-sm" />
            <Button type="submit" variant="secondary">
              查询
            </Button>
          </form>
          <div className="rounded-2xl border border-line bg-white p-4 text-sm">
            <h2 className="font-medium">访问日志</h2>
            <ul className="mt-2 space-y-1">
              {access.slice(0, 30).map((row) => (
                <li key={row.id}>
                  {new Date(row.createdAt).toISOString()} · {row.userName} · {row.departmentName}
                </li>
              ))}
              {access.length === 0 ? <li className="text-muted">还没有记录</li> : null}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-white p-4 text-sm">
            <h2 className="font-medium">操作日志</h2>
            <ul className="mt-2 space-y-1">
              {operations.slice(0, 20).map((row) => (
                <li key={row.id}>
                  {row.userName} · {row.action} · {row.detail}
                </li>
              ))}
            </ul>
          </div>
          <form action={purgeLogsAction}>
            <Button type="submit" variant="secondary">
              清理已超过 6 个月的日志
            </Button>
          </form>
        </section>
      ) : null}
      {can(user, "export") ? (
        <p className="text-sm">
          <a className="text-primary" href="/api/headcount/export">
            导出当前数据
          </a>
        </p>
      ) : null}
      {can(user, "wipe") ? (
        <div className="flex flex-wrap gap-3">
          <form action={wipeAction}>
            <Button type="submit" variant="danger">
              清除在线数据
            </Button>
          </form>
          <form action={restoreAction}>
            <Button type="submit" variant="secondary">
              恢复示例数据
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
