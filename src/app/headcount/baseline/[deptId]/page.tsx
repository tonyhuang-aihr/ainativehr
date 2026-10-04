import { LeaderBoard } from "@/components/headcount/leader-board";
import { openDepartment } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselineDepartmentPage({ params }: { params: Promise<{ deptId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "leader") redirect("/headcount/leader");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const { deptId } = await params;
  let data;
  try {
    data = await openDepartment(user, deptId);
  } catch {
    redirect("/headcount/baseline");
  }
  return <LeaderBoard view={data.view} marks={data.showMarks ? data.marks : undefined} />;
}
