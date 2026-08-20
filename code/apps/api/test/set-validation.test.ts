import { beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";

process.env.FORMA_DB_PATH = ":memory:";

import { initializeDatabase, createUser, createTemplate } from "@repo/db";
import { saveTemplate } from "@repo/storage";
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
