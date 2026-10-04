import { Button } from "@/components/ui";
import { loginAction } from "@/lib/headcount/actions";
import { isDemo } from "@/lib/headcount/env";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/headcount/sample";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const demo = isDemo();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">登录编制规划</h1>
        <p className="mt-2 text-sm text-muted">会话写在 HttpOnly Cookie 里。连续失败 5 次会锁定 15 分钟。</p>
      </div>
      <form action={loginAction} className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <label className="block text-sm">
          用户名
          <input name="username" className="mt-1 w-full rounded-xl border border-line px-3 py-2" autoComplete="username" />
        </label>
        <label className="block text-sm">
          密码
          <input name="password" type="password" className="mt-1 w-full rounded-xl border border-line px-3 py-2" autoComplete="current-password" />
        </label>
        {query.error ? <p className="text-sm text-[#B91C1C]">用户名或密码不对，或账号还在锁定期。</p> : null}
        <Button type="submit">登录</Button>
      </form>
      {demo ? (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm">
          <p className="font-medium">演示账号</p>
          <p className="mt-1 text-muted">密码都是 {DEMO_PASSWORD}</p>
          <ul className="mt-3 space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.username}>
                <span className="font-medium">{account.username}</span> · {account.name} · {account.blurb}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
