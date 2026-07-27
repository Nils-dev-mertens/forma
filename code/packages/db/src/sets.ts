import { db } from "./client.ts";
import { sets, type NewSet, type Set } from "./schema.ts";
import { and, eq } from "drizzle-orm";

/**
 * Supported field types for set entries. Strings flow in / out via JSON, so
 * the kinds here are only enforced at UI / form-generation time; the database
 * itself stores entries as opaque JSON.
 */
export const SUPPORTED_FIELD_TYPES = ["string", "number", "boolean", "image"] as const;
export type SetFieldType = (typeof SUPPORTED_FIELD_TYPES)[number];

/** A single declared field on a set. */
export interface SetField {
  fieldname: string;
  /** "string" | "number" | "boolean" */
  type: SetFieldType | string;
  /** When true, entries must include this field. */
  required?: boolean;
}

/** Set -> templates: which template names are attached to it. */
export type SetTemplateNames = string[];

/**
 * Trigger config.
 * For each event the array lists the template names that participate in the
 * action. add: render each template, link output to the entry.
 * modify: delete previous outputs from these templates and re-render them.
 * remove: delete outputs that came from these templates.
 */
export interface SetTriggers {
  add: string[];
  modify: string[];
  remove: string[];
}

/** Dimensions for a single template output. */
export interface SetDimension {
  width: number;
  height: number;
}

/** Per-template output dimensions keyed by template name. */
export type SetDimensions = Record<string, SetDimension>;

/** Helper that produces an empty/default trigger config. */
export function emptyTriggers(): SetTriggers {
  return { add: [], modify: [], remove: [] };
}

/**
 * Default triggers: render every attached template on add, modify and remove.
 */
export function defaultTriggersFor(templates: string[]): SetTriggers {
  return { add: [...templates], modify: [...templates], remove: [...templates] };
}

interface CreateSetInput {
  userId: number;
  name: string;
  description?: string | null;
  fields: SetField[];
  templates: SetTemplateNames;
  triggers?: SetTriggers;
  dimensions?: SetDimensions;
}

interface UpdateSetInput {
  description?: string | null;
  fields?: SetField[];
  templates?: SetTemplateNames;
  triggers?: SetTriggers;
  dimensions?: SetDimensions;
}

function serialize(input: CreateSetInput | UpdateSetInput) {
  return {
    description: "description" in input ? input.description ?? null : undefined,
    fields: "fields" in input && input.fields ? JSON.stringify(input.fields) : undefined,
    templates: "templates" in input && input.templates ? JSON.stringify(input.templates) : undefined,
    triggers:
      "triggers" in input && input.triggers
        ? JSON.stringify(input.triggers)
        : undefined,
    dimensions:
      "dimensions" in input && input.dimensions
        ? JSON.stringify(input.dimensions)
        : undefined,
  };
}

/**
 * Create a new set. The caller is responsible for validating
 * that input.templates has at least one entry and that all template names exist
 * for the user. This function will throw on a (user_id, name) collision.
 */
