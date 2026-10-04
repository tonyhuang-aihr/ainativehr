import { LeaderBoard } from "@/components/headcount/leader-board";
import { assertKnownDepartment, openDepartment } from "@/lib/headcount/db/present";
import { detailQueryFromSearch } from "@/lib/headcount/rosterPage";
import { DepartmentMissing, ScopeDenied } from "@/lib/headcount/scopeGuard";
import { currentUser } from "@/lib/headcount/session";
import { forbidden, notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselineDepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ deptId: string }>;
  searchParams: Promise<{ dept?: string; people?: string; types?: string; page?: string; size?: string; agents?: string; agentSort?: string; agentPage?: string; agentSize?: string; open?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  const { deptId } = await params;
  const query = await searchParams;
  try {
    await assertKnownDepartment(deptId);
    if (query.dept) await assertKnownDepartment(query.dept);
  } catch (error) {
    if (error instanceof DepartmentMissing) notFound();
    throw error;
  }
  if (user.role === "leader") forbidden();
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const detail = detailQueryFromSearch(query);
  let data;
  try {
    data = await openDepartment(user, query.dept ?? deptId, detail);
  } catch (error) {
    if (error instanceof DepartmentMissing) notFound();
    if (error instanceof ScopeDenied) forbidden();
    throw error;
  }
  return <LeaderBoard view={data.view} />;
}
