import { ScopeOverviewBoard } from "@/components/headcount/scope-overview";
import { openBaseline } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BaselinePage() {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "leader") redirect("/headcount/leader");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  const data = await openBaseline(user);
  return <ScopeOverviewBoard overview={data.overview} />;
}
