import { redirect } from "next/navigation";
import { currentUser } from "@/lib/headcount/session";

export const dynamic = "force-dynamic";

export default async function HeadcountHome() {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  if (user.role === "leader") redirect("/headcount/leader");
  if (user.role === "hrbp") redirect("/headcount/baseline");
  if (user.role === "sys_admin") redirect("/headcount/admin");
  redirect("/headcount/baseline");
}
