import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { TEMPLATES_DIR } from "./config.ts";

// Ensure TEMPLATES_DIR exists
async function ensureTemplatesDir() {
    if (!existsSync(TEMPLATES_DIR)) {
        await mkdir(TEMPLATES_DIR, { recursive: true });
    }
}

// Save template content as utf-8 text
export async function saveTemplate(filename: string, content: string): Promise<void> {
    await ensureTemplatesDir();
    const filePath = join(TEMPLATES_DIR, filename);
    await writeFile(filePath, content, "utf-8");
    console.log(`Saved template file: ${filename}`);
}

// Get template content, or null if not found
export async function getTemplate(filename: string): Promise<string | null> {
    const filePath = join(TEMPLATES_DIR, filename);
    if (!existsSync(filePath)) return null;
    return await readFile(filePath, "utf-8");
}
