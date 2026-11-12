import {defineConfig} from "vite";
import {resolve} from "node:path";

// Library build.
//
// Two outputs, because there are two ways to consume this kit:
//
//   index.js             ESM, for a bundler (`import {Button} from "…"`)
//   macos-ui-kit.iife.js IIFE exposing `window.MacUI`, for a plain <script>
//
// Both share one stylesheet and the assets next to it. The ESM build is the one
// to prefer; the IIFE exists so the kit is usable without any build tooling at
// all, which is most of its audience.
export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        // One stylesheet rather than a file per component: the kit is consumed as
        // a whole, and 30 separate <link> tags would be worse for the consumer
        // than one request.
        cssCodeSplit: false,
        // Lib mode inlines every asset as base64 by default. For a 308 KB font
        // that turns a 53 KB stylesheet into a 485 KB one, and the font can no
        // longer be cached or preloaded on its own. Emit it as a file instead.
        assetsInlineLimit: 0,
        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            formats: ["es", "iife"],
            name: "MacUI",
            fileName: (format) => (format === "iife" ? "macos-ui-kit.iife.js" : "index.js"),
            cssFileName: "macos-ui-kit",
        },
        rollupOptions: {
            output: {
                // Stable names rather than content hashes: the stylesheet
                // references the font by path, and a consumer may want to
                // preload or relicense it.
                assetFileNames: (asset) => {
                    const name = asset.names?.[0] ?? asset.name ?? "";
                    if (name.endsWith(".css")) return "macos-ui-kit.css";
                    return "assets/[name][extname]";
                },
            },
        },
    },
});
