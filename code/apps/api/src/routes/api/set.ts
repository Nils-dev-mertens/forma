import { Router } from "express";
import { logger } from "@repo/logger";
import {
  checkRequiredFields,
  createEntry,
  createSet,
  decodeEntryData,
  decodeSetDimensions,
  decodeSetFields,
  decodeSetTemplates,
  decodeSetTriggers,
  defaultTriggersFor,
  deleteEntriesBySetId,
  deleteEntry,
  deleteSet,
  emptyTriggers,
  getEntriesBySetId,
  getEntryInSet,
  getSetById,
  getSetFields,
  getSetsByUserId,
  getTemplateByName,
  getImagesByEntryId,
  updateEntry,
  updateSet,
  validateDimensions,
  validateFields,
  type SetDimensions,
  type SetField,
  type SetTriggers,
} from "@repo/db";
import { fireTriggers, unusedTemplatesForSet } from "../../services/setTriggers.ts";
import { getTemplateFields } from "@repo/generation";
import { getTemplate } from "@repo/storage";

const router: Router = Router();

// ---------------- template coverage validation ----------------

interface TemplateCoverageError {
  template: string;
  missing: string[];
}

async function validateTemplateFieldCoverage(
  fields: SetField[],
  templates: string[],
): Promise<TemplateCoverageError[]> {
  const fieldNames = new Set(fields.map((f) => f.fieldname));
  const errors: TemplateCoverageError[] = [];
  for (const template of templates) {
    const content = await getTemplate(template);
    if (content === null) {
      errors.push({ template, missing: ["<template file not found>"] });
      continue;
    }
    const missing = getTemplateFields(content).filter((f) => !fieldNames.has(f));
    if (missing.length > 0) errors.push({ template, missing });
  }
  return errors;
}

// ---------------- helpers ----------------

function requireUserId(res: any): number | null {
  const userId = res.locals.user?.id;
  if (!userId) return null;
  return userId as number;
}

async function assertOwnership(userId: number, setId: number) {
  const set = await getSetById(setId);
  if (!set || set.userId !== userId) {
    return { ok: false as const, status: 404, message: "Set not found" };
  }
  return { ok: true as const, set };
}

function normalizeTriggers(input: unknown): SetTriggers {
  const empty = emptyTriggers();
  if (!input || typeof input !== "object") return empty;
  const obj = input as Record<string, unknown>;
  return {
    add: Array.isArray(obj.add) ? (obj.add as string[]) : empty.add,
    modify: Array.isArray(obj.modify) ? (obj.modify as string[]) : empty.modify,
    remove: Array.isArray(obj.remove) ? (obj.remove as string[]) : empty.remove,
  };
}

function normalizeDimensions(input: unknown): SetDimensions | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) return undefined;
  return input as SetDimensions;
}

// =====================================================================
// /api/set  --  Sets CRUD
// =====================================================================

/**
 * @openapi
 * /api/set:
 *   post:
 *     summary: Create a set
 *     description: Create a new set. A set must have at least one attached template. Triggers default to "render every attached template on every event" when omitted.
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, fields, templates]
 *             properties:
 *               name: { type: string, example: "team" }
 *               description: { type: string, example: "Team members" }
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [fieldname]
 *                   properties:
 *                     fieldname: { type: string, example: "name" }
 *                     type: { type: string, enum: [string, number, boolean, image], example: "string" }
 *                     required: { type: boolean, example: true }
 *               templates:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string, example: "badge.html" }
 *               triggers:
 *                 type: object
 *                 properties:
 *                   add:    { type: array, items: { type: string } }
 *                   modify: { type: array, items: { type: string } }
 *                   remove: { type: array, items: { type: string } }
 *               dimensions:
 *                 type: object
 *                 additionalProperties:
 *                   type: object
 *                   properties:
 *                     width: { type: integer, example: 1200 }
 *                     height: { type: integer, example: 800 }
 *     responses:
 *       201: { description: Set created }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       409: { description: Set with this name already exists }
 */
