import {defineConfig} from "vite";
import {resolve} from "node:path";

// Library build: one ESM bundle, one stylesheet, and the assets (the Inter font)
// next to it. Consumers import the JS and the CSS separately — see README.md.
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
            formats: ["es"],
            fileName: () => "index.js",
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
