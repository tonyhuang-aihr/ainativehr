/** 金额在内部一律用元。显示时换成万，并取整到 0.5 万。 */

export function roundHalfAwayFromZero(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5);
}

/** 四舍五入到最近的 5000 元，返回单位为万。 */
export function roundToHalfWan(yuan: number): number {
  return roundHalfAwayFromZero(yuan / 5000) * 0.5;
}

export function formatWan(yuan: number): string {
  const rounded = roundToHalfWan(yuan);
  const sign = rounded < 0 ? "−" : "";
  const [whole, frac] = Math.abs(rounded).toFixed(1).split(".");
  return `${sign}${Number(whole).toLocaleString("en-US")}.${frac}`;
}

export function formatSignedWan(yuan: number): string {
  const rounded = roundToHalfWan(yuan);
  if (rounded === 0) return "—";
  const body = formatWan(Math.abs(yuan));
  return rounded > 0 ? `+${body}` : `−${body.replace(/^−/, "")}`;
}

function wanLabel(yuanStep: number): string {
  const wan = yuanStep / 10000;
  return String(Number(wan.toFixed(4)));
}

/**
 * 人员行区间。年度 10 万一档，季度 2.5 万一档。
 * 正好落在档边界上时归入上一档（较高的那一档）。
 */
export function costBand(yuan: number, step: number): string {
  const abs = Math.abs(yuan);
  const lo = Math.floor(abs / step + 1e-9) * step;
  const hi = lo + step;
  const text = `${wanLabel(lo)}–${wanLabel(hi)}`;
  return yuan < 0 ? `−${text}` : text;
}

export function quarterBand(yuan: number, days: number): string {
  if (days <= 0 || yuan === 0) return "—";
  return costBand(yuan, 25_000);
}

export function yearBand(yuan: number): string {
  if (yuan === 0) return "—";
  return costBand(yuan, 100_000);
}
