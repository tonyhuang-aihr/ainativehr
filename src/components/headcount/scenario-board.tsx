import {
  addScenarioChangeAction,
  copyScenarioAction,
  createScenarioAction,
  importSampleSandboxAction,
  importSandboxFileAction,
  prefillAssumptionsAction,
  renameScenarioAction,
  saveAssumptionsAction,
  toggleScenarioAction,
} from "@/lib/headcount/actions";
import { SandboxLocalRestore } from "@/components/headcount/sandbox-restore";
import { ScenarioFileField } from "@/components/headcount/scenario-file-field";
import { DepartmentDailyRows } from "@/components/headcount/department-daily-rows";
import { InfoMark } from "@/components/headcount/info-mark";
import { COMPARE_SCROLL_HINT, SCENARIO_TOTAL_NOTE, TIMELINE_CHANGE_NOTE } from "@/lib/headcount/copy";
import type { ScenarioDefinition } from "@/lib/headcount/scenario";
import type { ScenarioBoard } from "@/lib/headcount/scenarioView";

const field = "w-full rounded-xl border border-line px-3 py-2";

const sticky = "sticky left-0 z-10 bg-white shadow-[1px_0_0_#E6E8EC]";

function healthShort(name: string): string {
  if (name.includes("拆组前")) return "方案 A 拆组前";
  if (name.startsWith("激进")) return "激进";
  if (name.startsWith("基准")) return "基准";
  return name;
}

