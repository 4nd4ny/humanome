// Construction de la copie autonome (spec §11, point 2) : un bundle IIFE
// unique, sans import de module (file://), à partir de carto-viewer.html.
// scripts/build-viewer.mjs l'inline ensuite dans UN fichier HTML modèle.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: fileURLToPath(new URL('./carto-viewer.html', import.meta.url)),
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
  resolve: {
    alias: { '@engine': fileURLToPath(new URL('../engine/src', import.meta.url)) },
  },
})
