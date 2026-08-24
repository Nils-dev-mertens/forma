import { beforeAll, describe, expect, test, afterEach } from "bun:test";
import express from "express";
import request from "supertest";
import { initializeDatabase, createUser, createTemplate, createSet } from "@repo/db";
import {
  encryptHookForStorage,
  toDisplayHook,
  fireHooks,
  buildWebhookPayload,
  sendWebhook,
  type SetHook,
} from "../src/services/hooks.ts";
import setRoute from "../src/routes/api/set.ts";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  (res as any).locals.user = { id: 1 };
  next();
});
app.use("/api/set", setRoute);

let setUrl: string | null = null;

beforeAll(async () => {
  process.env.FORMA_DB_PATH = ":memory:";
  process.env.AI_ENCRYPTION_KEY =
    process.env.AI_ENCRYPTION_KEY ?? "test-encryption-key-0123456789abcd";
  await initializeDatabase();
  await createUser("hookuser", "hook@example.com", "hash");
  await createTemplate(1, "badge.html", "<div>{{ name }}</div>");
  const created = await createSet({
    userId: 1,
    name: "hookset",
    description: null,
    fields: [],
    templates: ["badge.html"],
  });
  setUrl = `/api/set/${created!.id}`;
});

function makeSet(hooks: SetHook[]): any {
  return {
    id: 1,
    userId: 1,
    name: "s",
    description: null,
    fields: "[]",
    templates: "[]",
    triggers: "{}",
    hooks: JSON.stringify(hooks),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("hooks service", () => {
  test("encrypts + masks webhook config", () => {
    const stored = encryptHookForStorage({
      id: "h1",
      type: "webhook",
      events: ["add"],
      config: { url: "https://example.com/secret/hook?token=abc" },
    });
    // stored config is an opaque encrypted string, not the raw url
    expect(typeof stored.config).toBe("string");
    expect((stored.config as string)).not.toContain("example.com");
    const display = toDisplayHook(stored);
    expect(display.config.url).toBe("https://example.com/****");
    expect(display.configured).toBe(true);
    expect(display.type).toBe("webhook");
  });

  test("rejects non-http webhook url", () => {
    expect(() =>
      encryptHookForStorage({
        id: "x",
        type: "webhook",
        events: ["add"],
        config: { url: "ftp://example.com" },
      }),
    ).toThrow(/http/);
  });

  test("buildWebhookPayload shapes the body", () => {
    const payload = buildWebhookPayload(
      { set: { id: 5, name: "people" } as any, entry: { id: 9, data: { name: "Ada" } } },
      "modify",
      [{ name: "img.png", template: "badge.html" }],
    );
    expect(payload.event).toBe("modify");
    expect((payload as any).set.id).toBe(5);
    expect((payload as any).entry.data.name).toBe("Ada");
    expect((payload as any).images[0].name).toBe("img.png");
    expect((payload as any).images[0].template).toBe("badge.html");
  });

  test("fireHooks posts to webhook and reports no failures", async () => {
    const stored = encryptHookForStorage({
      id: "h1",
      type: "webhook",
      events: ["add"],
      config: { url: "https://example.com/hook" },
    });
    const set = makeSet([stored]);
    let captured: { url: string; body: any } | null = null;
    (globalThis as any).fetch = async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body) };
      return new Response("ok", { status: 200 });
    };
    const failures = await fireHooks(
      { set, entry: { id: 7, data: { name: "Ada" } } },
      "add",
      [{ name: "img.png", template: "badge.html" }],
    );
    expect(failures).toHaveLength(0);
    expect(captured?.url).toBe("https://example.com/hook");
    expect(captured?.body.images[0].url).toContain("/api/photos/img.png");
  });

  test("fireHooks records failure when webhook errors", async () => {
    const stored = encryptHookForStorage({
      id: "h1",
      type: "webhook",
      events: ["add"],
      config: { url: "https://example.com/hook" },
    });
    (globalThis as any).fetch = async () => new Response("boom", { status: 500 });
    const failures = await fireHooks(
      { set: makeSet([stored]), entry: { id: 7, data: {} } },
      "add",
      [{ name: "img.png", template: "badge.html" }],
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].type).toBe("webhook");
  });

  test("sendWebhook throws on non-2xx", async () => {
    (globalThis as any).fetch = async () => new Response("nope", { status: 500 });
    expect(
      sendWebhook({ url: "https://example.com/x" }, { event: "add" }),
    ).rejects.toThrow(/500/);
  });
});

describe("hooks API", () => {
  afterEach(() => {
    (globalThis as any).fetch = undefined;
  });

  test("PATCH stores hooks, GET returns masked config", async () => {
    const patchRes = await request(app)
      .patch(setUrl!)
      .send({
        hooks: [
          {
            id: "h1",
            type: "webhook",
            events: ["add", "modify"],
            config: { url: "https://example.com/secret/hook" },
          },
        ],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.set.hooks[0].config.url).toBe("https://example.com/****");
    expect(patchRes.body.set.hooks[0].configured).toBe(true);

    const getRes = await request(app).get(setUrl!);
    expect(getRes.status).toBe(200);
    expect(getRes.body.set.hooks[0].config.url).toBe("https://example.com/****");
  });

  test("PATCH rejects an invalid webhook url", async () => {
    const res = await request(app)
      .patch(setUrl!)
      .send({
        hooks: [
          { id: "h2", type: "webhook", events: ["add"], config: { url: "ftp://x" } },
        ],
      });
    expect(res.status).toBe(400);
  });

  test("test-send endpoint reports delivered / error", async () => {
    (globalThis as any).fetch = async () =>
      new Response("ok", { status: 200 });
    const ok = await request(app)
      .post(`${setUrl}/hooks/test`)
      .send({ hook: { id: "h", type: "webhook", events: ["add"], config: { url: "https://example.com/hook" } } });
    expect(ok.status).toBe(200);
    expect(ok.body.delivered).toBe(true);

    (globalThis as any).fetch = async () =>
      new Response("bad", { status: 500 });
    const bad = await request(app)
      .post(`${setUrl}/hooks/test`)
      .send({ hook: { id: "h", type: "webhook", events: ["add"], config: { url: "https://example.com/hook" } } });
    expect(bad.status).toBe(200);
    expect(bad.body.delivered).toBe(false);
    expect(typeof bad.body.error).toBe("string");
  });

  test("PATCH preserves existing config when hook sent without config", async () => {
    // First add a real hook with a config.
    const add = await request(app)
      .patch(setUrl!)
      .send({
        hooks: [
          { id: "keep", type: "webhook", events: ["add"], config: { url: "https://example.com/real" } },
        ],
      });
    expect(add.status).toBe(200);
    expect(add.body.set.hooks[0].config.url).toBe("https://example.com/****");

    // Round-trip the same hook WITHOUT a config (simulating the dashboard
    // re-submitting the GET-masked form). It must be preserved, not clobbered.
    const roundTrip = await request(app)
      .patch(setUrl!)
      .send({
        hooks: [{ id: "keep", type: "webhook", events: ["add"], config: {} }],
      });
    expect(roundTrip.status).toBe(200);
    expect(roundTrip.body.set.hooks).toHaveLength(1);
    expect(roundTrip.body.set.hooks[0].configured).toBe(true);

    // Dropping the hook from the array removes it.
    const remove = await request(app).patch(setUrl!).send({ hooks: [] });
    expect(remove.status).toBe(200);
    expect(remove.body.set.hooks).toHaveLength(0);
  });
});
