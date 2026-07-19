import { generateRandomName } from "@repo/auth";
import { getTemplateFields } from "@repo/generation";
import { logger } from "@repo/logger";
import { deleteTempFile, getTemplate, saveTemplate } from "@repo/storage";
import { Router } from "express";
import { readFile } from "fs/promises";
import multer from "multer";
import path from "path";
import { createTemplate, getTemplateByName } from "@repo/db";

const router: Router = Router();

const tempDir = path.resolve(process.cwd(), "../../local-blob-storage/temp");

const upload = multer({
    dest: tempDir,
});

/**
 * @openapi
 * /api/template/upload:
 *   post:
 *     summary: Upload a template
 *     description: Upload a template file that will be associated with the authenticated user.
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 format: binary
 *                 description: Template file to upload (HTML format recommended)
 *     responses:
 *       200:
 *         description: Template upload result with extracted fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Template uploaded"
 *                 filename:
 *                   type: string
 *                   example: "abc123def456.html"
 *                 fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["title", "description", "imageUrl"]
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized - missing or invalid API key
 *       500:
 *         description: Failed to upload template
 */
router.post("/upload", upload.single("template"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).send("No file uploaded");
            return;
        }

        const userId = res.locals.user?.id;
        if (!userId) {
            res.status(401).send("Unauthorized");
            return;
        }

        const newTemplateName: string = generateRandomName({
            length: 12,
            endsWith: ".html",
        });

        const oldPath = req.file.path;

        const htmlContent = await readFile(oldPath, "utf8");

        await saveTemplate(newTemplateName, htmlContent);
        await deleteTempFile(req.file.filename);

        // Store template in database with user ownership
        await createTemplate(userId, newTemplateName, htmlContent);

        const fields = getTemplateFields(htmlContent);

        res.json({
            message: "Template uploaded",
            filename: newTemplateName,
            fields,
        });
    } catch (error) {
        logger.error({ error: error as Error });
        res.status(500).json({
            error: "Failed to upload template",
        });
    }
});

/**
 * @openapi
 * /api/template/fields/{template}:
 *   get:
 *     summary: Get template fields
 *     description: Retrieve the extractable fields from a template file. Only returns fields for templates owned by the authenticated user.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: template
 *         required: true
 *         schema:
 *           type: string
 *           example: "abc123def456.html"
 *         description: Template file name to fetch fields for
 *     responses:
 *       200:
 *         description: Template fields retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["title", "description", "imageUrl"]
 *       400:
 *         description: Template not found or bad request
 *       401:
 *         description: Unauthorized - missing or invalid API key
 *       403:
 *         description: Forbidden - you don't have access to this template
 *       500:
 *         description: Failed to retrieve template fields
 */
router.get("/fields/:template", async (req, res) => {
    try {
        const templatename = req.params.template as string;
        const userId = res.locals.user?.id;
        
        if (!userId) {
            return res.status(401).send("Unauthorized");
        }
        
        // Check if user owns this template
        const templateRecord = await getTemplateByName(userId, templatename);
        if (!templateRecord) {
            return res.status(403).send({ message: "Access denied or template not found" });
        }
        
        const htmlContent = await getTemplate(
            templatename.split(".")[1]?.toLocaleLowerCase() == "html"
                ? templatename
                : `${templatename}.html`,
        );
        
        if (htmlContent == null) {
            return res
                .status(400)
                .send({ message: `${templatename} not found` });
        }
        
        const fields = getTemplateFields(htmlContent);
        res.send({ fields });
    } catch (error) {
        logger.error({ error: error as Error });
        res.status(500).json({
            error: "Failed to upload template",
        });
    }
});

export default router;