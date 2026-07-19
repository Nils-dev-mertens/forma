import { db } from "./client.ts";
import { apiKeys, type NewApiKey, type ApiKey } from "./schema.ts";
import { eq, and, isNotNull, lte } from "drizzle-orm";

/**
 * Create a new API key
 */
export async function createApiKey(data: NewApiKey): Promise<ApiKey> {
  console.log(data);
  const [result] = await db.insert(apiKeys).values(data).returning();
  if (!result) throw new Error("Failed to create API key");
  return result;
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(id: number): Promise<ApiKey | undefined> {
  const [result] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .limit(1);
  
  return result;
}

/**
 * Get API key by key value
 */
export async function getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
  const [result] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key))
    .limit(1);
  
  return result;
}

/**
 * Get all API keys for a user
 */
export async function getApiKeysByUserId(userId: number): Promise<ApiKey[]> {
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .all();
}

/**
 * Update API key
 */
export async function updateApiKey(id: number, data: Partial<NewApiKey>): Promise<ApiKey | undefined> {
  const result = await db
    .update(apiKeys)
    .set(data)
    .where(eq(apiKeys.id, id))
    .returning();
  
  return result[0];
}

/**
 * Delete API key
 */
export async function deleteApiKey(id: number): Promise<boolean> {
  const result = await db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
  
  // @ts-ignore - changes property exists on the result
  return (result as any).changes > 0;
}

/**
 * Delete expired API keys
 */
export async function deleteExpiredApiKeys(): Promise<number> {
  const result = await db
    .delete(apiKeys)
    .where(and(
      isNotNull(apiKeys.expiresAt),
      lte(apiKeys.expiresAt, new Date())
    ))
    .run();
  
  // @ts-ignore - changes property exists on the result
  return result.changes || 0;
}