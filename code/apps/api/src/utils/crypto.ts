import crypto from "crypto";
import { aiEncryptionKey } from "../config.ts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | undefined;

function getKeyOrThrow(): Buffer {
  if (!aiEncryptionKey) {
    throw new Error("AI_ENCRYPTION_KEY environment variable is required");
  }
  // Derive a 256-bit key from the configured secret using a fixed salt. The
  // salt is not secret; it only needs to be stable so the same key is produced
  // on every startup. Cache the derived key so we don't re-run scrypt on every
  // encrypt/decrypt call.
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(aiEncryptionKey, "forma-ai-key-salt", KEY_LENGTH);
  }
  return cachedKey;
}

export interface EncryptedValue {
  iv: string;
  authTag: string;
  ciphertext: string;
}

/**
 * Encrypt a plain string using AES-256-GCM.
 * Returns the components as base64 strings.
 */
export function encrypt(plainText: string): string {
  const key = getKeyOrThrow();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plainText, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  const payload: EncryptedValue = {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext,
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt a string that was produced by encrypt().
 * The input is the JSON-serialized EncryptedValue.
 */
export function decrypt(encryptedPayload: string): string {
  const key = getKeyOrThrow();
  let payload: EncryptedValue;
  try {
    payload = JSON.parse(encryptedPayload) as EncryptedValue;
  } catch {
    throw new Error("Invalid encrypted payload format");
  }

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plainText = decipher.update(payload.ciphertext, "base64", "utf8");
  plainText += decipher.final("utf8");
  return plainText;
}
