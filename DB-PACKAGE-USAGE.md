# Shared `@repo/db` Package

This repository uses a monorepo workspace layout with `apps/*` and `packages/*`.

## Goal

When two apps need the same data-fetching logic, keep that logic in one shared package and import it from both apps.

## What was added

- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/src/getData.ts`
- `packages/db/src/index.ts`

The shared package is named `@repo/db`.

## How the shared package works

### 1) Define a shared function

In `packages/db/src/getData.ts`:

```ts
export async function getData() {
  const response = await fetch("https://jsonplaceholder.typicode.com/posts/1")
  if (!response.ok) throw new Error("Failed to fetch data")
  return response.json()
}
```

### 2) Export it from the package entrypoint

In `packages/db/src/index.ts`:

```ts
export { getData } from "./getData"
```

### 3) Add the package as a workspace dependency in apps

In `apps/dashboard/package.json` and `apps/api/package.json`:

```json
"dependencies": {
  "@repo/db": "workspace:*"
}
```

### 4) Import from `@repo/db` in both apps

In `apps/dashboard/src/routes/index.tsx`:

```ts
import { getData } from "@repo/db"
```

In `apps/api/index.ts`:

```ts
import { getData } from "@repo/db"
```
```

## Run setup

From the repo root (`code`):

```bash
bun install
```

Then run the apps:

```bash
cd apps/dashboard && bun run dev
cd apps/api && bun run dev
```

## Why this is better

- The fetch logic is written once.
- Both apps use the same shared package.
- The shared function is easy to test and maintain.