router.post("/", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, description, fields, templates, triggers, dimensions } = req.body ?? {};
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    const fieldsError = validateFields(fields);
    if (fieldsError) return res.status(400).json({ error: fieldsError });

    const dimensionsError = validateDimensions(dimensions, templates as string[]);
    if (dimensionsError) return res.status(400).json({ error: dimensionsError });

    if (!Array.isArray(templates) || templates.length === 0) {
      return res
        .status(400)
        .json({ error: "templates must contain at least one template name" });
    }
    for (const t of templates) {
      if (typeof t !== "string" || t.trim() === "") {
        return res.status(400).json({ error: "every template entry must be a non-empty string" });
      }
      const owned = await getTemplateByName(userId, t);
      if (!owned) {
        return res.status(400).json({ error: `template not found: ${t}` });
      }
    }

    const tr = normalizeTriggers(triggers ?? defaultTriggersFor(templates as string[]));
    for (const list of [tr.add, tr.modify, tr.remove]) {
      for (const t of list) {
        if (!(templates as string[]).includes(t)) {
          return res
            .status(400)
            .json({ error: `trigger references template not attached to set: ${t}` });
        }
      }
    }

    const coverageErrors = await validateTemplateFieldCoverage(
      fields as SetField[],
      templates as string[],
    );
    if (coverageErrors.length > 0) {
      return res.status(400).json({
        error: "Set fields do not cover all template variables",
        coverageErrors,
      });
    }

    const created = await createSet({
      userId,
      name,
      description: typeof description === "string" ? description : null,
      fields: fields as SetField[],
      templates: templates as string[],
      triggers: tr,
      dimensions: normalizeDimensions(dimensions),
    });
    if (!created) {
      return res.status(409).json({ error: "A set with this name already exists" });
    }
    return res.status(201).json({
      success: true,
      set: {
        ...created,
        fields: decodeSetFields(created),
        templates: decodeSetTemplates(created),
        triggers: decodeSetTriggers(created),
        dimensions: decodeSetDimensions(created),
      },
    });
  } catch (error) {
    logger.error({ message: "Failed to create set", error: error as Error });
    return res.status(500).json({ error: "Failed to create set" });
  }
});

/**
 * @openapi
 * /api/set:
 *   get:
 *     summary: List sets
 *     description: List all sets owned by the authenticated user.
 *     security:
 *       - apiKey: []
 *     responses:
 *       200: { description: Sets listed (with decoded fields/templates/triggers) }
 *       401: { description: Unauthorized }
 */
router.get("/", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await getSetsByUserId(userId);
    return res.json({
      success: true,
      sets: rows.map((row) => ({
        ...row,
        fields: decodeSetFields(row),
        templates: decodeSetTemplates(row),
        triggers: decodeSetTriggers(row),
        dimensions: decodeSetDimensions(row),
      })),
    });
  } catch (error) {
    logger.error({ message: "Failed to list sets", error: error as Error });
    return res.status(500).json({ error: "Failed to list sets" });
  }
});

/**
 * @openapi
 * /api/set/{setId}:
 *   get:
 *     summary: Get a set
 *     description: Get a single set (with decoded JSON shapes).
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Set }
 *       404: { description: Set not found }
 */
router.get("/:setId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const row = own.set;
    return res.json({
      success: true,
      set: {
        ...row,
        fields: decodeSetFields(row),
        templates: decodeSetTemplates(row),
        triggers: decodeSetTriggers(row),
        dimensions: decodeSetDimensions(row),
      },
      unusedTemplates: unusedTemplatesForSet(row),
    });
  } catch (error) {
    logger.error({ message: "Failed to get set", error: error as Error });
    return res.status(500).json({ error: "Failed to get set" });
  }
});

/**
 * @openapi
 * /api/set/{setId}:
 *   patch:
 *     summary: Update a set
 *     description: Update a set's metadata, fields, templates, or triggers. Cannot be used to change ownership. Re-applying triggers re-runs nothing immediately; triggers only fire on entry events.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     fieldname: { type: string }
 *                     type: { type: string, enum: [string, number, boolean, image] }
 *                     required: { type: boolean }
 *               templates:
 *                 type: array
 *                 minItems: 1
 *                 items: { type: string }
 *               triggers:
 *                 type: object
 *                 properties:
 *                   add:    { type: array, items: { type: string } }
 *                   modify: { type: array, items: { type: string } }
 *                   remove: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Set updated }
 *       400: { description: Bad request }
 *       404: { description: Set not found }
 */
