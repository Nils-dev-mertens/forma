import { decrypt, encrypt } from "../utils/crypto.ts";
import { origin } from "../config.ts";
import { logger } from "@repo/logger";
import { getGeneratedImage } from "@repo/storage";
import { decodeSetHooks, validateHooks, type Set, type SetHook, type HookType } from "@repo/db";

export interface HookImagePayload {
  name: string;
  template: string;
  url: string;
  /** Present only when the hook requested inline base64. */
  dataUrl?: string;
}

export interface WebhookConfig {
  url: string;
  inlineBase64?: boolean;
}

export interface HookFailure {
  type: HookType;
  reason: string;
}

/** A hook as returned to API clients: config decrypted but secrets masked. */
export interface DisplayHook {
  id: string;
  type: HookType;
  events: ("add" | "modify")[];
  config: Record<string, unknown>;
  configured: boolean;
}

interface HookContext {
  set: Set;
  entry: { id: number; data: Record<string, unknown> };
}

/** Mask a webhook URL so only its scheme + host are visible in responses. */
function maskWebhookUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/****`;
  } catch {
    return "****";
  }
}

/**
 * Convert a stored hook into a client-safe display form: the config is
 * decrypted but any sensitive field (webhook url) is masked.
 */
export function toDisplayHook(hook: SetHook): DisplayHook {
  const decrypted = decryptHookConfig(hook.config);
  const config: Record<string, unknown> = {};
  if (decrypted) {
    for (const [key, value] of Object.entries(decrypted)) {
      if (key === "url" && typeof value === "string") {
        config.url = maskWebhookUrl(value);
      } else {
        config[key] = value;
      }
    }
  }
  return {
    id: hook.id,
    type: hook.type,
    events: hook.events,
    config,
    configured: decrypted !== null,
  };
}

/**
 * Validate a single hook's destination config for storage. Enforces the
 * webhook-url scheme rule. Returns an error string or null.
 */
export function validateHookConfigForStorage(hook: SetHook): string | null {
  if (hook.type === "webhook") {
    const config = hook.config as Record<string, unknown> | null;
    if (!config || typeof config.url !== "string") {
      return `hook ${hook.id}: webhook requires a url`;
    }
    if (!/^https?:\/\//i.test(config.url)) {
      return `hook ${hook.id}: webhook url must be http(s)`;
    }
  }
  return null;
}

/**
 * Prepare a client-supplied hook for persistence: validate its destination
 * config and encrypt the config blob. Returns the stored form.
 */
export function encryptHookForStorage(hook: SetHook): SetHook {
  const error = validateHookConfigForStorage(hook);
  if (error) throw new Error(error);
  return { ...hook, config: encryptHookConfig(hook.config) };
}

/**
 * Reconcile an incoming hooks array against the hooks currently stored on the
 * set. This lets clients update hooks without resending secret configs:
 *  - a hook supplied WITH a config is validated and (re)encrypted;
 *  - a hook supplied WITHOUT a config but whose id matches an existing stored
 *    hook keeps its previously encrypted config (so GET-masked configs are not
 *    clobbered on a round-trip);
 *  - any id in `existing` not present in `incoming` is dropped.
 * Throws on validation or missing-config errors.
 */
export function reconcileHooks(incoming: SetHook[], existing: SetHook[] = []): SetHook[] {
  const error = validateHooks(incoming);
  if (error) throw new Error(error);
  const existingById = new Map(existing.map((h) => [h.id, h]));
  return incoming.map((hook) => {
    const hasConfig =
      !!hook.config &&
      typeof hook.config === "object" &&
      Object.keys(hook.config).length > 0;
    if (hasConfig) return encryptHookForStorage(hook);
    const prior = existingById.get(hook.id);
    if (!prior) {
      throw new Error(`hook ${hook.id}: no config provided and not found on the set`);
    }
    return prior;
  });
}

const WEBHOOK_TIMEOUT_MS = 10_000;

function mimeForImage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

/**
 * Encrypt a hook's destination config for storage. The config is JSON-encoded
 * then sealed with the envelope cipher used for AI keys.
 */
export function encryptHookConfig(config: unknown): string {
  return encrypt(JSON.stringify(config ?? {}));
}

/**
 * Recover a hook's destination config from its encrypted storage form. Returns
 * null if the value is missing or cannot be decrypted (e.g. key rotation).
 */
export function decryptHookConfig(encrypted: unknown): Record<string, unknown> | null {
  if (typeof encrypted !== "string" || encrypted.length === 0) return null;
  try {
    return JSON.parse(decrypt(encrypted)) as Record<string, unknown>;
  } catch (error) {
    logger.warn({
      message: "Failed to decrypt hook config",
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Build the JSON payload POSTed to a webhook. Image URLs are absolute, derived
 * from the configured ORIGIN so the destination can fetch them back.
 */
export function buildWebhookPayload(
  ctx: HookContext,
  event: "add" | "modify",
  images: HookImagePayload[],
): Record<string, unknown> {
  return {
    event,
    set: { id: ctx.set.id, name: ctx.set.name },
    entry: { id: ctx.entry.id, data: ctx.entry.data },
    images,
  };
}

/**
 * POST the payload to a webhook destination. Throws on network errors or
 * non-2xx responses so callers can record the failure.
 */
export async function sendWebhook(
  config: WebhookConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`webhook responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchHook(
  hook: SetHook,
  ctx: HookContext,
  event: "add" | "modify",
  images: { name: string; template: string }[],
): Promise<void> {
  if (hook.type === "webhook") {
    const config = decryptHookConfig(hook.config);
    if (!config || typeof config.url !== "string") {
      throw new Error("webhook config is missing a url");
    }
    const url = config.url;
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`webhook url must be http(s): ${url}`);
    }
    const payloadImages: HookImagePayload[] = await Promise.all(
      images.map(async (img) => {
        const item: HookImagePayload = {
          name: img.name,
          template: img.template,
          url: `${origin}/api/photos/${img.name}`,
        };
        if (config.inlineBase64) {
          const buffer = await getGeneratedImage(img.name);
          if (buffer) {
            item.dataUrl = `data:${mimeForImage(img.name)};base64,${buffer.toString("base64")}`;
          }
        }
        return item;
      }),
    );
    await sendWebhook({ url, inlineBase64: config.inlineBase64 === true }, buildWebhookPayload(ctx, event, payloadImages));
    return;
  }
  // email and any future type are handled in later phases; skip gracefully.
  logger.warn({ message: "Hook type not yet supported", type: hook.type, hookId: hook.id });
}

/**
 * Fire every hook attached to the set whose events include `event`. Hook sends
 * are non-fatal: any failure is recorded in the returned list rather than
 * thrown, so rendering still succeeds.
 */
export async function fireHooks(
  ctx: HookContext,
  event: "add" | "modify",
  images: { name: string; template: string }[],
): Promise<HookFailure[]> {
  const hooks = decodeSetHooks(ctx.set).filter((h) => h.events.includes(event));
  if (hooks.length === 0) return [];
  if (images.length === 0) return [];

  const failures: HookFailure[] = [];
  for (const hook of hooks) {
    try {
      await dispatchHook(hook, ctx, event, images);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error({
        message: "Hook failed (non-fatal)",
        type: hook.type,
        hookId: hook.id,
        set: ctx.set.name,
        event,
        reason,
      });
      failures.push({ type: hook.type, reason });
    }
  }
  return failures;
}
