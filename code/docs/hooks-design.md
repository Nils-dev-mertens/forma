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
   `PATCH`/`GET` API, dashboard "Hooks" card, tests. ✅ Implemented 2026-08-25.
3. Phase 2 (email): SMTP service + UI, reusing the same `Hook` shape.

## Phase 1 implementation notes (2026-08-25)

- **Storage**: `sets.hooks` is a `text` column (raw SQL + drizzle schema +
  idempotent `ALTER TABLE` migration in `packages/db/src/client.ts`). Decoded
  via `decodeSetHooks` (mirrors `decodeSetTriggers`).
- **Encryption**: each hook's `config` is encrypted at rest with the same
  envelope cipher as AI keys (`apps/api/src/utils/crypto.ts`). The API layer
  encrypts on write (`encryptHookForStorage` / `reconcileHooks`) and decrypts
  on read (`toDisplayHook` masks secrets, currently the webhook URL →
  `https://host/****`).
- **Round-trip without secrets**: `PATCH /api/set/:id` accepts a full hooks
  array. A hook supplied *without* a `config` but whose `id` matches an existing
  stored hook keeps its previously-encrypted config (`reconcileHooks`), so the
  dashboard can re-submit the GET-masked form without clobbering secrets.
  Supplying a `config` (re)encrypts; ids absent from the incoming array are
  dropped.
- **Firing**: `fireHooks` (new `apps/api/src/services/hooks.ts`) runs after
  rendering in `fireTriggers` for `add`/`modify`, filtered by event. Webhook
  payload shape matches the design; image URLs use `ORIGIN` + `/api/photos/`.
  `inlineBase64` opt-in reads the blob via `@repo/storage`. Failures are
  non-fatal and returned as `hookFailures` on the trigger result; surfaced in
  the dashboard as a yellow warning after add/edit.
- **Test-send**: `POST /api/set/:id/hooks/test` validates a hook config and
  fires one webhook with a sample payload built from the set's latest entry;
  returns `{ delivered, error? }`.
- **Validation**: `validateHooks` (array shape, type, events) + per-type
  `validateHookConfigForStorage` (webhook URL must be http(s)).
- **Dashboard**: `Sets.$setId` adds an "Export hooks" card (list / remove /
  add webhook with event toggles / test send) plus per-entry hook-failure
  warning. Types in `apps/dashboard/src/lib/api/sets.ts`.
- **Tests**: `apps/api/test/hooks.test.ts` covers encrypt/mask, fireHooks
  success+failure, sendWebhook error, PATCH/GET masking, reconciliation, and
  test-send.

## Open questions (resolve during Phase 2)

- Email `to`: a set-level address list, or the user's profile email?
- Retries / rate limits for external destinations.
- Storage destination (S3/GCS) as a later phase.

---

## Future: visual node canvas (design only — not yet built)

> Captured 2026-08-25 as a north-star idea. The user wants a drag-to-connect
> canvas on the set page replacing the current typed trigger/hook JSON with a
> graph. Written up here so it can become a ticket later; no code yet.

### Why it makes sense

The current model is two JSON lists on a set:

- `triggers` (`SetTriggers`): `add` / `modify` event → templates to render.
- `hooks` (`SetHook[]`): `add` / `modify` event → destinations to send to.

A canvas is the *same graph drawn instead of typed*, with one new capability:
drawing an edge **from a template node to a hook node** ("this hook fires after
this specific template rendered") — which the current "hook fires after all
rendering of the event" model cannot express.

### Graph shape

- **Source (event) nodes**: "add entry", "edit entry" (the existing
  `add` / `modify` events; `remove` stays auto-cleanup, not a canvas node).
- **Action nodes**:
  - *Render template* — one per attached template (today a `TriggerAction`).
  - *Send to destination* — a `Hook` (webhook today; email/storage in Phase 2).
- **Edges**: event → action. The valuable extension is action → action
  (template → hook) to express ordering/dependency.

### Two build strategies

1. **Canvas over the existing JSON (recommended first step).** The graph is
   just a visual editor for the current `triggers` + `hooks` shapes: sources are
   `add`/`modify`, edges are event→action. No backend executor change — keep
   `fireTriggers` reading the two arrays. Fastest path to drag-to-connect UX;
   does NOT yet support template→hook edges (those would be ignored by the
   executor until strategy 2).
2. **Full graph + executor.** New `nodes` + `edges` storage (replace or
   complement `triggers`/`hooks` columns), and a topological execution engine in
   `fireTriggers` that walks the DAG (so template→hook edges actually gate the
   hook). Larger frontend + backend effort and a migration that compiles the old
   JSON into the graph (or vice-versa).

### Open questions for when this is picked up

- Library: `@xyflow/react` (React Flow) fits the React 19 + TanStack stack.
- Does the canvas also visualize the live "rendered" state / hook failures per
  node (e.g. a red border on a failed hook node)?
- How to keep the mobile/compact fallback (the current "Hooks" + "Set settings"
  cards) when a canvas is too wide?
- Storage/migration path from `triggers`+`hooks` JSON to a graph.

### Suggested ticket

"Visual workflow canvas for sets: drag-to-connect entry events → template
render / export hooks (and template → hook edges)." Depends on #20 Phase 1
(webhook) and ideally Phase 2 (email/storage) so there are enough node types to
make the canvas worthwhile.
