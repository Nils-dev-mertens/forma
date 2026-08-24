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
  /** "string" | "number" | "boolean" | "image" */
  type: SetFieldType | string;
  /** When true, entries must include this field. */
  required?: boolean;
}

/** Set -> templates: which template names are attached to it. */
export type SetTemplateNames = string[];

/** A single render action inside a trigger list. */
export interface TriggerAction {
  template: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Trigger config.
 * For each event the array lists the templates to render, together with the
 * desired output dimensions. add: render each template, link output to entry.
 * modify: delete previous outputs from these templates and re-render them.
 * On entry remove, all linked generated images are deleted automatically.
 */
export interface SetTriggers {
  add: TriggerAction[];
  modify: TriggerAction[];
}

/** Default render dimensions. */
export const DEFAULT_RENDER_DIMENSIONS = { widthPx: 1200, heightPx: 800 } as const;

/** Helper that produces an empty/default trigger config. */
export function emptyTriggers(): SetTriggers {
  return { add: [], modify: [] };
}

/**
 * Default triggers: render every attached template on add and modify,
 * using the default dimensions.
 */
export function defaultTriggersFor(templates: string[]): SetTriggers {
  const actions = templates.map((template) => ({
    template,
    widthPx: DEFAULT_RENDER_DIMENSIONS.widthPx,
    heightPx: DEFAULT_RENDER_DIMENSIONS.heightPx,
  }));
  return { add: actions, modify: actions };
}

interface CreateSetInput {
  userId: number;
  name: string;
  description?: string | null;
  fields: SetField[];
  templates: SetTemplateNames;
  triggers?: SetTriggers;
}

interface UpdateSetInput {
  name?: string;
  description?: string | null;
  fields?: SetField[];
  templates?: SetTemplateNames;
  triggers?: SetTriggers;
}

function serialize(input: CreateSetInput | UpdateSetInput) {
  return {
    name: "name" in input && input.name ? input.name : undefined,
    description: "description" in input ? input.description ?? null : undefined,
    fields: "fields" in input && input.fields ? JSON.stringify(input.fields) : undefined,
    templates: "templates" in input && input.templates ? JSON.stringify(input.templates) : undefined,
    triggers:
      "triggers" in input && input.triggers
        ? JSON.stringify(input.triggers)
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseTriggerAction(item: unknown): TriggerAction | null {
  if (typeof item === "string") {
    return {
      template: item,
      widthPx: DEFAULT_RENDER_DIMENSIONS.widthPx,
      heightPx: DEFAULT_RENDER_DIMENSIONS.heightPx,
    };
  }
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.template !== "string") return null;
  return {
    template: obj.template,
    widthPx: isPositiveInteger(obj.widthPx)
      ? obj.widthPx
      : DEFAULT_RENDER_DIMENSIONS.widthPx,
    heightPx: isPositiveInteger(obj.heightPx)
      ? obj.heightPx
      : DEFAULT_RENDER_DIMENSIONS.heightPx,
  };
}

function parseTriggerActions(list: unknown): TriggerAction[] {
  if (!Array.isArray(list)) return [];
  return list.map(parseTriggerAction).filter((a): a is TriggerAction => a !== null);
}

export function decodeSetTriggers(set: Set): SetTriggers {
  const empty = emptyTriggers();
  try {
    const parsed = JSON.parse(set.triggers);
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      add: parseTriggerActions(parsed.add),
      modify: parseTriggerActions(parsed.modify),
    };
  } catch {
    return empty;
  }
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

/**
 * Validate a list of trigger actions against the attached templates.
 * Returns the first error message or null.
 */
function validateTriggerActions(
  actions: unknown,
  attachedTemplates: string[],
  event: string,
): string | null {
  if (!Array.isArray(actions)) return `${event} trigger actions must be an array`;
  const seen = new Set<string>();
  for (const item of actions) {
    if (!item || typeof item !== "object") {
      return `${event}: every trigger action must be an object`;
    }
    const template = (item as any).template;
    if (typeof template !== "string") {
      return `${event}: every trigger action must have a template string`;
    }
    if (!attachedTemplates.includes(template)) {
      return `${event}: trigger references template not attached to set: ${template}`;
    }
    if (seen.has(template)) {
      return `${event}: duplicate trigger for template ${template}`;
    }
    seen.add(template);
    const width = (item as any).widthPx;
    if (!isPositiveInteger(width)) {
      return `${event}: widthPx for template ${template} must be a positive integer`;
    }
    const height = (item as any).heightPx;
    if (!isPositiveInteger(height)) {
      return `${event}: heightPx for template ${template} must be a positive integer`;
    }
  }
  return null;
}

/**
 * Validate the trigger config. Returns the first error message or null.
 * Omitted keys are allowed and treated as empty arrays by callers.
 */
export function validateTriggers(
  triggers: unknown,
  attachedTemplates: string[],
): string | null {
  if (!triggers || typeof triggers !== "object") {
    return "triggers must be an object";
  }
  const obj = triggers as Record<string, unknown>;
  for (const event of ["add", "modify"]) {
    if (!(event in obj)) continue;
    const list = obj[event];
    const error = validateTriggerActions(list, attachedTemplates, event);
    if (error) return error;
  }
  return null;
}
