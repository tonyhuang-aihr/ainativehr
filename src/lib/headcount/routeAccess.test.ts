import { createElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEPARTMENT_MISSING_TEXT, RETURN_VIEW_TEXT, SCENARIO_MISSING_TEXT, SCOPE_DENIED_TEXT } from "@/components/headcount/access-state";
import { DEPT } from "@/lib/headcount/sample";

const session = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; role: "od" | "hrbp" | "leader"; departmentIds: string[] },
}));

vi.mock("@/lib/headcount/session", () => ({
  currentUser: async () => session.user,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ refresh: () => undefined }),
  };
});

import ForbiddenPage from "@/app/headcount/forbidden";
import NotFoundPage from "@/app/headcount/not-found";
import BaselinePage from "@/app/headcount/baseline/page";
import BaselineDepartmentPage from "@/app/headcount/baseline/[deptId]/page";
import BaselineDepartmentNotFound from "@/app/headcount/baseline/[deptId]/not-found";
import LeaderPage from "@/app/headcount/leader/page";
import LeaderNotFound from "@/app/headcount/leader/not-found";
import ScenariosPage from "@/app/headcount/scenarios/page";
import { POST as postScenarioWrite } from "@/app/headcount/scenarios/write/route";
import nextConfig from "../../../next.config";

const lin = { id: "lin", name: "林", role: "hrbp" as const, departmentIds: [DEPT.prod1] };
const huang = { id: "huang", name: "黄", role: "od" as const, departmentIds: [] as string[] };
const zhao = { id: "zhao", name: "赵一", role: "leader" as const, departmentIds: [DEPT.plat] };
const qian = { id: "qian", name: "钱二", role: "leader" as const, departmentIds: [DEPT.infra] };

function statusOf(error: unknown): number {
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  const message = error instanceof Error ? error.message : "";
  const text = digest || message;
  if (text.endsWith(";403")) return 403;
  if (text.endsWith(";404")) return 404;
  throw error;
}

