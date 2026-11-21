// Keyboard consistency across the whole showcase: no traps, one tab stop per
// collection, Home/End everywhere a collection exists, arrows that do not scroll.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8417;
const BASE = "/macos-ui-kit/";
const TY = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ttf": "font/ttf"};

const server = createServer(async (req, res) => {
    let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    p = p.startsWith(BASE) ? p.slice(BASE.length - 1) : "/";
    const rel = p === "/" || p === "" ? "index.html" : p.replace(/^\/+/, "");
    const f = normalize(join(ROOT, rel));
    if (!f.startsWith(ROOT)) return void res.writeHead(403).end();
    try {
        res.writeHead(200, {"content-type": TY[extname(f)] ?? "application/octet-stream"});
        res.end(await readFile(f));
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const proc = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--remote-debugging-port=9677", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot26")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9677/json/list")).json();
        if (targets.length) break;
    } catch {}
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
    if (m.method === "Runtime.exceptionThrown") {
        consoleErrors.push(m.params?.exceptionDetails?.exception?.description ?? "exception");
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
        consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    }
});
await new Promise((r) => ws.on("open", r));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false});
await send("Page.navigate", {url: `http://127.0.0.1:${PORT}${BASE}`});
await new Promise((r) => setTimeout(r, 3400));

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

const key = async (name, code, vk, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", {type: "rawKeyDown", key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers});
    await send("Input.dispatchKeyEvent", {type: "keyUp", key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers});
};

// --- 1. Tab does not trap ----------------------------------------------------
{
    // Identity, not a signature: two switches share the class `mac-switch`, and a
    // date field keeps `document.activeElement` across its own segments, so a
    // name comparison reports a stall where there is none.
    await evalJs(`(()=>{ let n = 0; window.__tabId = (el) => (el.__tabId ??= ++n); return true; })()`);
    const trail = [];
    for (let i = 0; i < 140; i++) {
        const before = await evalJs(`(()=>{
            const el = document.activeElement;
            return el ? window.__tabId(el) : null;})()`);
        await key("Tab", "Tab", 9);
        const after = await evalJs(`(()=>{
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            return {
                id: window.__tabId(el),
                sig: el.id || el.getAttribute('aria-label') || (el.className||'').toString() || el.tagName,
                inGrid: !!el.closest('.mac-showcase__grid'),
                // Chrome walks the segments of a date input without moving
                // activeElement, so those repeats are the engine's, not a trap.
                segmented: (el.getAttribute('type') || '') === 'date' || (el.getAttribute('type') || '') === 'time',
            };})()`);
        if (!after) break;
        trail.push({before, after});
    }
    const stalls = trail.filter((step) => step.before === step.after.id && !step.after.segmented);
    ok(trail.length >= 60, "the tab walk found plenty of stops", trail.length);
    ok(stalls.length === 0, "Tab never gets stuck on one element", stalls.slice(0, 6).map((s) => s.after.sig));
    const inGrid = trail.filter((step) => step.after.inGrid).length;
    ok(inGrid >= 40, "most of the walk is inside the showcase", inGrid);
    console.log("     stops:", trail.length, "in grid:", inGrid);
}

// --- 2. one tab stop per collection -----------------------------------------
{
    const collections = await evalJs(`(()=>{
        const roles = ['listbox','tablist','radiogroup','tree','grid'];
        const out = [];
        for (const el of document.querySelectorAll('.mac-showcase__grid [role]')) {
            if (!roles.includes(el.getAttribute('role'))) continue;
            const items = [...el.querySelectorAll('[role="option"],[role="tab"],[role="radio"],[role="treeitem"],[role="row"]')];
            if (items.length < 2) continue;
            out.push({
                role: el.getAttribute('role'),
                cls: (el.className||'').toString().slice(0,34),
                items: items.length,
                tabStops: items.filter(i=>i.tabIndex===0).length,
            });
        }
        return out;})()`);
    // At most one: a combobox popup and a calendar grid deliberately keep focus on
    // their single control and are navigated from there.
    const bad = collections.filter((c) => c.tabStops > 1);
    ok(collections.length >= 5, "the showcase has several collections", collections.length);
    ok(bad.length === 0, "no collection is a multi-stop tab run", bad);
    console.log("     collections:", collections.map((c) => `${c.role}:${c.items}/${c.tabStops}`).join(" "));
}

