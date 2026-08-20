import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel, type ModelMessage } from "ai";
import { getAiKeyByUserId } from "@repo/db";
import { decrypt } from "../../utils/crypto.ts";
import { aiDefaultModel } from "../../config.ts";

export type SupportedProvider = "openai";

export const SUPPORTED_PROVIDERS: SupportedProvider[] = ["openai"];

export function isSupportedProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as string[]).includes(value);
}

const PROVIDERS: Record<SupportedProvider, (apiKey: string, model: string) => LanguageModel> = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
};

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  userId: number;
  system: string;
  messages: AiMessage[];
}

/**
 * Convert the local AiMessage shape to the AI SDK's ModelMessage type.
 * ai v7 renamed CoreMessage to ModelMessage and no longer exports it; mapping
 * roles to literals keeps the array fully typed.
 */
function toModelMessages(messages: AiMessage[]): ModelMessage[] {
  return messages.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content }
      : { role: "assistant", content: m.content },
  );
}

function getModel(provider: SupportedProvider, apiKey: string): LanguageModel {
  const factory = PROVIDERS[provider];
  if (!factory) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  return factory(apiKey, aiDefaultModel);
}

/**
 * Load the user's stored AI key, decrypt it, and return a Vercel AI SDK model.
 * Defaults to OpenAI. Throws if no key is configured.
 */
export async function getModelForUser(userId: number): Promise<LanguageModel> {
  const keyRecord = await getAiKeyByUserId(userId);
  if (!keyRecord) {
    throw new Error("AI provider key not configured. Set one via POST /api/ai/key");
  }

  const apiKey = decrypt(keyRecord.encryptedKey);
  const provider = keyRecord.provider as SupportedProvider;

  return getModel(provider, apiKey);
}

export interface GenerationResult {
  text: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

/**
 * Generate a text response from the configured provider using the given system
 * prompt and chat messages. Returns the text plus token usage so callers can
 * enforce budgets and log costs.
 */
export async function generateFromProvider(
  options: GenerateOptions,
): Promise<GenerationResult> {
  const model = await getModelForUser(options.userId);
  const { text, usage } = await generateText({
    model,
    system: options.system,
    messages: toModelMessages(options.messages),
  });
  return {
    text,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
  };
}

/**
 * Validate that a raw API key works with the given provider WITHOUT making a
 * billable generation call. OpenAI's `GET /v1/models` is free and rejects
 * invalid keys with a 401, so we hit that endpoint instead of generateText().
 * Throws if the provider rejects the key.
 */
export async function validateRawAiKey(provider: SupportedProvider, apiKey: string): Promise<void> {
  if (provider !== "openai") {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  const res = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`AI provider rejected the API key (HTTP ${res.status})`);
  }
}


