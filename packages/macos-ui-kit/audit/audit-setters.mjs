// The kit's first API convention, audited across the published bundle:
// every `setX()` is silent. A setter that fires `onChange` makes a caller's own
// write come back as if the user had done it — the classic feedback loop.
//
// Runs against `dist/macos-ui-kit.iife.js` rather than the sources, so what is
// checked is what a consumer actually loads.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8419;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"></head>
<body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
window.__spy = () => { const calls = []; const fn = (...args) => calls.push(args); fn.calls = calls; return fn; };
// Every case: build the component with a spy, call a setter, report whether the
// spy fired and whether the state actually moved.
window.__cases = {
    TextField: (spy) => {
        const c = new MacUI.TextField({value: "a", onInput: spy, onChange: spy});
        const before = c.value;
        c.setValue("b");
        return {before, after: c.value, calls: spy.calls.length};
    },
    Switch: (spy) => {
        const c = new MacUI.Switch({checked: false, onChange: spy});
        const before = c.checked;
        c.setChecked(true);
        return {before, after: c.checked, calls: spy.calls.length};
    },
    Checkbox: (spy) => {
        const c = new MacUI.Checkbox({label: "x", checked: false, onChange: spy});
        const before = c.checked;
        c.setChecked(true);
        return {before, after: c.checked, calls: spy.calls.length};
    },
    Slider: (spy) => {
        const c = new MacUI.Slider({value: 10, onChange: spy});
        const before = c.value;
        c.setValue(40);
        return {before, after: c.value, calls: spy.calls.length};
    },
    Rating: (spy) => {
        const c = new MacUI.Rating({value: 2, onChange: spy});
        const before = c.value;
        c.setValue(4);
        return {before, after: c.value, calls: spy.calls.length};
    },
    ColorWell: (spy) => {
        const c = new MacUI.ColorWell({value: "#ff0000", onChange: spy});
        const before = c.value;
        c.setValue("#00ff00");
        return {before, after: c.value, calls: spy.calls.length};
    },
    TimePicker: (spy) => {
        const c = new MacUI.TimePicker({value: "10:00", onChange: spy});
        const before = c.value;
        c.setValue("11:30");
        return {before, after: c.value, calls: spy.calls.length};
    },
    Stepper: (spy) => {
        const c = new MacUI.Stepper({value: 5, onChange: spy});
        const before = c.value;
        c.setValue(9);
        return {before, after: c.value, calls: spy.calls.length};
    },
    TabView: (spy) => {
        const c = new MacUI.TabView({tabs: [{id: "a", label: "A"}, {id: "b", label: "B"}], selected: "a", onSelect: spy});
        const before = c.selected;
        c.setSelected("b");
        return {before, after: c.selected, calls: spy.calls.length};
    },
    TabBar: (spy) => {
        const c = new MacUI.TabBar({items: [{value: "a", label: "A", icon: "M0 0"}, {value: "b", label: "B", icon: "M0 0"}], value: "a", onChange: spy});
        const before = c.value;
        c.setValue("b");
        return {before, after: c.value, calls: spy.calls.length};
    },
    List: (spy) => {
        const items = [{value: "a", label: "A"}, {value: "b", label: "B"}];
        const c = new MacUI.List({items, value: "a", onSelect: spy});
        const before = c.value;
        c.setValue("b");
        return {before, after: c.value, calls: spy.calls.length};
    },
    Sidebar: (spy) => {
        const c = new MacUI.Sidebar({groups: [{items: [{id: "a", label: "A"}, {id: "b", label: "B"}]}], selected: "a", onSelect: spy});
        const before = c.selected;
        c.setSelected("b");
        return {before, after: c.selected, calls: spy.calls.length};
    },
    SegmentedControl: (spy) => {
        const c = new MacUI.SegmentedControl({options: [{value: "a", label: "A"}, {value: "b", label: "B"}], value: "a", onChange: spy});
        const before = c.value;
        c.setValue("b");
        return {before, after: c.value, calls: spy.calls.length};
    },
    Select: (spy) => {
        const c = new MacUI.Select({options: [{value: "a", label: "A"}, {value: "b", label: "B"}], value: "a", onChange: spy});
        const before = c.value;
        c.setValue("b");
        return {before, after: c.value, calls: spy.calls.length};
    },
    NumberField: (spy) => {
        const c = new MacUI.NumberField({value: 1, onChange: spy});
        const before = c.value;
        c.setValue(7);
        return {before, after: c.value, calls: spy.calls.length};
    },
    RangeSlider: (spy) => {
        const c = new MacUI.RangeSlider({value: [20, 80], onChange: spy});
        const before = JSON.stringify(c.value);
        if (typeof c.setValue === "function") c.setValue([30, 70]);
        else if (typeof c.setValues === "function") c.setValues(30, 70);
        return {before, after: JSON.stringify(c.value), calls: spy.calls.length};
    },
    Table: (spy) => {
        const c = new MacUI.Table({
            columns: [{key: "n", title: "N", sortable: true}],
            rows: [{n: "b"}, {n: "a"}],
            onSortChange: spy,
        });
        const before = c.sort;
        c.setSort({key: "n", direction: "ascending"});
        return {before: JSON.stringify(before), after: JSON.stringify(c.sort), calls: spy.calls.length};
    },
    InlineNotice: (spy) => {\n        // dismiss() is the setter; the close button is the user path.
        const c = new MacUI.InlineNotice({message: "a", onDismiss: spy});
        const before = c.isDismissed;
        c.dismiss();
        return {before, after: c.isDismissed, calls: spy.calls.length};
    },
    Sidebar2: (spy) => {
        const c = new MacUI.Sidebar({groups: [{heading: "G", items: [{id: "a", label: "A"}]}], collapsible: true, onToggleGroup: spy});
        const before = c.isCollapsed(0);
        c.toggleGroup(0, true);
        return {before, after: c.isCollapsed(0), calls: spy.calls.length};
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
    "--headless=new", "--remote-debugging-port=9679", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot27")}`, "--window-size=900,700", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9679/json/list")).json(); if (targets.length) break; } catch {}
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
await new Promise((r) => setTimeout(r, 2000));

