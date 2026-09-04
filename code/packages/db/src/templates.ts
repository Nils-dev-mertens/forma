import { db } from "./client.ts";
import { templates, templateVersions, type NewTemplate, type Template, type TemplateVersion } from "./schema.ts";
import { eq, desc, sql } from "drizzle-orm";

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
  const template = result[0] || null;
  if (template) {
    // Seed version history with the initial content.
    await addTemplateVersion(template.id, 1, content);
  }
  return template;
}

// Get a template by name for a specific user
export async function getTemplateByName(_userId: number, name: string): Promise<Template | null> {
  const result = await db
    .select()
    .from(templates)
    .where(eq(templates.name, name))
    .limit(1);
  
  return result[0] || null;
}

// Get all templates for a user
export async function getTemplatesByUserId(userId: number): Promise<Template[]> {
  return await db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
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

// --- Template version history ---

// Insert a snapshot of template content as a specific version number.
export async function addTemplateVersion(
  templateId: number,
  version: number,
  content: string,
  note?: string,
): Promise<TemplateVersion> {
  const result = await db
    .insert(templateVersions)
    .values({ templateId, version, content, note: note ?? null })
    .returning();
  return result[0]!;
}

// Highest existing version number for a template (0 if none).
export async function getLatestTemplateVersionNumber(templateId: number): Promise<number> {
  const rows = await db
    .select({ max: sql<number>`MAX(${templateVersions.version})` })
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId));
  const max = rows[0]?.max;
  return typeof max === "number" ? max : 0;
}

// List versions for a template, newest first.
export async function getTemplateVersions(templateId: number): Promise<TemplateVersion[]> {
  return await db
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.version));
}

// Fetch a single version by number.
export async function getTemplateVersion(
  templateId: number,
  version: number,
): Promise<TemplateVersion | null> {
  const result = await db
    .select()
    .from(templateVersions)
    .where(
      sql`${templateVersions.templateId} = ${templateId} AND ${templateVersions.version} = ${version}`,
    )
    .limit(1);
  return result[0] || null;
}

// Update template content (no snapshot). Callers should snapshot first via
// `addTemplateVersion` so history is preserved.
export async function updateTemplateContent(id: number, content: string): Promise<Template | null> {
  const result = await db
    .update(templates)
    .set({ content, updatedAt: new Date() })
    .where(eq(templates.id, id))
    .returning();
  return result[0] || null;
}

// Snapshot the template's current content as a new version and return that
// version number (used before an edit or a restore so history is append-only).
export async function snapshotCurrentTemplateVersion(templateId: number, note?: string): Promise<number> {
  const current = await db
    .select({ content: templates.content })
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1);
  if (!current[0]) return 0;
  const nextVersion = (await getLatestTemplateVersionNumber(templateId)) + 1;
  await addTemplateVersion(templateId, nextVersion, current[0].content, note);
  return nextVersion;
}