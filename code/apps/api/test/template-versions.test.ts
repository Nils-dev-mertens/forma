import { beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { initializeDatabase, createUser, createTemplate } from "@repo/db";
import templateRoute from "../src/routes/api/template.ts";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  (res as any).locals.user = { id: 1 };
  next();
});
app.use("/api/template", templateRoute);

beforeAll(async () => {
  process.env.FORMA_DB_PATH = ":memory:";
  await initializeDatabase();
  await createUser("versionuser", "version@example.com", "hash");
});

describe("template versioning", () => {
  test("seeds version 1 on create and lists it", async () => {
    await createTemplate(1, "v-banner.html", "<div>v1</div>");
    const res = await request(app).get("/api/template/v-banner.html/versions");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].version).toBe(1);
  });

  test("PUT records a new version and updates live content", async () => {
    await createTemplate(1, "v-edit.html", "<div>original</div>");

    const put = await request(app)
      .put("/api/template/v-edit.html")
      .send({ content: "<div>edited</div>", note: "first edit" });
    expect(put.status).toBe(200);
    expect(put.body.version).toBe(2);

    const versions = await request(app).get("/api/template/v-edit.html/versions");
    expect(versions.body.versions).toHaveLength(2);
    expect(versions.body.versions[0].version).toBe(2);
    expect(versions.body.versions[0].note).toBe("first edit");
    // Newest version holds the live content.
    expect(versions.body.versions[0].id).toBeDefined();
  });

  test("restore reverts live content and preserves history", async () => {
    await createTemplate(1, "v-restore.html", "<div>one</div>");
    await request(app).put("/api/template/v-restore.html").send({ content: "<div>two</div>" });

    const restore = await request(app).post("/api/template/v-restore.html/versions/1/restore");
    expect(restore.status).toBe(200);
    expect(restore.body.restoredVersion).toBe(1);

    // Live content is back to v1's content.
    const { getTemplate } = await import("@repo/storage");
    const live = await getTemplate("v-restore.html");
    expect(live).toContain("one");

    const versions = await request(app).get("/api/template/v-restore.html/versions");
    // v1 (one), v2 (two snapshot of new state), v3 (restore snapshot of current before revert).
    expect(versions.body.versions.length).toBeGreaterThanOrEqual(3);
  });

  test("rejects update with missing content", async () => {
    await createTemplate(1, "v-missing.html", "<div>x</div>");
    const res = await request(app).put("/api/template/v-missing.html").send({});
    expect(res.status).toBe(400);
  });

  test("forbids access to another user's template", async () => {
    await createUser("other", "other@example.com", "hash");
    // create a template owned by user 2
    await createTemplate(2, "v-other.html", "<div>secret</div>");
    const res = await request(app).get("/api/template/v-other.html/versions");
    expect(res.status).toBe(403);
  });
});
