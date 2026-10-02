import { resolveLlmConfig } from "@/lib/ai/llmConfig";

export async function GET() {
  const config = resolveLlmConfig({
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  });
  return Response.json({
    enabled: config.enabled,
    mode: config.enabled ? "llm" : "offline",
    provider: config.provider,
    model: config.model,
  });
}