export async function createSet(input: CreateSetInput): Promise<Set | null> {
  const existing = await db
    .select()
    .from(sets)
    .where(and(eq(sets.userId, input.userId), eq(sets.name, input.name)))
    .limit(1);
  if (existing.length > 0) return null;

  const partial = serialize(input);
  if (!partial.fields || !partial.templates) {
    throw new Error("createSet requires fields and templates");
  }
  const triggers = partial.triggers ?? JSON.stringify(defaultTriggersFor(input.templates));

  const row: NewSet = {
    userId: input.userId,
    name: input.name,
    description: partial.description ?? null,
    fields: partial.fields,
    templates: partial.templates,
    triggers,
    dimensions: partial.dimensions ?? JSON.stringify({}),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.insert(sets).values(row).returning();
  return result[0] ?? null;
}

export async function getSetById(id: number): Promise<Set | null> {
  const result = await db.select().from(sets).where(eq(sets.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getSetByName(
  userId: number,
  name: string,
): Promise<Set | null> {
  const result = await db
    .select()
    .from(sets)
    .where(and(eq(sets.userId, userId), eq(sets.name, name)))
    .limit(1);
  return result[0] ?? null;
}

export async function getSetsByUserId(userId: number): Promise<Set[]> {
  return db
    .select()
    .from(sets)
    .where(eq(sets.userId, userId))
    .orderBy(sets.createdAt);
}

export async function updateSet(
  id: number,
  patch: UpdateSetInput,
): Promise<Set | null> {
  const partial = serialize(patch);
  const result = await db
    .update(sets)
    .set({ ...partial, updatedAt: new Date() })
    .where(eq(sets.id, id))
    .returning();
  return result[0] ?? null;
}

export async function deleteSet(id: number): Promise<boolean> {
  await db.delete(sets).where(eq(sets.id, id));
  return true;
}

// ---------- JSON shape decoders (always return safe defaults) ----------

export function decodeSetFields(set: Set): SetField[] {
  try {
    const parsed = JSON.parse(set.fields);
    return Array.isArray(parsed) ? (parsed as SetField[]) : [];
  } catch {
    return [];
  }
}

export function decodeSetTemplates(set: Set): SetTemplateNames {
  try {
    const parsed = JSON.parse(set.templates);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function decodeSetTriggers(set: Set): SetTriggers {
  const empty = emptyTriggers();
  try {
    const parsed = JSON.parse(set.triggers);
    return {
      add: Array.isArray(parsed.add) ? parsed.add : empty.add,
      modify: Array.isArray(parsed.modify) ? parsed.modify : empty.modify,
      remove: Array.isArray(parsed.remove) ? parsed.remove : empty.remove,
    };
  } catch {
    return empty;
  }
}

export function decodeSetDimensions(set: Set): SetDimensions {
  try {
    const parsed = JSON.parse(set.dimensions);
    if (!parsed || typeof parsed !== "object") return {};
    const out: SetDimensions = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as SetDimension).width === "number" &&
        typeof (value as SetDimension).height === "number"
      ) {
        out[key] = {
          width: (value as SetDimension).width,
          height: (value as SetDimension).height,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Validate per-template dimensions. Returns the first error message or null.
 * Validator rules:
 *  - must be a plain object
 *  - every key must be in `templates`
 *  - every value must be an object with positive integer width/height.
 */
export function validateDimensions(
  dimensions: unknown,
  templates: string[],
): string | null {
  if (dimensions === undefined || dimensions === null) return null;
  if (typeof dimensions !== "object" || Array.isArray(dimensions)) {
    return "dimensions must be an object";
  }
  const dimRecord = dimensions as Record<string, unknown>;
  for (const [template, value] of Object.entries(dimRecord)) {
    if (!templates.includes(template)) {
      return `dimensions key "${template}" is not a template attached to the set`;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return `dimensions for "${template}" must be an object with width and height`;
    }
    const { width, height } = value as Record<string, unknown>;
    if (!Number.isInteger(width) || (width as number) <= 0) {
      return `dimensions width for "${template}" must be a positive integer`;
    }
    if (!Number.isInteger(height) || (height as number) <= 0) {
      return `dimensions height for "${template}" must be a positive integer`;
    }
  }
  return null;
}

/**
 * Validate the field declarations. Returns the first error message or null.
 * Validator rules:
 *  - must be an array
 *  - duplicate fieldnames are not allowed
 *  - every entry must have a non-empty `fieldname` string
 *  - if `type` is set it must be one of SUPPORTED_FIELD_TYPES.
 *    Omitting type is allowed (treated as "string" by consumers).
 */
export function validateFields(fields: unknown): string | null {
  if (!Array.isArray(fields)) return "fields must be an array";
  const seen = new Set<string>();
  for (const f of fields as SetField[]) {
    if (!f || typeof f !== "object") {
      return "every field must be an object";
    }
    if (typeof f.fieldname !== "string" || f.fieldname.trim() === "") {
      return "every field needs a non-empty fieldname";
    }
    if (seen.has(f.fieldname)) {
      return `duplicate fieldname: ${f.fieldname}`;
    }
    seen.add(f.fieldname);
    if (f.type !== undefined) {
      if (typeof f.type !== "string") {
        return `field type must be a string: ${String(f.type)}`;
      }
      if (!SUPPORTED_FIELD_TYPES.includes(f.type as SetFieldType)) {
        return `unsupported field type: ${f.type}`;
      }
    }
  }
  return null;
}
