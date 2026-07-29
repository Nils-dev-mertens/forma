import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
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
}function getModel(provider: SupportedProvider, apiKey: string): LanguageModel {
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

/**
 * Generate a text response from the configured provider using the given system
 * prompt and chat messages.
 */
export async function generateFromProvider(
  options: GenerateOptions,
): Promise<string> {
  const model = await getModelForUser(options.userId);
  const { text } = await generateText({
    model,
    system: options.system,
    // ai v7 does not export a CoreMessage type, so we cast the local shape.
    messages: options.messages as any,
  });
  return text;
}

/**
 * Validate that a raw API key works with the given provider by making a tiny
 * test call. Throws if the provider rejects it.
 */
export async function validateRawAiKey(provider: SupportedProvider, apiKey: string): Promise<void> {
  const model = getModel(provider, apiKey);
  await generateText({
    model,
    system: "Reply with the single word OK.",
    // ai v7 does not export a CoreMessage type, so we cast the local shape.
    messages: [{ role: "user", content: "OK?" } as any],
  });
}


