import { HeadcountChrome } from "@/components/headcount/chrome";
import { isDemo } from "@/lib/headcount/env";
import { currentUser } from "@/lib/headcount/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HeadcountLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <HeadcountChrome role={user?.role ?? null} name={user?.name ?? ""} demo={isDemo()}>
      {children}
    </HeadcountChrome>
  );
}
