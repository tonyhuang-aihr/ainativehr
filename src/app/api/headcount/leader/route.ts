import { forbiddenLeaderPaths } from "@/lib/headcount/leaderView";
import { openLeader } from "@/lib/headcount/db/present";
import { detailQueryFromSearch } from "@/lib/headcount/rosterPage";
import { currentUser } from "@/lib/headcount/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const url = new URL(request.url);
  const departmentId = url.searchParams.get("dept") ?? undefined;
  const detail = detailQueryFromSearch({
    people: url.searchParams.get("people") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    size: url.searchParams.get("size") ?? undefined,
    agents: url.searchParams.get("agents") ?? undefined,
    agentPage: url.searchParams.get("agentPage") ?? undefined,
    agentSize: url.searchParams.get("agentSize") ?? undefined,
    open: url.searchParams.get("open") ?? undefined,
  });
  try {
    const view = await openLeader(user, departmentId, detail);
    if (forbiddenLeaderPaths(view).length) return Response.json({ error: "响应含有不该出现的字段" }, { status: 500 });
    return Response.json(view);
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法查看";
    const status = message.includes("授权") || message.includes("无权") ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}
