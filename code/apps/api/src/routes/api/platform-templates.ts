import { logger } from "@repo/logger";
import { Router } from "express";
import { platformTemplates } from "../../platform-templates/templates.ts";

const router: Router = Router();

/**
 * @openapi
 * /api/platform-templates:
 *   get:
 *     summary: List platform templates
 *     description: List all curated platform templates available for use. These are read-only reference templates.
 *     tags: [Platform Templates]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Platform templates listed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       description: { type: string }
 *                       category: { type: string }
 *                       widthPx: { type: integer }
 *                       heightPx: { type: integer }
 *                       fields: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized
 */
router.get("/", async (_req, res) => {
  try {
    const userId = res.locals.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const summaries = platformTemplates.map(
      ({ id, name, description, category, widthPx, heightPx, fields }) => ({
        id,
        name,
        description,
        category,
        widthPx,
        heightPx,
        fields,
      }),
    );

    return res.json({ success: true, templates: summaries });
  } catch (error) {
    logger.error({ error: error as Error });
    res.status(500).json({ error: "Failed to list platform templates" });
  }
});

/**
 * @openapi
 * /api/platform-templates/{id}:
 *   get:
 *     summary: Get platform template
 *     description: Get the full HTML content of a curated platform template by its ID.
 *     tags: [Platform Templates]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Platform template ID
 *     responses:
 *       200:
 *         description: Platform template retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 template:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     description: { type: string }
 *                     category: { type: string }
 *                     widthPx: { type: integer }
 *                     heightPx: { type: integer }
 *                     fields: { type: array, items: { type: string } }
 *                     html: { type: string }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 */
router.get("/:id", async (req, res) => {
  try {
    const userId = res.locals.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = req.params.id as string;
    const template = platformTemplates.find((t) => t.id === id);

    if (!template) {
      return res.status(404).json({ error: "Platform template not found" });
    }

    return res.json({ success: true, template });
  } catch (error) {
    logger.error({ error: error as Error });
    res.status(500).json({ error: "Failed to get platform template" });
  }
});

export default router;
