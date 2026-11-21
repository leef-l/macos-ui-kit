// List reordering: pointer drag, Alt+Arrow, section adoption, and no regressions.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8411;
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
    "--headless=new", "--remote-debugging-port=9671", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot23")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9671/json/list")).json();
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

const CELL = (n) => `[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===${JSON.stringify(n)})`;

const state = async () => await evalJs(`(()=>{
    const c = ${CELL("List")};
    const box = c.querySelector('[role="listbox"]');
    const rows = [...c.querySelectorAll('.mac-list__row')];
    return {
        order: rows.map(r=>r.dataset.value),
        labels: rows.map(r=>r.querySelector('.mac-list__label').textContent.trim()),
        sections: [...c.querySelectorAll('.mac-list__section')].map(s=>s.textContent.trim()),
        dragging: rows.filter(r=>r.classList.contains('is-dragging')).length,
        indicators: rows.map(r=>r.classList.contains('is-drop-before')?'before':r.classList.contains('is-drop-after')?'after':null),
        reordering: c.querySelector('.mac-list').classList.contains('is-reordering'),
        reorderable: c.querySelector('.mac-list').classList.contains('mac-list--reorderable'),
        selected: rows.filter(r=>r.getAttribute('aria-selected')==='true').map(r=>r.dataset.value),
        focused: document.activeElement?.dataset?.value ?? null,
        readout: c.querySelector('.mac-showcase__state').textContent.trim(),
        boxRole: box.getAttribute('role'),
    };})()`);

