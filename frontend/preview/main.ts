// Entry shim for the preview build.
//
// Vite's `root` is ./preview so the emitted file is `index.html` (GitHub Pages
// serves that at the directory root). The real entry lives in src/ with the rest
// of the app's TypeScript, which keeps it type checked and linted alongside
// everything else.
import "../src/preview";
