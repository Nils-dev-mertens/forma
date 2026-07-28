/**
 * Tests for the "set" + entry DB layer:
 *   - validateFields, emptyTriggers, decode* helpers (pure, no DB)
 *   - Sets CRUD: createSet / getSetById / ByName / ByUserId / update / delete
 *   - Entries CRUD: createEntry / list / getByIdInSet / update / delete
 *   - entryDataToRecords, checkRequiredFields helpers
 *   - getSetFields: union of declared + observed keys
 *
 * Run with `FORMA_DB_PATH=:memory: bun test test/sets.test.ts` from the
 * packages/db package root.
 * Each run uses a unique runId prefix so reruns cannot collide.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  initializeDatabase,
  createSet,
  getSetById,
  getSetByName,
  getSetsByUserId,
  updateSet,
  deleteSet,
  createTemplate,
  deleteTemplate,
  validateFields,
  emptyTriggers,
  decodeSetFields,
  decodeSetTemplates,
  decodeSetTriggers,
  SUPPORTED_FIELD_TYPES,
  createEntry,
  getEntriesBySetId,
  getEntryById,
  getEntryInSet,
  updateEntry,
  deleteEntry,
  decodeEntryData,
  entryDataToRecords,
  checkRequiredFields,
  getSetFields,
  deleteEntriesBySetId,
} from "../src/index.ts";

// -------- Pure validators and decoders --------

describe("validateFields", () => {
  test("accepts a valid array of fields with supported types", () => {
    expect(
      validateFields([
        { fieldname: "name", type: "string", required: true },
        { fieldname: "age", type: "number" },
        { fieldname: "active", type: "boolean" },
      ]),
    ).toBeNull();
  });

  test("accepts fields without a type (treated as string by consumers)", () => {
    expect(validateFields([{ fieldname: "name" }])).toBeNull();
  });

  test("rejects non-array input", () => {
    expect(validateFields("nope")).toBe("fields must be an array");
    expect(validateFields({ fieldname: "x" })).toBe("fields must be an array");
    expect(validateFields(null)).toBe("fields must be an array");
  });

  test("rejects non-object entries", () => {
    expect(validateFields([null])).toBe("every field must be an object");
    expect(validateFields([42])).toBe("every field must be an object");
  });

  test("rejects empty or missing fieldname", () => {
    expect(validateFields([{ type: "string" }])).toBe(
      "every field needs a non-empty fieldname",
    );
    expect(validateFields([{ fieldname: "   ", type: "string" }])).toBe(
      "every field needs a non-empty fieldname",
    );
  });

  test("rejects duplicate fieldnames", () => {
    expect(
      validateFields([
        { fieldname: "name", type: "string" },
        { fieldname: "name", type: "number" },
      ]),
    ).toBe("duplicate fieldname: name");
  });

  test("rejects unsupported string type values", () => {
    // "datetime" is not in SUPPORTED_FIELD_TYPES; the whole point of declaring
    // a type is that the UI can match it to the right input control.
    expect(
      validateFields([{ fieldname: "when", type: "datetime" }]),
    ).toBe("unsupported field type: datetime");

    // Ensure every supported type is accepted (including image).
    for (const t of SUPPORTED_FIELD_TYPES) {
      expect(validateFields([{ fieldname: t, type: t }])).toBeNull();
    }
  });

  test("accepts image as a supported field type", () => {
    expect(validateFields([{ fieldname: "photo", type: "image" }])).toBeNull();
  });

  test("rejects non-string type values", () => {
    expect(
      validateFields([{ fieldname: "n", type: 42 }]),
    ).toBe("field type must be a string: 42");
  });
});

describe("emptyTriggers", () => {
  test("produces two empty arrays", () => {
    const tr = emptyTriggers();
    expect(tr).toEqual({ add: [], modify: [] });
  });
});

describe("decodeSetFields / Templates / Triggers", () => {
  test("decodeSetFields returns the array or empty", () => {
    const decoded = decodeSetFields({
      fields: JSON.stringify([{ fieldname: "x", type: "string" }]),
    } as any);
    expect(decoded).toEqual([{ fieldname: "x", type: "string" }]);

    const empty = decodeSetFields({ fields: "not-json" } as any);
    expect(empty).toEqual([]);
  });

  test("decodeSetTemplates returns the array or empty", () => {
    expect(decodeSetTemplates({ templates: '["a","b"]' } as any)).toEqual([
      "a",
      "b",
    ]);
    expect(decodeSetTemplates({ templates: "garbage" } as any)).toEqual([]);
  });

  test("decodeSetTriggers returns trigger actions, defaulting to empty", () => {
    const tr = decodeSetTriggers({
      triggers: JSON.stringify({
        add: ["t1"],
        modify: ["t1", "t2"],
      }),
    } as any);
    expect(tr).toEqual({
      add: [{ template: "t1", widthPx: 1200, heightPx: 800 }],
      modify: [
        { template: "t1", widthPx: 1200, heightPx: 800 },
        { template: "t2", widthPx: 1200, heightPx: 800 },
      ],
    });

    const empty = decodeSetTriggers({ triggers: "broken" } as any);
    expect(empty).toEqual({ add: [], modify: [] });

    const partial = decodeSetTriggers({
      triggers: JSON.stringify({ add: ["x"] }),
    } as any);
    expect(partial).toEqual({
      add: [{ template: "x", widthPx: 1200, heightPx: 800 }],
      modify: [],
    });
  });
});

// -------- Entry-side pure helpers --------

describe("entry pure helpers", () => {
  test("decodeEntryData always returns an object", () => {
    expect(decodeEntryData({ data: '{"a":1}' } as any)).toEqual({ a: 1 });
    expect(decodeEntryData({ data: "[]" } as any)).toEqual({});
    expect(decodeEntryData({ data: "not-json" } as any)).toEqual({});
    expect(decodeEntryData({ data: "{}" } as any)).toEqual({});
  });

  test("entryDataToRecords coerces every value to a string", () => {
    expect(
      entryDataToRecords({
        name: "Ada",
        age: 42,
        active: true,
        missing: undefined,
        gone: null,
        list: [1, 2],
      }),
    ).toEqual({
      name: "Ada",
      age: "42",
      active: "true",
      missing: "",
      gone: "",
      list: "[1,2]",
    });
  });

  test("checkRequiredFields flags only missing required fields", () => {
    const declared = [
      { fieldname: "name", type: "string", required: true },
      { fieldname: "age", type: "number", required: true },
      { fieldname: "bio", type: "string" }, // optional
    ];
    expect(
      checkRequiredFields(declared, { name: "Ada", age: 30, bio: "hi" }),
    ).toEqual([]);

    // Missing required -> violation
    expect(checkRequiredFields(declared, { age: 30 })).toEqual([
      { fieldname: "name" },
    ]);

    // Empty string counts as missing
    expect(checkRequiredFields(declared, { name: "", age: 30 })).toEqual([
      { fieldname: "name" },
    ]);

    // Null counts as missing
    expect(checkRequiredFields(declared, { name: null, age: 30 })).toEqual([
      { fieldname: "name" },
    ]);

    // Multiple missing required -> all reported
    expect(checkRequiredFields(declared, {})).toEqual([
      { fieldname: "name" },
      { fieldname: "age" },
    ]);
  });
});

// -------- DB-backed tests --------

const runId = `${process.pid}-${Date.now()}`;
const testUserId = 1; // existing seeded user from init migrations
const set1Name = `test-set-${runId}-1`;
const set2Name = `test-set-${runId}-2`;
const sharedTemplateName = `test-tpl-${runId}.html`;
const secondTemplateName = `test-tpl-${runId}-b.html`;

let set1Id = 0;
let set2Id = 0;

beforeAll(async () => {
  await initializeDatabase();

  // Two real templates so the set can attach >=1, and trigger tests can use
  // both to validate per-template selection.
  await createTemplate(testUserId, sharedTemplateName, "<p>{{ name }}</p>");
  await createTemplate(testUserId, secondTemplateName, "<p>{{ name }} again</p>");
});

afterAll(async () => {
  // Best-effort cleanup. Use the runId prefix so we only touch our own rows,
  // and don't worry if some steps silently fail because earlier tests deleted
  // the rows already.
  if (set1Id) {
    await deleteEntriesBySetId(set1Id);
    await deleteSet(set1Id);
  }
  if (set2Id) {
    await deleteEntriesBySetId(set2Id);
    await deleteSet(set2Id);
  }
  // Templates have a unique name; delete them too.
  await deleteTemplate(sharedTemplateName).catch(() => undefined);
  await deleteTemplate(secondTemplateName).catch(() => undefined);
});

describe("Sets CRUD", () => {
  test("createSet writes all JSON columns and returns the row", async () => {
    const created = await createSet({
      userId: testUserId,
      name: set1Name,
      description: "test set #1",
      fields: [
        { fieldname: "name", type: "string", required: true },
        { fieldname: "age", type: "number" },
      ],
      templates: [sharedTemplateName, secondTemplateName],
      triggers: {
        add: [{ template: sharedTemplateName, widthPx: 1200, heightPx: 800 }],
        modify: [{ template: sharedTemplateName, widthPx: 800, heightPx: 600 }],
      },
    });

    expect(created).not.toBeNull();
    expect(created!.id).toBeGreaterThan(0);
    expect(created!.userId).toBe(testUserId);
    expect(created!.name).toBe(set1Name);
    // Columns are JSON strings; decode them through the same helpers the API uses.
    expect(decodeSetFields(created!)).toEqual([
      { fieldname: "name", type: "string", required: true },
      { fieldname: "age", type: "number" },
    ]);
    expect(decodeSetTemplates(created!)).toEqual([
      sharedTemplateName,
      secondTemplateName,
    ]);
    expect(decodeSetTriggers(created!)).toEqual({
      add: [{ template: sharedTemplateName, widthPx: 1200, heightPx: 800 }],
      modify: [{ template: sharedTemplateName, widthPx: 800, heightPx: 600 }],
    });

    set1Id = created!.id;
  });

  test("createSet returns null on duplicate (userId, name)", async () => {
    const dup = await createSet({
      userId: testUserId,
      name: set1Name,
      fields: [{ fieldname: "x", type: "string" }],
      templates: [sharedTemplateName],
    });
    expect(dup).toBeNull();
  });

  test("getSetById / getSetByName / getSetsByUserId roundtrip", async () => {
    expect((await getSetById(set1Id))?.name).toBe(set1Name);
    expect((await getSetByName(testUserId, set1Name))?.id).toBe(set1Id);
    const all = await getSetsByUserId(testUserId);
    expect(all.find((s) => s.id === set1Id)).toBeDefined();
  });

  test("updateSet merges only the provided fields", async () => {
    const updated = await updateSet(set1Id, { description: "renamed desc" });
    expect(updated?.description).toBe("renamed desc");
    // Untouched fields stay intact.
    expect(decodeSetTemplates(updated!)).toEqual([
      sharedTemplateName,
      secondTemplateName,
    ]);

    // Now patch triggers only.
    const updated2 = await updateSet(set1Id, {
      triggers: {
        add: [{ template: sharedTemplateName, widthPx: 1200, heightPx: 800 }],
        modify: [],
      },
    });
    expect(decodeSetTriggers(updated2!)).toEqual({
      add: [{ template: sharedTemplateName, widthPx: 1200, heightPx: 800 }],
      modify: [],
    });
  });

  test("createSet defaults triggers when omitted", async () => {
    const created = await createSet({
      userId: testUserId,
      name: set2Name,
      fields: [{ fieldname: "x", type: "string" }],
      templates: [sharedTemplateName],
    });
    expect(created).not.toBeNull();
    expect(decodeSetTriggers(created!)).toEqual({
      add: [{ template: sharedTemplateName, widthPx: 1200, heightPx: 800 }],
      modify: [{ template: sharedTemplateName, widthPx: 1200, heightPx: 800 }],
    });
  });
});

describe("Entries CRUD", () => {
  test("createEntry stores data as JSON; decodeEntryData roundtrips", async () => {
    const created = await createEntry({
      setId: set1Id,
      data: { name: "Ada", age: 30 },
    });
    expect(created).not.toBeNull();
    expect(created!.setId).toBe(set1Id);
    // Stored as text JSON.
    expect(typeof created!.data).toBe("string");
    expect(decodeEntryData(created!)).toEqual({ name: "Ada", age: 30 });
  });

  test("getEntriesBySetId returns entries ordered by createdAt", async () => {
    await createEntry({ setId: set1Id, data: { name: "B" } });
    await createEntry({ setId: set1Id, data: { name: "C" } });
    const entries = await getEntriesBySetId(set1Id);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // First entries created earlier -> earlier in the list.
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].createdAt >= entries[i - 1].createdAt).toBe(true);
    }
  });

  test("getEntryInSet scopes by setId and entryId", async () => {
    const created = await createEntry({ setId: set1Id, data: { x: 1 } });
    expect(created).not.toBeNull();
    // Wrong set id -> null
    expect(await getEntryInSet(999999, created!.id)).toBeNull();
    // Right set id -> row
    expect((await getEntryInSet(set1Id, created!.id))?.id).toBe(created!.id);
  });

  test("updateEntry replaces data", async () => {
    const created = await createEntry({ setId: set1Id, data: { v: 1 } });
    const updated = await updateEntry(created!.id, { data: { v: 2 } });
    expect(decodeEntryData(updated!)).toEqual({ v: 2 });
  });

  test("deleteEntry removes the row", async () => {
    const created = await createEntry({ setId: set1Id, data: { v: 3 } });
    await deleteEntry(created!.id);
    expect(await getEntryById(created!.id)).toBeNull();
  });
});

describe("getSetFields", () => {
  test("returns declared fields merged with observed keys, sorted", async () => {
    // Create a brand-new set with one declared + one extra used in data.
    const setXName = `test-set-${runId}-fields`;
    const setX = await createSet({
      userId: testUserId,
      name: setXName,
      fields: [{ fieldname: "name", type: "string", required: true }],
      templates: [sharedTemplateName],
    });
    expect(setX).not.toBeNull();

    await createEntry({ setId: setX!.id, data: { name: "Ada", extra: 1 } });
    await createEntry({ setId: setX!.id, data: { name: "Bo", other: "x" } });

    const out = await getSetFields(setX!.id);
    expect(out.declared).toEqual([
      { fieldname: "name", type: "string", required: true },
    ]);
    expect(out.observed).toEqual(["extra", "name", "other"]);

    // Cleanup
    await deleteEntriesBySetId(setX!.id);
    await deleteSet(setX!.id);
  });
});
