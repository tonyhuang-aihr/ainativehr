import { LeaderBoard } from "@/components/headcount/leader-board";
import { openLeader } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LeaderPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const query = await searchParams;
  let view;
  try {
    view = await openLeader(user, query.dept);
  } catch {
    view = await openLeader(user);
  }
  return <LeaderBoard view={view} />;
}
