import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile, rm } from "fs/promises";
import { join, normalize } from "path";
import { PROFILE_LOGOS_DIR, STORAGE_DIR } from "./config.ts";

function profileLogoDir(userId: number): string {
  return join(PROFILE_LOGOS_DIR, String(userId));
}

function ensureSafeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function randomSuffix(): string {
  return createHash("sha256").update(randomUUID()).digest("hex").slice(0, 16);
}

/**
 * Save an uploaded logo for a user's identity profile.
 * The file is stored under local-blob-storage/profile-logos/<userId>/logo-<random>.<ext>
 * and the relative public path is returned.
 */
export async function saveProfileLogo(
  userId: number,
  imageBuffer: Buffer,
  originalName: string,
): Promise<string> {
  const ext = originalName.split(".").pop()?.toLowerCase() || "png";
  const imagename = `logo-${randomSuffix()}.${ext}`;
  const dir = profileLogoDir(userId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, imagename);
  await writeFile(filePath, imageBuffer);
  return `profile-logos/${userId}/${imagename}`;
}

/** Resolve a relative storage path to a real filesystem path, preventing traversal. */
function resolveStoragePath(relativePath: string): string {
  const resolved = normalize(join(STORAGE_DIR, relativePath));
  if (!resolved.startsWith(STORAGE_DIR)) {
    throw new Error("Invalid profile logo path: directory traversal detected");
  }
  return resolved;
}

/** Read a profile logo by its public relative path. */
export async function getProfileLogo(relativePath: string): Promise<Buffer | null> {
  const filePath = resolveStoragePath(relativePath);
  if (!existsSync(filePath)) return null;
  return readFile(filePath);
}

/** Delete a profile logo by its public relative path. */
export async function deleteProfileLogo(relativePath: string): Promise<boolean> {
  const filePath = resolveStoragePath(relativePath);
  if (!existsSync(filePath)) return false;
  await rm(filePath);
  return true;
}

/** Build the full filesystem path for a profile logo (used by static middleware). */
export function getProfileLogoPath(relativePath: string): string {
  return resolveStoragePath(relativePath);
}

/** Check whether a value is a stored profile logo public path. */
export function isProfileLogoPath(value: string): boolean {
  return value.startsWith("profile-logos/");
}
