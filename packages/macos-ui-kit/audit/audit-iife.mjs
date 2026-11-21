// IIFE smoke test: load dist/macos-ui-kit.iife.js in a real engine and assert that
// every exported component is a constructible class, with no console errors.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {spawn} from "node:child_process";
import WebSocket from "ws";

const KIT = "C:\\project\\test\\myapp\\packages\\macos-ui-kit";
const PORT = 8397;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css">
</head><body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
  window.__probe = (() => {
    const api = window.MacUI;
    if (!api) return {error: "window.MacUI is missing"};
    const classes = [];
    const others = [];
    for (const key of Object.keys(api)) {
      if (typeof api[key] === "function" && /^[A-Z]/.test(key)) classes.push(key);
      else others.push(key);
    }
    return {classes, others, total: Object.keys(api).length};
  })();
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
    "--headless=new", "--remote-debugging-port=9657", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot16")}`, "--window-size=900,700", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9657/json/list")).json(); if (targets.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 250));
}
const page = targets.find((t) => t.type === "page") ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
const errors = [];
ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params?.exceptionDetails?.exception?.description ?? "exception");
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
        errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    }
});
await new Promise((r) => ws.on("open", r));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
await new Promise((r) => setTimeout(r, 2500));

const evalJs = async (e) => {
    const r = await send("Runtime.evaluate", {expression: e, returnByValue: true, awaitPromise: true});
    if (r?.exceptionDetails) return {__error: r.exceptionDetails.exception?.description};
    return r?.result?.value;
};

let pass = 0;
let fail = 0;
const ok = (cond, label, detail) => {
    if (cond) { pass++; console.log(`OK   ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
    else { fail++; console.log(`FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
};

const probe = await evalJs(`window.__probe`);
console.log("CLASSES:", JSON.stringify(probe?.classes));
ok(!probe?.error, "the IIFE registered window.MacUI", probe?.error ?? probe?.total);

// The full surface of the bundle: 59 components, plus the three infrastructure
// classes that are exported alongside them (`Component` the base class,
// `ThemeManager`, and `FormRow` the row a Form is built from).
const EXPECTED = [
    "ActionSheet", "Alert", "Avatar", "Badge", "Breadcrumb", "Button", "Calendar", "Card",
    "Checkbox", "ColorWell", "ComboBox", "CommandPalette", "Component", "ContextMenu", "DatePicker",
    "Dialog", "Disclosure", "Divider", "EmptyState", "Form", "FormRow", "InlineNotice", "Kbd",
    "LevelIndicator", "List", "Menu", "MobileShell", "NumberField", "Pagination", "Popover",
    "Progress", "ProgressRing", "RadioGroup", "RangeSlider", "Rating", "SearchField",
    "SegmentedControl", "Select", "Sheet", "Sidebar", "Skeleton", "Slider", "Spinner", "SplitButton",
    "SplitView", "StatusBar", "Stepper", "Switch", "TabBar", "TabView", "Table", "TagInput",
    "TextArea", "TextField", "ThemeManager", "TimePicker", "TitleBar", "Toast", "Toolbar",
    "Tooltip", "TrafficLights", "TreeView",
];

const classes = probe?.classes ?? [];
const missing = EXPECTED.filter((n) => !classes.includes(n));
ok(missing.length === 0, "every exported name is present in the bundle", missing);
ok(classes.length === EXPECTED.length,
    `the bundle exposes exactly ${EXPECTED.length} component classes`, classes.length);
ok(Array.isArray(probe?.others) && probe.others.length > 0,
    "the non-class exports (theme, density, toasts) are there too", probe?.others);

// Every declared component must construct and mount without throwing.
const mounted = await evalJs(`(async () => {
    const host = document.getElementById("host");
    const api = window.MacUI;
    const built = [];
    const failed = [];
    for (const name of ${JSON.stringify(EXPECTED)}) {
        // Two are not mountable: the abstract base class has no element, and
        // ThemeManager writes tokens onto the document rather than owning a node.
        if (name === "Component" || name === "ThemeManager") continue;
        const Ctor = api[name];
        if (typeof Ctor !== "function") { failed.push(name + ": not a constructor"); continue; }
        // Components whose constructor takes required options get the minimum that
        // makes sense; the rest are default-constructible.
        const div = () => document.createElement("div");
        const withArgs = {
            Table: {columns: [{key: "a", title: "A"}], rows: []},
            List: {items: [{value: "a", label: "A"}]},
            Form: {fields: []},
            FormRow: {label: "A", control: div()},
            TabView: {tabs: [{value: "a", label: "A", content: div()}]},
            Sidebar: {groups: [{items: [{value: "a", label: "A"}]}]},
            SegmentedControl: {options: [{value: "a", label: "A"}]},
            RadioGroup: {options: [{value: "a", label: "A"}]},
            Select: {options: [{value: "a", label: "A"}]},
            ComboBox: {options: [{value: "a", label: "A"}]},
            Toolbar: {items: []},
            Menu: {items: [{value: "a", label: "A"}]},
            ContextMenu: {items: [{value: "a", label: "A"}]},
            Breadcrumb: {items: [{label: "A"}]},
            Pagination: {total: 10},
            CommandPalette: {items: []},
            TreeView: {nodes: [{value: "a", label: "A"}]},
            TabBar: {items: [{value: "a", label: "A", icon: "M0 0"}]},
            ActionSheet: {actions: [{value: "a", label: "A"}]},
            MobileShell: {content: div()},
            Avatar: {name: "Ann"},
            Kbd: {keys: ["⌘", "K"]},
            Popover: {content: div()},
            Alert: {title: "A", message: "B"},
            TitleBar: {},
            TrafficLights: {},
            StatusBar: {},
        };
        try {
            const instance = new Ctor(withArgs[name] ?? {});
            const el = instance.element ?? instance;
            if (!(el instanceof HTMLElement)) { failed.push(name + ": no element"); continue; }
            host.appendChild(el);
            built.push(name);
        } catch (error) {
            failed.push(name + ": " + error.message);
        }
    }
    return {built: built.length, failed, hostChildren: host.children.length};
})()`);
ok(mounted.failed?.length === 0, "every component constructs and mounts", mounted.failed);
ok(mounted.built === EXPECTED.length - 2, "all of them produced an element", mounted.built);

ok(errors.length === 0, "no console errors while building the whole kit", errors.slice(0, 5));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
