export async function GET() {
  const enabled = Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL);
  return Response.json({
    enabled,
    mode: enabled ? "llm" : "offline",
    model: enabled ? process.env.LLM_MODEL || "gpt-4o-mini" : null,
  });
}
