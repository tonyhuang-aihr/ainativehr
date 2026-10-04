/** 访问日志、开关日志和操作日志至少保留 6 个月。一键清除是另一条退出流程，不走这里。 */
export const MIN_LOG_RETENTION_DAYS = 180;

export function logExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= MIN_LOG_RETENTION_DAYS * 86_400_000;
}

export function retentionCutoff(nowMs: number): number {
  return nowMs - MIN_LOG_RETENTION_DAYS * 86_400_000;
}
