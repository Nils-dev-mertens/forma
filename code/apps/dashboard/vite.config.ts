import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const config = defineConfig({
  // Mount the dashboard under /dashboard so it can live alongside the Astro
  // landing page behind a single reverse proxy (see nginx.conf).
  base: "/dashboard/",
  resolve: { tsconfigPaths: true },
  server: {
    port: 3000,
    proxy: {
      // In development the API runs on PORT (default 3001). Override with
      // VITE_PROXY_TARGET in apps/dashboard/.env when the API runs elsewhere
      // (e.g. PORT=3002 because 3001 is occupied). Proxied server-side, so
      // requests stay same-origin and session cookies work.
      "/api": process.env.VITE_PROXY_TARGET ?? "http://localhost:3001",
    },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({ router: { basepath: "/dashboard" } }),
    viteReact(),
  ],
})

export default config
