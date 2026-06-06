import { saveGeneratedImage } from "@repo/storage";
import { generateImageFromTemplate, renderTemplateStrict, TemplateGenerationInput } from "./generation.ts";

/**
 * Generates an image from a template and stores it in storage package.
 * 
 * @param input The input parameters for image generation, includes templatename, width, height, data.
 * @param imagename The name to store the generated image as.
 * @returns Promise<void> resolves when image is saved.
 */
export async function generateAndStoreImageFromTemplate(input: TemplateGenerationInput, imagename: string): Promise<void> {
    const uint8ImageBuffer = await generateImageFromTemplate(input);
    if (!uint8ImageBuffer) {
        throw new Error("Failed to generate image buffer");
    }
    const imageBuffer = Buffer.from(uint8ImageBuffer);
    await saveGeneratedImage(imagename, imageBuffer);
}

/**
 * Generates an image from a template and stores it in storage package and is STRICT.
 * 
 * @param input The input parameters for image generation, includes templatename, width, height, data.
 * @param imagename The name to store the generated image as.
 * @returns Promise<void> resolves when image is saved.
 */
export async function generateAndStoreImageFromTemplateStrict(input: TemplateGenerationInput, imagename: string): Promise<void> {
    const uint8ImageBuffer = await renderTemplateStrict(input);
    if (!uint8ImageBuffer) {
        throw new Error("Failed to generate image buffer");
    }
    const imageBuffer = Buffer.from(uint8ImageBuffer);
    await saveGeneratedImage(imagename, imageBuffer);
}