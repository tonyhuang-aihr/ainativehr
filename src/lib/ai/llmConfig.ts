export const LLM_PROVIDERS = ["deepseek", "glm", "kimi", "openai-compatible"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** OpenAI 兼容的 Chat Completions 根地址，代码会再拼 /chat/completions。 */
export const DEFAULT_LLM_BASE_URL: Record<LlmProvider, string> = {
  deepseek: "https://api.deepseek.com/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  kimi: "https://api.moonshot.cn/v1",
  "openai-compatible": "https://api.openai.com/v1",
};

export const DEFAULT_LLM_MODEL: Record<LlmProvider, string> = {
  deepseek: "deepseek-chat",
  glm: "glm-4-flash",
  kimi: "moonshot-v1-8k",
  "openai-compatible": "gpt-4o-mini",
};

export type LlmEnv = {
  LLM_PROVIDER?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
};

export type LlmConfig =
  | { enabled: false; provider: null; baseUrl: null; model: null }
  | { enabled: true; provider: LlmProvider; baseUrl: string; model: string; apiKey: string };

export function parseLlmProvider(value: string | undefined): LlmProvider {
  const name = value?.trim().toLowerCase();
  if (name && (LLM_PROVIDERS as readonly string[]).includes(name)) return name as LlmProvider;
  return "openai-compatible";
}

/** 没有密钥就是离线。密钥在、地址空着时，用该服务商的默认地址。 */
export function resolveLlmConfig(env: LlmEnv): LlmConfig {
  const apiKey = env.LLM_API_KEY?.trim() ?? "";
  if (!apiKey) return { enabled: false, provider: null, baseUrl: null, model: null };
  const provider = parseLlmProvider(env.LLM_PROVIDER);
  const baseUrl = (env.LLM_BASE_URL?.trim() || DEFAULT_LLM_BASE_URL[provider]).replace(/\/$/, "");
  const model = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL[provider];
  return { enabled: true, provider, baseUrl, model, apiKey };
}
