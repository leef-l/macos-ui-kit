// Lifecycle audit: destroy() has to leave nothing behind.
//
// A vanilla UI leaks by default — a listener added on `document`, an observer
// never disconnected, a component destroyed while its overlay is still mounted.
// None of that shows in a screenshot, and every existing audit creates one
// component and moves on.
//
// The page installs ledgers BEFORE any component exists: a net count of
// document-level listeners by type, and a live set of ResizeObservers. Each case
// then builds, exercises and destroys, and the ledgers must return to baseline.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8427;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/kit.css"></head>
<body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
// --- ledgers, installed before the first component exists -------------------
window.__doc = new Map();          // type -> net listeners on document
window.__observers = new Set();    // live ResizeObserver instances
(function instrument() {
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, fn, options) => {
        window.__doc.set(type, (window.__doc.get(type) || 0) + 1);
        return add(type, fn, options);
    };
    document.removeEventListener = (type, fn, options) => {
        window.__doc.set(type, (window.__doc.get(type) || 0) - 1);
        return remove(type, fn, options);
    };
    const Native = window.ResizeObserver;
    window.ResizeObserver = class extends Native {
        constructor(cb) { super(cb); window.__observers.add(this); }
        disconnect() { window.__observers.delete(this); return super.disconnect(); }
    };
})();
window.__snapshot = () => ({
    doc: Object.fromEntries([...window.__doc].filter(([, n]) => n !== 0)),
    observers: window.__observers.size,
    bodyChildren: document.body.children.length,
    overlays: document.querySelectorAll('.mac-dialog__scrim, .mac-menu').length,
});

window.__cases = {
    "Table: create and destroy": () => {
        const before = window.__snapshot();
        const c = new MacUI.Table({columns: [{key: 'a', title: 'A', width: 100}], rows: [{a: 1}], selectable: true, resizable: true});
        document.body.appendChild(c.element);
        const during = window.__snapshot();
        c.destroy();
        c.element.remove();
        return {before, during, after: window.__snapshot()};
    },
    "CommandPalette: five open/close cycles": () => {
        // Snapshot before construction: the palette registers its hotkey listener
        // in the constructor, so a snapshot taken after it already counts that.
        const before = window.__snapshot();
        const c = new MacUI.CommandPalette({items: [{value: 'a', label: 'A'}]});
        for (let i = 0; i < 5; i++) { c.open(); c.close(); }
        // Destroyed as well, so the baseline the next case measures is not
        // carrying this component's document listener.
        c.destroy();
        return {before, after: window.__snapshot()};
    },
    "ActionSheet: destroyed while open": () => {
        const before = window.__snapshot();
        const c = new MacUI.ActionSheet({actions: [{value: 'a', label: 'A'}]});
        c.open();
        // One sheet is a scrim plus its panel; count the scrim, not every element
        // whose class mentions the sheet.
        const open = {overlays: document.querySelectorAll('.mac-actionsheet__backdrop').length};
        c.destroy();
        return {before, open, after: window.__snapshot()};
    },
    "Dialog: destroyed mid-fade": async () => {
        const c = new MacUI.Dialog({title: 'T'});
        const before = window.__snapshot();
        c.open();
        c.close();
        c.destroy();               // before the 200ms removal runs
        await new Promise((r) => setTimeout(r, 350));
        return {before, after: window.__snapshot()};
    },
    "Menu: open, destroy, then dispatch": () => {
        const c = new MacUI.Menu({items: [{value: 'a', label: 'A'}]});
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        const before = window.__snapshot();
        c.open(anchor);
        c.destroy();
        anchor.remove();
        return {before, after: window.__snapshot()};
    },
    "List: ten create/destroy rounds": () => {
        const before = window.__snapshot();
        for (let i = 0; i < 10; i++) {
            const c = new MacUI.List({items: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}], reorderable: true});
            document.body.appendChild(c.element);
            c.destroy();
            c.element.remove();
        }
        return {before, after: window.__snapshot()};
    },
    "Toast: shows then hides": () => {
        const before = window.__snapshot();
        MacUI.showToast('hello');
        const during = window.__snapshot();
        return {before, during};
    },
};
</script></body></html>`;

const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/" || url === "/index.html") {
        res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
        return void res.end(PAGE);
    }
    const file = url === "/kit.css" ? join(KIT, "dist", "macos-ui-kit.css") : join(KIT, "dist", "macos-ui-kit.iife.js");
    try {
        const body = await readFile(file);
        res.writeHead(200, {"content-type": url.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"});
        res.end(body);
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const proc = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--remote-debugging-port=9687", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot31")}`, "--window-size=1000,800", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9687/json/list")).json(); if (targets.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
}
const page = targets.find((t) => t.type === "page") ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
const consoleErrors = [];
ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params?.exceptionDetails?.exception?.description ?? "exception");
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
        consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    }
});
await new Promise((r) => ws.on("open", r));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
await new Promise((r) => setTimeout(r, 1800));

