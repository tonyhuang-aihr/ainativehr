export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function stripZero(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

export function formatCny(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 10000) {
    const wan = abs / 10000;
    const digits = wan >= 100 ? 0 : 1;
    const text = wan.toFixed(digits).replace(/\.0$/, "");
    return `${sign}¥${text} 万`;
  }
  return `${sign}¥${Math.round(abs).toLocaleString("zh-CN")}`;
}

export function formatDeltaNumber(value: number, digits = 0): string {
  if (Math.abs(value) < (digits > 0 ? 0.05 : 0.001)) return "与基线持平";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits).replace(/\.0$/, "")}`;
}

export function formatDeltaMoney(value: number | null): string {
  if (value == null) return "基线未提供";
  if (Math.abs(value) < 1) return "与基线持平";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCny(value)}`;
}

export function formatPercent(share: number): string {
  return `${round1(share * 100).toString().replace(/\.0$/, "")}%`;
}

export function parseCost(value: string | undefined | null): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "—" || raw === "无") return null;
  const wan = raw.match(/(-?[\d,.]+)\s*万/);
  if (wan) {
    const n = Number(wan[1].replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n * 10000) : null;
  }
  const num = raw.replace(/[¥￥,\s元]/g, "");
  if (!num) return null;
  const n = Number(num);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function deptIdFromPath(path: string[]): string {
  return `d-${path.map((part) => encodeURIComponent(part)).join("~")}`;
}

export function personIdFor(rowNumber: number, employeeId: string): string {
  if (employeeId) return `p-${employeeId}`;
  return `p-row-${rowNumber}`;
}
