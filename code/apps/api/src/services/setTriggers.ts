import { generateAndStoreImageFromTemplateStrict, type TemplateGenerationInput } from "@repo/generation";
import { deleteGeneratedImage, deleteSetImageDirectory } from "@repo/storage";
import { generateRandomName } from "@repo/auth";
import {
  createImage,
  decodeSetTemplates,
  decodeSetTriggers,
  decodeEntryData,
  deleteImage,
  entryDataToRecords,
  getEntriesBySetId,
  getImagesByEntryId,
  getImagesByEntryIdAndTemplateNames,
  getOrphanImagesBySetId,
  getProfileByUserId,
  getTemplateByName,
  linkImageToEntry,
  profileToRecords,
  getWorkflowNodes,
  DEFAULT_RENDER_DIMENSIONS,
  type Entry,
  type Set,
  type Image,
  type SetTriggers,
  type TriggerAction,
} from "@repo/db";
import { logger } from "@repo/logger";
import { imagePathToDataUrl } from "./imageDataUrls.ts";
import { fireHooks, type HookFailure } from "./hooks.ts";
import { fireWorkflow } from "./workflowEngine.ts";

interface TriggerContext {
  userId: number;
  set: Set;
  entry: Entry;
}

interface TriggerFailure {
  templatename: string;
  reason: string;
}

interface RenderedImage {
  name: string;
  template: string;
}

interface TriggerResult {
  rendered: RenderedImage[];
  deleted: string[];
  /** Per-template render failures with the actual error message. */
  failed: TriggerFailure[];
  /** Templates that were in the trigger config but no longer exist for this user. */
  missing: string[];
  /** Export hook failures (non-fatal) recorded after rendering. */
  hookFailures: HookFailure[];
}

/**
 * Build a TemplateGenerationInput record from an entry's data.
 * Every declared field with a string-coercible value flows through as a record.
 *
 * Any value that points to a stored set-image (e.g. "set-images/1/2/photo.png")
 * or profile logo is replaced with a base64 data URL so Puppeteer can render it
 * without relying on a live static server.
 *
 * NOTE: the existing TemplateGenerationInput interface in @repo/generation
 * misspells the width field as `withdpx`. We map the trigger action's widthPx
 * to that field so the generated runtime accepts the object.
 */
async function buildGenerationInput(
  action: TriggerAction,
  entry: Entry,
  userId: number,
): Promise<TemplateGenerationInput> {
  const records = entryDataToRecords(decodeEntryData(entry));

  // Merge identity profile values into the template records.
  const profile = await getProfileByUserId(userId);
  if (profile) {
    const profileRecords = profileToRecords(profile);
    for (const [key, value] of Object.entries(profileRecords)) {
      records[key] = value;
    }
  }

  for (const [key, value] of Object.entries(records)) {
    if (typeof value !== "string") continue;
    try {
      const dataUrl = await imagePathToDataUrl(value);
      if (dataUrl) records[key] = dataUrl;
    } catch (error) {
      // Soft-fail: keep the original relative path if the file is missing
      // or unreadable; the template will show a broken image instead of
      // blocking the whole render.
    }
  }

  return {
    templatename: action.template,
    withdpx: action.widthPx ?? DEFAULT_RENDER_DIMENSIONS.widthPx,
    heightpx: action.heightPx ?? DEFAULT_RENDER_DIMENSIONS.heightPx,
    data: { records },
  };
}

/**
 * Resolve the trigger config's template names against actual templates owned by
 * the user. Missing templates are returned so callers can surface a warning
 * instead of silently dropping them.
 */
async function resolveTemplates(
  userId: number,
  actions: TriggerAction[],
): Promise<{ valid: TriggerAction[]; missing: string[] }> {
  if (actions.length === 0) return { valid: [], missing: [] };
  const valid: TriggerAction[] = [];
  const missing: string[] = [];
  for (const action of actions) {
    const t = await getTemplateByName(userId, action.template);
    if (t) valid.push(action);
    else missing.push(action.template);
  }
  if (missing.length > 0) {
    logger.warn({
      message: "Trigger references templates that no longer exist for this user",
      userId,
      missing,
    });
  }
  return { valid, missing };
}

