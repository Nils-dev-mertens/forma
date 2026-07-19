import { existsSync } from "fs";
import { TEMP_DIR } from "./config.ts";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { logger } from "@repo/logger";

// get raw content from temp dir
export async function getTempFile(fileName: string): Promise<Buffer | null> {
    try {
        const filePath = join(TEMP_DIR, fileName);
        if (!existsSync(filePath)) return null;
        return await readFile(filePath);
    } catch (error) {
        logger.info({
            package: "blobStorage",
            message: `File "${fileName}" doesnt exsist`,
            error: error as Error,
        });
        return null;
    }
}

// delete file from temp dir
export async function deleteTempFile(fileName: string): Promise<boolean> {
    try {
        const filePath = join(TEMP_DIR, fileName);
        if (existsSync(filePath)) {
            await rm(filePath);
            return true;
        }
        return false;
    } catch (error) {
        logger.info({
            package: "blobStorage",
            message: `File "${fileName}" doesnt exsist`,
            error: error as Error,
        });
        return false;
    }
}
