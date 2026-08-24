import { Router, type Response, type Request, type NextFunction } from "express";
import { logger } from "@repo/logger";
import multer from "multer";
import {
  checkRequiredFields,
  createEntry,
  createSet,
  decodeEntryData,
  decodeSetFields,
  decodeSetTemplates,
  decodeSetTriggers,
  decodeSetHooks,
  defaultTriggersFor,
  deleteEntriesBySetId,
  deleteEntry,
  deleteSet,
  getEntriesBySetId,
  getEntryInSet,
  getSetById,
  getSetFields,
  getSetsByUserId,
  getTemplateByName,
  getImagesByEntryId,
  updateEntry,
  updateSet,
  validateFields,
  validateTriggers,
  validateHooks,
  DEFAULT_RENDER_DIMENSIONS,
  type SetField,
  type SetTriggers,
  type TriggerAction,
  type SetHook,
  type Set,
} from "@repo/db";
import { fireTriggers, cleanupSetImages, unusedTemplatesForSet } from "../../services/setTriggers.ts";
import { toDisplayHook, sendWebhook, buildWebhookPayload, reconcileHooks } from "../../services/hooks.ts";
import { getTemplateFields } from "@repo/generation";
import { getTemplate, saveSetImage, deleteSetImage } from "@repo/storage";
import { imageSize } from "image-size";
import { maxImageBytes, maxImageDimension, maxUploadFiles, origin } from "../../config.ts";

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxImageBytes,
    files: maxUploadFiles,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image type: ${file.mimetype}`));
    }
  },
});

// Run multer and translate errors into JSON responses.
function uploadImages(req: Request, res: Response, next: NextFunction) {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `File too large. Maximum size is ${Math.round(maxImageBytes / (1024 * 1024))} MB.`,
        });
      }
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_COUNT") {
        return res.status(413).json({
          error: `Too many files. Maximum is ${maxUploadFiles} files per request.`,
        });
      }
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
    next();
  });
}

// Read image dimensions from a buffer without loading it into memory.
function imageDimensions(buffer: Buffer): ReturnType<typeof imageSize> | undefined {
  try {
    return imageSize(buffer);
  } catch {
    return undefined;
  }
}

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
    // `profile.*` placeholders are filled automatically from the user's brand
    // profile at render time, so they must NOT be declared as set fields. Only
    // template-specific (entry) placeholders are required to be covered.
    const missing = getTemplateFields(content)
      .filter((f) => !f.startsWith("profile."))
      .filter((f) => !fieldNames.has(f));
    if (missing.length > 0) errors.push({ template, missing });
  }
  return errors;
}

// ---------------- helpers ----------------

function requireUserId(res: Response): number | undefined {
  const user = (res.locals.user as { id?: number } | undefined);
  return user?.id;
}

function parseIntParam(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

async function assertOwnership(userId: number, setId: number) {
  const set = await getSetById(setId);
  if (!set || set.userId !== userId) {
    return { ok: false as const, status: 404, message: "Set not found" };
  }
  return { ok: true as const, set };
}

function normalizeTriggerActions(list: unknown, templates: string[]): TriggerAction[] {
  if (!Array.isArray(list)) return [];
  const out: TriggerAction[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const template = (item as any).template;
    if (typeof template !== "string") continue;
    const width = Number((item as any).widthPx);
    const height = Number((item as any).heightPx);
    out.push({
      template,
      widthPx:
        Number.isInteger(width) && width > 0
          ? width
          : DEFAULT_RENDER_DIMENSIONS.widthPx,
      heightPx:
        Number.isInteger(height) && height > 0
          ? height
          : DEFAULT_RENDER_DIMENSIONS.heightPx,
    });
  }
  return out;
}

function normalizeTriggers(input: unknown, templates: string[]): SetTriggers {
  if (!input || typeof input !== "object") {
    return { add: [], modify: [] };
  }
  const obj = input as Record<string, unknown>;
  return {
    add: normalizeTriggerActions(obj.add, templates),
    modify: normalizeTriggerActions(obj.modify, templates),
  };
}

/**
 * Attach a decoded, client-safe representation of a set to its raw row:
 * fields / templates / triggers are decoded from JSON, and hooks are decrypted
 * with secrets masked.
 */
function presentSet(row: Set) {
  return {
    ...row,
    fields: decodeSetFields(row),
    templates: decodeSetTemplates(row),
    triggers: decodeSetTriggers(row),
    hooks: decodeSetHooks(row).map(toDisplayHook),
  };
}

/**
 * Encrypt a client-supplied hooks array for storage: validate the array shape
 * and each destination config, then encrypt every config blob.
 */
function prepareHooksForStorage(hooks: unknown, existing: SetHook[] = []): SetHook[] {
  return reconcileHooks(hooks as SetHook[], existing);
}

// =====================================================================
// /api/set  --  Sets CRUD
// =====================================================================

/**
 * @openapi
 * /api/set:
 *   post:
 *     summary: Create a set
 *     description: Create a new set. A set must have at least one attached template. Triggers default to rendering every attached template on add and modify using the default dimensions.
 *     tags: [Sets]
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
 *                   add:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [template, widthPx, heightPx]
 *                       properties:
 *                         template: { type: string, example: "badge.html" }
 *                         widthPx: { type: integer, example: 1200 }
 *                         heightPx: { type: integer, example: 800 }
 *                   modify:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [template, widthPx, heightPx]
 *                       properties:
 *                         template: { type: string, example: "badge.html" }
 *                         widthPx: { type: integer, example: 1200 }
 *                         heightPx: { type: integer, example: 800 }
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

    const { name, description, fields, templates, triggers, hooks } = req.body ?? {};
    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    const fieldsError = validateFields(fields);
    if (fieldsError) return res.status(400).json({ error: fieldsError });

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

    let tr: SetTriggers;
    if (triggers === undefined || triggers === null) {
      tr = defaultTriggersFor(templates as string[]);
    } else {
      const triggersError = validateTriggers(triggers, templates as string[]);
      if (triggersError) return res.status(400).json({ error: triggersError });
      tr = normalizeTriggers(triggers, templates as string[]);
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
      hooks: hooks === undefined || hooks === null ? undefined : prepareHooksForStorage(hooks),
    });
    if (!created) {
      return res.status(409).json({ error: "A set with this name already exists" });
    }
    return res.status(201).json({
      success: true,
      set: presentSet(created),
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
 *     tags: [Sets]
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
      sets: rows.map((row) => presentSet(row)),
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
 *     tags: [Sets]
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
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });
    const row = own.set;
    return res.json({
      success: true,
      set: presentSet(row),
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
 *     description: Update a set's metadata, fields, templates, or triggers. Cannot be used to change ownership.
 *     tags: [Sets]
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
 *               name: { type: string }
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
 *                   add:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [template, widthPx, heightPx]
 *                       properties:
 *                         template: { type: string }
 *                         widthPx: { type: integer }
 *                         heightPx: { type: integer }
 *                   modify:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [template, widthPx, heightPx]
 *                       properties:
 *                         template: { type: string }
 *                         widthPx: { type: integer }
 *                         heightPx: { type: integer }
 *     responses:
 *       200: { description: Set updated }
 *       400: { description: Bad request }
 *       404: { description: Set not found }
 */
router.patch("/:setId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    const patch: {
      name?: string;
      description?: string | null;
      fields?: SetField[];
      templates?: string[];
      triggers?: SetTriggers;
      hooks?: SetHook[];
    } = {};
    if (req.body?.name !== undefined) {
      if (typeof req.body.name !== "string" || req.body.name.trim() === "") {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      patch.name = req.body.name.trim();
    }
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
    if (req.body?.triggers !== undefined) {
      const effectiveTemplates = patch.templates ?? decodeSetTemplates(own.set);
      const triggersError = validateTriggers(req.body.triggers, effectiveTemplates);
      if (triggersError) return res.status(400).json({ error: triggersError });
      const tr = normalizeTriggers(req.body.triggers, effectiveTemplates);
      patch.triggers = tr;
    }
    if (req.body?.hooks !== undefined) {
      try {
        patch.hooks = prepareHooksForStorage(req.body.hooks, decodeSetHooks(own.set));
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Invalid hooks",
        });
      }
    }

    const updated = await updateSet(setId, patch);
    if (!updated) return res.status(404).json({ error: "Set not found" });
    return res.json({
      success: true,
      set: presentSet(updated),
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
 *     description: Delete a set, all of its entries, and every linked generated image plus the set's uploaded image folders.
 *     tags: [Sets]
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
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    const { deleted } = await cleanupSetImages(own.set);
    await deleteEntriesBySetId(setId);
    await deleteSet(setId);
    return res.json({ success: true, deleted });
  } catch (error) {
    logger.error({ message: "Failed to delete set", error: error as Error });
    return res.status(500).json({ error: "Failed to delete set" });
  }
});

/**
 * @openapi
 * /api/set/{setId}/hooks/test:
 *   post:
 *     summary: Test-send a hook
 *     description: |
 *       Validate a hook config and fire a single test webhook (Phase 1) using a
 *       sample payload built from the set's most recent entry. Does not persist
 *       the hook. Returns whether the destination accepted the request.
 *     tags: [Sets]
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
 *             required: [hook]
 *             properties:
 *               hook:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   type: { type: string, enum: [webhook, email] }
 *                   events: { type: array, items: { type: string } }
 *                   config: { type: object, properties: { url: { type: string } } }
 *     responses:
 *       200: { description: Test result returned (delivered / error) }
 *       400: { description: Invalid hook config }
 *       404: { description: Set not found }
 */
router.post("/:setId/hooks/test", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
    const own = await assertOwnership(userId, setId);
    if (!own.ok) return res.status(own.status).json({ error: own.message });

    const hook = req.body?.hook;
    if (!hook || typeof hook !== "object") {
      return res.status(400).json({ error: "hook is required" });
    }
    if (hook.type !== "webhook") {
      return res.status(400).json({ error: "Only webhook hooks can be tested in this phase" });
    }
    const config = (hook.config ?? {}) as Record<string, unknown>;
    const url = config.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "webhook requires a valid http(s) url" });
    }

    // Build a sample payload from the most recent entry (if any).
    const entries = await getEntriesBySetId(setId);
    const latest = entries[entries.length - 1];
    const sampleImages = latest ? await getImagesByEntryId(latest.id) : [];
    const payload = buildWebhookPayload(
      {
        set: own.set,
        entry: latest
          ? { id: latest.id, data: decodeEntryData(latest) }
          : { id: 0, data: {} },
      },
      "add",
      sampleImages.map((img) => ({
        name: img.name,
        template: img.template ?? "",
        url: `${origin}/api/photos/${img.name}`,
      })),
    );

    try {
      await sendWebhook(
        { url, inlineBase64: config.inlineBase64 === true },
        payload,
      );
      return res.json({ success: true, delivered: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return res.json({ success: true, delivered: false, error: reason });
    }
  } catch (error) {
    logger.error({ message: "Failed to test hook", error: error as Error });
    return res.status(500).json({ error: "Failed to test hook" });
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
 *     tags: [Sets]
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
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
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
 *     tags: [Entries]
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
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
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
 *     tags: [Entries]
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
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
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
 *     tags: [Entries]
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
    const setId = parseIntParam(req.params.setId);
    const entryId = parseIntParam(req.params.entryId);
    if (setId === undefined || entryId === undefined) {
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
 *     tags: [Entries]
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
    const setId = parseIntParam(req.params.setId);
    const entryId = parseIntParam(req.params.entryId);
    if (setId === undefined || entryId === undefined) {
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
 *     description: "Delete an entry. Fires the `remove` event: any images linked to the entry are deleted from disk and the database."
 *     tags: [Entries]
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
    const setId = parseIntParam(req.params.setId);
    const entryId = parseIntParam(req.params.entryId);
    if (setId === undefined || entryId === undefined) {
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
// /api/set/{setId}/entry/{entryId}/images  --  upload image fields
// =====================================================================

/**
 * @openapi
 * /api/set/{setId}/entry/{entryId}/images:
 *   post:
 *     summary: Upload images for entry image fields
 *     description: |
 *       Upload one image per declared image field for an existing entry.
 *       Files are stored persistently under local-blob-storage/set-images and the
 *       entry data is updated with the public path. Old files for the same field
 *       are replaced. Re-renders linked templates via the modify trigger.
 *     tags: [Entries]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               profilephoto:
 *                 type: string
 *                 format: binary
 *                 description: "File for the image field named 'profilephoto'"
 *     responses:
 *       200: { description: Entry updated with image paths }
 *       400: { description: Bad request }
 *       404: { description: Entry not found }
 */
router.post(
  "/:setId/entry/:entryId/images",
  uploadImages,
  async (req, res) => {
    try {
      const userId = requireUserId(res);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const setId = parseIntParam(req.params.setId);
      const entryId = parseIntParam(req.params.entryId);
      if (setId === undefined || entryId === undefined) {
        return res.status(400).json({ error: "Invalid id" });
      }
      const own = await assertOwnership(userId, setId);
      if (!own.ok) return res.status(own.status).json({ error: own.message });
      const entry = await getEntryInSet(setId, entryId);
      if (!entry) return res.status(404).json({ error: "Entry not found" });

      const declared = decodeSetFields(own.set);
      const imageFields = new Set(
        declared.filter((f) => f.type === "image").map((f) => f.fieldname),
      );
      if (imageFields.size === 0) {
        return res
          .status(400)
          .json({ error: "This set has no image fields" });
      }

      const files = (req.files as Express.Multer.File[]) ?? [];
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      const data = decodeEntryData(entry);
      const uploaded: Record<string, string> = {};
      const replaced: string[] = [];

      for (const file of files) {
        if (!imageFields.has(file.fieldname)) continue;

        // SVG is vector and scalable; dimension limits do not apply.
        const isSvg = file.mimetype === "image/svg+xml";
        const dimensions = imageDimensions(file.buffer);
        if (!isSvg && (!dimensions?.width || !dimensions?.height)) {
          return res.status(400).json({
            error: `Unable to read image dimensions for field "${file.fieldname}". The file may be corrupted or in an unsupported format.`,
          });
        }
        if (
          !isSvg &&
          (dimensions!.width > maxImageDimension ||
            dimensions!.height > maxImageDimension)
        ) {
          return res.status(413).json({
            error: `Image for field "${file.fieldname}" is ${dimensions!.width}x${dimensions!.height}. Maximum allowed is ${maxImageDimension}x${maxImageDimension} pixels.`,
          });
        }

        const oldPath = data[file.fieldname];
        if (typeof oldPath === "string" && oldPath.startsWith("set-images/")) {
          replaced.push(oldPath);
        }
        const relativePath = await saveSetImage(
          setId,
          entryId,
          file.fieldname,
          file.buffer,
          file.originalname,
        );
        data[file.fieldname] = relativePath;
        uploaded[file.fieldname] = relativePath;
      }

      if (Object.keys(uploaded).length === 0) {
        return res
          .status(400)
          .json({ error: "No valid image fields uploaded" });
      }

      // Clean up replaced files in the background.
      for (const oldPath of replaced) {
        try {
          await deleteSetImage(oldPath);
        } catch (error) {
          logger.warn({
            message: "Failed to delete replaced set image",
            path: oldPath,
            error: error as Error,
          });
        }
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
        uploaded,
        triggers: triggerResult,
      });
    } catch (error) {
      logger.error({
        message: "Failed to upload entry images",
        error: error as Error,
      });
      return res.status(500).json({ error: "Failed to upload entry images" });
    }
  },
);

// =====================================================================
// /api/set/{setId}/images  --  bulk listing of all generated images
// =====================================================================

/**
 * @openapi
 * /api/set/{setId}/images:
 *   get:
 *     summary: List all images linked to entries in this set
 *     tags: [Entries]
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
    const setId = parseIntParam(req.params.setId);
    if (setId === undefined) return res.status(400).json({ error: "Invalid setId" });
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
