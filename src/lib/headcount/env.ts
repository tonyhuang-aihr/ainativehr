export type AppEnv = "demo" | "prod";

export function appEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return env.APP_ENV === "prod" ? "prod" : "demo";
}

export function isDemo(env: NodeJS.ProcessEnv = process.env): boolean {
  return appEnv(env) !== "prod";
}

/** 生产必须配置 AUTH_SECRET。演示环境用固定回退值，只为了能打开预览。 */
export function authSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (secret) return secret;
  if (appEnv(env) === "prod") throw new Error("生产环境必须设置 AUTH_SECRET");
  return "demo-only-headcount-auth-secret";
}
