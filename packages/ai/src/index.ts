import Anthropic from "@anthropic-ai/sdk";

// Singleton client — instantiated once per process
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const MODEL_SONNET = "claude-sonnet-4-6" as const;
export const MODEL_HAIKU = "claude-haiku-4-5-20251001" as const;

export type ClaudeModel = typeof MODEL_SONNET | typeof MODEL_HAIKU;

export interface CompletionOptions {
  model?: ClaudeModel;
  maxTokens?: number;
  system?: string;
}

/**
 * Simple text completion via Claude.
 */
export async function complete(
  prompt: string,
  options: CompletionOptions = {}
): Promise<string> {
  const client = getClient();
  const { model = MODEL_SONNET, maxTokens = 1024, system } = options;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block?.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

export { Anthropic };
