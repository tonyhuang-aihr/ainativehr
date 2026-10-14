import { currentUser } from "@/lib/headcount/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExplainPage() {
  const user = await currentUser();
  if (!user) redirect("/headcount/login");
  return (
    <article className="max-w-2xl space-y-4 rounded-2xl border border-line bg-white p-6 text-sm leading-7">
      <h1 className="text-2xl font-semibold">数据说明</h1>
      <p>个人补偿估算不存储、不展示，只以部门汇总呈现。</p>
      <p>负责人看到的是部门汇总、人员成本区间，以及已经确认的加入和离开。姓名可以出现在他负责的部门里。工号暂不显示。离职只写生效日，不写原因。</p>
      <p>发给模型的内容只有该负责人能看到的部门汇总。少于 5 人的部门不送人数，也不送能换算到个人的金额，模板结论同样遵守。没有模型密钥时，结论用模板。</p>
      <p>经济补偿、Agent 实施和培训不进入负责人视图。部门预算只和人员成本、Agent 日常费用比较。</p>
      <p>访问、精确估算开关和操作都会留日志，至少保留 6 个月。一键清除是单独的退出流程。</p>
    </article>
  );
}
