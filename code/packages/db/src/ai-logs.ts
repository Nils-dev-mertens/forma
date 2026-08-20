import { db } from "./client.ts";
import { aiLogs, type AiLog, type NewAiLog } from "./schema.ts";
import { eq, desc, gte, sql, and } from "drizzle-orm";

export interface CreateAiLogInput {
  userId: number;
  sessionId?: number | null;
  provider: string;
  model: string;
  system?: string | null;
  prompt?: string | null;
  response?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  status: "success" | "error";
  error?: string | null;
}

export async function createAiLog(input: CreateAiLogInput): Promise<AiLog> {
  const result = await db
    .insert(aiLogs)
    .values({
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      provider: input.provider,
      model: input.model,
      system: input.system ?? null,
      prompt: input.prompt ?? null,
      response: input.response ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      status: input.status,
      error: input.error ?? null,
      createdAt: new Date(),
    } as NewAiLog)
    .returning();
  if (!result[0]) {
    throw new Error("Failed to create AI log");
  }
  return result[0];
}

export async function getAiLogsByUserId(
  userId: number,
  options: { limit?: number } = {},
): Promise<AiLog[]> {
  const limit = options.limit ?? 50;
  return await db
    .select()
    .from(aiLogs)
    .where(eq(aiLogs.userId, userId))
    .orderBy(desc(aiLogs.createdAt))
    .limit(limit);
}

/**
 * Sum the total tokens consumed by a user in successful provider calls since
 * the given timestamp. Used to enforce per-user token/cost budgets.
 */
export async function getAiTokenUsageByUserSince(
  userId: number,
  since: Date,
): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${aiLogs.totalTokens}), 0)` })
    .from(aiLogs)
    .where(and(eq(aiLogs.userId, userId), gte(aiLogs.createdAt, since), eq(aiLogs.status, "success")));
  return result[0]?.total ?? 0;
}