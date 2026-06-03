import { type ApiKey } from "@repo/auth";

const keyStore = new Map<ApiKey, string>(); // in-memory: key -> bcryptHash

export async function storeKeyHash(key: ApiKey, bcryptHash: string) {
  keyStore.set(key, bcryptHash);
}

export async function getKeyHash(key: ApiKey) {
  return keyStore.get(key);
}
