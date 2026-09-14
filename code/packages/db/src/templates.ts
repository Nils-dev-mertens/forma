import { db } from "./client.ts";
import { templates, type NewTemplate, type Template } from "./schema.ts";
import { and, eq, inArray } from "drizzle-orm";

// Create a new template for a user
export async function createTemplate(userId: number, name: string, content: string): Promise<Template | null> {
  const newTemplate: NewTemplate = {
    userId,
    name,
    content,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.insert(templates).values(newTemplate).returning();
  return result[0] || null;
}

// Get a template by name for any of the given team member user ids
// (team-aware): a team is a shared, editable workspace with no permission
// tiers - any team member can read/edit any asset a teammate owns.
export async function getTemplateByNameForUserIds(
  userIds: number[],
  name: string,
): Promise<Template | null> {
  if (userIds.length === 0) return null;
  const result = await db
    .select()
    .from(templates)
    .where(and(inArray(templates.userId, userIds), eq(templates.name, name)))
    .limit(1);
  return result[0] || null;
}

// Get all templates for a single user
export async function getTemplatesByUserId(userId: number): Promise<Template[]> {
  return await db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(templates.createdAt);
}

// Get all templates for any of the given team member user ids (team-aware)
export async function getTemplatesByUserIds(userIds: number[]): Promise<Template[]> {
  if (userIds.length === 0) return [];
  return await db
    .select()
    .from(templates)
    .where(inArray(templates.userId, userIds))
    .orderBy(templates.createdAt);
}

// Update a template
export async function updateTemplate(id: number, content: string): Promise<Template | null> {
  const result = await db
    .update(templates)
    .set({ content, updatedAt: new Date() })
    .where(eq(templates.id, id))
    .returning();
  
  return result[0] || null;
}

// Delete a template
export async function deleteTemplate(id: number): Promise<boolean> {
  await db.delete(templates).where(eq(templates.id, id));
  return true;
}