// --- 3. Home and End in every collection ------------------------------------
{
    const spots = [
        ['List', '.mac-list__row', 'data-value'],
        ['TabBar', '.mac-tabbar__item', 'data-value'],
        ['TabView', '.mac-tabview__tab', 'data-id'],
        ['SegmentedControl', '.mac-segmented__item', 'data-value'],
    ];
    for (const [name, selector, attr] of spots) {
        const result = await evalJs(`(async()=>{
            const cell = [...document.querySelectorAll('.mac-showcase__grid > *')]
                .find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===${JSON.stringify(name)});
            if (!cell) return {missing: true};
            const items = [...cell.querySelectorAll(${JSON.stringify(selector)})];
            if (items.length < 2) return {missing: true};
            const host = items[0].parentElement;
            const fire = (k) => host.dispatchEvent(new KeyboardEvent('keydown', {key:k, bubbles:true, cancelable:true}));
            items[0].focus();
            fire('End');
            await new Promise(r=>setTimeout(r,120));
            const atEnd = items.indexOf(document.activeElement);
            fire('Home');
            await new Promise(r=>setTimeout(r,120));
            const atHome = items.indexOf(document.activeElement);
            return {count: items.length, atEnd, atHome,
                    last: items.length - 1,
                    focusedIsItem: items.includes(document.activeElement)};})()`);
        if (result.missing) { ok(false, `${name}: collection not found`); continue; }
        ok(result.focusedIsItem, `${name}: focus stays on an item`, result.focusedIsItem);
        ok(result.atEnd === result.last, `${name}: End jumps to the last item`, {at: result.atEnd, last: result.last});
        ok(result.atHome === 0, `${name}: Home jumps back to the first`, result.atHome);
    }
}

// --- 4. arrows move focus without scrolling the page ------------------------
{
    const scroll = await evalJs(`(async()=>{
        const cell = [...document.querySelectorAll('.mac-showcase__grid > *')]
            .find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()==='List');
        cell.scrollIntoView({block:'center'});
        await new Promise(r=>setTimeout(r,300));
        const items = [...cell.querySelectorAll('.mac-list__row')];
        const host = items[0].parentElement;
        items[0].focus();
        const before = window.scrollY;
        let scrolledDuring = 0;
        const seen = [];
        for (let i=0;i<4;i++) {
            host.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
            await new Promise(r=>setTimeout(r,80));
            if (window.scrollY !== before) scrolledDuring++;
            seen.push(items.indexOf(document.activeElement));
        }
        return {before, scrolledDuring, seen, after: window.scrollY};})()`);
    ok(scroll.scrolledDuring === 0, "arrow keys move focus without scrolling the page", scroll);
    ok(new Set(scroll.seen).size >= 3, "and presses move down the rows until the end", scroll.seen);
}

// --- 5. Escape returns focus to the trigger ---------------------------------
{
    const esc = await evalJs(`(async()=>{
        const cell = [...document.querySelectorAll('.mac-showcase__grid > *')]
            .find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()==='CommandPalette');
        const trigger = cell.querySelector('button');
        trigger.focus();
        trigger.click();
        await new Promise(r=>setTimeout(r,260));
        const opened = !!document.querySelector('.mac-commandpalette');
        const input = document.querySelector('.mac-commandpalette__input');
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,260));
        return {opened, closed: !document.querySelector('.mac-commandpalette'),
                back: document.activeElement === trigger};})()`);
    ok(esc.opened && esc.closed, "an overlay opens and closes with Escape", esc);
    ok(esc.back === true, "and focus comes back to its trigger", esc.back);
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
