import { LeaderBoard } from "@/components/headcount/leader-board";
import { ScopeOverviewBoard } from "@/components/headcount/scope-overview";
import { openLeader } from "@/lib/headcount/db/present";
import { detailQueryFromSearch } from "@/lib/headcount/rosterPage";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LeaderPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; people?: string; types?: string; page?: string; size?: string; agents?: string; agentSort?: string; agentPage?: string; agentSize?: string; open?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const query = await searchParams;
  const detail = detailQueryFromSearch(query);
  let screen;
  try {
    screen = await openLeader(user, query.dept, detail);
  } catch {
    screen = await openLeader(user, undefined, detail);
  }
  if (screen.kind === "overview") {
    return (
      <div className="space-y-5">
        <ScopeOverviewBoard overview={screen.overview} />
        <LeaderBoard view={screen.view} variant="roster" />
      </div>
    );
  }
  return <LeaderBoard view={screen.view} />;
}
