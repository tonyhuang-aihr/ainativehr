"use client";

import { useState } from "react";
import { InfoMark } from "@/components/headcount/info-mark";
import { ROUNDING_EQUATION_NOTE } from "@/lib/headcount/copy";
import type { CompareColumn } from "@/lib/headcount/scenarioView";

const sticky = "sticky left-0 z-10 bg-white shadow-[1px_0_0_#E6E8EC]";

/** 和人员明细、Agent 明细同一套记号：收起 ›，展开 ⌄。 */
export function DepartmentDailyRows({
  columns,
  note,
  defaultOpen = false,
}: {
  columns: CompareColumn[];
  note: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const names = columns[0]?.dailyParts ?? [];
  return (
    <>
      <tr className="border-b border-line text-right">
        <td className={`px-4 py-2 text-left text-muted ${sticky}`}>
          <button type="button" className="inline-flex items-center gap-1" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span aria-hidden="true">{open ? "⌄" : "›"}</span>
            部门持续成本 人工 + Agent
          </button>
        </td>
        {columns.map((column) => (
          <td key={column.id} className={`px-4 py-2 ${column.lowest ? "bg-[#FAFAFF]" : ""}`}>
            {column.approx ? `≈ ${column.daily}` : column.daily}
            {column.approx ? <InfoMark note={ROUNDING_EQUATION_NOTE} /> : null}
          </td>
        ))}
      </tr>
      {open
        ? names.map((part) => (
            <tr key={part.id} className="border-b border-line text-right text-xs text-muted">
              <td className={`py-2 pl-8 pr-4 text-left ${sticky}`}>{part.name}</td>
              {columns.map((column) => (
                <td key={column.id} className={`px-4 py-2 ${column.lowest ? "bg-[#FAFAFF]" : ""}`}>
                  {column.dailyParts?.find((item) => item.id === part.id)?.text}
                </td>
              ))}
            </tr>
          ))
        : null}
      {open ? (
        <tr className="border-b border-line text-right text-xs text-muted">
          <td className={`py-2 pl-8 pr-4 text-left ${sticky}`}>
            未归属部门 Agent
            <InfoMark note={note} />
          </td>
          {columns.map((column) => (
            <td key={column.id} className={`px-4 py-2 ${column.lowest ? "bg-[#FAFAFF]" : ""}`}>
              {column.unattributed}
            </td>
          ))}
        </tr>
      ) : null}
    </>
  );
}
