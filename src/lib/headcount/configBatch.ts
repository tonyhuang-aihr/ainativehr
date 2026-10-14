export type BudgetBatchRow = { key: string; amount: number };
export type QuotaBatchRow = { key: string; formal: number; agent: number };

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function cells(line: string): string[] {
  return line.split(/[,，\t]/).map((cell) => cell.trim());
}

/** 每行「部门 ID 或名称,金额（元）」。 */
export function parseBudgetBatch(text: string): BudgetBatchRow[] {
  return linesOf(text).map((line) => {
    const [key, raw] = cells(line);
    const amount = Number(raw);
    if (!key || !Number.isFinite(amount)) throw new Error(`无法识别的预算行：${line}`);
    return { key, amount: Math.round(amount) };
  });
}

/** 每行「部门 ID 或名称,正式编制,Agent 编制」。 */
export function parseQuotaBatch(text: string): QuotaBatchRow[] {
  return linesOf(text).map((line) => {
    const [key, formalRaw, agentRaw] = cells(line);
    const formal = Number(formalRaw);
    const agent = Number(agentRaw);
    if (!key || !Number.isFinite(formal) || !Number.isFinite(agent)) throw new Error(`无法识别的编制行：${line}`);
    return { key, formal: Math.round(formal), agent: Math.round(agent) };
  });
}
