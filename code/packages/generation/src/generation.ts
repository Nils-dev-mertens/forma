import puppeteer from "puppeteer";
import {
    fillTemplate,
    validateTemplateData,
    type StructuredData,
} from "./template.ts";
import { getTemplate } from "@repo/storage";

export interface TemplateGenerationInput {
    templatename: string;
    heightpx: number;
    withdpx: number;
    data: StructuredData;
}

export async function generateImageFromTemplate(
    input: TemplateGenerationInput,
) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--disable-web-security",
            "--allow-running-insecure-content",
            "--disable-site-isolation-trials",
        ],
    });

    const page = await browser.newPage();

    // Set viewport to your desired dimensions
    await page.setViewport({
        width: Number(input.withdpx),
        height: Number(input.heightpx),
        deviceScaleFactor: 1,
    });

    // inside generateImageFromTemplate function
    const htmlContent = await getTemplate(input.templatename);
    if (!htmlContent) {
        throw new Error(
            `Template file ${input.templatename} not found in storage`,
        );
    }
    // Set the HTML content directly
    const dataUrl = `data:text/html,${encodeURIComponent('<base href="http://localhost:3001/" />' + fillTemplate(htmlContent, input.data))}`;

    await page.goto(dataUrl, { waitUntil: "load" });

    await page.evaluate(
        () =>
            new Promise((resolve) => {
                const imgs = Array.from(document.images);

                if (imgs.length === 0) return resolve(null);

                let remaining = imgs.length;

                const done = () => {
                    remaining--;
                    if (remaining === 0) resolve(null);
                };

                for (const img of imgs) {
                    if (img.complete && img.naturalWidth > 0) {
                        done();
                    } else {
                        img.onload = done;
                        img.onerror = done;
                    }
                }
            }),
    );

    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => new Promise(requestAnimationFrame));

    // Take a screenshot with the viewport dimensions
    const screenshotBuffer = await page.screenshot({
        clip: {
            x: 0,
            y: 0,
            width: input.withdpx,
            height: input.heightpx,
        },
        encoding: "binary",
    });

    await browser.close();
    return screenshotBuffer;
}

export async function renderTemplateStrict(input: TemplateGenerationInput) {
    const htmlContent = await getTemplate(input.templatename);
    if (!htmlContent) {
        throw new Error(
            `Template file ${input.templatename} not found in storage`,
        );
    }

    const validation = validateTemplateData(htmlContent, input.data);

    if (!validation.valid) {
        throw new Error(
            `Missing template fields: ${validation.missing.join(", ")}`,
        );
    }

    return await generateImageFromTemplate(input);
}
