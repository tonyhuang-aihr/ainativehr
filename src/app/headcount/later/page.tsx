import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LaterPage() {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  return (
    <article className="max-w-2xl space-y-3 rounded-2xl border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold">规划中（P1/P2）</h1>
      <p className="text-sm leading-7 text-muted">场景、时间轴和沙盘方案导入在「场景」页，只有 OD / HRBP 能看。供需测算、缺口行动、招聘成本和办公成本放在 P1。滚动预测放在 P2。</p>
    </article>
  );
}
