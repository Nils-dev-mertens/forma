import { generateRandomName } from "@repo/auth";
import { generateAndStoreImageFromTemplate, generateAndStoreImageFromTemplateStrict, type TemplateGenerationInput } from "@repo/generation";
import { logger } from "@repo/logger";
import { Router } from "express";
import { rm, rename } from "fs/promises";
import multer from "multer";
import path, { join } from "path"
import { origin } from "../../../config";
import { createImage, getTemplateByName } from "@repo/db";

const router: Router = Router();

const tempDir = path.resolve(process.cwd(), "../../local-blob-storage/temp");

const upload = multer({
    dest: tempDir,
});

/**
 * @openapi
 * /api/generation/image/:
 *   post:
 *     summary: Generate an image from template
 *     description: Generate an image by uploading temporary images and providing template data. The generated image will be associated with the authenticated user.
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Temporary images to use in generation
 *               input:
 *                 type: string
 *                 description: JSON string containing template generation parameters
 *                 example: '{"templatename":"template.html","widthpx":800,"heightpx":600,"data":{"title":"Example"}}'
 *     responses:
 *       200:
 *         description: Image generation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imagename:
 *                   type: string
 *                   example: "abc123def456.png"
 *       400:
 *         description: Missing input, imagename, or no images uploaded
 *       401:
 *         description: Unauthorized - missing or invalid API key
 *       403:
 *         description: Forbidden - you don't have access to the specified template
 *       500:
 *         description: Failed to generate image
 */
router.post("/", upload.array("images"), async (req, res) => {
    try {
        const input: TemplateGenerationInput =
            typeof req.body.input === "string"
                ? JSON.parse(req.body.input)
                : req.body.input;
        logger.info(input);

        if (!input) {
            res.status(400).send("Missing input or imagename");
            return;
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "Geen images geüpload." });
        }

        const tempFileNames: string[] = [];

        for (const file of req.files as Express.Multer.File[]) {
            const ext = file.originalname.match(/\.[0-9a-z]+$/i)?.[0] ?? ".png";

            const tempFileName = generateRandomName({
                length: 12,
                endsWith: ext,
            });

            const tempFilePath = join(tempDir, tempFileName);

            // move file
            await rename(file.path, tempFilePath);

            tempFileNames.push(tempFileName);

            if (input.data?.records) {
                for (const key in input.data.records) {
                    if (input.data.records[key] === file.originalname) {
                        input.data.records[key] = `/tempphotos/${tempFileName}`;
                    }
                }
            }
        }

        const generatedImageName: string = generateRandomName({
            length: 12,
            endsWith: ".png",
        });

        const userId = res.locals.user?.id;
        
        // Verify template ownership if template is specified
        if (input.templatename) {
            const templateRecord = await getTemplateByName(userId!, input.templatename);
            if (!templateRecord) {
                return res.status(403).send("You don't have access to this template");
            }
        }

        await generateAndStoreImageFromTemplate(input, generatedImageName);
        
        // Store image record in database
        // Get template ID from the template name
        let templateId = null;
        if (input.templatename) {
            const templateRecord = await getTemplateByName(userId!, input.templatename);
            templateId = templateRecord?.id || null;
        }
        
        await createImage(userId!, templateId, generatedImageName, {
            template: input.templatename,
            data: input.data,
            width: input.withdpx,
            height: input.heightpx,
        });

        for (const filename of tempFileNames) {
            await rm(join(tempDir, filename));
        }
        res.json({ imagename: generatedImageName });
    } catch (error) {
        res.status(500).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to generate image",
        });
    }
});

/**
 * @openapi
 * /api/generation/image/strict:
 *   post:
 *     summary: Generate an image from template (strict mode)
 *     description: Generate an image using strict template rendering. The generated image will be associated with the authenticated user.
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 type: object
 *                 description: Template generation parameters
 *                 properties:
 *                   templatename:
 *                     type: string
 *                     example: "template.html"
 *                     description: Name of the template to use
 *                   widthpx:
 *                     type: number
 *                     example: 800
 *                     description: Width of the output image in pixels
 *                   heightpx:
 *                     type: number
 *                     example: 600
 *                     description: Height of the output image in pixels
 *                   data:
 *                     type: object
 *                     description: Data to fill the template with
 *                     example: {"title": "Example", "description": "Test"}
 *     responses:
 *       200:
 *         description: Image generation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imagename:
 *                   type: string
 *                   example: "abc123def456.png"
 *       400:
 *         description: Missing input or imagename
 *       401:
 *         description: Unauthorized - missing or invalid API key
 *       403:
 *         description: Forbidden - you don't have access to the specified template
 *       500:
 *         description: Failed to generate image
 */
router.post("/strict", async (req, res) => {
    try {
        const input: TemplateGenerationInput = req.body.input;
        console.log(input);
        const imagename: string = generateRandomName({
            length: 12,
            endsWith: ".png",
        });
        
        const userId = res.locals.user?.id;
        
        if (!input || !imagename || !userId) {
            res.status(400).send("Missing input or imagename");
            return;
        }

        // Verify template ownership if template is specified
        if (input.templatename) {
            const templateRecord = await getTemplateByName(userId, input.templatename);
            if (!templateRecord) {
                return res.status(403).send("You don't have access to this template");
            }
        }

        await generateAndStoreImageFromTemplateStrict(input, imagename);
        
        // Store image record in database
        // Get template ID from the template name
        let templateId = null;
        if (input.templatename) {
            const templateRecord = await getTemplateByName(userId, input.templatename);
            templateId = templateRecord?.id || null;
        }
        
        await createImage(userId, templateId, imagename, {
            template: input.templatename,
            data: input.data,
            width: input.withdpx,
            height: input.heightpx,
        });
        
        res.json({ imagename });
    } catch (error) {
        res.status(500).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to generate image",
        });
    }
});

export default router;