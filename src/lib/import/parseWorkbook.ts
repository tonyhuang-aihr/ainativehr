import * as XLSX from "xlsx";
import type { SheetTable } from "@/lib/model/types";

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const label = header || "未命名列";
    const count = seen.get(label) ?? 0;
    seen.set(label, count + 1);
    return count === 0 ? label : `${label} (${count + 1})`;
  });
}

export function sheetFromMatrix(name: string, matrix: unknown[][]): SheetTable | null {
  const start = matrix.findIndex((row) => row.some((cell) => asText(cell)));
  if (start < 0) return null;
  const headerRow = matrix[start] ?? [];
  let last = -1;
  headerRow.forEach((cell, index) => {
    if (asText(cell)) last = index;
  });
  if (last < 0) return null;
  const headers = uniqueHeaders(
    Array.from({ length: last + 1 }, (_, index) => asText(headerRow[index]) || `未命名列${index + 1}`),
  );
  const rows: string[][] = [];
  for (const raw of matrix.slice(start + 1)) {
    const cells = Array.from({ length: headers.length }, (_, index) => asText(raw?.[index]));
    if (cells.every((cell) => !cell)) continue;
    rows.push(cells);
  }
  return { name, headers, rows };
}

export function parseWorkbook(input: ArrayBuffer | string, delimiter?: string): SheetTable[] {
  const book =
    typeof input === "string"
      ? XLSX.read(input.replace(/^\uFEFF/, ""), { type: "string", FS: delimiter, raw: false })
      : XLSX.read(input, { type: "array", raw: false, cellDates: false });
  const sheets: SheetTable[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const table = sheetFromMatrix(name, matrix);
    if (table && table.headers.length > 0) sheets.push(table);
  }
  return sheets;
}

export function parsePastedTable(text: string): SheetTable[] {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  const delimiter = tabs >= commas && tabs >= semis && tabs > 0 ? "\t" : semis > commas ? ";" : ",";
  const sheets = parseWorkbook(text, delimiter);
  return sheets.map((sheet) => ({ ...sheet, name: "粘贴的表格" }));
}
