// State consistency: after any write, the getter, the ARIA attribute and the
// rendered DOM have to say the same thing.
//
// This is the class of bug a screenshot cannot show and a demo never hits: the
// value looks right in code, the screen looks right, and the two disagree. Each
// case writes once and reports all three views; the assertions live here in Node
// so the expectation is not written by the same code that produces the answer.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8423;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"></head>
<body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
const $ = (sel, root) => root.querySelector(sel);
window.__cases = {
    Slider: () => {
        const c = new MacUI.Slider({value: 10});
        document.body.appendChild(c.element);
        c.setValue(72);
        const input = $('input[type=range]', c.element);
        return {getter: String(c.value), aria: input?.getAttribute('aria-valuenow') ?? String(input?.value),
                dom: input?.value ?? null};
    },
    Progress: () => {
        const c = new MacUI.Progress({value: 10});
        document.body.appendChild(c.element);
        c.setValue(72);
        // The painted width is a percentage string; dividing pixel widths by the
        // root box counted its padding and read 100% for every value.
        // The fill is full width and scaled on X (so a change animates without a
        // layout pass), which means the painted value lives in a custom property.
        const fill = $('.mac-progress__fill', c.element);
        const scale = fill ? parseFloat(fill.style.getPropertyValue('--mac-progress-scale')) : NaN;
        return {getter: String(c.value), aria: c.element.getAttribute('aria-valuenow'),
                dom: Number.isFinite(scale) ? String(Math.round(scale * 100)) : null};
    },
    Rating: () => {
        const c = new MacUI.Rating({value: 1, max: 5});
        document.body.appendChild(c.element);
        c.setValue(4);
        const clips = [...c.element.querySelectorAll('.mac-rating__clip')]
            .map((x) => parseFloat(x.style.getPropertyValue('--mac-rating-fill')) || 0);
        return {getter: String(c.value), aria: c.element.getAttribute('aria-valuenow'),
                dom: String(clips.filter((p) => p === 100).length)};
    },
    Stepper: () => {
        const c = new MacUI.Stepper({value: 1, min: 0, max: 10});
        document.body.appendChild(c.element);
        c.setValue(7);
        return {getter: String(c.value), aria: c.element.getAttribute('aria-valuenow'), dom: null};
    },
    Checkbox: () => {
        const c = new MacUI.Checkbox({label: 'x', checked: false});
        document.body.appendChild(c.element);
        c.setChecked(true);
        const input = $('input[type=checkbox]', c.element);
        return {getter: String(c.checked), aria: input?.getAttribute('aria-checked') ?? String(input?.checked),
                dom: String(input?.checked)};
    },
    Switch: () => {
        const c = new MacUI.Switch({checked: false});
        document.body.appendChild(c.element);
        c.setChecked(true);
        // The root IS the switch: querySelector only looks at descendants.
        const box = c.element.matches('[role=switch], input') ? c.element : $('[role=switch], input', c.element);
        return {getter: String(c.checked), aria: box?.getAttribute('aria-checked') ?? String(box?.checked),
                dom: String(box?.getAttribute('aria-checked') ?? box?.checked)};
    },
    List: () => {
        const items = [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}, {value: 'c', label: 'C'}];
        const c = new MacUI.List({items, value: 'a'});
        document.body.appendChild(c.element);
        c.setValue('c');
        const aria = [...c.element.querySelectorAll('[role=option]')]
            .filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.dataset.value);
        const dom = [...c.element.querySelectorAll('.mac-list__row')]
            .filter((x) => x.classList.contains('is-selected')).map((x) => x.dataset.value);
        return {getter: String(c.value), aria: aria.join(','), dom: dom.join(',')};
    },
    TabBar: () => {
        const items = [{value: 'a', label: 'A', icon: 'M0 0'}, {value: 'b', label: 'B', icon: 'M0 0'}];
        const c = new MacUI.TabBar({items, value: 'a'});
        document.body.appendChild(c.element);
        c.setValue('b');
        const aria = [...c.element.querySelectorAll('[role=tab]')]
            .filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.dataset.value);
        return {getter: String(c.value), aria: aria.join(','), dom: aria.join(',')};
    },
    TabView: () => {
        const c = new MacUI.TabView({tabs: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], selected: 'a'});
        document.body.appendChild(c.element);
        c.setSelected('b');
        const aria = [...c.element.querySelectorAll('[role=tab]')]
            .filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.dataset.id);
        // The visible panel names the tab it belongs to through aria-labelledby:
        // that is the DOM side of the selection, not how many panels show.
        const panel = [...c.element.querySelectorAll('[role=tabpanel]')].find((x) => !x.hidden);
        const labelledBy = panel?.getAttribute('aria-labelledby');
        const domId = labelledBy ? document.getElementById(labelledBy)?.dataset.id ?? null : null;
        return {getter: String(c.selected), aria: aria.join(','), dom: domId};
    },
    Select: () => {
        const c = new MacUI.Select({options: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}], value: 'a'});
        document.body.appendChild(c.element);
        c.setValue('b');
        const sel = $('select', c.element);
        return {getter: String(c.value), aria: String(sel?.value),
                dom: sel?.selectedOptions?.[0]?.value ?? null};
    },
    SegmentedControl: () => {
        const c = new MacUI.SegmentedControl({options: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}], value: 'a'});
        document.body.appendChild(c.element);
        c.setValue ? c.setValue('b') : c.setSelected?.('b');
        const checked = [...c.element.querySelectorAll('[aria-checked=true], .is-selected')]
            .map((x) => x.dataset.value)[0];
        return {getter: String(c.value), aria: checked ?? null, dom: checked ?? null};
    },
    TreeView: () => {
        const c = new MacUI.TreeView({
            nodes: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}], value: 'a',
        });
        document.body.appendChild(c.element);
        c.setValue('b');
        const aria = [...c.element.querySelectorAll('[role=treeitem]')]
            .filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.dataset.value);
        const dom = [...c.element.querySelectorAll('.mac-treeview__row.is-selected')].map((x) => x.dataset.value);
        return {getter: String(c.value), aria: aria.join(','), dom: dom.join(',')};
    },
    RangeSlider: () => {
        const c = new MacUI.RangeSlider({value: [20, 80]});
        document.body.appendChild(c.element);
        if (typeof c.setValue === 'function') c.setValue([30, 70]);
        else c.setValues?.(30, 70);
        const inputs = [...c.element.querySelectorAll('input[type=range]')].map((x) => x.value);
        return {getter: c.value.join(','), aria: inputs.join(','), dom: inputs.join(',')};
    },
    TimePicker: () => {
        const c = new MacUI.TimePicker({value: '09:00'});
        document.body.appendChild(c.element);
        c.setValue('14:45');
        const input = $('input', c.element);
        return {getter: String(c.value), aria: String(input?.value), dom: String(input?.value)};
    },
    ColorWell: () => {
        const c = new MacUI.ColorWell({value: '#ff0000'});
        document.body.appendChild(c.element);
        c.setValue('#00ff00');
        const swatch = $('.mac-colorwell__swatch', c.element);
        const painted = getComputedStyle(swatch).backgroundColor;
        // The custom property is the value the swatch was given; the computed
        // colour is the same thing in rgb(), so compare like with like.
        const probe = document.createElement('span');
        probe.style.color = c.value;
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return {getter: String(c.value), aria: String(c.element.querySelector('input').value),
                dom: painted === expected ? String(c.value) : painted};
    },
};
</script></body></html>`;

const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/" || url === "/index.html") {
        res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
        return void res.end(PAGE);
    }
    const file = url === "/style.css" ? join(KIT, "dist", "macos-ui-kit.css") : join(KIT, "dist", "macos-ui-kit.iife.js");
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
    "--headless=new", "--remote-debugging-port=9683", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot29")}`, "--window-size=1000,800", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9683/json/list")).json(); if (targets.length) break; } catch {}
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

const results = await evalJs(`(async () => {
    const out = [];
    const host = document.getElementById('host');
    for (const [name, fn] of Object.entries(window.__cases)) {
        try { out.push({name, ...fn()}); }
        catch (error) { out.push({name, error: String(error && error.message || error)}); }
        host.replaceChildren();
        document.body.querySelectorAll('.mac-dialog, .mac-actionsheet, .mac-menu').forEach((n) => n.remove());
    }
    return out;})()`);

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
    if (cond) { pass++; console.log(`OK   ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
    else { fail++; console.log(`FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
};

const broken = (results ?? []).filter((r) => r.error);
ok(broken.length === 0, "every case ran", broken.map((r) => `${r.name}: ${r.error}`));

for (const r of results ?? []) {
    if (r.error) continue;
    const agree = r.getter === r.aria && (r.dom === null || r.dom === r.getter);
    ok(agree, `${r.name}: getter, aria and DOM agree`, {getter: r.getter, aria: r.aria, dom: r.dom});
}

console.log(`\n${pass} assertions passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail > 0 ? 1 : 0);
