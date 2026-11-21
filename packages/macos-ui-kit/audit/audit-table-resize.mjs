// Table column resizing: drag, keys, reset, floor, and what it must not disturb.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8407;
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
    "--headless=new", "--remote-debugging-port=9667", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot21")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9667/json/list")).json();
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

// Scroll the table into view first: pointer coordinates are viewport coordinates.
await evalJs(`(()=>{const c=${CELL("Table")}; c.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 500));

const geometry = async () => await evalJs(`(()=>{
    const c = ${CELL("Table")};
    const table = c.querySelector('.mac-table');
    const cols = [...table.querySelectorAll('.mac-table__col')];
    const ths = [...table.querySelectorAll('thead th')];
    const handles = [...table.querySelectorAll('.mac-table__resizer')];
    return {
        fixed: table.classList.contains('mac-table--fixed'),
        colWidths: cols.map(col=>Math.round(col.getBoundingClientRect().width)),
        thWidths: ths.map(th=>Math.round(th.getBoundingClientRect().width)),
        handles: handles.length,
        handleCols: handles.map(h=>Number(h.dataset.col)),
        handleRoles: handles.map(h=>h.getAttribute('role')),
        handleValues: handles.map(h=>h.getAttribute('aria-valuenow')),
        handleLabels: handles.map(h=>h.getAttribute('aria-label')),
        // The root is the outer box; the table is the element whose width the
        // resize pass sets, so that is the one that has to grow.
        tableWidth: Math.round(table.querySelector('.mac-table__table').getBoundingClientRect().width),
        cursor: handles[0] ? getComputedStyle(handles[0]).cursor : null,
        touchAction: handles[0] ? getComputedStyle(handles[0]).touchAction : null,
    };})()`);

const before = await geometry();
ok(before.fixed === true, "a resizable table lays out with fixed columns", before.fixed);
ok(before.handles === 7, "every non-action column gets a divider (8 columns, minus actions)", before.handles);
ok(JSON.stringify(before.handleCols) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
    "the dividers address their columns by index, skipping the action column", before.handleCols);
ok(before.handleRoles.every((r) => r === "separator"), "each divider is a separator", before.handleRoles);
ok(before.handleValues.every((v) => Number(v) >= 56), "each announces its column width", before.handleValues);
ok(before.handleLabels[0].includes("名称"), "each is named after its column", before.handleLabels[0]);
ok(before.cursor === "col-resize", "the divider offers the resize cursor", before.cursor);
ok(before.touchAction === "none", "a finger drags the divider instead of scrolling", before.touchAction);

// --- drag with a real pointer -------------------------------------------------
{
    const box = await evalJs(`(()=>{
        const h = ${CELL("Table")}.querySelector('.mac-table__resizer[data-col="0"]');
        const r = h.getBoundingClientRect();
        return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};})()`);

    await send("Input.dispatchMouseEvent", {type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: box.x + 40, y: box.y, button: "left", buttons: 1});
    const mid = await evalJs(`(()=>{
        const c = ${CELL("Table")};
        const t = c.querySelector('.mac-table');
        const h = t.querySelector('.mac-table__resizer[data-col="0"]');
        return {resizing: t.classList.contains('is-resizing'),
                dragging: h.classList.contains('is-dragging'),
                capture: h.hasPointerCapture ? true : null};})()`);
    ok(mid.resizing === true, "the table enters its resize state while dragging", mid.resizing);
    ok(mid.dragging === true, "the divider shows that it is the one being dragged", mid.dragging);

    await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: box.x + 80, y: box.y, button: "left", buttons: 1});
    await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: box.x + 80, y: box.y, button: "left", clickCount: 1});
    await new Promise((r) => setTimeout(r, 250));

    const after = await geometry();
    const state = await evalJs(`${CELL("Table")}.querySelectorAll('.mac-showcase__state')[1].textContent.trim()`);
    const grew = after.thWidths[1] - before.thWidths[1];
    ok(Math.abs(grew - 80) <= 2, "dragging the divider 80px widens its column by 80px", {before: before.thWidths[1], after: after.thWidths[1]});
    ok(after.thWidths[6] === before.thWidths[6], "the neighbouring column keeps its width", {before: before.thWidths[6], after: after.thWidths[6]});
    ok(after.tableWidth - before.tableWidth >= 78, "the table grows with the column instead of squeezing the rest",
        {before: before.tableWidth, after: after.tableWidth});
    ok(/name = 168px/.test(state ?? ""), "onColumnResize reported the column and its width", state);
    ok((await evalJs(`(()=>{const t=${CELL("Table")}.querySelector('.mac-table'); return t.classList.contains('is-resizing');})()`)) === false,
        "the resize state ends with the gesture");
    ok(Number(after.handleValues[0]) === after.thWidths[1],
        "aria-valuenow follows the width", {now: after.handleValues[0], width: after.thWidths[1]});
}

// --- keyboard ----------------------------------------------------------------
{
    const stepped = await evalJs(`(async()=>{
        const c = ${CELL("Table")};
        const h = c.querySelector('.mac-table__resizer[data-col="2"]');
        const col = (i)=>Math.round([...c.querySelectorAll('.mac-table__col')][i].getBoundingClientRect().width);
        const start = col(3);
        h.focus();
        const fire=(k,opts={})=>{h.dispatchEvent(new KeyboardEvent('keydown',Object.assign({key:k,bubbles:true,cancelable:true},opts)));};
        fire('ArrowRight');
        await new Promise(r=>setTimeout(r,80));
        const plus8 = col(3);
        fire('ArrowRight', {shiftKey:true});
        await new Promise(r=>setTimeout(r,80));
        const plus9 = col(3);
        fire('ArrowLeft');
        await new Promise(r=>setTimeout(r,80));
        const back = col(3);
        return {start, plus8, plus9, back, value: h.getAttribute('aria-valuenow'), focused: document.activeElement===h};})()`);
    ok(stepped.focused === true, "the divider is a tab stop", stepped.focused);
    ok(stepped.plus8 - stepped.start === 8, "ArrowRight widens by 8px", {from: stepped.start, to: stepped.plus8});
    ok(stepped.plus9 - stepped.plus8 === 1, "Shift makes it a single pixel", {from: stepped.plus8, to: stepped.plus9});
    ok(stepped.back - stepped.plus9 === -8, "ArrowLeft narrows by 8px", {from: stepped.plus9, to: stepped.back});
}

// --- floor and reset ---------------------------------------------------------
{
    const floored = await evalJs(`(async()=>{
        const c = ${CELL("Table")};
        const h = c.querySelector('.mac-table__resizer[data-col="4"]');
        const col = ()=>Math.round([...c.querySelectorAll('.mac-table__col')][5].getBoundingClientRect().width);
        h.focus();
        for (let i=0;i<40;i++) h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,120));
        return {width: col(), value: Number(h.getAttribute('aria-valuenow'))};})()`);
    ok(floored.width === 56 && floored.value === 56,
        "a column refuses to shrink past 56px", floored);

    const reset = await evalJs(`(async()=>{
        const c = ${CELL("Table")};
        const h = c.querySelector('.mac-table__resizer[data-col="4"]');
        const col = ()=>Math.round([...c.querySelectorAll('.mac-table__col')][5].getBoundingClientRect().width);
        h.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,150));
        return {width: col(), value: Number(h.getAttribute('aria-valuenow'))};})()`);
    ok(reset.width > 56 && reset.width === reset.value,
        "a double click puts the column back to its natural width", reset);

    const home = await evalJs(`(async()=>{
        const c = ${CELL("Table")};
        const h = c.querySelector('.mac-table__resizer[data-col="3"]');
        h.focus();
        h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,80));
        const moved = Number(h.getAttribute('aria-valuenow'));
        h.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,80));
        return {moved, home: Number(h.getAttribute('aria-valuenow'))};})()`);
    ok(home.home === home.moved - 8, "Home restores the natural width", home);
}

// --- the rest of the table still works --------------------------------------
{
    const intact = await evalJs(`(async()=>{
        const c = ${CELL("Table")};
        const table = c.querySelector('.mac-table');
        const btns = [...c.querySelectorAll('button.mac-table__sort')];
        const th = [...c.querySelectorAll('th.mac-table__th--sortable')][0];
        const step = async () => { btns[0].click(); await new Promise(r=>setTimeout(r,300)); return th.getAttribute('aria-sort'); };
        const first = await step();
        const sorted = [...c.querySelectorAll('tbody tr')].map(t=>t.querySelector('td:nth-child(2)')?.textContent.trim());
        const second = await step();
        const third = await step();
        const pinned = [...c.querySelectorAll('th[data-pin="right"]')].map(h=>getComputedStyle(h).position);
        const selected = [...c.querySelectorAll('tbody tr')].filter(t=>t.classList.contains('is-selected')).length;
        const rowCheck = c.querySelector('tbody input[type="checkbox"]');
        if (rowCheck) { rowCheck.checked = true; rowCheck.dispatchEvent(new Event('change',{bubbles:true})); }
        await new Promise(r=>setTimeout(r,120));
        return {sorted, first, second, third, pinned,
                selectedAfter: [...c.querySelectorAll('tbody tr')].filter(t=>t.classList.contains('is-selected')).length,
                state: c.querySelectorAll('.mac-showcase__state')[2]?.textContent.trim()};})()`);
    ok(JSON.stringify(intact.sorted) === JSON.stringify(["api-01", "db-01", "web-01"]),
        "sorting still reorders the rows", intact.sorted);
    ok(intact.first === "ascending" && intact.second === "descending" && intact.third === "none",
        "and the header still cycles ascending -> descending -> unsorted",
        [intact.first, intact.second, intact.third]);
    ok(intact.pinned.every((p) => p === "sticky"), "the action column is still pinned", intact.pinned);
    ok(intact.selectedAfter === 1, "selection still works next to the dividers", intact.selectedAfter);
}

await evalJs(`(()=>{const c=${CELL("Table")}; c.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 400));
{
    const b = await evalJs(`(()=>{const r=(${CELL("Table")}).getBoundingClientRect();
        return {x:Math.round(r.left+window.scrollX)-10,y:Math.round(r.top+window.scrollY)-10,
                w:Math.round(r.width)+20,h:Math.round(r.height)+20};})()`);
    const s = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true,
        clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale: 2}});
    if (s?.data) { writeFileSync(join(process.cwd(), "p7-table-resize.png"), Buffer.from(s.data, "base64")); console.log("saved p7-table-resize.png"); }
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
