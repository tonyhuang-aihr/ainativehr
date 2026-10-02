const DEPT_PALETTE = ["#4F46E5", "#0891B2", "#059669", "#D97706", "#DB2777", "#7C3AED", "#DC2626", "#0F766E"];

export type ColorMode = "dept" | "headcount" | "cost";

export function departmentAccent(path: string[]): string {
  const key = path[1] ?? path[0] ?? "组织";
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return DEPT_PALETTE[hash % DEPT_PALETTE.length];
}

export function scaleAccent(mode: ColorMode, value: number, max: number): string {
  const t = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  if (mode === "cost") return mix([209, 250, 229], [6, 95, 70], t);
  return mix([224, 231, 255], [49, 46, 129], t);
}

function mix(from: number[], to: number[], t: number): string {
  const channel = from.map((value, index) => Math.round(value + (to[index] - value) * t));
  return `rgb(${channel[0]}, ${channel[1]}, ${channel[2]})`;
}
