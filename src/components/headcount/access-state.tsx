export const SCOPE_DENIED_TEXT = "你没有查看这个范围的权限";
export const SCENARIO_MISSING_TEXT = "场景不存在或已删除";
export const DEPARTMENT_MISSING_TEXT = "部门不存在";
export const RETURN_VIEW_TEXT = "返回我的视图";
export const RETURN_VIEW_HREF = "/headcount";

export function AccessStatePage({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <a className="mt-6 inline-block text-sm text-primary" href={RETURN_VIEW_HREF}>
        {RETURN_VIEW_TEXT}
      </a>
    </main>
  );
}
