import { LeaderBoard } from "@/components/headcount/leader-board";
import { ScopeOverviewBoard } from "@/components/headcount/scope-overview";
import { assertKnownDepartment, openBaseline, openDepartment } from "@/lib/headcount/db/present";
import { detailQueryFromSearch } from "@/lib/headcount/rosterPage";
import { DepartmentMissing, ScopeDenied } from "@/lib/headcount/scopeGuard";
import { currentUser } from "@/lib/headcount/session";
import { forbidden, notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselinePage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; people?: string; types?: string; page?: string; size?: string; agents?: string; agentSort?: string; agentPage?: string; agentSize?: string; open?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  const query = await searchParams;
  if (query.dept) {
    try {
      await assertKnownDepartment(query.dept);
    } catch (error) {
      if (error instanceof DepartmentMissing) notFound();
      throw error;
    }
  }
  if (user.role === "leader") forbidden();
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const detail = detailQueryFromSearch(query);
  if (query.dept) {
    try {
      const data = await openDepartment(user, query.dept, detail);
      return <LeaderBoard view={data.view} />;
    } catch (error) {
      if (error instanceof DepartmentMissing) notFound();
      if (error instanceof ScopeDenied) forbidden();
      throw error;
    }
  }
  const data = await openBaseline(user, detail);
  return (
    <div className="space-y-5">
      <ScopeOverviewBoard overview={data.overview} />
      <LeaderBoard view={data.view} variant="roster" />
    </div>
  );
}
