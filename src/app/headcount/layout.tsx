import { HeadcountChrome } from "@/components/headcount/chrome";
import { isDemo } from "@/lib/headcount/env";
import { currentUser } from "@/lib/headcount/session";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "编制与成本规划",
};

export default async function HeadcountLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <HeadcountChrome role={user?.role ?? null} name={user?.name ?? ""} demo={isDemo()}>
      {children}
    </HeadcountChrome>
  );
}