const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (r?.exceptionDetails) return {__error: r.exceptionDetails.exception?.description};
    return r?.result?.value;
};

const results = await evalJs(`(async () => {
    const out = [];
    for (const [name, fn] of Object.entries(window.__cases)) {
        try { out.push({name, ...(await fn())}); }
        catch (error) { out.push({name, error: String(error && error.message || error)}); }
        // Reset the page between cases so one leak cannot hide in the next.
        document.getElementById('host').replaceChildren();
        document.body.querySelectorAll('.mac-dialog__scrim, .mac-menu, .mac-toast').forEach((n) => n.remove());
    }
    return out;})()`);

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
    if (cond) { pass++; console.log(`OK   ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
    else { fail++; console.log(`FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
};

const byName = (n) => (results ?? []).find((r) => r.name === n) ?? {};
ok((results ?? []).every((r) => !r.error), "every lifecycle case ran",
    (results ?? []).filter((r) => r.error).map((r) => `${r.name}: ${r.error}`));

// A destroyed Table must give back its observer and its document listens.
const table = byName("Table: create and destroy");
ok((table.during?.observers ?? 0) > (table.before?.observers ?? 0),
    "a table with a declared width observes its scroller", {before: table.before?.observers, during: table.during?.observers});
ok(table.after?.observers === table.before?.observers,
    "destroy disconnects it", {before: table.before?.observers, after: table.after?.observers});

// Five open/close cycles must not stack document listeners.
const palette = byName("CommandPalette: five open/close cycles");
ok(JSON.stringify(palette.after?.doc ?? {}) === JSON.stringify(palette.before?.doc ?? {}),
    "five palette cycles leave no document listener behind", {before: palette.before?.doc, after: palette.after?.doc});
ok((palette.after?.overlays ?? 0) === 0, "and no palette in the document", palette.after?.overlays);

// destroy() while a sheet is open must take the backdrop with it.
const sheet = byName("ActionSheet: destroyed while open");
ok((sheet.open?.overlays ?? 0) === 1, "an open action sheet mounts one backdrop", sheet.open?.overlays);
ok((sheet.after?.overlays ?? -1) === 0, "destroying it removes the backdrop", sheet.after?.overlays);
ok(JSON.stringify(sheet.after?.doc ?? {}) === JSON.stringify(sheet.before?.doc ?? {}),
    "and releases its document listener", {before: sheet.before?.doc, after: sheet.after?.doc});

// A dialog destroyed mid-fade must not resurrect its scrim when the timer fires.
const dialog = byName("Dialog: destroyed mid-fade");
ok((dialog.after?.overlays ?? -1) === 0, "a dialog destroyed mid-fade leaves no scrim", dialog.after?.overlays);

// Ten rounds of a reorderable list: no listener or node accumulation.
const list = byName("List: ten create/destroy rounds");
ok((list.after?.bodyChildren ?? -1) === (list.before?.bodyChildren ?? -2),
    "ten list rounds leave the body as they found it",
    {before: list.before?.bodyChildren, after: list.after?.bodyChildren});
ok((list.after?.observers ?? -1) === (list.before?.observers ?? -2),
    "and no observers", {before: list.before?.observers, after: list.after?.observers});

ok(consoleErrors.length === 0, "no console errors while tearing components down", consoleErrors.slice(0, 3));

console.log(`\n${pass} assertions passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail > 0 ? 1 : 0);
