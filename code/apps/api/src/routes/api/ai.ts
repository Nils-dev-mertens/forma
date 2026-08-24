import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  upsertAiKey,
  getAiKeyByUserId,
  createAiSession,
  getAiSessionById,
  getAiMessagesBySessionId,
  addAiMessage,
  updateAiSessionUpdatedAt,
  updateAiSessionModel,
  createAiLog,
  getAiTokenUsageByUserSince,
  getTemplateByName,
  createTemplate,
} from "@repo/db";
import { logger } from "@repo/logger";
import { encrypt } from "../../utils/crypto.ts";
import { generateFromProvider, validateRawAiKey, type AiMessage, isSupportedProvider, isSupportedModel } from "../../services/ai/provider.ts";
import { loadSystemPrompt } from "../../services/ai/prompts.ts";
import { getTemplate, saveTemplate } from "@repo/storage";
import { requireUserId } from "../../utils/auth.ts";
import { validateHtml } from "../../utils/html-validation.ts";
import { aiDefaultModel, aiDailyTokenLimit, nodeEnv } from "../../config.ts";

const router: Router = Router();

const AI_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractHtmlBlock(text: string): string {
  const match = text.match(/```html\s*([\s\S]*?)\s*```/);
  if (!match || match[1] === undefined) return text.trim();
  return match[1].trim();
}

interface ParsedAiResponse {
  text: string;
  html: string;
}

function findJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString: string | null = null;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") {
        i++;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === "{") {
      depth++;
      continue;
    }
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseAiResponse(text: string): ParsedAiResponse {
  const jsonText = findJsonObject(text);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed.text === "string" && typeof parsed.html === "string") {
        const html = parsed.html.trim();
        return {
          text: parsed.text.trim(),
          html: html.startsWith("```") ? extractHtmlBlock(html) : html,
        };
      }
    } catch {
      // Fall back to legacy parsing below.
    }
  }
  return {
    text: "",
    html: extractHtmlBlock(text),
  };
}

function isSafeTemplateName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+\.html$/.test(name);
}

// Production-only rate limiting for the expensive/mutable AI endpoints. Key
// setup and read-only session endpoints are left unlimited so users can still
// configure keys and browse history.
const isDevOrTest = () => {
  const env = nodeEnv;
  return env === "development" || env === "test";
};

const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevOrTest(),
  keyGenerator: (req, res) => {
    const user = (res as any).locals?.user;
    if (user?.id) return String(user.id);
    return ipKeyGenerator(req.ip ?? "unknown");
  },
  handler: (req, res) => {
    logger.warn({
      message: "AI rate limit exceeded",
      path: req.path,
      ip: req.ip,
    });
    res.status(429).json({ error: "Too many AI requests, please try again later." });
  },
});

// Apply the limiter to the routes that cost money or mutate state.
router.use(["/session/:sessionId/message", "/save-template", "/validate-html"], aiRateLimiter);

/**
 * @openapi
 * /api/ai/key:
 *   post:
 *     summary: Store or update the user's AI provider API key
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, apiKey]
 *             properties:
 *               provider: { type: string, example: "openai" }
 *               apiKey: { type: string, example: "sk-..." }
 *     responses:
 *       200: { description: Key stored }
 *       400: { description: Invalid input }
 *       401: { description: Unauthorized }
 */
router.post("/key", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = isRecord(req.body) ? req.body : {};
    if (!isNonEmptyString(body.provider) || !isNonEmptyString(body.apiKey)) {
      return res.status(400).json({ error: "provider and apiKey are required" });
    }

    const { provider, apiKey } = body;
    if (!isSupportedProvider(provider)) {
      return res.status(400).json({ error: "Unsupported AI provider" });
    }

    // Verify the key with the provider before storing it. This avoids keeping
    // invalid keys in the database.
    try {
      await validateRawAiKey(provider, apiKey);
    } catch (validationError) {
      logger.warn({
        message: "AI key validation failed",
        userId,
        provider,
        error: validationError instanceof Error ? validationError.message : String(validationError),
      });
      return res.status(400).json({
        error: "Invalid API key or provider rejected the test call",
      });
    }

    const encryptedKey = encrypt(apiKey);
    const record = await upsertAiKey(userId, provider, encryptedKey);
    return res.json({ success: true, provider: record.provider });
  } catch (error) {
    logger.error({ message: "Failed to store AI key", error: error as Error });
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to store AI key",
    });
  }
});