export function ScenarioBoardView({
  board,
  notice,
  sandboxRestore,
}: {
  board: ScenarioBoard;
  notice?: string;
  sandboxRestore?: { userId: string; scopeKey: string; plans: ScenarioDefinition[] } | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">场景与时间轴</h1>
          <p className="mt-1 text-sm text-muted">基于基线（含已确认在途）· 仅 OD / HRBP 可见 · {board.year} 自然季度</p>
          {sandboxRestore ? <SandboxLocalRestore userId={sandboxRestore.userId} scopeKey={sandboxRestore.scopeKey} plans={sandboxRestore.plans} /> : null}
        </div>
        <a className="text-sm text-primary" href="/headcount/explain">
          口径说明
        </a>
      </div>
      {notice ? <p className="rounded-xl bg-primarySoft px-3 py-2 text-sm text-primary">{notice}</p> : null}

      <section className="grid gap-6 rounded-2xl border border-line bg-white p-6 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="text-xs text-[#7C3AED]">
            AI 生成 · 依据可查
            <InfoMark note={SCENARIO_TOTAL_NOTE} />
          </p>
          <p className="mt-3 text-base leading-8">{board.hero}</p>
          <p className="mt-4 text-xs text-muted">{board.oneOffCaption}</p>
        </div>
        <div className="border-line lg:border-l lg:pl-6">
          <p className="text-sm text-muted">成本最低 · {board.lowestName}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-primary">
            {board.lowestTotal}
            <span className="ml-1 text-base font-normal text-muted">万</span>
          </p>
          <div className="mt-4 h-2 rounded-full bg-[#EEF0F3]">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, board.usage)}%` }} />
          </div>
          <p className="mt-2 flex justify-between text-xs text-muted">
            <span>
              {board.budgetCaption} {board.budget} 万
            </span>
            <span>为预算的 {board.percent}</span>
          </p>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Step n="1" title="选场景" body={board.stepSelect} note={board.stepSelectNote} />
        <Step n="2" title="调假设" body={board.stepAssume} note={board.stepAssumeNote} />
        <Step n="3" title="看对比 / 体检" body={board.stepCheck} note={board.stepCheckNote} current />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section id="scenario-compare" className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex items-center gap-2 px-4 py-3 text-sm">
          <b>场景对比</b>
          <span className="text-muted">全年 · 万元</span>
          <a className="ml-auto text-primary" href="#scenario-timeline">
            按季度看
          </a>
        </div>
        <p className="px-4 pb-2 text-xs text-muted">{COMPARE_SCROLL_HINT}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-y border-line text-right">
                <th className={`px-4 py-3 text-left font-medium text-muted ${sticky}`} />
                {board.columns.map((column) => (
                  <th key={column.id} className={`px-4 py-3 font-medium ${column.lowest ? "bg-[#FAFAFF] text-primary" : ""}`}>
                    <div className="text-ink">{column.name}</div>
                    <div className="text-xs font-normal text-muted">{column.subtitle}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line text-right">
                <td className={`px-4 py-3 text-left ${sticky}`}>{board.totalLabel}</td>
                {board.columns.map((column) => (
                  <td key={column.id} className={`px-4 py-3 ${column.lowest ? "bg-[#FAFAFF]" : ""}`}>
                    <div className={`text-lg font-semibold ${column.lowest ? "text-primary" : ""}`}>{column.total}</div>
                  </td>
                ))}
              </tr>
              <Metric label={`对比${board.budgetCaption} ${board.budget}`} values={board.columns.map((column) => ({ id: column.id, text: column.gap, warn: column.over, lowest: column.lowest }))} />
              <Metric label="期末正式人数" values={board.columns.map((column) => ({ id: column.id, text: String(column.people), lowest: column.lowest }))} />
              <Metric label="期末 Agent 数" values={board.columns.map((column) => ({ id: column.id, text: String(column.agents), lowest: column.lowest }))} />
              <Metric label="人 : AI 按工时" values={board.columns.map((column) => ({ id: column.id, text: column.ratio, muted: column.ratio === "未拆解", lowest: column.lowest }))} />
              <tr>
                <td className={`bg-[#FCFCFD] px-4 py-2 text-xs text-muted ${sticky}`} colSpan={1}>
                  构成
                </td>
                <td className="bg-[#FCFCFD]" colSpan={board.columns.length} />
              </tr>
              {board.dailyBreakdown ? (
                <DepartmentDailyRows columns={board.columns} note={board.dailyBreakdown.note} />
              ) : (
                <Metric label="部门持续成本 人工 + Agent" values={board.columns.map((column) => ({ id: column.id, text: column.daily, lowest: column.lowest }))} />
              )}
              {board.showOneOff ? <Metric label="一次性 HR / OD 统一管理" values={board.columns.map((column) => ({ id: column.id, text: column.oneOff, lowest: column.lowest }))} /> : null}
            </tbody>
          </table>
        </div>
      </section>
      <aside id="health-checks" className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white">
        <h2 className="px-4 py-3 text-sm font-semibold">体检 · {board.health.length} 个场景 · {board.health[0]?.cells.length ?? 0} 项</h2>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 whitespace-nowrap text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className={`border-b border-line px-3 py-2 font-medium ${sticky}`} />
                {board.health.map((row) => (
                  <th key={row.id} className="border-b border-line px-3 py-2 font-medium">
                    {healthShort(row.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.health[0]?.cells.map((cell, index) => (
                <tr key={cell.title}>
                  <td className={`border-b border-line px-3 py-2 text-muted ${sticky}`}>{cell.title}</td>
                  {board.health.map((row) => {
                    const item = row.cells[index];
                    return (
                      <td key={row.id} className={`border-b border-line px-3 py-2 ${item?.tone === "warn" ? "text-[#DC2626]" : ""} ${item?.tone === "compliance" ? "text-[#92400E]" : ""} ${item?.tone === "muted" ? "text-muted" : ""}`}>
                        {item?.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {board.healthFootnote ? <p className="border-t border-line px-4 py-3 text-sm leading-6 text-muted">{board.healthFootnote}</p> : null}
        {board.incompleteRatioNote ? <p className="border-t border-line px-4 py-3 text-sm text-muted">{board.incompleteRatioNote}</p> : null}
      </aside>
      </div>

      <section id="scenario-timeline" className="overflow-hidden rounded-2xl border border-line bg-white">
        <details open>
          <summary className="list-none cursor-pointer px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center gap-3">
              <b>{board.timelineTitle}</b>
              <span className="text-muted">{board.timelineSummary}</span>
            </span>
            <span className="mt-1 block text-xs text-muted">
              {board.timelineCaption}
              <InfoMark note={TIMELINE_CHANGE_NOTE} />
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-muted">
                  <th className="px-4 py-2 text-left font-medium">季度</th>
                  <th className="px-4 py-2 font-medium">人数</th>
                  <th className="px-4 py-2 font-medium">Agent</th>
                  <th className="px-4 py-2 font-medium">人工</th>
                  <th className="px-4 py-2 font-medium">Agent 成本</th>
                  <th className="px-4 py-2 font-medium">一次性</th>
                  <th className="px-4 py-2 font-medium">总成本</th>
                </tr>
              </thead>
              <tbody>
                {board.timelineRows.map((row) => (
                  <tr key={row.quarter} className="border-t border-line text-right">
                    <td className="px-4 py-2 text-left">{row.quarter}</td>
                    <td className="px-4 py-2">{row.people}</td>
                    <td className="px-4 py-2">{row.agents}</td>
                    <td className="px-4 py-2">{row.labor}</td>
                    <td className="px-4 py-2">{row.agentCost}</td>
                    <td className="px-4 py-2">{row.oneOff}</td>
                    <td className="px-4 py-2 font-medium">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <div className="border-t border-line px-4 py-3 text-sm text-muted">
          <b className="text-ink">基础假设</b>
          <span className="ml-3">{board.assumptionSummary}</span>
        </div>
        <div className="border-t border-line px-4 py-3 text-sm text-muted">
          <b className="text-ink">场景减员</b>
          <span className="ml-3">{board.cutSummary}</span>
        </div>
      </section>

      <p id="assumption-prefill" className="text-sm text-muted">
        {board.prefillNote}
      </p>

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={saveAssumptionsAction} className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">编辑假设 · {board.scenarios.find((item) => item.id === board.focusId)?.name}</h2>
          <input name="id" type="hidden" value={board.focusId} />
          <label className="block">
            离职率（%）
            <input className={field} defaultValue={board.assumptionForm.attrition} name="attrition" />
          </label>
          <label className="block">
            招聘周期（天）
            <input className={field} defaultValue={board.assumptionForm.cycle} name="cycle" />
          </label>
          <label className="block">
            调薪率（%）
            <input className={field} defaultValue={board.assumptionForm.raise} name="raise" />
          </label>
          <label className="block">
            AI 替代比例（%，留空表示沿用沙盘拆解）
            <input className={field} defaultValue={board.assumptionForm.ai} name="ai" placeholder="沿用沙盘拆解" />
          </label>
          <label className="flex items-center gap-2">
            <input defaultChecked={board.assumptionForm.noticePay} name="noticePay" type="checkbox" />
            N+1 计入经济补偿（默认不计入）
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl bg-primary px-3 py-2 text-white" type="submit">
              保存假设
            </button>
          </div>
        </form>
        <form action={prefillAssumptionsAction} className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
          <h2 className="font-medium">预填假设</h2>
          <input name="id" type="hidden" value={board.focusId} />
          <p className="leading-6 text-muted">预填先走脱敏。不足 5 人的部门不送人数，也不送能反推到个人的金额。</p>
          <button className="rounded-xl border border-line px-3 py-2" type="submit">
            用默认值或模型预填
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 text-sm">
        <h2 className="font-medium">按季度记一笔变动</h2>
        <form action={addScenarioChangeAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <input name="id" type="hidden" value={board.focusId} />
          <select className={field} name="kind">
            <option value="hire">增员</option>
            <option value="agent">Agent</option>
            <option value="cut">减员</option>
          </select>
          <select className={field} name="quarter" defaultValue="2">
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>
          <input className={field} name="count" placeholder="人数" />
          <select className={field} name="department">
            {board.departments.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <select className={field} name="grade">
            {board.grades.map((grade) => (
              <option key={grade}>{grade}</option>
            ))}
          </select>
          <input className={field} name="agentName" placeholder="Agent 名称" />
          <input className={field} name="monthly" placeholder="单实例月费（元）" />
          <input className={field} name="oneOff" placeholder="一次性（元）" />
          <select className={field} name="mark" defaultValue="N">
            <option value="N">经济补偿 N</option>
            <option value="N+1">N+1</option>
            <option value="不计">不计</option>
          </select>
          <input className={field} name="tenure" placeholder="部门平均司龄（年）" />
          <button className="rounded-xl bg-primary px-3 py-2 text-white" type="submit">
            记入这一季
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">减员成本算到最后工作日，含当天。补偿只按部门合计显示，不落个人金额。</p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4 text-sm">
        <h2 className="font-medium">场景列表</h2>
        <ul className="mt-3 divide-y divide-line">
          {board.scenarios.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-2">
              <a className="font-medium text-primary" href={`/headcount/scenarios?focus=${item.id}`}>
                {item.name}
              </a>
              <span className="text-xs text-muted">{item.compared ? "对比中" : "未加入对比"}</span>
              <form action={toggleScenarioAction}>
                <input name="id" type="hidden" value={item.id} />
                {item.compared ? null : <input name="compared" type="hidden" value="on" />}
                <button className="rounded-lg px-2 py-1 text-primary" type="submit">
                  {item.compared ? "移出对比" : "加入对比"}
                </button>
              </form>
              <form action={copyScenarioAction}>
                <input name="id" type="hidden" value={item.id} />
                <button className="rounded-lg px-2 py-1 text-primary" type="submit">
                  复制
                </button>
              </form>
              <form action={renameScenarioAction} className="flex items-center gap-2">
                <input name="id" type="hidden" value={item.id} />
                <input className="w-36 rounded-lg border border-line px-2 py-1" name="name" placeholder="新名称" />
                <button className="rounded-lg px-2 py-1 text-primary" type="submit">
                  重命名
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={createScenarioAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input className={field} name="name" placeholder="新场景名称" />
          <button className="rounded-xl border border-line px-3 py-2" type="submit">
            新建场景
          </button>
        </form>
      </section>

      <section id="sandbox-import" className="rounded-2xl border border-line bg-white p-4 text-sm">
        <h2 className="font-medium">从沙盘导入方案</h2>
        <p className="mt-2 leading-6 text-muted">沙盘不接编制服务端的花名册。请上传沙盘在本地导出的方案文件，服务器只保留部门结构、人数变化、人 : AI 和算力。生效季度由 OD 选定。</p>
        {board.importNote ? (
          <div className="mt-3 rounded-xl bg-[#F8F9FF] px-3 py-3 leading-6">
            <p>{board.importNote}</p>
            <p>人 : AI {board.importRatio}</p>
            {board.importSpan ? <p>管理幅度 {board.importSpan}</p> : null}
          </div>
        ) : null}
        <form action={importSandboxFileAction} className="mt-3 flex flex-wrap items-center gap-3">
          <ScenarioFileField />
          <select className="rounded-xl border border-line px-3 py-2" name="quarter" defaultValue="2">
            <option value="1">Q1 生效</option>
            <option value="2">Q2 生效</option>
            <option value="3">Q3 生效</option>
            <option value="4">Q4 生效</option>
          </select>
          <button className="rounded-xl border border-line px-3 py-2" type="submit">
            上传方案文件
          </button>
        </form>
        <form action={importSampleSandboxAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input name="quarter" type="hidden" value="2" />
          <button className="rounded-xl bg-primary px-3 py-2 text-white" type="submit">
            载入沙盘示例方案 A
          </button>
          <span className="text-muted">应用分析小组并入数据组</span>
        </form>
      </section>

      <p className="text-xs text-muted">{board.footer}</p>
    </div>
  );
}

function Step({ n, title, body, note, current }: { n: string; title: string; body: string; note: string; current?: boolean }) {
  return (
    <article className={`rounded-2xl border bg-white p-4 ${current ? "border-[#A5B4FC]" : "border-line"}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${current ? "bg-primary text-white" : "bg-primarySoft text-primary"}`}>{n}</span>
        {title}
      </h2>
      <p className="mt-3 text-sm">{body}</p>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </article>
  );
}

function Metric({ label, values }: { label: string; values: { id: string; text: string; warn?: boolean; muted?: boolean; lowest?: boolean }[] }) {
  return (
    <tr className="border-b border-line text-right">
      <td className={`px-4 py-2 text-left text-muted ${sticky}`}>{label}</td>
      {values.map((value) => (
        <td key={value.id} className={`px-4 py-2 ${value.lowest ? "bg-[#FAFAFF]" : ""} ${value.warn ? "text-[#DC2626]" : ""} ${value.muted ? "text-muted" : ""}`}>
          {value.text}
        </td>
      ))}
    </tr>
  );
}

