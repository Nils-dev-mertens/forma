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
            "--no-sandbox",
            "--disable-setuid-sandbox",
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

    // Don't let navigation hang on slow/unreachable external resources.
    page.setDefaultNavigationTimeout(15000);

    // inside generateImageFromTemplate function
    const htmlContent = await getTemplate(input.templatename);
    if (!htmlContent) {
        throw new Error(
            `Template file ${input.templatename} not found in storage`,
        );
    }
    // Set the HTML content directly
    const dataUrl = `data:text/html,${encodeURIComponent('<base href="http://localhost:3001/" />' + fillTemplate(htmlContent, input.data))}`;

    await page.goto(dataUrl, { waitUntil: "domcontentloaded" });

    await page.evaluate(
        () =>
            new Promise((resolve) => {
                const imgs = Array.from(document.images);

                if (imgs.length === 0) return resolve(null);

                let remaining = imgs.length;
                let settled = false;

                const done = () => {
                    if (settled) return;
                    remaining--;
                    if (remaining <= 0) {
                        settled = true;
                        resolve(null);
                    }
                };

                for (const img of imgs) {
                    // `complete` is true once an image has loaded *or* failed
                    // (e.g. an empty `src=""`). Broken/empty images never fire
                    // load/error again, so resolving on `complete` avoids a hang.
                    if (img.complete) {
                        done();
                    } else {
                        img.addEventListener("load", done);
                        img.addEventListener("error", done);
                    }
                }

                // Hard fallback: never block the render forever on a stuck image.
                setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        resolve(null);
                    }
                }, 5000);
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
