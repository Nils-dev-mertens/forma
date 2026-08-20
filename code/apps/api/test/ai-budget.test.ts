process.env.FORMA_DB_PATH = ":memory:";
process.env.AI_ENCRYPTION_KEY = "test-ai-encryption-key-0123456789abcdef";

import { beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import {
  initializeDatabase,
  createAiSession,
  createAiLog,
  getAiTokenUsageByUserSince,
} from "@repo/db";
import { aiDailyTokenLimit } from "../src/config.ts";
import aiRoute from "../src/routes/api/ai";

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

describe("AI token budget enforcement", () => {
  test("rejects a message when the user is at the daily token limit", async () => {
    const session = await createAiSession(1, null);
    expect(session).not.toBeNull();

    // Seed usage at exactly the limit so the budget check trips before any
    // provider call is made.
    await createAiLog({
      userId: 1,
      sessionId: session!.id,
      provider: "openai",
      model: "gpt-4o-mini",
      prompt: "seed",
      response: "seed",
      totalTokens: aiDailyTokenLimit,
      status: "success",
    });

    const res = await request(app)
      .post(`/api/ai/session/${session!.id}/message`)
      .send({ text: "Make a banner" });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain("Daily AI token limit reached");
  }, 10000);
});

describe("getAiTokenUsageByUserSince", () => {
  test("sums total tokens from successful logs only", async () => {
    const userId = 2;
    await createAiLog({
      userId,
      provider: "openai",
      model: "gpt-4o-mini",
      totalTokens: 100,
      status: "success",
    });
    await createAiLog({
      userId,
      provider: "openai",
      model: "gpt-4o-mini",
      totalTokens: 250,
      status: "success",
    });
    await createAiLog({
      userId,
      provider: "openai",
      model: "gpt-4o-mini",
      totalTokens: 99999,
      status: "error",
    });

    const usage = await getAiTokenUsageByUserSince(
      userId,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    expect(usage).toBe(350);
  });

  test("returns 0 when no logs exist in the window", async () => {
    const usage = await getAiTokenUsageByUserSince(
      999,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    expect(usage).toBe(0);
  });
});