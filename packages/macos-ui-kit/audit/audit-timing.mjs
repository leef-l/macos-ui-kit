// Timing and re-entrancy: what happens when the second thing arrives before the
// first has finished.
//
// Every other audit performs one action and looks. Real use is a click during a
// fade, a destroy while a layout pass is queued, a setter landing in the middle
// of a debounce. Those orders are where a vanilla component breaks, and no
// screenshot can show it.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8429;
const wait = (ms) => `await new Promise((r) => setTimeout(r, ${ms}));`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/kit.css"></head>
<body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.__cases = {
    // A queued layout pass must not run against a destroyed component.
    "Table destroyed with a frame pending": async () => {
        const c = new MacUI.Table({columns: [{key: 'a', title: 'A', width: 120}], rows: [{a: 1}], resizable: true});
        document.body.appendChild(c.element);
        c.destroy();               // requestAnimationFrame for enableResizing is still queued
        c.element.remove();
        ${wait(200)}
        return {errors: window.__errors.slice(), stray: document.querySelectorAll('.mac-table').length};
    },

    // Close in the same tick as open, then open again: one palette, and open.
    "Palette: open, close, open in one tick": async () => {
        const c = new MacUI.CommandPalette({items: [{value: 'a', label: 'A'}]});
        c.open(); c.close(); c.open();
        ${wait(150)}
        const dialogs = document.querySelectorAll('.mac-commandpalette').length;
        const scrims = document.querySelectorAll('.mac-commandpalette__backdrop').length;
        const isOpen = document.querySelector('.mac-commandpalette__backdrop')?.classList.contains('is-open') ?? false;
        c.close();
        ${wait(120)}
        return {dialogs, scrims, isOpen, afterClose: document.querySelectorAll('.mac-commandpalette').length};
    },

    // Re-open during the close fade: the fade's timer must not remove the new one.
    "Dialog: re-open during the fade": async () => {
        const c = new MacUI.Dialog({title: 'T'});
        c.open();
        c.close();
        ${wait(60)}
        c.open();
        ${wait(400)}             // well past the 200ms removal timer
        const scrims = document.querySelectorAll('.mac-dialog__scrim').length;
        const open = c.isOpen;
        c.close();
        ${wait(300)}
        return {scrims, open, afterClose: document.querySelectorAll('.mac-dialog__scrim').length};
    },

    // A setter landing inside the debounce window must not be overwritten by the
    // older keystrokes when the timer fires.
    "SearchField: setValue during the debounce": async () => {
        const seen = [];
        const c = new MacUI.SearchField({onChange: (v) => seen.push(v)});
        document.body.appendChild(c.element);
        const input = c.element.querySelector('input');
        input.value = 'abc';
        input.dispatchEvent(new Event('input', {bubbles: true}));
        ${wait(40)}              // inside the debounce
        c.setValue('zzz');
        ${wait(500)}
        return {getter: c.value, reported: seen.slice(), last: seen[seen.length - 1] ?? null};
    },

    // Rows replaced while a filter is active must still obey the filter.
    "Table: setRows under an active filter": async () => {
        const c = new MacUI.Table({
            columns: [{key: 'a', title: 'A'}],
            rows: [{id: '1', a: 'keep'}, {id: '2', a: 'drop'}],
        });
        document.body.appendChild(c.element);
        c.setFilter((row) => row.a === 'keep');
        ${wait(60)}
        const filtered = c.element.querySelectorAll('tbody tr').length;
        c.setRows([{id: '3', a: 'keep'}, {id: '4', a: 'drop'}, {id: '5', a: 'drop'}]);
        ${wait(120)}
        const after = c.element.querySelectorAll('tbody tr').length;
        return {filtered, after, text: c.element.querySelector('tbody')?.textContent.trim()};
    },

    // The stepper must not overshoot under a burst of key repeats.
    "Stepper: twenty key repeats against the ceiling": async () => {
        const c = new MacUI.Stepper({value: 8, min: 0, max: 10});
        document.body.appendChild(c.element);
        c.element.focus();
        for (let i = 0; i < 20; i++) {
            c.element.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true, cancelable: true}));
        }
        ${wait(80)}
        return {value: c.value, aria: c.element.getAttribute('aria-valuenow'),
                upDisabled: c.element.querySelector('.mac-stepper__button--up')?.disabled ?? null};
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
    "--headless=new", "--remote-debugging-port=9689", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot32")}`, "--window-size=1000,800", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9689/json/list")).json(); if (targets.length) break; } catch {}
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
        document.getElementById('host').replaceChildren();
        document.body.querySelectorAll('.mac-dialog__scrim, .mac-menu').forEach((n) => n.remove());
        window.__errors.length = 0;
    }
    return out;})()`);

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
    if (cond) { pass++; console.log(`OK   ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
    else { fail++; console.log(`FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
};
const at = (n) => (results ?? []).find((r) => r.name === n) ?? {};

ok((results ?? []).every((r) => !r.error), "every timing case ran",
    (results ?? []).filter((r) => r.error).map((r) => `${r.name}: ${r.error}`));

const table = at("Table destroyed with a frame pending");
ok((table.errors ?? ["?"]).length === 0, "a queued frame after destroy throws nothing", table.errors);
ok((table.stray ?? -1) === 0, "and leaves no table in the document", table.stray);

const palette = at("Palette: open, close, open in one tick");
ok(palette.dialogs === 1 && palette.scrims === 1, "open/close/open mounts exactly one palette", palette);
ok(palette.isOpen === true, "and it is open", palette.isOpen);
ok(palette.afterClose === 0, "closing it afterwards removes it", palette.afterClose);

const dialog = at("Dialog: re-open during the fade");
ok(dialog.scrims === 1, "re-opening during the fade leaves one scrim", dialog.scrims);
ok(dialog.open === true, "and the dialog is open", dialog.open);
ok(dialog.afterClose === 0, "closing after that removes it", dialog.afterClose);

const search = at("SearchField: setValue during the debounce");
ok(search.getter === "zzz", "the setter wins over the pending keystrokes", search.getter);
ok(search.last === null || search.last === "zzz",
    "and the debounced report does not contradict the value", search.reported);

const filter = at("Table: setRows under an active filter");
ok(filter.filtered === 1, "the filter shows one row", filter.filtered);
ok(filter.after === 1, "a new row set is still filtered", filter.after);

const stepper = at("Stepper: twenty key repeats against the ceiling");
ok(stepper.value === 10 && stepper.aria === "10", "key repeats clamp at the maximum",
    {value: stepper.value, aria: stepper.aria});
ok(stepper.upDisabled === true, "and the up segment disables itself", stepper.upDisabled);

ok(consoleErrors.length === 0, "no runtime exceptions during the run", consoleErrors.slice(0, 3));

console.log(`\n${pass} assertions passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail > 0 ? 1 : 0);
