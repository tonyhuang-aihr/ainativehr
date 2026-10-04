import { logoutAction } from "@/lib/headcount/actions";
import type { HeadcountRole } from "@/lib/headcount/authz";
import Link from "next/link";

const ROLE_LABEL: Record<HeadcountRole, string> = {
  od: "OD / HRBP",
  leader: "业务负责人",
  hr_admin: "HR 管理员",
  sys_admin: "系统管理员",
};

export function HeadcountChrome({
  role,
  name,
  demo,
  children,
}: {
  role: HeadcountRole | null;
  name: string;
  demo: boolean;
  children: React.ReactNode;
}) {
  const links = [
    role === "od" ? { href: "/headcount/import", label: "导入" } : null,
    role === "od" || role === "hr_admin" ? { href: "/headcount/baseline", label: "底座" } : null,
    role && role !== "sys_admin" ? { href: "/headcount/leader", label: "负责人" } : null,
    role === "hr_admin" || role === "sys_admin" ? { href: "/headcount/admin", label: "管理" } : null,
    { href: "/headcount/explain", label: "数据说明" },
    { href: "/headcount/later", label: "稍后" },
  ].filter((link): link is { href: string; label: string } => Boolean(link));

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {demo ? <p className="bg-[#FEF3C7] px-4 py-2 text-center text-sm text-[#92400E]">演示环境 · 示例数据</p> : null}
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/headcount" className="text-sm font-semibold">
            编制与成本规划
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-primarySoft hover:text-primary">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted">
            <Link href="/" className="hover:text-primary">
              沙盘
            </Link>
            {role ? (
              <>
                <span>
                  {name} · {ROLE_LABEL[role]}
                </span>
                <form action={logoutAction}>
                  <button className="rounded-lg px-2 py-1 hover:bg-[#F4F5F9]" type="submit">
                    退出
                  </button>
                </form>
              </>
            ) : (
              <Link href="/headcount/login" className="hover:text-primary">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
