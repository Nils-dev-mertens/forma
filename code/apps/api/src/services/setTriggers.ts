import { generateAndStoreImageFromTemplateStrict, type TemplateGenerationInput } from "@repo/generation";
import { deleteGeneratedImage } from "@repo/storage";
import { generateRandomName } from "@repo/auth";
import {
  createImage,
  decodeSetDimensions,
  decodeSetTemplates,
  decodeSetTriggers,
  decodeEntryData,
  defaultTriggersFor,
  deleteImage,
  entryDataToRecords,
  getImagesByEntryIdAndTemplateNames,
  getTemplateByName,
  linkImageToEntry,
  type Entry,
  type Set,
  type Image,
  type SetTriggers,
  type SetDimensions,
} from "@repo/db";
import { logger } from "@repo/logger";

interface TriggerContext {
  userId: number;
  set: Set;
  entry: Entry;
}

interface TriggerFailure {
  templatename: string;
  reason: string;
}

interface TriggerResult {
  rendered: string[];
  deleted: string[];
  /** Per-template render failures with the actual error message. */
  failed: TriggerFailure[];
  /** Templates that were in the trigger config but no longer exist for this user. */
  missing: string[];
}

/** Image generation defaults - keep in sync with template authors' expectations. */
const DEFAULT_RENDER_DIMENSIONS = { width: 1200, height: 800 } as const;

function getRenderDimensions(
  templatename: string,
  dimensions: SetDimensions,
): { width: number; height: number } {
  return {
    width: dimensions[templatename]?.width ?? DEFAULT_RENDER_DIMENSIONS.width,
    height: dimensions[templatename]?.height ?? DEFAULT_RENDER_DIMENSIONS.height,
  };
}

/**
 * Build a TemplateGenerationInput record from an entry's data.
 * Every declared field with a string-coercible value flows through as a record.
 *
 * NOTE: the existing TemplateGenerationInput interface in @repo/generation
 * misspells the width field as `withdpx`. We match that naming here so the
 * generated runtime accepts the object.
 */
function buildGenerationInput(
  templatename: string,
  entry: Entry,
  dimensions: SetDimensions,
): TemplateGenerationInput {
  const { width, height } = getRenderDimensions(templatename, dimensions);
  return {
    templatename,
    withdpx: width,
    heightpx: height,
    data: { records: entryDataToRecords(decodeEntryData(entry)) },
  };
}

/**
 * Resolve the trigger config's template names against actual templates owned by
 * the user. Missing templates are returned so callers can surface a warning
 * instead of silently dropping them.
 */
async function resolveTemplates(
  userId: number,
  names: string[],
): Promise<{ valid: string[]; missing: string[] }> {
  if (names.length === 0) return { valid: [], missing: [] };
  const valid: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const t = await getTemplateByName(userId, name);
    if (t) valid.push(name);
    else missing.push(name);
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
  templates: string[],
): Promise<{ rendered: string[]; failed: TriggerFailure[] }> {
  const rendered: string[] = [];
  const failed: TriggerFailure[] = [];
  const dimensions = decodeSetDimensions(ctx.set);
  for (const templatename of templates) {
    const imagename = generateRandomName({ length: 12, endsWith: ".png" });
    try {
      await generateAndStoreImageFromTemplateStrict(
        buildGenerationInput(templatename, ctx.entry, dimensions),
        imagename,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({
        message: "Trigger: failed to render template (skipping)",
        templatename,
        set: ctx.set.name,
        entry: ctx.entry.id,
        reason,
        stack: error instanceof Error ? error.stack : undefined,
      });
      failed.push({ templatename, reason });
      continue;
    }
    try {
      const templateRecord = await getTemplateByName(ctx.userId, templatename);
      const image = await createImage(
        ctx.userId,
        templateRecord?.id ?? null,
        imagename,
        {
          template: templatename,
          entryId: ctx.entry.id,
          setId: ctx.set.id,
        },
      );
      if (!image) continue;
      // createImage does not accept entryId directly; link after creation so
      // getImagesByEntryId* queries can find the image.
      await linkImageToEntry(image.id, ctx.entry.id);
      rendered.push(imagename);
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
        templatename,
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
 */
export async function fireTriggers(
  event: SetTriggerEvent,
  ctx: TriggerContext,
): Promise<TriggerResult> {
  const triggers: SetTriggers = decodeSetTriggers(ctx.set);
  const { valid: templates, missing } = await resolveTemplates(
    ctx.userId,
    triggers[event] ?? [],
  );

  if (templates.length === 0) {
    return { rendered: [], deleted: [], failed: [], missing };
  }

  if (event === "add") {
    const { rendered, failed } = await renderTemplates(ctx, templates);
    return { rendered, deleted: [], failed, missing };
  }

  if (event === "modify") {
    const stale = await getImagesByEntryIdAndTemplateNames(
      ctx.userId,
      ctx.entry.id,
      templates,
    );
    const deleted = stale.map((img) => img.name);
    await deleteImagesRowAndBlob(stale);
    // Re-render exactly the templates that just had their images invalidated -
    // NOT the "add" list. Each event controls its own template set.
    const { rendered, failed } = await renderTemplates(ctx, templates);
    return { rendered, deleted, failed, missing };
  }

  // remove
  const linked = await getImagesByEntryIdAndTemplateNames(
    ctx.userId,
    ctx.entry.id,
    templates,
  );
  const deleted = linked.map((img) => img.name);
  await deleteImagesRowAndBlob(linked);
  return { rendered: [], deleted, failed: [], missing };
}

// defaultTriggersFor is re-exported from @repo/db so the DB layer can
// apply the same default during createSet.

/** Utility: which templates in the set are *not* referenced by any event. */
export function unusedTemplatesForSet(set: Set): string[] {
  const t = decodeSetTemplates(set);
  const tr = decodeSetTriggers(set);
  const used = new Set<string>([...tr.add, ...tr.modify, ...tr.remove]);
  return t.filter((name) => !used.has(name));
}
