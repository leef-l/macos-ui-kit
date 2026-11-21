// Boundary and logic audit: the inputs a demo never passes.
//
// Every existing audit drives components the way the showcase does — sane data,
// one user at a time. This one hands them empty collections, out-of-range
// values, zero steps, inverted ranges and duplicate keys, and asks two things:
// does anything throw, and does the aria/DOM state stay truthful?
//
// Runs against the published IIFE bundle, so what is measured is what a consumer
// loads.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8421;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"></head>
<body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
window.__run = (fn) => {
    try { return {ok: true, value: fn()}; }
    catch (error) { return {ok: false, error: String(error && error.message || error)}; }
};
// Every probe returns a plain object so the runner can assert on it.
window.__cases = {
    "List: empty items": () => {
        const c = new MacUI.List({items: []});
        return {rows: c.element.querySelectorAll('.mac-list__row').length, value: JSON.stringify(c.value)};
    },
    "List: unknown setValue": () => {
        const c = new MacUI.List({items: [{value: 'a', label: 'A'}], value: 'a'});
        c.setValue('nope');
        return {value: c.value, selected: c.element.querySelectorAll('.is-selected').length};
    },
    "List: duplicate values": () => {
        const c = new MacUI.List({items: [{value: 'a', label: 'A'}, {value: 'a', label: 'A2'}]});
        return {rows: c.element.querySelectorAll('.mac-list__row').length, value: c.value};
    },
    "Select: empty options": () => {
        const c = new MacUI.Select({options: []});
        return {value: c.value, control: !!c.element.querySelector('.mac-select__control')};
    },
    "Stepper: zero step": () => {
        const c = new MacUI.Stepper({value: 5, step: 0, min: 0, max: 10});
        const before = c.value;
        c.setValue(6);
        return {before, after: c.value};
    },
    "Stepper: inverted range": () => {
        const c = new MacUI.Stepper({value: 5, min: 10, max: 0});
        return {value: c.value, now: c.element.getAttribute('aria-valuenow')};
    },
    "Stepper: value outside range": () => {
        const c = new MacUI.Stepper({value: 999, min: 0, max: 10});
        return {value: c.value, now: c.element.getAttribute('aria-valuenow')};
    },
    "Slider: min equals max": () => {
        const c = new MacUI.Slider({value: 5, min: 5, max: 5});
        const fill = c.element.querySelector('.mac-slider__fill');
        return {value: c.value, fillWidth: fill ? getComputedStyle(fill).width : null,
                now: c.element.getAttribute('aria-valuenow')};
    },
    "Slider: value above max": () => {
        const c = new MacUI.Slider({value: 999, min: 0, max: 100});
        return {value: c.value, now: c.element.getAttribute('aria-valuenow')};
    },
    "RangeSlider: inverted pair": () => {
        const c = new MacUI.RangeSlider({value: [80, 20]});
        return {value: JSON.stringify(c.value)};
    },
    "RangeSlider: equal pair": () => {
        const c = new MacUI.RangeSlider({value: [50, 50]});
        return {value: JSON.stringify(c.value)};
    },
    "Progress: negative value": () => {
        const c = new MacUI.Progress({value: -20});
        return {now: c.element.getAttribute('aria-valuenow'),
                bar: c.element.querySelector('.mac-progress__fill')?.style.width ?? null};
    },
    "Progress: value above 100": () => {
        const c = new MacUI.Progress({value: 500});
        return {now: c.element.getAttribute('aria-valuenow'),
                bar: c.element.querySelector('.mac-progress__fill')?.style.width ?? null};
    },
    "Pagination: total zero": () => {
        const c = new MacUI.Pagination({total: 0, page: 1, pageSize: 10});
        return {buttons: c.element.querySelectorAll('button').length,
                text: c.element.textContent.trim().slice(0, 40)};
    },
    "Pagination: page beyond range": () => {
        const c = new MacUI.Pagination({total: 30, page: 99, pageSize: 10});
        return {current: c.element.querySelector('[aria-current="page"]')?.textContent.trim() ?? null};
    },
    "Table: no rows": () => {
        const c = new MacUI.Table({columns: [{key: 'a', title: 'A'}], rows: []});
        return {rows: c.element.querySelectorAll('tbody tr').length,
                text: c.element.querySelector('tbody')?.textContent.trim()};
    },
    "Table: no columns": () => {
        const c = new MacUI.Table({columns: [], rows: [{a: 1}]});
        return {cells: c.element.querySelectorAll('tbody td').length,
                throws: false};
    },
    "Table: duplicate row keys": () => {
        const rows = [{id: 'x', a: 1}, {id: 'x', a: 2}];
        const c = new MacUI.Table({columns: [{key: 'a', title: 'A'}], rows, selectable: true});
        c.element.querySelectorAll('tbody input[type=checkbox]')[0].click();
        const selected = c.element.querySelectorAll('tbody tr.is-selected').length;
        return {selected};
    },
    "TreeView: empty nodes": () => {
        const c = new MacUI.TreeView({nodes: []});
        return {rows: c.element.querySelectorAll('.mac-treeview__row').length};
    },
    "TreeView: value not present": () => {
        const c = new MacUI.TreeView({nodes: [{value: 'a', label: 'A'}], value: 'zzz'});
        return {selected: c.element.querySelectorAll('[aria-selected="true"]').length};
    },
    "TabView: no tabs": () => {
        const c = new MacUI.TabView({tabs: []});
        return {selected: JSON.stringify(c.selected), tabs: c.element.querySelectorAll('[role=tab]').length};
    },
    "TabView: setSelected unknown": () => {
        const c = new MacUI.TabView({tabs: [{id: 'a', label: 'A'}], selected: 'a'});
        c.setSelected('nope');
        return {selected: c.selected};
    },
    "TabView: close all then select": () => {
        const c = new MacUI.TabView({tabs: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], closable: true});
        c.closeTab('a'); c.closeTab('b');
        const after = JSON.stringify(c.selected);
        c.setSelected('a');
        return {after, then: c.selected};
    },
    "TabBar: empty items": () => {
        const c = new MacUI.TabBar({items: []});
        return {tabs: c.element.querySelectorAll('[role=tab]').length, value: JSON.stringify(c.value)};
    },
    "TabBar: setValue unknown": () => {
        const c = new MacUI.TabBar({items: [{value: 'a', label: 'A', icon: 'M0 0'}], value: 'a'});
        c.setValue('nope');
        return {value: c.value};
    },
    "SegmentedControl: one option": () => {
        const c = new MacUI.SegmentedControl({options: [{value: 'a', label: 'A'}]});
        return {value: c.value, items: c.element.querySelectorAll('.mac-segmented__item').length};
    },
    "Rating: max zero": () => {
        const c = new MacUI.Rating({value: 3, max: 0});
        return {now: c.element.getAttribute('aria-valuenow'),
                text: c.element.getAttribute('aria-valuetext'),
                stars: c.element.querySelectorAll('.mac-rating__star').length};
    },
    "Rating: value above max": () => {
        const c = new MacUI.Rating({value: 99, max: 5});
        return {now: c.element.getAttribute('aria-valuenow')};
    },
    "NumberField: NaN value": () => {
        const c = new MacUI.NumberField({value: Number.NaN});
        return {value: String(c.value)};
    },
    "ProgressRing: max zero": () => {
        const c = new MacUI.ProgressRing({value: 5, max: 0});
        return {now: c.element.getAttribute('aria-valuenow')};
    },
    "InlineNotice: dismiss twice": () => {
        const c = new MacUI.InlineNotice({message: 'm', dismissible: true});
        c.dismiss(); c.dismiss();
        return {hidden: c.element.hasAttribute('hidden')};
    },
    "CommandPalette: no items, then Enter": () => {
        const c = new MacUI.CommandPalette({items: []});
        c.open();
        const input = document.querySelector('.mac-commandpalette__input');
        input?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
        const stillOpen = !!document.querySelector('.mac-commandpalette');
        c.close();
        return {stillOpen};
    },
    "ActionSheet: open twice": () => {
        const c = new MacUI.ActionSheet({actions: [{value: 'a', label: 'A'}]});
        c.open(); c.open();
        const count = document.querySelectorAll('.mac-actionsheet').length;
        c.close(); c.close();
        return {count, after: document.querySelectorAll('.mac-actionsheet').length};
    },
    "destroy then use": () => {
        const c = new MacUI.List({items: [{value: 'a', label: 'A'}]});
        document.body.appendChild(c.element);
        c.destroy();
        c.setValue('a');
        return {destroyed: c.isDestroyed};
    },
};
</script></body></html>`;

const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/" || url === "/index.html") {
        res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
        return void res.end(PAGE);
    }
    const file = url === "/style.css" ? join(KIT, "dist", "style.css") : join(KIT, "dist", "macos-ui-kit.iife.js");
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
    "--headless=new", "--remote-debugging-port=9681", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot28")}`, "--window-size=900,700", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9681/json/list")).json(); if (targets.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
}
const page = targets.find((t) => t.type === "page") ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
});
await new Promise((r) => ws.on("open", r));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
await new Promise((r) => setTimeout(r, 2000));

const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (r?.exceptionDetails) return {__error: r.exceptionDetails.exception?.description};
    return r?.result?.value;
};

const results = await evalJs(`(() => {
    const out = [];
    for (const [name, fn] of Object.entries(window.__cases)) {
        const r = window.__run(fn);
        out.push({name, ok: r.ok, value: r.ok ? r.value : null, error: r.ok ? null : r.error});
    }
    return out;})()`);

const thrown = (results ?? []).filter((r) => !r.ok);
console.log(`cases: ${results?.length ?? 0}, threw: ${thrown.length}`);
for (const r of thrown) console.log(`THROW ${r.name}: ${r.error}`);

// Print every observation: the point of this audit is to read them, not to
// rubber-stamp a shape I guessed at.
for (const r of results ?? []) {
    if (!r.ok) continue;
    console.log(`--- ${r.name}`);
    console.log("    " + JSON.stringify(r.value));
}

console.log(`\nSUMMARY: ${(results ?? []).length} cases, ${thrown.length} threw`);
try { proc.kill(); } catch {}
server.close();
// Exit 0 on purpose: this script reports, it does not gate. The assertions that
// matter become permanent once the finding is fixed.
process.exit(0);
