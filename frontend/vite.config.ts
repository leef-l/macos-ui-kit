import { defineConfig } from "vite";
import wails from "@wailsio/runtime/plugins/vite";
import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  resolve: {
    alias: {
      // The kit is a real package (see packages/macos-ui-kit) but this app
      // resolves it to source rather than to its built dist. Editing a component
      // therefore takes effect on reload, with no library build step in between,
      // and there is only ever one copy of the code. The matching mapping lives
      // in tsconfig.json under `paths`, so the type checker agrees with Vite.
      "@leef-l/macos-ui-kit": resolve(__dirname, "../packages/macos-ui-kit/src/index.ts"),
    },
  },
  plugins: [wails("./bindings")],
});
