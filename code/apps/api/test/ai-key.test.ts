process.env.FORMA_DB_PATH = ":memory:";
process.env.AI_ENCRYPTION_KEY = "test-ai-encryption-key-0123456789abcdef";

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { initializeDatabase } from "@repo/db";
import aiRoute from "../src/routes/api/ai";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  (res as any).locals.user = { id: 1 };
  next();
});
app.use("/api/ai", aiRoute);

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];
let nextStatus = 200;

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(() => {
  fetchCalls = [];
  nextStatus = 200;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const reqUrl = String(url);
    fetchCalls.push({
      url: reqUrl,
      headers: ((init as { headers?: Record<string, string> })?.headers ?? {}) as Record<string, string>,
    });
    return {
      ok: nextStatus < 400,
      status: nextStatus,
      json: async () => ({ data: [] }),
    } as Response;
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("POST /api/ai/key validation", () => {
  test("validates the key via the free /v1/models endpoint (not a generation call)", async () => {
    const res = await request(app)
      .post("/api/ai/key")
      .send({ provider: "openai", apiKey: "sk-valid-key" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fetchCalls.length).toBe(1);
    const call = fetchCalls[0]!;
    expect(call.url).toContain("/v1/models");
    expect(call.url).not.toContain("/chat/completions");
    expect(call.headers.Authorization).toBe("Bearer sk-valid-key");

    const statusRes = await request(app).get("/api/ai/key");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.configured).toBe(true);
    expect(statusRes.body.provider).toBe("openai");
  });

  test("rejects the key when /v1/models returns 401", async () => {
    nextStatus = 401;
    const res = await request(app)
      .post("/api/ai/key")
      .send({ provider: "openai", apiKey: "sk-invalid-key" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid API key");
  });

  test("rejects unsupported providers before making any network call", async () => {
    const res = await request(app)
      .post("/api/ai/key")
      .send({ provider: "anthropic", apiKey: "sk-anthropic" });

    expect(res.status).toBe(400);
    expect(fetchCalls.length).toBe(0);
  });
});