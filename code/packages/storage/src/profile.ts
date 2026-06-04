import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { PROFILESPHOTOS_DIR, TEMPLATES_DIR } from "./config.ts";

export async function saveProfilePhoto(
  imagename: string,
  imageBuffer: Buffer
): Promise<void> {
  const filePath = join(PROFILESPHOTOS_DIR, imagename);
  await writeFile(filePath, imageBuffer);
  console.log(`Saved image: ${imagename}`);
}

// Get a raw image (Buffer) by imagename
export async function getProfilePhoto(imagename: string): Promise<Buffer | null> {
  const filePath = join(PROFILESPHOTOS_DIR, imagename);
  if (!existsSync(filePath)) return null;
  return await readFile(filePath);
}