// Scroll the list into view once; pointer coordinates are viewport coordinates.
await evalJs(`(()=>{${CELL("List")}.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 400));

const before = await state();
ok(before.reorderable === true, "the demo list opts into reordering", before.reorderable);
ok(JSON.stringify(before.order) === JSON.stringify(["inbox", "starred", "drafts", "archive", "trash"]),
    "the rows start in their data order", before.order);
ok(JSON.stringify(before.sections) === JSON.stringify(["邮箱", "其他"]),
    "two section headings", before.sections);

const rowBox = async (value) => await evalJs(`(()=>{
    const row = ${CELL("List")}.querySelector('.mac-list__row[data-value="${value}"]');
    const r = row.getBoundingClientRect();
    return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
            top: Math.round(r.top), h: Math.round(r.height)};})()`);

// --- a real drag -------------------------------------------------------------
{
    const from = await rowBox("starred");
    const to = await rowBox("trash");

    await send("Input.dispatchMouseEvent", {type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1});
    // Below the threshold: nothing may start yet.
    await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: from.x, y: from.y + 2, button: "left", buttons: 1});
    const below = await state();
    ok(below.dragging === 0 && below.reordering === false,
        "a two-pixel wobble is still a click, not a drag", {dragging: below.dragging});

    await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: to.x, y: to.top + 2, button: "left", buttons: 1});
    await new Promise((r) => setTimeout(r, 120));
    const mid = await state();
    ok(mid.dragging === 1, "past the threshold the row is marked as dragged", mid.dragging);
    ok(mid.reordering === true, "and the list says a reorder is in progress", mid.reordering);
    ok(mid.indicators.filter(Boolean).length === 1, "exactly one drop indicator is drawn", mid.indicators);

    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: to.x, y: to.top + 2, button: "left", clickCount: 1});
    await new Promise((r) => setTimeout(r, 250));

    const after = await state();
    ok(JSON.stringify(after.order) === JSON.stringify(["inbox", "drafts", "archive", "starred", "trash"]),
        "the dragged row lands where the indicator was", after.order);
    ok(after.dragging === 0 && after.indicators.every((i) => i === null),
        "the drag state and the indicator are cleared", {dragging: after.dragging});
    ok(after.sections.includes("其他"), "the section headings are still drawn", after.sections);
    ok(/顺序: .*trash/.test(after.readout ?? ""), "onReorder reported the new order", after.readout);
    ok(after.boxRole === "listbox", "the box is still a listbox after a rebuild", after.boxRole);
}

// --- keyboard ----------------------------------------------------------------
{
    const moved = await evalJs(`(async()=>{
        const c = ${CELL("List")};
        const box = c.querySelector('[role="listbox"]');
        const row = c.querySelector('.mac-list__row[data-value="drafts"]');
        row.focus();
        const fire=(k,opts={})=>box.dispatchEvent(Object.assign(new KeyboardEvent('keydown',Object.assign({key:k,bubbles:true,cancelable:true},opts)),{}));
        const order = ()=>[...c.querySelectorAll('.mac-list__row')].map(r=>r.dataset.value);
        const start = order();
        fire('ArrowDown',{altKey:true});
        await new Promise(r=>setTimeout(r,150));
        const down = order();
        const focusAfter = document.activeElement?.dataset?.value ?? null;
        fire('ArrowUp',{altKey:true});
        await new Promise(r=>setTimeout(r,150));
        const up = order();
        return {start, down, up, focusAfter,
                readout: c.querySelector('.mac-showcase__state').textContent.trim(),
                selected: [...c.querySelectorAll('.mac-list__row')].filter(r=>r.getAttribute('aria-selected')==='true').map(r=>r.dataset.value)};})()`);
    ok(moved.down.join(",") !== moved.start.join(","), "Alt+ArrowDown moves the focused row", {start: moved.start, after: moved.down});
    ok(moved.down.indexOf("drafts") === moved.start.indexOf("drafts") + 1,
        "it moves exactly one place down", {from: moved.start.indexOf("drafts"), to: moved.down.indexOf("drafts")});
    ok(moved.focusAfter === "drafts", "focus follows the row it moved", moved.focusAfter);
    ok(moved.up.join(",") === moved.start.join(","), "Alt+ArrowUp puts it back", moved.up);
    ok(JSON.stringify(moved.selected) === JSON.stringify(["inbox"]),
        "the selection is untouched by a reorder", moved.selected);

    const plain = await evalJs(`(async()=>{
        const c = ${CELL("List")};
        const box = c.querySelector('[role="listbox"]');
        const row = c.querySelector('.mac-list__row[data-value="drafts"]');
        row.focus();
        const order = ()=>[...c.querySelectorAll('.mac-list__row')].map(r=>r.dataset.value);
        const start = order();
        box.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,120));
        return {same: order().join(',') === start.join(','), focused: document.activeElement?.dataset?.value ?? null};})()`);
    ok(plain.same === true, "a plain arrow still only moves the focus", plain.same);
    ok(plain.focused !== null && plain.focused !== "drafts", "and it moved to a neighbouring row without reordering", plain.focused);
}

// --- disabled and section edges ---------------------------------------------
{
    const guard = await evalJs(`(async()=>{
        const c = ${CELL("List")};
        const box = c.querySelector('[role="listbox"]');
        const disabled = c.querySelector('.mac-list__row[data-value="archive"]');
        const order = ()=>[...c.querySelectorAll('.mac-list__row')].map(r=>r.dataset.value);
        const start = order();
        // A disabled row is not draggable: pressing it must not arm a gesture.
        const r = disabled.getBoundingClientRect();
        return {from: {x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2)}, start};})()`);
    await send("Input.dispatchMouseEvent", {type: "mousePressed", x: guard.from.x, y: guard.from.y, button: "left", clickCount: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: guard.from.x, y: guard.from.y - 40, button: "left", buttons: 1});
    const midDrag = await state();
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: guard.from.x, y: guard.from.y - 40, button: "left", clickCount: 1});
    await new Promise((r) => setTimeout(r, 150));
    const afterDisabled = await state();
    ok(midDrag.dragging === 0, "a disabled row cannot be dragged", midDrag.dragging);
    ok(JSON.stringify(afterDisabled.order) === JSON.stringify(guard.start),
        "and the order is untouched", afterDisabled.order);

    const section = await evalJs(`(async()=>{
        const c = ${CELL("List")};
        const box = c.querySelector('[role="listbox"]');
        const row = c.querySelector('.mac-list__row[data-value="inbox"]');
        row.focus();
        for (let i=0;i<3;i++) { box.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));
            await new Promise(r=>setTimeout(r,90)); }
        const rows = [...c.querySelectorAll('.mac-list__row')];
        const order = rows.map(r=>r.dataset.value);
        const sections = [...c.querySelectorAll('.mac-list__section')].map(s=>s.textContent.trim());
        return {order, sections, at: order.indexOf('inbox')};})()`);
    ok(section.at > 0, "the row crossed into the second group", section);
    ok(section.sections.length === 2, "both headings survive the crossing", section.sections);
}

// --- selection still works ---------------------------------------------------
{
    const click = await evalJs(`(async()=>{
        const c = ${CELL("List")};
        const row = c.querySelector('.mac-list__row[data-value="trash"]');
        row.click();
        await new Promise(r=>setTimeout(r,120));
        return {selected: [...c.querySelectorAll('.mac-list__row')].filter(r=>r.getAttribute('aria-selected')==='true').map(r=>r.dataset.value),
                tabs: [...c.querySelectorAll('.mac-list__row')].filter(r=>r.tabIndex===0).length};})()`);
    ok(JSON.stringify(click.selected) === JSON.stringify(["trash"]), "clicking a row still selects it", click.selected);
    ok(click.tabs === 1, "the list still has exactly one tab stop", click.tabs);
}

await evalJs(`(()=>{${CELL("List")}.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 350));
{
    const b = await evalJs(`(()=>{const r=(${CELL("List")}).getBoundingClientRect();
        return {x:Math.round(r.left+window.scrollX)-10,y:Math.round(r.top+window.scrollY)-10,
                w:Math.round(r.width)+20,h:Math.round(r.height)+20};})()`);
    const s = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true,
        clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale: 2}});
    if (s?.data) { writeFileSync(join(process.cwd(), "p8-list-reorder.png"), Buffer.from(s.data, "base64")); console.log("saved p8-list-reorder.png"); }
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
