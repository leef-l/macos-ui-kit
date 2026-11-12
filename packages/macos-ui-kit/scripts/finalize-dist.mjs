/**
 * Finalise `dist/` after Vite and tsc have run.
 *
 * Two jobs, both of them things the bundler gets wrong for a published package:
 *
 * 1. Move the inlined font out of the stylesheet and back into a file. Vite's
 *    library mode inlines every asset referenced from CSS as a base64 data URI,
 *    and `build.assetsInlineLimit` does not apply to it. That turns a 63 KB
 *    stylesheet into a 473 KB one, and the font can no longer be cached
 *    separately, preloaded, or replaced by the consumer.
 *
 * 2. Write a type declaration for the `./style.css` export. Without it a
 *    TypeScript consumer that imports the stylesheet — which the README tells it
 *    to do — fails to compile: a side-effect import of an untyped module is an
 *    error when the consumer's `moduleResolution` is `bundler`.
 */
import {copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const CSS = join(DIST, "macos-ui-kit.css");

// The font the kit ships, and the name the stylesheet should point at.
const ASSETS = [{mime: "font/ttf", file: "Inter-Medium.ttf"}];

const kb = (n) => (n / 1024).toFixed(1);
const css = await readFile(CSS, "utf8");

// One capture per inlined font, in document order.
const pattern = /url\(data:(font\/[a-z]+);base64,([A-Za-z0-9+/=]+)\)/g;
const inlined = [...css.matchAll(pattern)];

if (inlined.length !== ASSETS.length) {
    throw new Error(
        `expected ${ASSETS.length} inlined font(s), found ${inlined.length}; ` +
            `update ASSETS in scripts/finalize-dist.mjs`,
    );
}

await mkdir(join(DIST, "assets"), {recursive: true});

let out = css;
for (const [index, match] of inlined.entries()) {
    const [, mime, base64] = match;
    const asset = ASSETS[index];

    if (mime !== asset.mime) {
        throw new Error(`inlined asset ${index} is ${mime}, expected ${asset.mime}`);
    }

    await writeFile(join(DIST, "assets", asset.file), Buffer.from(base64, "base64"));
    out = out.replace(match[0], `url(./assets/${asset.file})`);
}

await writeFile(CSS, out);

// The Inter font is SIL OFL, which requires the licence to travel with the
// font. `files` in package.json only publishes `dist`, so the copy that lives
// beside the source asset has to be duplicated in here.
await copyFile(
    join(ROOT, "assets", "Inter Font License.txt"),
    join(DIST, "assets", "Inter Font License.txt"),
);

// The stylesheet has no exports; the declaration only has to exist so the
// `./style.css` subpath resolves for the type checker.
await writeFile(
    join(DIST, "style.css.d.ts"),
    "/** Side-effect only stylesheet. Import it once, for its rules. */\nexport {};\n",
);

console.log(
    `finalize-dist: ${inlined.length} font(s) externalised, ` +
        `stylesheet ${kb(css.length)} KB -> ${kb(out.length)} KB; ` +
        `wrote style.css.d.ts and the font licence`,
);
