# Forma

Forma is a web app designed for developers and small teams to manage their personal or team brand identity efficiently. Define your brand identity once and instantly regenerate any visual asset — banner, card, avatar — whenever something changes.

---

## 🚩 Problem

Managing brand identity assets such as profile pictures, LinkedIn banners, and business cards is tedious and error-prone:

- Manually recreating and editing assets whenever details change (title, company, URL)
- No centralized source of truth for identity data
- Inconsistent branding when multiple people need access to the same assets

## 💡 Solution

Forma is a personal brand CMS where you store identity data and use HTML or Markdown templates to render image assets on demand:

- **Single source of truth:** Central identity profile feeds all templates
- **Template-driven:** HTML templates allow full design freedom
- **Instant regeneration:** Update a field once — all your banners, cards, avatars update
- **Downloadable assets** with platform integration planned for the future (LinkedIn, GitHub, Twitter/X)

## ⭐ Key Features

- Identity profiles with name, title, company, links, and brand colors
- HTML + CSS template editor with live preview
- Markdown templates for simpler cards
- Render LinkedIn banners, profile picture frames, business cards, and GitHub social previews
- Version history and rollback for assets
- Team support for shared identities and templates (planned)
- API for automation and CLI integration (planned)

## 🎯 Target Audience

- Developers maintaining consistent personal branding across multiple platforms
- Small teams wanting consistent visual identity without heavy design overhead

## 🛠️ Tech Stack

### Frontend (Dashboard)
- React (v19), React DOM
- TypeScript
- Tailwind CSS (v4) with @tailwindcss/vite plugin
- Vite (v8) with React plugin
- TanStack React Query, Router, Devtools
- Class Variance Authority, clsx
- tw-animate-css for animations
- Testing: Vitest, Testing Library (React and DOM)
- Linting: ESLint, Prettier with Tailwind plugin

### Backend (API)
- Bun runtime
- Express v5
- Multer for file upload handling
- Internal workspace packages: @repo/auth, @repo/db, @repo/storage, @repo/generation

### Monorepo Management
- Turbo repo for running scripts and managing builds

## 🚀 Roadmap

### MVP

- Identity profile creation
- Built-in templates (3-5) for banners and cards
- HTML template editor with live preview
- Image rendering and download (PNG)

### Future Phases

- API access
- Community template library
- Team identity profiles
- Platform push (LinkedIn, GitHub, Twitter/X)
- Template marketplace
- CLI tool and webhooks

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

## 📞 Contact

Feel free to open issues or pull requests on GitHub to contribute or report bugs.

---

*This README was generated based on project documentation and current package dependencies.*
