import { parseCost } from "@/lib/format";
import type { ColumnField, ColumnMatch, RawPerson, SheetTable } from "@/lib/model/types";

const INACTIVE = /离职|禁用|停用|冻结|已退出/;

function indexOf(headers: string[], header: string | undefined): number {
  if (!header) return -1;
  return headers.indexOf(header);
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return row[index]?.trim() ?? "";
}

export function tableToPeople(
  table: SheetTable,
  mapping: ColumnMatch[],
): { people: RawPerson[]; skipped: { rowNumber: number; reason: string }[] } {
  const byField = new Map<ColumnField, string>(mapping.map((match) => [match.field, match.header]));
  const column = (field: ColumnField) => indexOf(table.headers, byField.get(field));
  const people: RawPerson[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];
  table.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = cell(row, column("name"));
    if (!name) {
      skipped.push({ rowNumber, reason: "这一行没有姓名，已跳过" });
      return;
    }
    const status = cell(row, column("status"));
    if (status && INACTIVE.test(status)) {
      skipped.push({ rowNumber, reason: `「${name}」状态是「${status}」，未进入沙盘` });
      return;
    }
    const employeeId = cell(row, column("employeeId"));
    people.push({
      rowNumber,
      name,
      originalName: name,
      employeeId,
      departmentRaw: cell(row, column("department")),
      title: cell(row, column("title")),
      managerRaw: cell(row, column("manager")),
      level: cell(row, column("level")),
      annualCost: parseCost(cell(row, column("annualCost"))),
      hireDate: cell(row, column("hireDate")),
      location: cell(row, column("location")),
      performance: cell(row, column("performance")),
      email: cell(row, column("email")),
      status,
    });
  });
  return { people, skipped };
}
