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

  test("rejects dimensions for templates not attached to the set", async () => {
    const res = await request(app)
      .post("/api/set")
      .send({
        name: `bad-dim-set-${Date.now()}`,
        fields: [
          { fieldname: "name", type: "string" },
          { fieldname: "title", type: "string" },
        ],
        templates: [templateName],
        dimensions: {
          "other.html": { width: 400, height: 300 },
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('dimensions key');
  });

  test("accepts image field type and per-template dimensions", async () => {
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
        dimensions: {
          [templateName]: { width: 800, height: 600 },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.set.dimensions[templateName]).toEqual({ width: 800, height: 600 });
    const imageField = res.body.set.fields.find((f: any) => f.fieldname === "profilephoto");
    expect(imageField.type).toBe("image");
  });
});