async function deleteImagesRowAndBlob(imgs: Image[]): Promise<void> {
  for (const img of imgs) {
    try {
      await deleteGeneratedImage(img.name);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn({
        message: "Failed to delete generated image blob (continuing)",
        image: img.name,
        reason,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    await deleteImage(img.id);
  }
}

/**
 * Shared rendering helper used by the "add" branch and the re-render step of
 * "modify". If `createImage` fails after Puppeteer has already written the
 * blob, we delete the orphan file to avoid disk leaks.
 */
async function renderTemplates(
  ctx: TriggerContext,
  actions: TriggerAction[],
): Promise<{ rendered: RenderedImage[]; failed: TriggerFailure[] }> {
  const rendered: RenderedImage[] = [];
  const failed: TriggerFailure[] = [];
  for (const action of actions) {
    const imagename = generateRandomName({ length: 12, endsWith: ".png" });
    try {
      await generateAndStoreImageFromTemplateStrict(
        await buildGenerationInput(action, ctx.entry, ctx.userId),
        imagename,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({
        message: "Trigger: failed to render template (skipping)",
        templatename: action.template,
        set: ctx.set.name,
        entry: ctx.entry.id,
        reason,
        stack: error instanceof Error ? error.stack : undefined,
      });
      failed.push({ templatename: action.template, reason });
      continue;
    }
    try {
      const templateRecord = await getTemplateByName(ctx.userId, action.template);
      const image = await createImage(
        ctx.userId,
        templateRecord?.id ?? null,
        imagename,
        {
          template: action.template,
          entryId: ctx.entry.id,
          setId: ctx.set.id,
        },
      );
      if (!image) continue;
      // createImage does not accept entryId directly; link after creation so
      // getImagesByEntryId* queries can find the image.
      await linkImageToEntry(image.id, ctx.entry.id);
      rendered.push({ name: imagename, template: action.template });
    } catch (error) {
      // Clean up the orphan blob we just wrote: the DB row never landed.
      try {
        await deleteGeneratedImage(imagename);
      } catch (cleanupError) {
        const cleanupReason = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        logger.warn({
          message: "Failed to clean up orphan image after DB failure",
          imagename,
          reason: cleanupReason,
          stack: cleanupError instanceof Error ? cleanupError.stack : undefined,
        });
      }
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({
        message: "Trigger: failed to record image in DB (cleaned up blob)",
        templatename: action.template,
        set: ctx.set.name,
        entry: ctx.entry.id,
        reason,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
  return { rendered, failed };
}

export type SetTriggerEvent = "add" | "modify" | "remove";

/**
 * Generic trigger dispatcher. Reads the trigger config from the set, chooses
 * the right list of templates for the event, then performs the linked
 * side-effect: render, re-render, or delete.
 *
 * If a workflow canvas exists for this set, it uses the new execution engine
 * instead of the legacy trigger system.
 */
export async function fireTriggers(
  event: SetTriggerEvent,
  ctx: TriggerContext,
): Promise<TriggerResult> {
  // Check if a workflow canvas exists for this set
  const workflowNodes = await getWorkflowNodes(ctx.set.id);
  if (workflowNodes.length > 0) {
    // Use the new workflow execution engine
    const result = await fireWorkflow({
      userId: ctx.userId,
      set: ctx.set,
      entry: ctx.entry,
      event,
    });

    // Map workflow results to the legacy TriggerResult format
    const rendered = result.nodeResults
      .filter((r) => r.type === "template" && r.status === "success")
      .map((r) => {
        const resp = r.response as { imageName: string } | undefined;
        return {
          name: resp?.imageName ?? "unknown",
          template: (r.payload as { templateName: string })?.templateName ?? "unknown",
        };
      });

    const failed = result.nodeResults
      .filter((r) => r.type === "template" && r.status === "failed")
      .map((r) => ({
        templatename: (r.payload as { templateName: string })?.templateName ?? "unknown",
        reason: r.error ?? "Unknown error",
      }));

    return {
      rendered,
      deleted: [],
      failed,
      missing: [],
      hookFailures: result.hookFailures,
    };
  }

  // Legacy trigger system (no workflow canvas)
  if (event === "remove") {
    // On entry deletion we drop every linked image automatically; there is
    // no user-facing remove trigger anymore.
    const linked = await getImagesByEntryId(ctx.entry.id);
    const deleted = linked.map((img) => img.name);
    await deleteImagesRowAndBlob(linked);
    await deleteSetImageDirectory(ctx.set.id, ctx.entry.id);
    return { rendered: [], deleted, failed: [], missing: [], hookFailures: [] };
  }

  const triggers: SetTriggers = decodeSetTriggers(ctx.set);
  const { valid: actions, missing } = await resolveTemplates(
    ctx.userId,
    triggers[event] ?? [],
  );

  if (actions.length === 0) {
    return { rendered: [], deleted: [], failed: [], missing, hookFailures: [] };
  }

  let hookFailures: HookFailure[] = [];
  if (event === "add") {
    const { rendered, failed } = await renderTemplates(ctx, actions);
    hookFailures = await fireHooks(
      { set: ctx.set, entry: { id: ctx.entry.id, data: decodeEntryData(ctx.entry) } },
      "add",
      rendered,
    );
    return { rendered, deleted: [], failed, missing, hookFailures };
  }

  // event === "modify"
  const templateNames = actions.map((a) => a.template);
  const stale = await getImagesByEntryIdAndTemplateNames(
    ctx.userId,
    ctx.entry.id,
    templateNames,
  );
  const deleted = stale.map((img) => img.name);
  await deleteImagesRowAndBlob(stale);
  // Re-render exactly the templates that just had their images invalidated -
  // NOT the "add" list. Each event controls its own template set.
  const { rendered, failed } = await renderTemplates(ctx, actions);
  hookFailures = await fireHooks(
    { set: ctx.set, entry: { id: ctx.entry.id, data: decodeEntryData(ctx.entry) } },
    "modify",
    rendered,
  );
  return { rendered, deleted, failed, missing, hookFailures };
}

// defaultTriggersFor is re-exported from @repo/db so the DB layer can
// apply the same default during createSet.

/** Utility: which templates in the set are *not* referenced by any event. */
export function unusedTemplatesForSet(set: Set): string[] {
  const t = decodeSetTemplates(set);
  const tr = decodeSetTriggers(set);
  const used = new Set<string>([
    ...tr.add.map((a) => a.template),
    ...tr.modify.map((a) => a.template),
  ]);
  return t.filter((name) => !used.has(name));
}

/**
 * Delete every generated image and set-image directory owned by a set.
 * Mirrors the per-entry "remove" cleanup for every entry in the set, and also
 * drops orphaned image rows that reference the set via generationData but are
 * not linked to any entry. Call BEFORE deleting the set's entries.
 */
export async function cleanupSetImages(
  set: Set,
): Promise<{ deleted: string[] }> {
  const deleted: string[] = [];
  const entries = await getEntriesBySetId(set.id);
  for (const entry of entries) {
    const linked = await getImagesByEntryId(entry.id);
    deleted.push(...linked.map((img) => img.name));
    await deleteImagesRowAndBlob(linked);
    await deleteSetImageDirectory(set.id, entry.id);
  }
  const orphans = await getOrphanImagesBySetId(set.userId, set.id);
  deleted.push(...orphans.map((img) => img.name));
  await deleteImagesRowAndBlob(orphans);
  return { deleted };
}