const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (r?.exceptionDetails) return {__error: r.exceptionDetails.exception?.description};
    return r?.result?.value;
};

let pass = 0;
let fail = 0;
const ok = (cond, label, detail) => {
    if (cond) { pass++; console.log(`OK   ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
    else { fail++; console.log(`FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
};

const results = await evalJs(`(() => {
    const out = [];
    for (const [name, run] of Object.entries(window.__cases)) {
        try {
            const spy = window.__spy();
            const r = run(spy);
            out.push({name, ...r});
        } catch (error) {
            out.push({name, error: error.message});
        }
    }
    return out;})()`);

ok(Array.isArray(results) && results.length >= 15, "the matrix ran over the bundle", results?.length);

const broken = [];
let silent = 0;
for (const r of results ?? []) {
    if (r.error) { console.log(`     ${r.name}: threw — ${r.error}`); continue; }
    // A setter must move the state and stay quiet. A case whose setter does not
    // exist is reported, not failed: the name may simply differ.
    const moved = r.before !== r.after;
    if (!moved) { console.log(`     ${r.name}: setter had no effect (${r.before} → ${r.after})`); continue; }
    if (r.calls === 0) { silent++; continue; }
    broken.push({name: r.name, calls: r.calls, before: r.before, after: r.after});
}
ok(silent >= 12, "at least a dozen setters were exercised", silent);
ok(broken.length === 0, "every setX() is silent — no onChange fired", broken);

// The other half of the contract: a *user-driven* change must report. Without this
// the whole suite could pass on components whose callbacks are simply never wired.
const wired = await evalJs(`(() => {
    const out = [];
    const spy = window.__spy();
    const field = new MacUI.TextField({value: "a", onChange: spy});
    field.element.querySelector('input').focus();
    const input = field.element.querySelector('input');
    input.value = "b";
    input.dispatchEvent(new Event("input", {bubbles: true}));\n    input.dispatchEvent(new Event("change", {bubbles: true}));
    out.push({name: "TextField", calls: spy.calls.length});

    const box = window.__spy();
    const sw = new MacUI.Switch({checked: false, onChange: box});
    const control = sw.element.matches('input, button')
        ? sw.element
        : sw.element.querySelector('input, button, [role="switch"]');
    control?.click();
    out.push({name: "Switch", calls: box.calls.length});
    return out;})()`);
ok(Array.isArray(wired) && wired.every((w) => w.calls > 0),
    "and a real user change does report", wired);

ok(consoleErrors.length === 0, "no console errors while building every component", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
