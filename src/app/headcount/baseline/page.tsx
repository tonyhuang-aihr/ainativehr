import { LeaderBoard } from "@/components/headcount/leader-board";
import { ScopeOverviewBoard } from "@/components/headcount/scope-overview";
import { openBaseline } from "@/lib/headcount/db/present";
import { detailQueryFromSearch } from "@/lib/headcount/rosterPage";
import { currentUser } from "@/lib/headcount/session";
import { forbidden, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselinePage({
  searchParams,
}: {
  searchParams: Promise<{ people?: string; types?: string; page?: string; size?: string; agents?: string; agentSort?: string; agentPage?: string; agentSize?: string; open?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "leader") forbidden();
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const data = await openBaseline(user, detailQueryFromSearch(await searchParams));
  return (
    <div className="space-y-5">
      <ScopeOverviewBoard overview={data.overview} />
      <LeaderBoard view={data.view} variant="roster" />
    </div>
  );
}
