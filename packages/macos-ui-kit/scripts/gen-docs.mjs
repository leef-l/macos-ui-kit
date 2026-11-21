// Generate API.md from the component sources.
//
// The kit's contract is the TypeScript source: every option is declared on an
// `export interface XOptions` and every public member is a method or getter on
// the class. Writing that down by hand for 59 components guarantees drift, so
// this script reads the source and emits the table instead. It is regex-based on
// purpose — a full TypeScript parser would be a dependency, and the shapes it has
// to read are the ones the kit writes itself.
import {readdir, readFile, writeFile} from "node:fs/promises";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "API.md");

const GROUPS = [
    ["controls", "Controls"],
    ["layout", "Layout"],
    ["overlays", "Overlays"],
    ["mobile", "Mobile"],
];

/** Strip a `/** ... *\/` block down to one line of prose. */
const prose = (block) => {
    const text = block
        .replace(/^\/\*\*?/, "")
        .replace(/\*\/$/, "")
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, "").trim())
        .filter((line) => line !== "" && !line.startsWith("@"));
    return text.join(" ").replace(/\s+/g, " ").trim();
};

/**
 * Read a balanced `{ ... }` body starting at `open`, honouring strings and
 * template literals so a `}` inside a default value cannot close it early.
 */
const readBody = (text, open) => {
    let depth = 0;
    let quote = null;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === "\\") i++;
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return text.slice(open + 1, i);
        }
    }
    return "";
};

