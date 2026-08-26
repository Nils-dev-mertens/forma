import { defineConfig } from "astro/config"
import tailwindcss from "@tailwindcss/vite"

// The landing page is a static Astro site served at "/". In development it runs
// on port 3005 (see nginx.conf for how it is routed behind the gateway).
export default defineConfig({
  server: {
    port: 3005,
    host: true,
  },
  // Static output: `astro build` produces plain HTML/CSS that nginx can serve
  // directly, or the dev server can be proxied during development.
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
})
