import { db } from "./client.ts";
import { aiKeys, type AiKey, type NewAiKey } from "./schema.ts";
import { eq } from "drizzle-orm";

export async function getAiKeyByUserId(userId: number): Promise<AiKey | null> {
  const result = await db
    .select()
    .from(aiKeys)
    .where(eq(aiKeys.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertAiKey(
  userId: number,
  provider: string,
  encryptedKey: string,
): Promise<AiKey> {
  const existing = await getAiKeyByUserId(userId);
  if (existing) {
    const result = await db
      .update(aiKeys)
      .set({ provider, encryptedKey, updatedAt: new Date() })
      .where(eq(aiKeys.id, existing.id))
      .returning();
    if (!result[0]) {
      throw new Error("Failed to update AI key");
    }
    return result[0];
  }

  const result = await db
    .insert(aiKeys)
    .values({
      userId,
      provider,
      encryptedKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as NewAiKey)
    .returning();
  if (!result[0]) {
    throw new Error("Failed to insert AI key");
  }
  return result[0];
}

export async function deleteAiKey(userId: number): Promise<boolean> {
  const result = await db.delete(aiKeys).where(eq(aiKeys.userId, userId)).run();
  // @ts-ignore - changes property exists on the result
  return (result as any).changes > 0;
}
