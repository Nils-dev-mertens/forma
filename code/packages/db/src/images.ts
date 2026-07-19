import { db } from "./client.ts";
import { images, type NewImage, type Image } from "./schema.ts";
import { eq, and } from "drizzle-orm";

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
export async function getImageByName(userId: number, name: string): Promise<Image | null> {
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
  await db.delete(images).where(eq(images.id, id));
  return true;
}