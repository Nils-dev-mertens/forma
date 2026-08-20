import { db } from "./client.ts";
import { images, templates, type NewImage, type Image } from "./schema.ts";
import { eq, and, inArray } from "drizzle-orm";

// Create a new image record for a user
export async function createImage(userId: number, templateId: number | null, name: string, generationData?: any): Promise<Image | null> {
  const newImage: NewImage = {
    userId,
    templateId,
    name,
    generationData: generationData ? JSON.stringify(generationData) : null,
    createdAt: new Date(),
  };

  const result = await db.insert(images).values(newImage).returning();
  return result[0] || null;
}

// Get an image by name for a specific user
export async function getImageByName(_userId: number, name: string): Promise<Image | null> {
  const result = await db
    .select()
    .from(images)
    .where(eq(images.name, name))
    .limit(1);
  
  return result[0] || null;
}

// Get all images for a user
export async function getImagesByUserId(userId: number): Promise<Image[]> {
  return await db
    .select()
    .from(images)
    .where(eq(images.userId, userId))
    .orderBy(images.createdAt);
}

// Get images by template for a user
export async function getImagesByTemplateId(userId: number, templateId: number): Promise<Image[]> {
  return await db
    .select()
    .from(images)
    .where(and(eq(images.userId, userId), eq(images.templateId, templateId)))
    .orderBy(images.createdAt);
}

// Delete an image
export async function deleteImage(id: number): Promise<boolean> {
  await db.delete(images).where(eq(images.id, id)).run();
  return true;
}

// Link an existing image record to an entry (no-op if entryId is null).
export async function linkImageToEntry(
  id: number,
  entryId: number,
): Promise<boolean> {
  await db.update(images).set({ entryId }).where(eq(images.id, id)).run();
  return true;
}

// Get all images linked to a specific entry.
export async function getImagesByEntryId(entryId: number): Promise<Image[]> {
  return db
    .select()
    .from(images)
    .where(eq(images.entryId, entryId))
    .orderBy(images.createdAt);
}

// Get images that reference a set but are not linked to any entry. These are
// orphans left behind when a render's DB row was created but the entry link
// step failed (or legacy images predate entry linking). Parsing generationData
// in JS keeps this portable instead of relying on SQLite's json_extract.
export async function getOrphanImagesBySetId(
  userId: number,
  setId: number,
): Promise<Image[]> {
  const all = await getImagesByUserId(userId);
  return all.filter((img) => {
    if (img.entryId !== null) return false;
    if (!img.generationData) return false;
    try {
      const data = JSON.parse(img.generationData);
      return (
        data !== null &&
        typeof data === "object" &&
        (data as Record<string, unknown>).setId === setId
      );
    } catch {
      return false;
    }
  });
}

// Get an entry's images filtered to a specific list of template names owned
// by a user. Resolves names -> template ids in one query, then joins by
// images.templateId so we never have to parse generationData JSON.
export async function getImagesByEntryIdAndTemplateNames(
  userId: number,
  entryId: number,
  templateNames: string[],
): Promise<Image[]> {
  if (templateNames.length === 0) return [];
  const templateRows = await db
    .select({ id: templates.id })
    .from(templates)
    .where(
      and(eq(templates.userId, userId), inArray(templates.name, templateNames)),
    );
  const ids = templateRows.map((row) => row.id);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(images)
    .where(and(eq(images.entryId, entryId), inArray(images.templateId, ids)));
}
