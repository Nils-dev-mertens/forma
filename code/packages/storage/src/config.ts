import { mkdir } from "fs/promises";
import { join } from "path";
import { resolve } from "path";

export const STORAGE_DIR = resolve(__dirname, "../../../local-blob-storage");

export const PROFILESPHOTOS_DIR = join(STORAGE_DIR, "pfp");
export const TEMPLATES_DIR = join(STORAGE_DIR, "templates");
export const GENERATED_IMAGES_DIR = join(STORAGE_DIR, "generated-images");

// Ensure directories exist
export async function ensureDirs() {

    try {
        await mkdir(PROFILESPHOTOS_DIR, { recursive: true });
        await mkdir(TEMPLATES_DIR, { recursive: true });
        console.log("The storage dirs are okay");
    } catch (error) {
        console.log("Cant make storage dirs, exit program")
        process.exit(1)   
    }
}