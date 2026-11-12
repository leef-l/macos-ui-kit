import {defineConfig} from "vite";
import {resolve} from "node:path";

// Build for the static preview published to GitHub Pages.
//
// Deliberately separate from vite.config.ts: that one loads the Wails plugin and
// expects a Go backend behind the dev server. This build must stand alone in a
// browser tab, so it takes nothing from Wails.
//
// `root` is ./preview so the emitted HTML is `index.html` at the output root —
// Pages serves that at the directory URL. The actual entry lives in src/ and is
// imported by preview/main.ts, which keeps it type checked with the rest.
//
// `base` is the repository path, because Pages serves a project site under
// /<repo>/ rather than at the domain root.
export default defineConfig({
    root: resolve(import.meta.dirname, "preview"),
    base: "/macos-ui-kit/",
    resolve: {
        alias: {
            // Same mapping as the app: resolve the kit to source, so the preview
            // always shows the current components with no library build step.
            "@leef-l/macos-ui-kit": resolve(import.meta.dirname, "../packages/macos-ui-kit/src/index.ts"),
        },
    },
    build: {
        outDir: resolve(import.meta.dirname, "dist-preview"),
        emptyOutDir: true,
    },
});
