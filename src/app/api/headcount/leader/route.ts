import { forbiddenLeaderPaths } from "@/lib/headcount/leaderView";
import { openLeader } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const departmentId = new URL(request.url).searchParams.get("dept") ?? undefined;
  try {
    const view = await openLeader(user, departmentId);
    if (forbiddenLeaderPaths(view).length) return Response.json({ error: "响应含有不该出现的字段" }, { status: 500 });
    return Response.json(view);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法查看";
    const status = message.includes("授权") || message.includes("无权") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
