import { LeaderBoard } from "@/components/headcount/leader-board";
import { openDepartment } from "@/lib/headcount/db/present";
import { detailQueryFromSearch } from "@/lib/headcount/rosterPage";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselineDepartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ deptId: string }>;
  searchParams: Promise<{ people?: string; types?: string; page?: string; size?: string; agents?: string; agentSort?: string; agentPage?: string; agentSize?: string; open?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "leader") redirect("/headcount/leader");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const { deptId } = await params;
  const detail = detailQueryFromSearch(await searchParams);
  let data;
  try {
    data = await openDepartment(user, deptId, detail);
  } catch {
    redirect("/headcount/baseline");
  }
  return <LeaderBoard view={data.view} />;
}
