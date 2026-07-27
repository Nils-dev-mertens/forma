# Forma

Forma is a brand asset pipeline for generating static images from reusable templates and structured data.

Define your brand identity once, connect it to a data source, and automatically generate consistent assets whenever something changes. Forma is meant to make repeatable brand visuals easy to create, maintain, and update without turning the workflow into a full design tool.

---

## Problem

Keeping brand assets consistent across platforms is tedious:

- Profile pictures, banners, cards, and social previews need to stay in sync.
- Small changes like a title, company, logo, or URL often require manual redesign.
- Multiple people editing assets usually leads to inconsistency.
- Existing tools can feel too heavy for simple repeatable brand needs.

The real problem is not making one image. The real problem is maintaining a pipeline that can regenerate many images from the same source of truth.

---

## Solution

Forma is a data-driven brand asset pipeline.

Instead of recreating assets by hand, you define a template once and connect it to structured data:

- **Single source of truth:** One identity record or dataset feeds all templates.
- **Template-driven:** Reusable templates define layout, typography, and brand rules.
- **Automatic regeneration:** When data changes, Forma generates new outputs.
- **Multiple formats:** The same data can power banners, avatars, cards, and other static assets.
- **Simple workflow:** Built for non-designers and small teams, not just developers.

Forma should feel more like a repeatable publishing system than a creative editor.

---

## What it generates

- LinkedIn banners.
- Profile picture frames.
- Business cards.
- Announcement graphics.
- Social previews.
- Team identity visuals.
- Simple CV or profile images.

The focus is on static image generation first. Video may come later as an extension of the same pipeline.

---

## Key Features

- Identity profiles with name, title, company, links, colors, and assets.
- HTML or Markdown-style templates for image generation.
- Live preview of template output.
- Multiple output sizes for different platforms.
- Regeneration when source data changes.
- Version history and rollback for templates and assets.
- API and CLI integration for automation.
- Team support for shared templates and shared identities.

---

## Target Audience

- Developers who want a clean way to generate branded images from data.
- Small teams that need consistent visual assets without design overhead.
- HR managers and operators who need to update many assets in the same format.
- Creators and personal brands that want repeatable visuals across platforms.

Forma should be easy enough for a non-designer to understand, but structured enough for developers to extend.

---

## Core Workflow

1. Create a template.
2. Connect identity or content data.
3. Choose one or more output formats.
4. Render the generated image.
5. Update the data later and regenerate automatically.

This makes Forma useful as a pipeline, not just a one-off generator.

---

## Tech Stack

### Frontend
- React.
- TypeScript.
- Tailwind CSS.
- Vite.
- TanStack React Query and Router.
- Vitest and Testing Library.
- ESLint and Prettier.

### Backend
- Bun runtime.
- Express v5.
- Multer for uploads.
- Internal workspace packages for auth, database, storage, and generation.

### Monorepo
- Turbo repo for scripts, builds, and workspace management.

---

## Status

Forma is an early concept and the name may still change.

The current direction is:

- static image generation first,
- pipeline-first workflow,
- simple setup,
- brand consistency across repeated assets.