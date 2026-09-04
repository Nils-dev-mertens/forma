import { generateRandomName } from "@repo/auth";
import { getTemplateFields } from "@repo/generation";
import { logger } from "@repo/logger";
import { deleteTempFile, getTemplate, saveTemplate } from "@repo/storage";
import { Router } from "express";
import { readFile } from "fs/promises";
import multer from "multer";
import path from "path";
import {
  createTemplate,
  getTemplateByName,
  getTemplatesByUserId,
  getTemplateVersions,
  getTemplateVersion,
  getLatestTemplateVersionNumber,
  addTemplateVersion,
  snapshotCurrentTemplateVersion,
  updateTemplateContent,
} from "@repo/db";

const router: Router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const tempDir = path.resolve(process.cwd(), "../../local-blob-storage/temp");

/**
 * @openapi
 * /api/template:
 *   get:
 *     summary: List templates
 *     description: List all templates owned by the authenticated user.
 *     tags: [Templates]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Templates listed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       userId: { type: integer }
 *                       name: { type: string }
 *                       content: { type: string }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to list templates
 */
router.get("/", async (req, res) => {
  try {
    const userId = res.locals.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const templates = await getTemplatesByUserId(userId);
    return res.json({ success: true, templates });
  } catch (error) {
    logger.error({ error: error as Error });
    res.status(500).json({ error: "Failed to list templates" });
  }
});

const upload = multer({
    dest: tempDir,
});

/**
 * @openapi
 * /api/template/upload:
 *   post:
 *     summary: Upload a template
 *     description: Upload a template file that will be associated with the authenticated user.
 *     tags: [Templates]
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
 *     tags: [Templates]
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

function isTemplateRecord(value: unknown): value is { userId: number } {
    return typeof value === "object" && value !== null && "userId" in value;
}

/**
 * @openapi
 * /api/template/{name}:
 *   put:
 *     summary: Update a template's content (records a new version)
 *     tags: [Templates]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *               note: { type: string }
 *     responses:
 *       200: { description: Template updated, new version recorded }
 *       400: { description: content required }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.put("/:name", async (req, res) => {
    try {
        const name = req.params.name;
        const userId = res.locals.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const body = isRecord(req.body) ? req.body : {};
        if (typeof body.content !== "string" || body.content.trim() === "") {
            return res.status(400).json({ error: "content is required" });
        }

        const template = await getTemplateByName(userId, name);
        if (!template || template.userId !== userId) {
            return res.status(403).json({ error: "Template not found or access denied" });
        }

        // Append-only history: record the new content as a new version.
        const nextVersion = (await getLatestTemplateVersionNumber(template.id)) + 1;
        await addTemplateVersion(
            template.id,
            nextVersion,
            body.content,
            typeof body.note === "string" ? body.note : "update",
        );
        await updateTemplateContent(template.id, body.content);
        await saveTemplate(name, body.content);

        return res.json({ success: true, version: nextVersion, updatedAt: new Date().toISOString() });
    } catch (error) {
        logger.error({ message: "Failed to update template", error: error instanceof Error ? { message: error.message, stack: error.stack } : error });
        return res.status(500).json({ error: "Failed to update template", detail: error instanceof Error ? error.message : String(error) });
    }
});

/**
 * @openapi
 * /api/template/{name}/versions:
 *   get:
 *     summary: List a template's version history
 *     tags: [Templates]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Version list }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get("/:name/versions", async (req, res) => {
    try {
        const name = req.params.name;
        const userId = res.locals.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const template = await getTemplateByName(userId, name);
        if (!template || template.userId !== userId) {
            return res.status(403).json({ error: "Template not found or access denied" });
        }

        const versions = await getTemplateVersions(template.id);
        return res.json({
            success: true,
            versions: versions.map((v) => ({
                id: v.id,
                version: v.version,
                note: v.note,
                createdAt: v.createdAt,
            })),
        });
    } catch (error) {
        logger.error({ message: "Failed to list template versions", error: error as Error });
        return res.status(500).json({ error: "Failed to list template versions" });
    }
});

/**
 * @openapi
 * /api/template/{name}/versions/{version}/restore:
 *   post:
 *     summary: Restore a template to a previous version (records a new version)
 *     tags: [Templates]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: version
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Template restored }
 *       400: { description: Invalid version }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Version not found }
 */
router.post("/:name/versions/:version/restore", async (req, res) => {
    try {
        const name = req.params.name;
        const userId = res.locals.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const version = Number(req.params.version);
        if (!Number.isInteger(version) || version <= 0) {
            return res.status(400).json({ error: "Invalid version" });
        }

        const template = await getTemplateByName(userId, name);
        if (!template || template.userId !== userId) {
            return res.status(403).json({ error: "Template not found or access denied" });
        }

        const target = await getTemplateVersion(template.id, version);
        if (!target) {
            return res.status(404).json({ error: "Version not found" });
        }

        // Snapshot the current (to-be-replaced) content, then restore.
        await snapshotCurrentTemplateVersion(template.id, `restore to v${version}`);
        await updateTemplateContent(template.id, target.content);
        await saveTemplate(name, target.content);

        return res.json({ success: true, restoredVersion: version, updatedAt: new Date().toISOString() });
    } catch (error) {
        logger.error({ message: "Failed to restore template version", error: error as Error });
        return res.status(500).json({ error: "Failed to restore template version" });
    }
});

export default router;