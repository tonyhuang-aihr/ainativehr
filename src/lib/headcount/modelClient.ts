import type { ChatTurn } from "@/lib/ai/desensitize";
import { resolveLlmConfig } from "@/lib/ai/llmConfig";

function llmConfig() {
  return resolveLlmConfig({
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
  });
}

export function modelConfigured(): boolean {
  return llmConfig().enabled;
}

export async function askHeadcountModel(messages: ChatTurn[]): Promise<string | null> {
  const config = llmConfig();
  if (!config.enabled) return null;
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, temperature: 0.2, messages }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return payload.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