async function expectStatus(run: () => Promise<unknown>, status: 403 | 404, missingPage?: () => ReturnType<typeof createElement>) {
  try {
    const page = await run();
    const html = renderToStaticMarkup(page as ReturnType<typeof createElement>);
    throw new Error(`页面正常返回了，没有 ${status}：${html.slice(0, 120)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("页面正常返回了")) throw error;
    expect(statusOf(error)).toBe(status);
    const html = renderToStaticMarkup(createElement(status === 403 ? ForbiddenPage : (missingPage ?? NotFoundPage)));
    expect(html).toContain(status === 403 ? SCOPE_DENIED_TEXT : missingPage ? DEPARTMENT_MISSING_TEXT : SCENARIO_MISSING_TEXT);
    if (missingPage) expect(html).not.toContain(SCENARIO_MISSING_TEXT);
    expect(html).toContain(RETURN_VIEW_TEXT);
    expect(html).toContain('href="/headcount"');
  }
}

function redirectDigest(error: unknown): string {
  return typeof error === "object" && error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
}

describe("未知场景 404，范围外 403", () => {
  beforeAll(() => {
    process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "1";
  });

  it("构建打开了 forbidden 的真实状态码", () => {
    expect(nextConfig.experimental?.authInterrupts).toBe(true);
  });

  it("林访问范围外的部门和场景时渲染 403，未知场景渲染 404", async () => {
    session.user = lin;
    const departments = [DEPT.plat, DEPT.ai, DEPT.qa, DEPT.prod2, DEPT.data, DEPT.infra, DEPT.direct];
    for (const deptId of departments) {
      await expectStatus(() => BaselineDepartmentPage({ params: Promise.resolve({ deptId }), searchParams: Promise.resolve({}) }), 403);
    }
    for (const dept of [DEPT.plat, DEPT.infra, DEPT.ai]) {
      await expectStatus(() => LeaderPage({ searchParams: Promise.resolve({ dept }) }), 403);
    }
    for (const focus of ["jj", "fa", "jz", "bs", "jx", "bu-plat-jz"]) {
      await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus }) }), 403);
    }
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus: "doesnotexist" }) }), 404);
  }, 120_000);

  it("林的默认场景页能打开，并带上演示说明", async () => {
    session.user = lin;
    const page = await ScenariosPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("场景与时间轴");
    expect(html).toContain("演示模式：刷新后沙盘方案从本机浏览器恢复");
    expect(html).toContain("bu-prod1-jz");
    expect(html).not.toContain("16,095.5");
    expect(html).toContain("场景总成本 = 日常成本（人工 + Agent 席位、算力）。一次性费用（经济补偿、Agent 实施和培训费）由 HR 和 OD 统一管理，不计入。");
    expect(html).toContain("没有可导入的沙盘示例。只能载入范围完全落在本事业部内的方案。");
    expect(html).not.toContain("载入沙盘示例方案 A");
    expect(html).not.toContain("应用分析小组并入数据组");
    expect(html).not.toContain(">一次性<");
    expect(html).toContain('action="/headcount/scenarios/write"');
    expect(html).toContain('method="post"');
    expect(html).toMatch(/<input\b[^>]*name="intent"[^>]*value="change"|<input\b[^>]*value="change"[^>]*name="intent"/);
    expect(html).not.toContain("$ACTION_");
  }, 120_000);

  it("黄的场景页保留一次性列和公司沙盘示例", async () => {
    session.user = huang;
    const page = await ScenariosPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain(">一次性<");
    expect(html).toContain("载入沙盘示例方案 A");
    expect(html).toContain("应用分析小组并入数据组");
    expect(html).not.toContain("没有可导入的沙盘示例");
    expect(html).toContain('method="post"');
  }, 120_000);

  it("黄打开 HRBP 投影场景仍是 404", async () => {
    session.user = huang;
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus: "bu-prod1-jz" }) }), 404);
  }, 120_000);

  it("黄访问不存在的场景也是 404，不会落到默认场景", async () => {
    session.user = huang;
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus: "doesnotexist" }) }), 404);
  }, 120_000);

  it("负责人访问底座和场景是 403，未知部门是 404", async () => {
    session.user = zhao;
    const home = renderToStaticMarkup(await LeaderPage({ searchParams: Promise.resolve({}) }));
    expect(home).toContain("平台部");
    await expectStatus(() => BaselinePage({ searchParams: Promise.resolve({}) }), 403);
    await expectStatus(() => BaselineDepartmentPage({ params: Promise.resolve({ deptId: DEPT.prod1 }), searchParams: Promise.resolve({}) }), 403);
    await expectStatus(() => BaselineDepartmentPage({ params: Promise.resolve({ deptId: DEPT.plat }), searchParams: Promise.resolve({}) }), 403);
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus: "jj" }) }), 403);
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus: "doesnotexist" }) }), 403);
    await expectStatus(
      () => BaselineDepartmentPage({ params: Promise.resolve({ deptId: "doesnotexist" }), searchParams: Promise.resolve({}) }),
      404,
      BaselineDepartmentNotFound,
    );
    await expectStatus(() => LeaderPage({ searchParams: Promise.resolve({ dept: "doesnotexist" }) }), 404, LeaderNotFound);

    session.user = qian;
    await expectStatus(() => BaselinePage({ searchParams: Promise.resolve({}) }), 403);
    await expectStatus(() => BaselineDepartmentPage({ params: Promise.resolve({ deptId: DEPT.prod1 }), searchParams: Promise.resolve({}) }), 403);
    await expectStatus(() => BaselineDepartmentPage({ params: Promise.resolve({ deptId: DEPT.plat }), searchParams: Promise.resolve({}) }), 403);
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({}) }), 403);
  }, 120_000);

  it("未知部门对黄和林都是 404，真实的范围外部门仍是 403", async () => {
    session.user = huang;
    await expectStatus(
      () => BaselineDepartmentPage({ params: Promise.resolve({ deptId: "doesnotexist" }), searchParams: Promise.resolve({}) }),
      404,
      BaselineDepartmentNotFound,
    );
    await expectStatus(() => LeaderPage({ searchParams: Promise.resolve({ dept: "doesnotexist" }) }), 404, LeaderNotFound);
    session.user = lin;
    await expectStatus(
      () => BaselineDepartmentPage({ params: Promise.resolve({ deptId: "doesnotexist" }), searchParams: Promise.resolve({}) }),
      404,
      BaselineDepartmentNotFound,
    );
    await expectStatus(() => LeaderPage({ searchParams: Promise.resolve({ dept: "doesnotexist" }) }), 404, LeaderNotFound);
    await expectStatus(() => BaselineDepartmentPage({ params: Promise.resolve({ deptId: DEPT.plat }), searchParams: Promise.resolve({}) }), 403);
  }, 120_000);

  it("记入这一季用普通 POST 写入，公司示例对林的导入动作会被拒绝", async () => {
    session.user = lin;
    const change = new FormData();
    change.set("intent", "change");
    change.set("id", "bu-prod1-jz");
    change.set("kind", "hire");
    change.set("count", "1");
    change.set("quarter", "2");
    change.set("department", "产品研发一部");
    change.set("grade", "P6");
    change.set("mark", "N");
    change.set("tenure", "2");
    try {
      const response = await postScenarioWrite(new Request("http://localhost/headcount/scenarios/write", { method: "POST", body: change }));
      throw new Error(`没有重定向：${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("没有重定向")) throw error;
      expect(decodeURIComponent(redirectDigest(error))).toContain("这一季的变动已记入场景");
    }

    const sample = new FormData();
    sample.set("intent", "import-sample");
    sample.set("sampleId", "fa");
    sample.set("quarter", "2");
    try {
      const response = await postScenarioWrite(new Request("http://localhost/headcount/scenarios/write", { method: "POST", body: sample }));
      throw new Error(`没有重定向：${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("没有重定向")) throw error;
      expect(decodeURIComponent(redirectDigest(error))).toContain("无权查看");
    }

    const unknown = new FormData();
    unknown.set("intent", "nope");
    const rejected = await postScenarioWrite(new Request("http://localhost/headcount/scenarios/write", { method: "POST", body: unknown }));
    expect(rejected.status).toBe(400);
  }, 120_000);
});
