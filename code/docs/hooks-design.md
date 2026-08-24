# Hooks: export / send generated images (and templates)

> Split from #19 (closed). #19 covered the set-page UX; this issue covers the
> deferred "hook" idea: after an image is generated for a set entry, send it
> somewhere useful (webhook, email, storage). Per the original ticket this
> "needs to doctor out" — this document is that design pass.

## Goal

When an entry is added or modified, the set already renders its templates into
images (the `add`/`modify` trigger actions). A **hook** is a separate,
independent action that fires *after* rendering and **sends the generated
images to a destination**.

## Where it is configured

- **Per set**, as a `hooks` array stored on the set. Mirror the existing
  `triggers` JSON column: add a `hooks text` column to the `sets` table and
  decode/encode it like `decodeSetTriggers`/`encodeSetTriggers`.
  - Migration: `initializeDatabase()` must `ALTER TABLE sets ADD COLUMN hooks
    text` for existing DBs (lazy, guarded so it is idempotent), plus the column
    in the `CREATE TABLE` for fresh DBs.
- Each hook:
  ```ts
  interface Hook {
    id: string;
    type: "webhook" | "email";
    events: ("add" | "modify")[];   // when it fires
    config: Record<string, unknown>; // destination-specific (secrets encrypted)
  }
  ```
- **Decoupled from render `triggers`**: rendering and exporting are orthogonal.
  A set can render without exporting, or export without custom render
  dimensions.

## Supported destinations (build order)

1. **Phase 1 — Webhook (HTTP POST):** easiest to test, generic. A user provides
   a URL; we POST the generated images' metadata to it.
2. **Phase 2 — Email:** the most valuable per the user. Sends the image
   (attachment or link) via SMTP to a configured address.

## Webhook payload

`POST` to the configured URL with `Content-Type: application/json`:

```json
{
  "event": "add" | "modify",
  "set": { "id": 1, "name": "people set" },
  "entry": { "id": 7, "data": { "headline": "Hi" } },
  "images": [
    {
      "name": "abc123.png",
      "template": "people-banner.html",
      "url": "https://ORIGIN/api/photos/abc123.png"
    }
  ]
}
```

- Use an absolute base URL from `ORIGIN` env.
- Open question: inline base64 for small images vs. URL only. **Recommend URL
  only by default**, with an opt-in `inlineBase64` flag for the hook.

## Secrets handling

- A webhook URL may embed tokens; email needs SMTP credentials. **Store the
  `config` encrypted at rest** (reuse `crypto.ts` envelope, same approach as
  AI keys — `encrypt`/`decrypt`). Decrypt only at fire time. GET responses
  return hooks with secrets **masked** (e.g. `****`).
- Validation: reject a hook whose URL is not `http(s)`; reject email configs
  missing host/user.

## Failure handling

- Hook sends are **non-fatal**: rendering still succeeds. Failures are recorded
  in the event result as `hookFailures: { type, reason }[]` (sibling to the
  existing `failed`), logged via `logger`, and surfaced in the dashboard so the
  user sees a red "hook failed" note instead of a silent drop.

## Service + API surface

- New `apps/api/src/services/hooks.ts`:
  - `fireHooks(ctx, event, images)` — looks up the set's hooks, filters by
    `event`, dispatches each.
  - `sendWebhook(url, payload)` — `fetch` POST.
  - `sendEmail(config, images)` — SMTP send (Phase 2).
- Wire into `fireTriggers` (`setTriggers.ts`) **after** `renderTemplates` for
  `add`/`modify`, passing the freshly rendered image names.
- API:
  - `PATCH /api/set/:id` accepts `hooks` (validate shape, encrypt `config`),
    with `validateHooks`.
  - `GET /api/set/:id` and `GET /api/set` include decoded `hooks` (masked).
  - Optional `POST /api/set/:id/hooks/test` for a manual test-send.

## Dashboard UI

- New **"Hooks"** card on the set detail page: list configured hooks, add a
  webhook (URL + events) or email config, remove, and a "Test send" button.
- Show hook failures from the entry/set result.

## Open questions (resolve during Phase 2)

- Email `to`: a set-level address list, or the user's profile email?
- Retries / rate limits for external destinations.
- Storage destination (S3/GCS) as a later phase.

## Next steps

1. Design — this document. ✅
2. Phase 1 (webhook): schema `hooks` column + migration, `hooks.ts` service,
   `PATCH`/`GET` API, dashboard "Hooks" card, tests.
3. Phase 2 (email): SMTP service + UI, reusing the same `Hook` shape.
