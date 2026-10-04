import { createElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RETURN_VIEW_TEXT, SCENARIO_MISSING_TEXT, SCOPE_DENIED_TEXT } from "@/components/headcount/access-state";
import { DEPT } from "@/lib/headcount/sample";

const session = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; role: "od" | "hrbp"; departmentIds: string[] },
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
import BaselineDepartmentPage from "@/app/headcount/baseline/[deptId]/page";
import LeaderPage from "@/app/headcount/leader/page";
import ScenariosPage from "@/app/headcount/scenarios/page";
import nextConfig from "../../../next.config";

const lin = { id: "lin", name: "林", role: "hrbp" as const, departmentIds: [DEPT.prod1] };
const huang = { id: "huang", name: "黄", role: "od" as const, departmentIds: [] as string[] };

function statusOf(error: unknown): number {
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  const message = error instanceof Error ? error.message : "";
  const text = digest || message;
  if (text.endsWith(";403")) return 403;
  if (text.endsWith(";404")) return 404;
  throw error;
}

async function expectStatus(run: () => Promise<unknown>, status: 403 | 404) {
  try {
    const page = await run();
    const html = renderToStaticMarkup(page as ReturnType<typeof createElement>);
    throw new Error(`页面正常返回了，没有 ${status}：${html.slice(0, 120)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("页面正常返回了")) throw error;
    expect(statusOf(error)).toBe(status);
    const html = renderToStaticMarkup(createElement(status === 403 ? ForbiddenPage : NotFoundPage));
    expect(html).toContain(status === 403 ? SCOPE_DENIED_TEXT : SCENARIO_MISSING_TEXT);
    expect(html).toContain(RETURN_VIEW_TEXT);
    expect(html).toContain('href="/headcount"');
  }
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
  }, 120_000);

  it("黄访问不存在的场景也是 404，不会落到默认场景", async () => {
    session.user = huang;
    await expectStatus(() => ScenariosPage({ searchParams: Promise.resolve({ focus: "doesnotexist" }) }), 404);
  }, 120_000);
});
