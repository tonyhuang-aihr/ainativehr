import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LaterPage() {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  return (
    <article className="max-w-2xl space-y-3 rounded-2xl border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold">规划中（P1/P2）</h1>
      <p className="text-sm leading-7 text-muted">情景推演、时间线和沙盘方案导入还没做。这里只留一个入口，避免和这一期的底座、负责人视图混在一起。</p>
    </article>
  );
}