router.patch("/:setId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    const patch: {
      description?: string | null;
      fields?: SetField[];
      templates?: string[];
      triggers?: SetTriggers;
      dimensions?: SetDimensions;
    } = {};
    if (req.body?.description !== undefined) {
      patch.description =
        typeof req.body.description === "string" ? req.body.description : null;
    }
    if (req.body?.fields !== undefined) {
      const fieldsError = validateFields(req.body.fields);
      if (fieldsError) return res.status(400).json({ error: fieldsError });
      patch.fields = req.body.fields as SetField[];
    }
    if (req.body?.templates !== undefined) {
      if (!Array.isArray(req.body.templates) || req.body.templates.length === 0) {
        return res
          .status(400)
          .json({ error: "templates must contain at least one template name" });
      }
      for (const t of req.body.templates) {
        const owned = await getTemplateByName(userId, t);
        if (!owned) return res.status(400).json({ error: `template not found: ${t}` });
      }
      patch.templates = req.body.templates as string[];
    }
    if (req.body?.dimensions !== undefined) {
      const effectiveTemplates = patch.templates ?? decodeSetTemplates(own.set);
      const dimensionsError = validateDimensions(req.body.dimensions, effectiveTemplates);
      if (dimensionsError) return res.status(400).json({ error: dimensionsError });
      patch.dimensions = req.body.dimensions as SetDimensions;
    }
    if (req.body?.triggers !== undefined) {
      patch.triggers = normalizeTriggers(req.body.triggers);
    }
    // Cross-check: triggers still reference only attached templates
    const effectiveTemplates = patch.templates ?? decodeSetTemplates(own.set);
    const effectiveTriggers = patch.triggers ?? decodeSetTriggers(own.set);
    for (const list of [
      effectiveTriggers.add,
      effectiveTriggers.modify,
      effectiveTriggers.remove,
    ]) {
      for (const t of list) {
        if (!effectiveTemplates.includes(t)) {
          return res
            .status(400)
            .json({ error: `trigger references template not attached to set: ${t}` });
        }
      }
    }

    const effectiveFields = patch.fields ?? decodeSetFields(own.set);
    const coverageErrors = await validateTemplateFieldCoverage(
      effectiveFields,
      effectiveTemplates,
    );
    if (coverageErrors.length > 0) {
      return res.status(400).json({
        error: "Set fields do not cover all template variables",
        coverageErrors,
      });
    }

    const updated = await updateSet(setId, patch);
    if (!updated) return res.status(404).json({ error: "Set not found" });
    return res.json({
      success: true,
      set: {
        ...updated,
        fields: decodeSetFields(updated),
        templates: decodeSetTemplates(updated),
        triggers: decodeSetTriggers(updated),
        dimensions: decodeSetDimensions(updated),
      },
    });
  } catch (error) {
    logger.error({ message: "Failed to update set", error: error as Error });
    return res.status(500).json({ error: "Failed to update set" });
  }
});

/**
 * @openapi
 * /api/set/{setId}:
 *   delete:
 *     summary: Delete a set
 *     description: Delete a set and all of its entries. Linked generated images are NOT automatically deleted.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Set deleted }
 *       404: { description: Set not found }
 */
router.delete("/:setId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    await deleteEntriesBySetId(setId);
    await deleteSet(setId);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ message: "Failed to delete set", error: error as Error });
    return res.status(500).json({ error: "Failed to delete set" });
  }
});

// =====================================================================
// /api/set/{setId}/fields  --  getFields helper (declared + observed)
// =====================================================================

/**
 * @openapi
 * /api/set/{setId}/fields:
 *   get:
 *     summary: List set fields
 *     description: Returns the set's declared fields plus a list of keys actually observed on its entries.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Fields retrieved }
 *       404: { description: Set not found }
 */
router.get("/:setId/fields", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const { declared, observed } = await getSetFields(setId);
    return res.json({ success: true, declared, observed });
  } catch (error) {
    logger.error({ message: "Failed to fetch set fields", error: error as Error });
    return res.status(500).json({ error: "Failed to fetch set fields" });
  }
});

// =====================================================================
// /api/set/{setId}/entry  --  Entry CRUD + trigger firing
// =====================================================================

/**
 * @openapi
 * /api/set/{setId}/entry:
 *   post:
 *     summary: Add an entry
 *     description: "Create a new entry on the set. Triggers the `add` event: linked templates render new images linked to this entry."
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   name: "Ada"
 *                   function: "Engineer"
 *     responses:
 *       201: { description: Entry created }
 *       400: { description: Missing or invalid data }
 *       404: { description: Set not found }
 */
router.post("/:setId/entry", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    const data = req.body?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "data must be a JSON object" });
    }

    const declared = decodeSetFields(own.set);
    const violations = checkRequiredFields(declared, data);
    if (violations.length > 0) {
      return res
        .status(400)
        .json({ error: "Missing required fields", missing: violations });
    }
    const entry = await createEntry({ setId, data });
    if (!entry) return res.status(500).json({ error: "Failed to create entry" });

    const triggerResult = await fireTriggers("add", {
      userId,
      set: own.set,
      entry,
    });

    return res.status(201).json({
      success: true,
      entry: { ...entry, data: decodeEntryData(entry) },
      triggers: triggerResult,
    });
  } catch (error) {
    logger.error({
      message: "Failed to create entry",
      error: error as Error,
    });
    return res.status(500).json({ error: "Failed to create entry" });
  }
});

/**
 * @openapi
 * /api/set/{setId}/entry:
 *   get:
 *     summary: List entries
 *     description: List every entry in the set (with decoded data). Optionally include linked images per entry.
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: withImages
 *         schema:
 *           type: boolean
 *         required: false
 *     responses:
 *       200: { description: Entries listed }
 *       404: { description: Set not found }
 */
