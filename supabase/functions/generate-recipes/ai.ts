// Provider-agnostic chat call over plain fetch (no SDKs).

export type Provider = "anthropic" | "openai" | "gemini";
export type AiConfig = { provider: Provider; apiKey: string; model: string };
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ModelReply = { text: string; truncated: boolean };

const MAX_TOKENS = 3000;
const TIMEOUT_MS = 25_000;
const DEFAULT_MODELS: Partial<Record<Provider, string>> = { anthropic: "claude-haiku-5-5" };

/** Returns the config, or a reason it is incomplete (for logs; never shown to users). */
export function readAiConfig(): AiConfig | { error: string } {
  const provider = (Deno.env.get("AI_PROVIDER") ?? "anthropic").trim().toLowerCase();
  if (provider !== "anthropic" && provider !== "openai" && provider !== "gemini") {
    return { error: `Unsupported AI_PROVIDER "${provider}"` };
  }
  const apiKey = Deno.env.get("AI_API_KEY")?.trim();
  if (!apiKey) return { error: "AI_API_KEY is not set" };
  const model = Deno.env.get("AI_MODEL")?.trim() || DEFAULT_MODELS[provider];
  if (!model) return { error: `AI_MODEL is required for provider "${provider}"` };
  return { provider, apiKey, model };
}

export class AiCallError extends Error {}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new AiCallError(
      e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "network error",
    );
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new AiCallError(`HTTP ${res.status}: ${detail}`);
  }
  return await res.json();
}

async function callAnthropic(
  cfg: AiConfig,
  system: string,
  messages: ChatMessage[],
): Promise<ModelReply> {
  const data = await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      // Low effort keeps thinking from eating the 3000-token budget the JSON needs.
      output_config: { effort: "low" },
      system,
      messages,
    },
  );
  if (data["stop_reason"] === "refusal") throw new AiCallError("model refused");
  const blocks = Array.isArray(data["content"])
    ? (data["content"] as { type: string; text?: string }[])
    : [];
  return {
    text: blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join(""),
    truncated: data["stop_reason"] === "max_tokens",
  };
}

async function callOpenAI(
  cfg: AiConfig,
  system: string,
  messages: ChatMessage[],
): Promise<ModelReply> {
  const data = await post(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      max_completion_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, ...messages],
    },
  );
  const choice = (
    data["choices"] as {
      message?: { content?: string; refusal?: string };
      finish_reason?: string;
    }[]
  )?.[0];
  if (choice?.message?.refusal) throw new AiCallError("model refused");
  return { text: choice?.message?.content ?? "", truncated: choice?.finish_reason === "length" };
}

async function callGemini(
  cfg: AiConfig,
  system: string,
  messages: ChatMessage[],
): Promise<ModelReply> {
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: MAX_TOKENS },
    },
  );
  const cand = (
    data["candidates"] as { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  )?.[0];
  return {
    text: (cand?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
    truncated: cand?.finishReason === "MAX_TOKENS",
  };
}

export function callModel(
  cfg: AiConfig,
  system: string,
  messages: ChatMessage[],
): Promise<ModelReply> {
  if (cfg.provider === "openai") return callOpenAI(cfg, system, messages);
  if (cfg.provider === "gemini") return callGemini(cfg, system, messages);
  return callAnthropic(cfg, system, messages);
}

/** Pull the first JSON object out of a reply, tolerating ```json fences. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
