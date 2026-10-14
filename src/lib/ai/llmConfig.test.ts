import { describe, expect, it } from "vitest";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, resolveLlmConfig } from "@/lib/ai/llmConfig";

describe("模型服务商", () => {
  it("没有密钥时保持离线", () => {
    expect(resolveLlmConfig({ LLM_PROVIDER: "deepseek", LLM_BASE_URL: "https://example.com/v1" })).toEqual({
      enabled: false,
      provider: null,
      baseUrl: null,
      model: null,
    });
  });

  it("按服务商使用默认地址和模型，并允许覆盖", () => {
    expect(resolveLlmConfig({ LLM_PROVIDER: "deepseek", LLM_API_KEY: "sk-test" })).toMatchObject({
      enabled: true,
      provider: "deepseek",
      baseUrl: DEFAULT_LLM_BASE_URL.deepseek,
      model: DEFAULT_LLM_MODEL.deepseek,
    });
    expect(resolveLlmConfig({ LLM_PROVIDER: "glm", LLM_API_KEY: "sk-test" }).baseUrl).toBe(DEFAULT_LLM_BASE_URL.glm);
    expect(resolveLlmConfig({ LLM_PROVIDER: "kimi", LLM_API_KEY: "sk-test" }).baseUrl).toBe(DEFAULT_LLM_BASE_URL.kimi);
    expect(resolveLlmConfig({ LLM_API_KEY: "sk-test" })).toMatchObject({
      provider: "openai-compatible",
      baseUrl: DEFAULT_LLM_BASE_URL["openai-compatible"],
      model: DEFAULT_LLM_MODEL["openai-compatible"],
    });
    expect(
      resolveLlmConfig({
        LLM_PROVIDER: "kimi",
        LLM_API_KEY: "sk-test",
        LLM_BASE_URL: "https://gateway.example/v1/",
        LLM_MODEL: "kimi-custom",
      }),
    ).toMatchObject({
      baseUrl: "https://gateway.example/v1",
      model: "kimi-custom",
    });
  });
});
