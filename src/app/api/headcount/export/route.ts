import { can } from "@/lib/headcount/authz";
import { getDb } from "@/lib/headcount/db/client";
import { loadPlan, loadSettings } from "@/lib/headcount/db/queries";
import { scopeFor } from "@/lib/headcount/db/present";
import { currentUser } from "@/lib/headcount/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user || !can(user, "export")) return Response.json({ error: "无权导出" }, { status: 403 });
  const db = await getDb();
  const settings = await loadSettings(db);
  const { visible } = await scopeFor(user);
  const sensitive = can(user, "viewCompensation") || can(user, "viewOneOff");
  const plan = await loadPlan(db, { departmentIds: user.role === "sys_admin" ? null : visible, sensitive });
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), dataVersion: settings.dataVersion, plan }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=headcount-export.json",
    },
  });
}