/**
 * @openapi
 * /api/ai/key:
 *   get:
 *     summary: Check whether the user has a stored AI provider key
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200: { description: Key status }
 *       401: { description: Unauthorized }
 */
router.get("/key", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const record = await getAiKeyByUserId(userId);
    return res.json({ success: true, configured: !!record, provider: record?.provider });
  } catch (error) {
    logger.error({ message: "Failed to get AI key", error: error as Error });
    return res.status(500).json({ error: "Failed to get AI key" });
  }
});

/**
 * @openapi
 * /api/ai/session:
 *   post:
 *     summary: Create a new AI chat session
 *     tags: [AI]
 *     security:
 *       - apiKey: []
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               contextTemplateName: { type: string, example: "badge.html" }
     *               model: { type: string, example: "gpt-4o" }
     *     responses:
     *       201: { description: Session created }
     *       401: { description: Unauthorized }
     */
router.post("/session", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = isRecord(req.body) ? req.body : {};
    let contextTemplateName: string | undefined;
    if (isNonEmptyString(body.contextTemplateName)) {
      const template = await getTemplateByName(userId, body.contextTemplateName);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      contextTemplateName = body.contextTemplateName;
    }

    const model = isNonEmptyString(body.model) ? body.model : null;

    const session = await createAiSession(userId, contextTemplateName, model);
    return res.status(201).json({ success: true, sessionId: session.id, model: session.model });
  } catch (error) {
    logger.error({ message: "Failed to create AI session", error: error as Error });
    return res.status(500).json({ error: "Failed to create AI session" });
  }
});

/**
 * @openapi
 * /api/ai/session/{sessionId}:
 *   patch:
 *     summary: Set the AI model used for a session
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [model]
 *             properties:
 *               model: { type: string, example: "gpt-4o" }
 *     responses:
 *       200: { description: Model updated }
 *       400: { description: Invalid model }
 *       401: { description: Unauthorized }
 *       404: { description: Session not found }
 */
router.patch("/session/:sessionId", async (req, res) => {
  const userId = requireUserId(res);
  const sessionId = Number(req.params.sessionId);
  try {
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getAiSessionById(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: "Session not found" });
    }

    const body = isRecord(req.body) ? req.body : {};
    if (body.model === undefined) {
      return res.status(400).json({ error: "model is required" });
    }

    // Empty model string clears the selection, falling back to AI_DEFAULT_MODEL.
    const requestedModel = isNonEmptyString(body.model) ? body.model : null;
    if (requestedModel === null) {
      await updateAiSessionModel(sessionId, null);
      return res.json({ success: true, model: null });
    }

    const keyRecord = await getAiKeyByUserId(userId);
    const provider = (keyRecord?.provider ?? "openai") as "openai";
    if (!isSupportedModel(provider, requestedModel)) {
      return res.status(400).json({ error: "Unsupported model for this provider" });
    }

    await updateAiSessionModel(sessionId, requestedModel);
    return res.json({ success: true, model: requestedModel });
  } catch (error) {
    logger.error({ message: "Failed to update AI session model", error: error as Error });
    return res.status(500).json({ error: "Failed to update AI session model" });
  }
});

/**
 * @openapi
 * /api/ai/session/{sessionId}/message:
 *   post:
 *     summary: Send a message to an AI session and receive a templated response
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, example: "Make a LinkedIn banner" }
 *     responses:
 *       200: { description: AI response }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       404: { description: Session not found }
 *       429: { description: Daily AI token limit reached }
 */
