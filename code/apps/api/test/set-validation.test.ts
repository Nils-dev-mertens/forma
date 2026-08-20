import { beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { existsSync } from "fs";
import { join } from "path";

process.env.FORMA_DB_PATH = ":memory:";

import {
  initializeDatabase,
  createUser,
  createTemplate,
  createImage,
  linkImageToEntry,
  getImageByName,
  getImagesByEntryId,
} from "@repo/db";
import {
  saveTemplate,
  saveGeneratedImage,
  getGeneratedImage,
  SET_IMAGES_DIR,
} from "@repo/storage";
import setRoute from "../src/routes/api/set";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  (res as any).locals.user = { id: 1 };
  next();
});
app.use("/api/set", setRoute);

describe("Set template field coverage validation", () => {
  const templateName = `coverage-test-${Date.now()}.html`;

  beforeAll(async () => {
    await initializeDatabase();
    const user = await createUser("testuser", "test@example.com", "hash");
    if (!user) throw new Error("Failed to create test user");

    const html = "<h1>{{ name }}</h1><p>{{ title }}</p>";
    await saveTemplate(templateName, html);
    const template = await createTemplate(1, templateName, html);
    if (!template) throw new Error("Failed to create test template");
  });

  test("rejects a set whose fields do not cover every template variable", async () => {
    const res = await request(app)
      .post("/api/set")
      .send({
        name: `bad-set-${Date.now()}`,
        fields: [{ fieldname: "name", type: "string" }],
        templates: [templateName],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Set fields do not cover all template variables");
    expect(res.body.coverageErrors).toEqual([
      { template: templateName, missing: ["title"] },
    ]);
  });

  test("accepts a set whose fields cover every template variable", async () => {
    const res = await request(app)
      .post("/api/set")
      .send({
        name: `good-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string" },
          { fieldname: "title", type: "string" },
        ],
        templates: [templateName],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test("accepts image field type and per-template trigger dimensions", async () => {
    const res = await request(app)
      .post("/api/set")
      .send({
        name: `image-dim-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string", required: true },
          { fieldname: "title", type: "string" },
          { fieldname: "profilephoto", type: "image" },
        ],
        templates: [templateName],
        triggers: {
          add: [{ template: templateName, widthPx: 800, heightPx: 600 }],
          modify: [{ template: templateName, widthPx: 400, heightPx: 300 }],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.set.triggers).toEqual({
      add: [{ template: templateName, widthPx: 800, heightPx: 600 }],
      modify: [{ template: templateName, widthPx: 400, heightPx: 300 }],
    });
    const imageField = res.body.set.fields.find((f: any) => f.fieldname === "profilephoto");
    expect(imageField.type).toBe("image");
  });

  test("rejects trigger actions referencing templates not attached to the set", async () => {
    const res = await request(app)
      .post("/api/set")
      .send({
        name: `bad-triggers-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string" },
          { fieldname: "title", type: "string" },
        ],
        templates: [templateName],
        triggers: {
          add: [{ template: "other.html", widthPx: 800, heightPx: 600 }],
          modify: [],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("trigger references template not attached");
  });
});

describe("Entry image field upload", () => {
  const templateName = `image-upload-test-${Date.now()}.html`;
  const onePixelPng = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082",
    "hex",
  );

  beforeAll(async () => {
    const html = "<h1>{{ name }}</h1><img src=\"{{ profilephoto }}\">";
    await saveTemplate(templateName, html);
    const template = await createTemplate(1, templateName, html);
    if (!template) throw new Error("Failed to create test template");
  });

  test("uploads an image for an entry image field", async () => {
    const setRes = await request(app)
      .post("/api/set")
      .send({
        name: `upload-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string", required: true },
          { fieldname: "profilephoto", type: "image" },
        ],
        templates: [templateName],
        triggers: { add: [], modify: [] },
      });
    expect(setRes.status).toBe(201);
    const setId = setRes.body.set.id;

    const entryRes = await request(app)
      .post(`/api/set/${setId}/entry`)
      .send({ data: { name: "Ada", profilephoto: "" } });
    expect(entryRes.status).toBe(201);
    const entryId = entryRes.body.entry.id;

    const uploadRes = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach("profilephoto", onePixelPng, "profilephoto.png");

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.entry.data.profilephoto).toMatch(/^set-images\//);
  }, 10000);

  test("rejects a file whose dimensions cannot be read", async () => {
    const setRes = await request(app)
      .post("/api/set")
      .send({
        name: `bad-image-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string" },
          { fieldname: "profilephoto", type: "image" },
        ],
        templates: [templateName],
        triggers: { add: [], modify: [] },
      });
    expect(setRes.status).toBe(201);
    const setId = setRes.body.set.id;

    const entryRes = await request(app)
      .post(`/api/set/${setId}/entry`)
      .send({ data: { name: "Ada", profilephoto: "" } });
    expect(entryRes.status).toBe(201);
    const entryId = entryRes.body.entry.id;

    const uploadRes = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach("profilephoto", Buffer.from("fake-image-data"), "profilephoto.png");

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toContain("Unable to read image dimensions");
  }, 10000);
});

describe("SVG and AVIF set image uploads", () => {
  const templateName = `format-upload-test-${Date.now()}.html`;
  const svgBuffer = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24"/></svg>',
  );
  // Minimal AVIF container: ftyp(major brand avif) + meta/iprp/ipco/ispe (1x1).
  const avifBuffer = (() => {
    const buf = Buffer.alloc(72);
    buf.writeUInt32BE(24, 0);
    buf.write("ftyp", 4, "ascii");
    buf.write("avif", 8, "ascii");
    buf.writeUInt32BE(0, 12);
    buf.write("avif", 16, "ascii");
    buf.write("mif1", 20, "ascii");
    buf.writeUInt32BE(48, 24);
    buf.write("meta", 28, "ascii");
    buf.writeUInt32BE(0, 32);
    buf.writeUInt32BE(36, 36);
    buf.write("iprp", 40, "ascii");
    buf.writeUInt32BE(28, 44);
    buf.write("ipco", 48, "ascii");
    buf.writeUInt32BE(20, 52);
    buf.write("ispe", 56, "ascii");
    buf.writeUInt32BE(0, 60);
    buf.writeUInt32BE(1, 64);
    buf.writeUInt32BE(1, 68);
    return buf;
  })();

  beforeAll(async () => {
    const html = "<h1>{{ name }}</h1><img src=\"{{ profilephoto }}\">";
    await saveTemplate(templateName, html);
    const template = await createTemplate(1, templateName, html);
    if (!template) throw new Error("Failed to create test template");
  });

  async function makeSetWithEntry() {
    const setRes = await request(app)
      .post("/api/set")
      .send({
        name: `format-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string", required: true },
          { fieldname: "profilephoto", type: "image" },
        ],
        templates: [templateName],
        triggers: { add: [], modify: [] },
      });
    expect(setRes.status).toBe(201);
    const setId = setRes.body.set.id;
    const entryRes = await request(app)
      .post(`/api/set/${setId}/entry`)
      .send({ data: { name: "Ada", profilephoto: "" } });
    expect(entryRes.status).toBe(201);
    return { setId, entryId: entryRes.body.entry.id };
  }

  test("accepts an SVG upload", async () => {
    const { setId, entryId } = await makeSetWithEntry();
    const res = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach("profilephoto", svgBuffer, "logo.svg");
    expect(res.status).toBe(200);
    expect(res.body.entry.data.profilephoto).toMatch(/^set-images\/.*\.svg$/);
  }, 10000);

  test("accepts an SVG without dimensions (vector, skips dimension checks)", async () => {
    const { setId, entryId } = await makeSetWithEntry();
    const res = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach(
        "profilephoto",
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'),
        "logo.svg",
      );
    expect(res.status).toBe(200);
  }, 10000);

  test("accepts an AVIF upload", async () => {
    const { setId, entryId } = await makeSetWithEntry();
    const res = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach("profilephoto", avifBuffer, "photo.avif");
    expect(res.status).toBe(200);
    expect(res.body.entry.data.profilephoto).toMatch(/^set-images\/.*\.avif$/);
  }, 10000);

  test("rejects unsupported image types", async () => {
    const { setId, entryId } = await makeSetWithEntry();
    const res = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach("profilephoto", Buffer.from("not-an-image"), "photo.bmp");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported image type");
  }, 10000);
});

describe("Set delete cleanup", () => {
  const templateName = `cleanup-test-${Date.now()}.html`;
  const onePixelPng = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082",
    "hex",
  );

  beforeAll(async () => {
    const html = "<h1>{{ name }}</h1><img src=\"{{ profilephoto }}\">";
    await saveTemplate(templateName, html);
    const template = await createTemplate(1, templateName, html);
    if (!template) throw new Error("Failed to create test template");
  });

  test("deletes set-image folders, generated images, and DB rows when the set is deleted", async () => {
    const setRes = await request(app)
      .post("/api/set")
      .send({
        name: `cleanup-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string", required: true },
          { fieldname: "profilephoto", type: "image" },
        ],
        templates: [templateName],
        triggers: { add: [], modify: [] },
      });
    expect(setRes.status).toBe(201);
    const setId = setRes.body.set.id;

    const entryRes = await request(app)
      .post(`/api/set/${setId}/entry`)
      .send({ data: { name: "Ada", profilephoto: "" } });
    expect(entryRes.status).toBe(201);
    const entryId = entryRes.body.entry.id;

    const uploadRes = await request(app)
      .post(`/api/set/${setId}/entry/${entryId}/images`)
      .attach("profilephoto", onePixelPng, "profilephoto.png");
    expect(uploadRes.status).toBe(200);
    const setImageDir = join(SET_IMAGES_DIR, String(setId), String(entryId));
    expect(existsSync(setImageDir)).toBe(true);

    const genName = `cleanup-generated-${Date.now()}.png`;
    await saveGeneratedImage(genName, onePixelPng);
    const image = await createImage(1, null, genName, {
      template: templateName,
      entryId,
      setId,
    });
    expect(image).not.toBeNull();
    await linkImageToEntry(image!.id, entryId);

    const delRes = await request(app).delete(`/api/set/${setId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
    expect(delRes.body.deleted).toContain(genName);

    expect(existsSync(setImageDir)).toBe(false);
    expect(await getGeneratedImage(genName)).toBeNull();
    expect(await getImageByName(1, genName)).toBeNull();
    expect(await getImagesByEntryId(entryId)).toEqual([]);
  }, 10000);

  test("cleans up orphaned images that reference the set but have no entry link", async () => {
    const setRes = await request(app)
      .post("/api/set")
      .send({
        name: `orphan-cleanup-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string" },
          { fieldname: "profilephoto", type: "string" },
        ],
        templates: [templateName],
        triggers: { add: [], modify: [] },
      });
    expect(setRes.status).toBe(201);
    const setId = setRes.body.set.id;

    const genName = `orphan-generated-${Date.now()}.png`;
    await saveGeneratedImage(genName, onePixelPng);
    const image = await createImage(1, null, genName, { template: templateName, setId });
    expect(image).not.toBeNull();

    const delRes = await request(app).delete(`/api/set/${setId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toContain(genName);

    expect(await getGeneratedImage(genName)).toBeNull();
    expect(await getImageByName(1, genName)).toBeNull();
  }, 10000);
});