/** Parse `export interface XOptions` members: name, type, optional flag, doc. */
const parseInterface = (body) => {
    const fields = [];
    let doc = "";
    let depth = 0;
    let current = "";
    const lines = body.split("\n");

    for (const raw of lines) {
        const line = raw.trim();

        if (depth === 0) {
            if (line.startsWith("/**")) { doc = prose(line) || doc; continue; }
            if (line.startsWith("*") && !line.startsWith("*/")) {
                const part = line.replace(/^\*\s?/, "").trim();
                if (part && !part.startsWith("@")) doc = (doc ? doc + " " : "") + part;
                continue;
            }
            if (line === "*/") continue;
        }

        for (const ch of line) {
            if (ch === "{" || ch === "(" || ch === "[") depth++;
            if (ch === "}" || ch === ")" || ch === "]") depth--;
        }
        current += " " + line;

        if (depth === 0 && /[;,]$/.test(line)) {
            const decl = current.replace(/\s+/g, " ").trim();
            current = "";
            const m = decl.match(/^(?:readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([^;]+);?$/);
            if (m) {
                fields.push({name: m[1], optional: !!m[2], type: m[3].replace(/\s+/g, " ").trim(), doc: doc.trim()});
            }
            doc = "";
        }
    }
    return fields;
};

/** Public members of a class: getters and methods, with their one-line doc. */
const parseMembers = (body) => {
    const members = [];
    let doc = "";
    const lines = body.split("\n");
    let skipDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (skipDepth > 0) {
            for (const ch of line) {
                if (ch === "{") skipDepth++;
                else if (ch === "}") skipDepth--;
            }
            continue;
        }

        if (line.startsWith("/**")) {
            const gathered = [line.replace(/^\/\*\*?/, "").replace(/\*\/$/, "")];
            let j = i;
            while (!lines[j].includes("*/") && j + 1 < lines.length) { j++; gathered.push(lines[j].replace(/\*\/$/, "")); }
            i = j;
            doc = prose(gathered.join("\n"));
            continue;
        }
        if (line.startsWith("//") || line === "") continue;

        if (/^(private|protected)\b/.test(line)) {
            // Skip the whole member, including its body.
            for (const ch of line) { if (ch === "{") skipDepth++; else if (ch === "}") skipDepth--; }
            doc = "";
            continue;
        }

        const getter = line.match(/^(?:override\s+)?get\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*:\s*([^{]+)\{/);
        if (getter) {
            members.push({kind: "getter", name: getter[1], signature: getter[2].trim(), doc: doc.trim()});
            for (const ch of line) { if (ch === "{") skipDepth++; else if (ch === "}") skipDepth--; }
            doc = "";
            continue;
        }

        const method = line.match(/^(?:override\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([^{]+)\{/);
        if (method && !["if", "for", "while", "switch", "catch", "return"].includes(method[1])) {
            const params = method[2].replace(/\s+/g, " ").trim();
            members.push({kind: "method", name: method[1], signature: `(${params}) => ${method[3].trim()}`, doc: doc.trim()});
            for (const ch of line) { if (ch === "{") skipDepth++; else if (ch === "}") skipDepth--; }
            doc = "";
            continue;
        }

        if (line !== "") doc = doc; // a doc comment only attaches to the next member
    }
    return members;
};

const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

const sections = [];

for (const [dir, label] of GROUPS) {
    const files = (await readdir(join(SRC, dir))).filter((f) => f.endsWith(".ts") && f !== "index.ts").sort();
    const entries = [];

    for (const file of files) {
        const text = await readFile(join(SRC, dir, file), "utf8");

        const classMatch = text.match(/export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/);
        if (!classMatch) continue;
        const name = classMatch[1];

        const classOpen = text.indexOf("{", classMatch.index);
        const classBody = readBody(text, classOpen);

        // The options interface, if the component takes one.
        const ifaceMatch = text.match(/export\s+interface\s+([A-Za-z0-9_]+Options)\s*\{/);
        const options = ifaceMatch ? parseInterface(readBody(text, ifaceMatch.index + ifaceMatch[0].length - 1)) : [];

        // The class docstring: the prose block immediately before `export class`.
        // Taken from the end of the prefix, not from the first block in the file —
        // a lazy global match would start at the first doc of the file and swallow
        // everything up to the class.
        const before = text.slice(0, classMatch.index);
        const blocks = [...before.matchAll(/\/\*\*[\s\S]*?\*\//g)];
        const lastBlock = blocks.length > 0 && before.slice(blocks[blocks.length - 1].index).trim().startsWith("/**")
            ? blocks[blocks.length - 1][0]
            : "";
        const summary = lastBlock ? prose(lastBlock).split(/(?<=\.)\s/)[0] : "";

        // Related exported types (unions the options refer to), with their own
        // docstring: an option typed `ButtonVariant` and documented nowhere is
        // still described, because the union itself carries the prose.
        const types = [...text.matchAll(/export\s+type\s+([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]);
        const typeDocs = new Map();
        for (const match of text.matchAll(/\/\*\*([\s\S]*?)\*\/\s*export\s+type\s+([A-Za-z0-9_]+)\s*=/g)) {
            typeDocs.set(match[2], prose(match[1]).split(/(?<=\.)\s/)[0]);
        }
        for (const field of options) {
            if (field.doc === "" && typeDocs.has(field.type)) field.doc = typeDocs.get(field.type);
        }

        entries.push({name, options, members: parseMembers(classBody), summary, types, file});
    }

    sections.push({label, entries});
}

const lines = [];
lines.push("# API reference");
lines.push("");
lines.push("Generated from `src/` by `npm run docs` — every option, getter and method");
lines.push("the kit exposes, in the order the source declares them. Do not edit this");
lines.push("file by hand; run the script.");
lines.push("");
lines.push("Conventions, identical in every component:");
lines.push("");
lines.push("| | |");
lines.push("| --- | --- |");
lines.push("| Read state | a property getter (`field.value`) |");
lines.push("| Write state | `setX(...)`, always silent (no `onChange`) |");
lines.push("| Dismissible overlays | `open(anchor?)` / `close()` / `isOpen` |");
lines.push("| Mount | `element` is the node; `mount(parent)` replaces the parent's content |");
lines.push("| Teardown | `destroy()` removes every listener; safe to call twice |");
lines.push("");
lines.push("An option whose description reads `—` is one whose name and type already say");
lines.push("what it does; the docstrings that exist are the ones the source carries.");
lines.push("");

let count = 0;for (const {label, entries} of sections) {
    lines.push(`## ${label} (${entries.length})`);
    lines.push("");
    for (const entry of entries) {
        count++;
        lines.push(`### ${entry.name}`);
        lines.push("");
        if (entry.summary) { lines.push(entry.summary); lines.push(""); }
        lines.push(`\`${entry.file}\``);
        lines.push("");

        if (entry.options.length > 0) {
            lines.push("| Option | Type | | Description |");
            lines.push("| --- | --- | --- | --- |");
            for (const field of entry.options) {
                const described = cell(field.doc) || "—";
                lines.push(`| \`${field.name}\` | \`${cell(field.type)}\` | ${field.optional ? "optional" : "**required**"} | ${described} |`);
            }
            lines.push("");
        } else {
            lines.push("Takes no options.");
            lines.push("");
        }

        const getters = entry.members.filter((m) => m.kind === "getter");
        const methods = entry.members.filter((m) => m.kind === "method");
        if (getters.length + methods.length > 0) {
            lines.push("| Member | Returns | Description |");
            lines.push("| --- | --- | --- |");
            for (const member of [...getters, ...methods]) {
                lines.push(`| \`${member.name}${member.kind === "method" ? cell(member.signature.slice(0, member.signature.indexOf(")") + 1)) : ""}\` | \`${cell(member.kind === "method" ? member.signature.slice(member.signature.lastIndexOf("=>") + 2).trim() : member.signature)}\` | ${cell(member.doc)} |`);
            }
            lines.push("");
        }

        if (entry.types.length > 0) {
            lines.push(`Related types: ${entry.types.map((t) => `\`${t}\``).join(", ")}`);
            lines.push("");
        }
    }
}

lines.push("");
lines.push(`_${count} components._`);
lines.push("");

await writeFile(OUT, lines.join("\n"), "utf8");
console.log(`API.md: ${count} components, ${lines.length} lines`);
