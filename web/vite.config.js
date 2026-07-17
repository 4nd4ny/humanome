import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Monorepo root (the web app imports engine/src/validation.js and schemas/*.json
// from outside its own root — see resolve.alias below and docs/contrats.md §5).
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// The build targets a static bundle openable from file:// (ADR-003, plan-fusion-visu
// étape 6): a single IIFE chunk (no code-splitting, dynamic imports inlined) loaded
// by a classic <script> tag — <script type="module"> is blocked by CORS on file://.
// Vite always emits type="module" + crossorigin on the entry tag, so this plugin
// rewrites it to a classic deferred script after the bundle is generated.
function classicScriptTags() {
  return {
    name: 'classic-script-tags',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
          '<script defer src="$1"></script>',
        )
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), classicScriptTags()],
  // Relative base: the build must work from file:// and from any subpath (ADR-003, ADR-009)
  base: './',
  build: {
    // One self-contained IIFE bundle: works from file://, no module loader, no
    // extra requests. Static JSON imports (merge.json, respire-v7.json) are
    // inlined into this chunk; only the demo day documents stay as fetched files.
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      // Engine is consumed by source path (its package.json only exports src/index.js,
      // and validation.js is not re-exported there). The alias keeps the import
      // stable in dev, build and vitest; bare deps (ajv, ajv-formats) resolve from
      // engine/node_modules by upward walk from the importing file.
      '@engine': fileURLToPath(new URL('../engine/src', import.meta.url)),
    },
  },
  server: {
    // PORT env honoré (plusieurs serveurs dev en parallèle) ; défaut Vite sinon.
    port: Number(process.env.PORT) || 5173,
    fs: {
      // Allow the dev server to serve engine/ and schemas/ (outside web/).
      allow: [repoRoot],
    },
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
