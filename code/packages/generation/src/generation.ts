import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { join } from "path";
import { fillTemplate, validateTemplateData, type StructuredData } from "./template.ts"

export interface TemplateGenerationInput {
    templatename: string;
    heightpx: number;
    withdpx: number;
    data: StructuredData;
}

export async function generateImageFromTemplate(input: TemplateGenerationInput) {

        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"], // Required for Docker
        });

        const page = await browser.newPage();

        // Set viewport to your desired dimensions
        await page.setViewport({
            width: input.withdpx,
            height: input.heightpx,
            deviceScaleFactor: 1,
        });

        // Path to your local HTML file
        const htmlPath = join(process.cwd(), input.templatename);
        const htmlContent = readFileSync(htmlPath, "utf8");

        // Set the HTML content directly
        const dataUrl = `data:text/html,${encodeURIComponent(fillTemplate(htmlContent, input.data))}`;
        await page.goto(dataUrl, { waitUntil: "networkidle0" });

        // Take a screenshot with the viewport dimensions
        const screenshotBuffer = await page.screenshot({
            clip: {
                x: 0,
                y: 0,
                width: input.withdpx,
                height: input.heightpx,
            },
            encoding: "binary"
        });

        await browser.close();
        return screenshotBuffer;
}

export function renderTemplateStrict(
input: TemplateGenerationInput
) {
    
    const htmlPath = join(process.cwd(), input.templatename);
    const htmlContent = readFileSync(htmlPath, "utf8");

    const validation = validateTemplateData(htmlContent, input.data);

    if (!validation.valid) {
        throw new Error(
            `Missing template fields: ${validation.missing.join(", ")}`
        );
    }

    generateImageFromTemplate(input);
}