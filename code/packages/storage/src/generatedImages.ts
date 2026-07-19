import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { GENERATED_IMAGES_DIR } from "./config.ts";

// Save generated image buffer to generated images directory
export async function saveGeneratedImage(imagename: string, imageBuffer: Buffer): Promise<void> {
    const filePath = join(GENERATED_IMAGES_DIR, imagename);
    await writeFile(filePath, imageBuffer);
    console.log(`Saved generated image: ${imagename}`);
}

// Get a raw generated image (Buffer) by imagename
export async function getGeneratedImage(imagename: string): Promise<Buffer | null> {
    const filePath = join(GENERATED_IMAGES_DIR, imagename);
    if (!existsSync(filePath)) return null;
    return await readFile(filePath);
}
