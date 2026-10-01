type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  if (!apiKey || !baseUrl) {
    return Response.json({ error: "offline" }, { status: 503 });
  }
  let body: { messages?: ChatTurn[]; json?: boolean };
  try {
    body = (await request.json()) as { messages?: ChatTurn[]; json?: boolean };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 20) : [];
  if (messages.length === 0) return Response.json({ error: "empty" }, { status: 400 });

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages,
        ...(body.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      return Response.json({ error: "upstream" }, { status: 502 });
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    return Response.json({ text });
  } catch {
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
