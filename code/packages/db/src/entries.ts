import { db } from "./client.ts";
import { entries, sets, type Entry, type NewEntry } from "./schema.ts";
import { and, eq } from "drizzle-orm";
import type { SetField } from "./sets.ts";
import { decodeSetFields } from "./sets.ts";

/** JSON object stored on each entry. */
export type EntryData = Record<string, unknown>;

interface CreateEntryInput {
  setId: number;
  data: EntryData;
}

interface UpdateEntryInput {
  data: EntryData;
}

function stringify(data: EntryData): string {
  return JSON.stringify(data ?? {});
}

export async function createEntry(input: CreateEntryInput): Promise<Entry | null> {
  const row: NewEntry = {
    setId: input.setId,
    data: stringify(input.data),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.insert(entries).values(row).returning();
  return result[0] ?? null;
}

export async function getEntryById(id: number): Promise<Entry | null> {
  const result = await db.select().from(entries).where(eq(entries.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getEntriesBySetId(setId: number): Promise<Entry[]> {
  return db
    .select()
    .from(entries)
    .where(eq(entries.setId, setId))
    .orderBy(entries.createdAt);
}

export async function updateEntry(
  id: number,
  patch: UpdateEntryInput,
): Promise<Entry | null> {
  const result = await db
    .update(entries)
    .set({ data: stringify(patch.data), updatedAt: new Date() })
    .where(eq(entries.id, id))
    .returning();
  return result[0] ?? null;
}

export async function deleteEntry(id: number): Promise<boolean> {
  await db.delete(entries).where(eq(entries.id, id));
  return true;
}

export async function deleteEntriesBySetId(setId: number): Promise<number> {
  const result = await db.delete(entries).where(eq(entries.setId, setId)).run();
  // @ts-ignore - changes property exists on the result
  return ((result as any).changes as number) ?? 0;
}

/** Decode the entry's data column into a JS object (always an object). */
export function decodeEntryData(entry: Entry): EntryData {
  try {
    const parsed = JSON.parse(entry.data);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as EntryData)
      : {};
  } catch {
    return {};
  }
}

/**
 * Build a flat dict suitable for template substitution: every key of the
 * entry's data is coerced to a string. Null / undefined become "".
 */
export function entryDataToRecords(data: EntryData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === null || value === undefined) {
      out[key] = "";
    } else if (typeof value === "string") {
      out[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
    } else {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

export interface RequiredFieldViolation {
  fieldname: string;
}

/**
 * Check that every field flagged as required is present in the entry data.
 * Missing OR empty string counts as a violation.
 */
export function checkRequiredFields(
  declared: SetField[],
  data: EntryData,
): RequiredFieldViolation[] {
  const missing: RequiredFieldViolation[] = [];
  for (const field of declared) {
    if (!field.required) continue;
    const value = data?.[field.fieldname];
    if (value === undefined || value === null || value === "") {
      missing.push({ fieldname: field.fieldname });
    }
  }
  return missing;
}

/**
 * getFields helper for the API.
 * Returns:
 *   - declared: the set's declared field schema (authoritative for forms)
 *   - observed: union of keys seen on actual entries (helps detect drift)
 */
export async function getSetFields(setId: number): Promise<{
  declared: SetField[];
  observed: string[];
}> {
  const set = await db.select().from(sets).where(eq(sets.id, setId)).limit(1);
  const declared = set[0] ? decodeSetFields(set[0]) : [];
  const setEntries = await getEntriesBySetId(setId);
  const observed = new Set<string>(declared.map((f) => f.fieldname));
  for (const entry of setEntries) {
    const data = decodeEntryData(entry);
    for (const key of Object.keys(data)) observed.add(key);
  }
  return { declared, observed: Array.from(observed).sort() };
}

/**
 * Returns the entry only if it belongs to the given set (and user, via set).
 * Convenience for API ownership checks.
 */
export async function getEntryInSet(
  setId: number,
  entryId: number,
): Promise<Entry | null> {
  const result = await db
    .select()
    .from(entries)
    .where(and(eq(entries.setId, setId), eq(entries.id, entryId)))
    .limit(1);
  return result[0] ?? null;
}
