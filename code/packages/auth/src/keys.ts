import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { getKeyHash, storeKeyHash } from "../../db/src/index.js";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

export type ApiKey = `key-${string}`;

export async function GenerateKey() {
  const key = `key-${randomBytes(32).toString("hex")}` as ApiKey;
  const bcryptHash = await bcrypt.hash(key, SALT_ROUNDS);
  
  await storeKeyHash(key, bcryptHash);
  return key;
}

export async function CheckKey(key: string) {
  const bcryptHash = await getKeyHash(key as ApiKey);
  if (!bcryptHash) return false;
  return bcrypt.compare(key, bcryptHash);
}