router.get("/:setId/entry", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const rows = await getEntriesBySetId(setId);
    const wantImages = req.query.withImages === "true" || req.query.withImages === "1";

    const entriesOut = await Promise.all(
      rows.map(async (entry) => {
        const base = { ...entry, data: decodeEntryData(entry) };
        if (!wantImages) return base;
        const images = await getImagesByEntryId(entry.id);
        return { ...base, images };
      }),
    );
    return res.json({ success: true, entries: entriesOut });
  } catch (error) {
    logger.error({ message: "Failed to list entries", error: error as Error });
    return res.status(500).json({ error: "Failed to list entries" });
  }
});

/**
 * @openapi
 * /api/set/{setId}/entry/{entryId}:
 *   get:
 *     summary: Get a single entry
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Entry }
 *       404: { description: Entry not found }
 */
router.get("/:setId/entry/:entryId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    const entryId = parseInt(req.params.entryId);
    if (isNaN(setId) || isNaN(entryId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const entry = await getEntryInSet(setId, entryId);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    const images = await getImagesByEntryId(entry.id);
    return res.json({
      success: true,
      entry: { ...entry, data: decodeEntryData(entry) },
      images,
    });
  } catch (error) {
    logger.error({ message: "Failed to get entry", error: error as Error });
    return res.status(500).json({ error: "Failed to get entry" });
  }
});

/**
 * @openapi
 * /api/set/{setId}/entry/{entryId}:
 *   put:
 *     summary: Update an entry
 *     description: "Replace the data of an entry. Fires the `modify` event: any previously rendered images from listed templates are removed and re-rendered with the new data."
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200: { description: Entry updated }
 *       400: { description: Missing required fields or bad data }
 *       404: { description: Entry not found }
 */
router.put("/:setId/entry/:entryId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    const entryId = parseInt(req.params.entryId);
    if (isNaN(setId) || isNaN(entryId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const existing = await getEntryInSet(setId, entryId);
    if (!existing) return res.status(404).json({ error: "Entry not found" });

    const data = req.body?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "data must be a JSON object" });
    }
    const declared = decodeSetFields(own.set);
    const violations = checkRequiredFields(declared, data);
    if (violations.length > 0) {
      return res
        .status(400)
        .json({ error: "Missing required fields", missing: violations });
    }

    const updated = await updateEntry(entryId, { data });
    if (!updated) return res.status(500).json({ error: "Failed to update entry" });
    const triggerResult = await fireTriggers("modify", {
      userId,
      set: own.set,
      entry: updated,
    });
    return res.json({
      success: true,
      entry: { ...updated, data: decodeEntryData(updated) },
      triggers: triggerResult,
    });
  } catch (error) {
    logger.error({ message: "Failed to update entry", error: error as Error });
    return res.status(500).json({ error: "Failed to update entry" });
  }
});

/**
 * @openapi
 * /api/set/{setId}/entry/{entryId}:
 *   delete:
 *     summary: Delete an entry
 *     description: "Delete an entry. Fires the `remove` event: any images created by the listed templates are deleted from disk and the database."
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Entry deleted }
 *       404: { description: Entry not found }
 */
router.delete("/:setId/entry/:entryId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    const entryId = parseInt(req.params.entryId);
    if (isNaN(setId) || isNaN(entryId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const existing = await getEntryInSet(setId, entryId);
    if (!existing) return res.status(404).json({ error: "Entry not found" });

    const triggerResult = await fireTriggers("remove", {
      userId,
      set: own.set,
      entry: existing,
    });
    await deleteEntry(entryId);
    return res.json({ success: true, triggers: triggerResult });
  } catch (error) {
    logger.error({ message: "Failed to delete entry", error: error as Error });
    return res.status(500).json({ error: "Failed to delete entry" });
  }
});

// =====================================================================
// /api/set/{setId}/images  --  bulk listing of all generated images
// =====================================================================

/**
 * @openapi
 * /api/set/{setId}/images:
 *   get:
 *     summary: List all images linked to entries in this set
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: setId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Images listed }
 *       404: { description: Set not found }
 */
router.get("/:setId/images", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseInt(req.params.setId);
    if (isNaN(setId)) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    const entries = await getEntriesBySetId(setId);
    const grouped = await Promise.all(
      entries.map(async (entry) => ({
        entryId: entry.id,
        images: await getImagesByEntryId(entry.id),
      })),
    );
    return res.json({ success: true, entries: grouped });
  } catch (error) {
    logger.error({ message: "Failed to list set images", error: error as Error });
    return res.status(500).json({ error: "Failed to list set images" });
  }
});

export default router;
