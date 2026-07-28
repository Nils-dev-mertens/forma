import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile, rm } from "fs/promises";
import { join, normalize } from "path";
import { SET_IMAGES_DIR, STORAGE_DIR } from "./config.ts";

function setImageDir(setId: number, entryId: number): string {
  return join(SET_IMAGES_DIR, String(setId), String(entryId));
}

function ensureSafeFilename(fieldname: string): string {
  return fieldname.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function randomSuffix(): string {
  return createHash("sha256").update(randomUUID()).digest("hex").slice(0, 16);
}

/**
 * Save an uploaded image for a specific set/entry/field. The file is stored
 * under local-blob-storage/set-images/<setId>/<entryId>/<fieldname>-<random>.<ext>
 * and the relative public path is returned.
 */
export async function saveSetImage(
  setId: number,
  entryId: number,
  fieldname: string,
  imageBuffer: Buffer,
  originalName: string,
): Promise<string> {
  const ext = originalName.split(".").pop()?.toLowerCase() || "png";
  const safeField = ensureSafeFilename(fieldname);
  const imagename = `${safeField}-${randomSuffix()}.${ext}`;
  const dir = setImageDir(setId, entryId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, imagename);
  await writeFile(filePath, imageBuffer);
  return `set-images/${setId}/${entryId}/${imagename}`;
}

/** Resolve a relative storage path to a real filesystem path, preventing traversal. */
function resolveStoragePath(relativePath: string): string {
  const resolved = normalize(join(STORAGE_DIR, relativePath));
  if (!resolved.startsWith(STORAGE_DIR)) {
    throw new Error("Invalid set image path: directory traversal detected");
  }
  return resolved;
}

/** Read a set image by its public relative path. */
export async function getSetImage(relativePath: string): Promise<Buffer | null> {
  const filePath = resolveStoragePath(relativePath);
  if (!existsSync(filePath)) return null;
  return readFile(filePath);
}

/** Delete a set image by its public relative path. */
export async function deleteSetImage(relativePath: string): Promise<boolean> {
  const filePath = resolveStoragePath(relativePath);
  if (!existsSync(filePath)) return false;
  await rm(filePath);
  return true;
}

/** Build the full filesystem path for a set image (used by static middleware). */
export function getSetImagePath(relativePath: string): string {
  return resolveStoragePath(relativePath);
}

/** Check whether a value is a stored set-image public path. */
export function isSetImagePath(value: string): boolean {
  return value.startsWith("set-images/");
}

/** Delete the entire set-images directory for a set/entry. */
export async function deleteSetImageDirectory(
  setId: number,
  entryId: number,
): Promise<void> {
  const dir = setImageDir(setId, entryId);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}
