import { type ApiKey } from "@repo/auth";
import { db } from "./client.ts";
import { apiKeys } from "./schema.ts";
import { eq } from "drizzle-orm";

// Interface for the API key data structure used in database operations
interface ApiKeyData {
  key: string;
  userId: number;
}

export async function storeKeyHash(key: ApiKey, bcryptHash: string) {
  // For now, we'll use a default userId since the auth ApiKey type doesn't include it
  // In a real implementation, you'd want to pass userId separately or extend the ApiKey type
  await db.insert(apiKeys).values({
    key: key,
    hash: bcryptHash,
    userId: 1, // Default user for now
  });
}

export async function getKeyHash(key: ApiKey) {
  const result = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key))
    .limit(1);
  
  return result[0]?.hash;
}
