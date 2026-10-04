"use client";

import { Button } from "@/components/ui";
import { commitImportAction } from "@/lib/headcount/actions";
import { buildUpload, type ImportIssue, type Matrix } from "@/lib/headcount/import/prepare";
import { parseWorkbook } from "@/lib/import/parseWorkbook";
import { useState } from "react";

type Context = {
  departments: string[];
  grades: string[];
  cities: string[];
  year: number;
  asOf: string;
  parentNames: Record<string, string | null>;
};

export function Importer({ context }: { context: Context }) {
  const [roster, setRoster] = useState<Matrix | null>(null);
  const [moves, setMoves] = useState<Matrix | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [note, setNote] = useState("");

  async function readFile(file: File): Promise<Matrix> {
    const sheets = parseWorkbook(await file.arrayBuffer());
    const sheet = sheets[0];
    if (!sheet) return { name: file.name, headers: [], rows: [] };
    return { name: sheet.name, headers: sheet.headers, rows: sheet.rows };
  }

  async function preview(nextRoster: Matrix | null, nextMoves: Matrix | null) {
    if (!nextRoster || !nextMoves) return;
    const bundle = buildUpload(nextRoster, nextMoves, {
      ...context,
      parentOf: (department) => context.parentNames[department] ?? null,
    });
    setIssues(bundle.issues);
    setDropped(bundle.droppedColumns);
    setNote(`离职类型已在浏览器换成补偿标记（${bundle.departureTypesDropped} 行）。入职日期只留给需要补偿的人。司龄按部门职级汇总，不足 5 人并入上级。`);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white p-4">
      <h2 className="font-medium">花名册与在途变动</h2>
      <p className="text-sm text-muted">文件在这台浏览器里解析。薪酬、绩效、身份证、手机、银行和离职原因列会先丢掉。离职类型不会上传。</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          花名册
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const matrix = await readFile(file);
              setRoster(matrix);
              await preview(matrix, moves);
            }}
          />
        </label>
        <label className="text-sm">
          在途变动
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const matrix = await readFile(file);
              setMoves(matrix);
              await preview(roster, matrix);
            }}
          />
        </label>
      </div>
      {dropped.length ? <p className="text-sm text-muted">已丢弃列：{dropped.join("、")}</p> : null}
      {note ? <p className="text-sm">{note}</p> : null}
      {issues.length ? (
        <ul className="space-y-1 text-sm">
          {issues.map((issue) => (
            <li key={issue.id}>
              {issue.level === "error" ? "需修改" : "可跳过"} · {issue.sheet} 第 {issue.row} 行 · {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      <form action={commitImportAction}>
        <Button type="submit" variant="secondary">
          提交校验结果
        </Button>
      </form>
    </div>
  );
}
