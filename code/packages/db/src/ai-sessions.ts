import { db } from "./client.ts";
import { aiSessions, aiMessages, type AiSession, type NewAiSession, type AiMessage, type NewAiMessage } from "./schema.ts";
import { eq, asc } from "drizzle-orm";

export async function createAiSession(
  userId: number,
  contextTemplateName?: string | null,
): Promise<AiSession> {
  const result = await db
    .insert(aiSessions)
    .values({
      userId,
      contextTemplateName: contextTemplateName ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as NewAiSession)
    .returning();
  if (!result[0]) {
    throw new Error("Failed to create AI session");
  }
  return result[0];
}

export async function getAiSessionById(sessionId: number): Promise<AiSession | null> {
  const result = await db
    .select()
    .from(aiSessions)
    .where(eq(aiSessions.id, sessionId))
    .limit(1);
  return result[0] ?? null;
}

export async function updateAiSessionUpdatedAt(sessionId: number): Promise<void> {
  await db
    .update(aiSessions)
    .set({ updatedAt: new Date() })
    .where(eq(aiSessions.id, sessionId))
    .run();
}

export async function deleteAiSession(sessionId: number): Promise<boolean> {
  const result = await db.delete(aiSessions).where(eq(aiSessions.id, sessionId)).run();
  // @ts-ignore - changes property exists on the result
  return (result as any).changes > 0;
}

export async function addAiMessage(
  sessionId: number,
  role: "user" | "assistant",
  content: string,
): Promise<AiMessage> {
  const result = await db
    .insert(aiMessages)
    .values({
      sessionId,
      role,
      content,
      createdAt: new Date(),
    } as NewAiMessage)
    .returning();
  if (!result[0]) {
    throw new Error("Failed to create AI message");
  }
  return result[0];
}

export async function getAiMessagesBySessionId(
  sessionId: number,
  options: { limit?: number } = {},
): Promise<AiMessage[]> {
  const limit = options.limit ?? 100;
  return await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.sessionId, sessionId))
    .orderBy(asc(aiMessages.createdAt))
    .limit(limit);
}