router.post("/session/:sessionId/message", async (req, res) => {
  const userId = requireUserId(res);
  const sessionId = Number(req.params.sessionId);
  let provider = "openai";
  let system: string | null = null;
  let userPrompt: string | null = null;

  try {
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getAiSessionById(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: "Session not found" });
    }

    const body = isRecord(req.body) ? req.body : {};
    if (!isNonEmptyString(body.text)) {
      return res.status(400).json({ error: "text is required" });
    }

    const keyRecord = await getAiKeyByUserId(userId);
    provider = keyRecord?.provider ?? "openai";

    let existingTemplateContent: string | null = null;
    if (session.contextTemplateName) {
      existingTemplateContent = await getTemplate(session.contextTemplateName);
    }

    system = await loadSystemPrompt("template", userId);
    const history = await getAiMessagesBySessionId(sessionId, { limit: 50 });
    const previousMessages: AiMessage[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    userPrompt = body.text;
    if (existingTemplateContent) {
      userPrompt = `${userPrompt}\n\nExisting template to edit:\n\`\`\`html\n${existingTemplateContent}\n\`\`\``;
    }

    await addAiMessage(sessionId, "user", body.text);

    // Enforce the per-user daily token budget before spending money.
    if (aiDailyTokenLimit > 0) {
      const usedTokens = await getAiTokenUsageByUserSince(
        userId,
        new Date(Date.now() - AI_USAGE_WINDOW_MS),
      );
      if (usedTokens >= aiDailyTokenLimit) {
        return res.status(429).json({
          error: `Daily AI token limit reached (${aiDailyTokenLimit} tokens per 24h).`,
        });
      }
    }

    const generation = await generateFromProvider({
      userId,
      system,
      messages: [...previousMessages, { role: "user", content: userPrompt }],
      model: session.model,
    });

    const parsed = parseAiResponse(generation.text);
    const text = parsed.text || "Generated a template for you.";
    const html = parsed.html;

    await addAiMessage(sessionId, "assistant", text);
    await updateAiSessionUpdatedAt(sessionId);

    try {
      await createAiLog({
        userId,
        sessionId,
        provider,
        model: generation.model,
        system,
        prompt: userPrompt,
        response: generation.text,
        inputTokens: generation.inputTokens,
        outputTokens: generation.outputTokens,
        totalTokens: generation.totalTokens,
        status: "success",
      });
    } catch (logError) {
      logger.warn({ message: "Failed to log AI response", error: logError as Error });
    }

    return res.json({
      success: true,
      response: text,
      html,
    });
  } catch (error) {
    logger.error({ message: "Failed to send AI message", error: error as Error });
    if (userId) {
      try {
        await createAiLog({
          userId,
          sessionId,
          provider,
          model: session.model ?? aiDefaultModel,
          system,
          prompt: userPrompt,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (logError) {
        logger.warn({ message: "Failed to log AI error", error: logError as Error });
      }
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to send AI message",
    });
  }
});

/**
 * @openapi
 * /api/ai/session/{sessionId}:
 *   get:
 *     summary: Get a session and its message history
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Session history }
 *       401: { description: Unauthorized }
 *       404: { description: Session not found }
 */
router.get("/session/:sessionId", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await getAiSessionById(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: "Session not found" });
    }

    const messages = await getAiMessagesBySessionId(sessionId, { limit: 200 });
    return res.json({
      success: true,
      session,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    logger.error({ message: "Failed to get AI session", error: error as Error });
    return res.status(500).json({ error: "Failed to get AI session" });
  }
});

/**
 * @openapi
 * /api/ai/save-template:
 *   post:
 *     summary: Save an AI-generated HTML template
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [html, name]
 *             properties:
 *               html: { type: string }
 *               name: { type: string, example: "linkedin-banner.html" }
 *     responses:
 *       201: { description: Template saved }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 */
router.post("/save-template", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = isRecord(req.body) ? req.body : {};
    if (!isNonEmptyString(body.html) || !isNonEmptyString(body.name)) {
      return res.status(400).json({ error: "html and name are required" });
    }

    const { html, name } = body;
    if (!isSafeTemplateName(name)) {
      return res.status(400).json({
        error: "Invalid template name. Use only alphanumeric characters, '-' or '_', and end with '.html'.",
      });
    }

    const validation = validateHtml(html);
    if (!validation.valid) {
      return res.status(400).json({
        error: "HTML validation failed",
        details: validation.errors,
      });
    }

    const existing = await getTemplateByName(userId, name);
    if (existing) {
      return res.status(409).json({ error: "Template name already exists" });
    }

    await saveTemplate(name, html);
    const template = await createTemplate(userId, name, html);

    return res.status(201).json({
      success: true,
      template,
    });
  } catch (error) {
    logger.error({ message: "Failed to save AI template", error: error as Error });
    return res.status(500).json({ error: "Failed to save AI template" });
  }
});

/**
 * @openapi
 * /api/ai/validate-html:
 *   post:
 *     summary: Validate generated HTML before saving
 *     tags: [AI]
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [html]
 *             properties:
 *               html: { type: string }
 *     responses:
 *       200: { description: Validation result }
 *       400: { description: Invalid input }
 *       401: { description: Unauthorized }
 */
router.post("/validate-html", async (req, res) => {
  try {
    const userId = requireUserId(res);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = isRecord(req.body) ? req.body : {};
    if (!isNonEmptyString(body.html)) {
      return res.status(400).json({ error: "html is required" });
    }

    const result = validateHtml(body.html);
    return res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ message: "Failed to validate HTML", error: error as Error });
    return res.status(500).json({ error: "Failed to validate HTML" });
  }
});

export default router;
