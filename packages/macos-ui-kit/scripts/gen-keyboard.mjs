// Generate KEYBOARD.md from the components that handle keys.
//
// The kit's keyboard map is spread across twenty-odd `onKeyDown` methods, and no
// single file says what the whole set is. This reads the sources and prints the
// answer, so a component that adds a binding (or forgets one) shows up in a diff
// instead of in a bug report.
import {readdir, readFile, writeFile} from "node:fs/promises";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "KEYBOARD.md");

const GROUPS = [
    ["controls", "Controls"],
    ["layout", "Layout"],
    ["overlays", "Overlays"],
    ["mobile", "Mobile"],
];

/** Human names for the keys the sources name. */
const LABELS = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Home: "Home", End: "End", Enter: "Enter", Escape: "Esc", Esc: "Esc",
    Tab: "Tab", " ": "Space", Backspace: "⌫", Delete: "Del",
    PageUp: "PgUp", PageDown: "PgDn",
};

/**
 * Read one `onKeyDown`-shaped function body from the first `case`/`key ===`
 * comparison in the file, so the keys of a helper that is not a key handler do
 * not leak in.
 */
const keysOf = (text) => {
    const found = new Map();

    // `case "X":` inside a switch.
    for (const match of text.matchAll(/case\s+"([^"]+)"\s*:/g)) {
        const key = match[1];
        const index = match.index;
        const after = text.slice(index, index + 600);
        found.set(key, summarize(after));
    }

    // `event.key === "X"`, and the negated guard form every early-return handler
    // uses: `if (event.key !== "Escape") return;`.
    for (const match of text.matchAll(/\.key\s*[!=]==\s*"([^"]+)"/g)) {
        found.set(match[1], found.get(match[1]) ?? summarize(text.slice(match.index, match.index + 600)));
    }
    for (const match of text.matchAll(/\[\s*((?:"[^"]+"\s*,\s*)*"[^"]+")\s*\]\s*\.includes\(\s*[a-z]+\.key/g)) {
        for (const keyMatch of match[1].matchAll(/"([^"]+)"/g)) {
            found.set(keyMatch[1], found.get(keyMatch[1]) ?? summarize(text.slice(match.index, match.index + 600)));
        }
    }
    return found;
};

/** The first comment line above the binding, if the source has one. */
const summarize = (slice) => {
    const before = slice.slice(0, slice.indexOf(":"));
    const doc = before.match(/\/\*\*([^*]*)\*\//);
    return doc ? doc[1].replace(/\s+/g, " ").trim() : "";
};

const rows = [];
for (const [dir, label] of GROUPS) {
    const files = (await readdir(join(SRC, dir))).filter((f) => f.endsWith(".ts") && f !== "index.ts").sort();
    for (const file of files) {
        const text = await readFile(join(SRC, dir, file), "utf8");
        // Only files that actually listen for keys.
        if (!/["']keydown["']/.test(text)) continue;
        const keys = keysOf(text);
        if (keys.size === 0) continue;
        const name = (text.match(/export\s+class\s+([A-Za-z0-9_]+)/) ?? [])[1] ?? file;
        rows.push({name, label, file, keys});
    }
}

const ALL = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " ", "Escape", "Tab", "Backspace", "Delete", "PageUp", "PageDown"];

const lines = [];
lines.push("# Keyboard");
lines.push("");
lines.push("Generated from `src/` by `npm run keyboard` — every component that handles a");
lines.push("key, and which keys it handles. Do not edit by hand.");
lines.push("");
lines.push("Conventions the whole kit follows:");
lines.push("");
lines.push("| | |");
lines.push("| --- | --- |");
lines.push("| Tab | leaves a component in one stop; collections use a roving tabindex |");
lines.push("| Arrow keys | move focus inside a collection, and never scroll the page |");
lines.push("| Home / End | jump to the first and last item of any collection |");
lines.push("| Escape | dismisses an overlay and returns focus to its trigger |");
lines.push("| Enter / Space | activates the focused element |");
lines.push("");
lines.push("## Coverage");
lines.push("");
lines.push(`| Component | ${ALL.map((k) => LABELS[k] ?? k).join(" | ")} |`);
lines.push(`| --- | ${ALL.map(() => ":-:").join(" | ")} |`);
for (const row of rows) {
    const cells = ALL.map((key) => (row.keys.has(key) ? "●" : ""));
    lines.push(`| **${row.name}** | ${cells.join(" | ")} |`);
}
lines.push("");

lines.push("## Bindings");
lines.push("");
for (const row of rows) {
    lines.push(`### ${row.name}`);
    lines.push("");
    lines.push(`\`${row.file}\``);
    lines.push("");
    lines.push("| Key | Does |");
    lines.push("| --- | --- |");
    for (const [key, doc] of row.keys) {
        lines.push(`| \`${LABELS[key] ?? key}\` | ${doc || "—"} |`);
    }
    lines.push("");
}

const total = rows.reduce((sum, row) => sum + row.keys.size, 0);
lines.push(`_${rows.length} components, ${total} bindings._`);
lines.push("");

await writeFile(OUT, lines.join("\n"), "utf8");
console.log(`KEYBOARD.md: ${rows.length} components, ${total} bindings`);
