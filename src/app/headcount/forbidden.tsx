export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">无权查看</h1>
      <p className="mt-3 text-sm text-muted">这个范围不在你的授权里。</p>
    </main>
  );
}
