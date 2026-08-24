process.env.FORMA_DB_PATH = ":memory:";
process.env.AI_ENCRYPTION_KEY = "test-ai-encryption-key-0123456789abcdef";

import { beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import {
  initializeDatabase,
  createAiSession,
  getAiSessionById,
  createAiLog,
  getAiLogsByUserId,
} from "@repo/db";
import aiRoute from "../src/routes/api/ai";
import { isSupportedModel, SUPPORTED_MODELS } from "../src/services/ai/provider";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  (res as any).locals.user = { id: 1 };
  next();
});
app.use("/api/ai", aiRoute);

beforeAll(async () => {
  await initializeDatabase();
});

describe("AI model allowlist", () => {
  test("accepts curated OpenAI models", () => {
    expect(isSupportedModel("openai", "gpt-4o-mini")).toBe(true);
    expect(isSupportedModel("openai", "gpt-4o")).toBe(true);
    expect(isSupportedModel("openai", "o3-mini")).toBe(true);
  });

  test("rejects unknown models", () => {
    expect(isSupportedModel("openai", "claude-3-opus")).toBe(false);
    expect(isSupportedModel("openai", "gpt-99")).toBe(false);
  });

  test("exposes an allowlist per provider", () => {
    expect(SUPPORTED_MODELS.openai.length).toBeGreaterThan(0);
  });
});

describe("per-session model selection", () => {
  test("stores a model on session creation", async () => {
    const res = await request(app)
      .post("/api/ai/session")
      .send({ model: "gpt-4o" });
    expect(res.status).toBe(201);
    expect(res.body.model).toBe("gpt-4o");

    const session = await getAiSessionById(res.body.sessionId);
    expect(session?.model).toBe("gpt-4o");
  });

  test("PATCH rejects an unsupported model", async () => {
    const created = await createAiSession(1, null);
    const res = await request(app)
      .patch(`/api/ai/session/${created.id}`)
      .send({ model: "not-a-real-model" });
    expect(res.status).toBe(400);
  });

  test("PATCH sets and clears a supported model", async () => {
    const created = await createAiSession(1, null);

    const setRes = await request(app)
      .patch(`/api/ai/session/${created.id}`)
      .send({ model: "o3-mini" });
    expect(setRes.status).toBe(200);
    expect(setRes.body.model).toBe("o3-mini");

    const session = await getAiSessionById(created.id);
    expect(session?.model).toBe("o3-mini");

    const clearRes = await request(app)
      .patch(`/api/ai/session/${created.id}`)
      .send({ model: "" });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.model).toBeNull();

    const cleared = await getAiSessionById(created.id);
    expect(cleared?.model).toBeNull();
  });
});

describe("AI logs endpoint", () => {
  test("GET /api/ai/logs returns the user's logs", async () => {
    await createAiLog({
      userId: 1,
      provider: "openai",
      model: "gpt-4o-mini",
      prompt: "hi",
      response: "hello",
      totalTokens: 10,
      status: "success",
    });

    const res = await request(app).get("/api/ai/logs");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs[0].model).toBe("gpt-4o-mini");
  });

  test("logs are scoped to the requesting user", async () => {
    const other = await getAiLogsByUserId(999);
    expect(other).toEqual([]);
  });
});
