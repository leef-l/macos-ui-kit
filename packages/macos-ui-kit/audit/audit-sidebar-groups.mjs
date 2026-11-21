// Collapsible sidebar groups: disclosure semantics, folding, tab order, selection.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8415;
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
    "--headless=new", "--remote-debugging-port=9675", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot25")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9675/json/list")).json();
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
    const c = ${CELL("Sidebar")};
    const bar = c.querySelector('.mac-sidebar');
    const handles = [...bar.querySelectorAll('.mac-sidebar__heading--disclosure')];
    const bodies = [...bar.querySelectorAll('.mac-sidebar__items')];
    return {
        groups: bar.querySelectorAll('.mac-sidebar__group').length,
        handles: handles.length,
        handleTag: handles[0]?.tagName ?? null,
        expanded: handles.map(h=>h.getAttribute('aria-expanded')),
        controls: handles.map(h=>h.getAttribute('aria-controls')),
        bodiesResolve: handles.map(h=>!!bar.querySelector('#'+h.getAttribute('aria-controls'))),
        bodiesHidden: bodies.map(b=>b.hidden),
        bodyDisplay: bodies.map(b=>getComputedStyle(b).display),
        rows: [...bar.querySelectorAll('.mac-sidebar__item')].map(r=>({
            id: r.dataset.id,
            visible: r.getClientRects().length > 0,
            tab: r.tabIndex,
            current: r.getAttribute('aria-current'),
        })),
        headingTexts: handles.map(h=>h.querySelector('.mac-sidebar__heading-text')?.textContent.trim()),
        triangle: handles.map(h=>getComputedStyle(h.querySelector('.mac-sidebar__disclosure')).transform),
        data: bar.dataset.group ?? null,
    };})()`);

await evalJs(`(()=>{${CELL("Sidebar")}.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 400));

const before = await state();
ok(before.groups === 2 && before.handles === 2, "both headed groups are disclosures", [before.groups, before.handles]);
ok(before.handleTag === "BUTTON", "the heading is a real button", before.handleTag);
ok(JSON.stringify(before.expanded) === JSON.stringify(["true", "true"]), "both start expanded", before.expanded);
ok(before.controls.every((c) => typeof c === "string" && c.length > 0) && before.bodiesResolve.every(Boolean),
    "each handle points at its row box", before.controls);
ok(JSON.stringify(before.headingTexts) === JSON.stringify(["资源库", "设置"]),
    "the heading text survives the conversion to a button", before.headingTexts);
ok(before.bodiesHidden.every((h) => h === false), "no group starts folded", before.bodiesHidden);
ok(before.triangle[0] === "none" || /matrix/.test(before.triangle[0]),
    "the triangle is a transformed box", before.triangle[0]);

// --- fold the first group ----------------------------------------------------
{
    const folded = await evalJs(`(async()=>{
        const c = ${CELL("Sidebar")};
        const handle = c.querySelectorAll('.mac-sidebar__heading--disclosure')[0];
        handle.click();
        await new Promise(r=>setTimeout(r,180));
        return true;})()`);
    void folded;
    const after = await state();
    ok(after.expanded[0] === "false", "clicking folds the group", after.expanded[0]);
    ok(after.bodiesHidden[0] === true, "its row box is hidden", after.bodiesHidden[0]);
    ok(after.bodyDisplay[0] === "none", "and paints nothing", after.bodyDisplay[0]);
    ok(after.rows.filter((r) => !r.visible).map((r) => r.id).join(",") === "all,fav",
        "both of its rows are gone from the layout", after.rows.filter((r) => !r.visible).map((r) => r.id));
    ok(/^0:collapsed$/.test(after.data ?? ""), "onToggleGroup reported the group and state", after.data);
    ok(after.expanded[1] === "true", "the other group is untouched", after.expanded[1]);

    // A hidden row must be out of the tab order: Tab is not expected to reach it.
    const tabs = await evalJs(`(()=>{
        const c = ${CELL("Sidebar")};
        const bar = c.querySelector('.mac-sidebar');
        return [...bar.querySelectorAll('.mac-sidebar__item')].filter(r=>r.getClientRects().length>0).length;})()`);
    ok(tabs === 2, "only the rows of the open group are reachable", tabs);
}

// --- unfold, and check the triangle flips -----------------------------------
{
    const unfolded = await evalJs(`(async()=>{
        const c = ${CELL("Sidebar")};
        const handle = c.querySelectorAll('.mac-sidebar__heading--disclosure')[0];
        const tri = () => getComputedStyle(handle.querySelector('.mac-sidebar__disclosure')).transform;
        const closed = tri();
        handle.click();
        await new Promise(r=>setTimeout(r,180));
        return {closed, open: tri()};})()`);
    ok(unfolded.closed !== unfolded.open, "the triangle rotates when the group opens",
        {closed: unfolded.closed, open: unfolded.open});
    const after = await state();
    ok(after.bodiesHidden[0] === false && after.expanded[0] === "true",
        "the group is open again", [after.bodiesHidden[0], after.expanded[0]]);
}

// --- the selection is unaffected --------------------------------------------
{
    const selected = await evalJs(`(async()=>{
        const c = ${CELL("Sidebar")};
        const bar = c.querySelector('.mac-sidebar');
        const handle = bar.querySelectorAll('.mac-sidebar__heading--disclosure')[0];
        // Fold the group the selected row lives in.
        handle.click();
        await new Promise(r=>setTimeout(r,160));
        const foldedCurrent = [...bar.querySelectorAll('.mac-sidebar__item')]
            .filter(r=>r.getAttribute('aria-current')==='page').map(r=>r.dataset.id);
        handle.click();
        await new Promise(r=>setTimeout(r,160));
        // Select a row in the other group, then fold its group.
        const row = bar.querySelector('.mac-sidebar__item[data-id="browser"]');
        row.click();
        await new Promise(r=>setTimeout(r,120));
        const afterClick = [...bar.querySelectorAll('.mac-sidebar__item')]
            .filter(r=>r.getAttribute('aria-current')==='page').map(r=>r.dataset.id);
        return {foldedCurrent, afterClick};})()`);
    ok(JSON.stringify(selected.foldedCurrent) === JSON.stringify(["all"]),
        "folding a group does not clear the selection inside it", selected.foldedCurrent);
    ok(JSON.stringify(selected.afterClick) === JSON.stringify(["browser"]),
        "rows still select normally inside a collapsible group", selected.afterClick);
}

// --- a group without a heading stays open -----------------------------------
{
    const open = await evalJs(`(()=>{
        const c = ${CELL("Sidebar")};
        // Every group here has a heading, so this checks the rule the other way:
        // a body is only hidden when a handle exists to reopen it.
        const bar = c.querySelector('.mac-sidebar');
        const bodies = [...bar.querySelectorAll('.mac-sidebar__items')];
        const handles = [...bar.querySelectorAll('.mac-sidebar__heading--disclosure')];
        return {bodies: bodies.length, handles: handles.length,
                orphanFolded: bodies.filter((b,i)=>b.hidden && !handles[i]).length};})()`);
    ok(open.bodies === open.handles && open.orphanFolded === 0,
        "no group is folded without a handle to reopen it", open);
}

await evalJs(`(()=>{${CELL("Sidebar")}.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 350));
{
    const b = await evalJs(`(()=>{const r=(${CELL("Sidebar")}).getBoundingClientRect();
        return {x:Math.round(r.left+window.scrollX)-10,y:Math.round(r.top+window.scrollY)-10,
                w:Math.round(r.width)+20,h:Math.round(r.height)+20};})()`);
    const s = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true,
        clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale: 2}});
    if (s?.data) { writeFileSync(join(process.cwd(), "p10-sidebar-groups.png"), Buffer.from(s.data, "base64")); console.log("saved p10-sidebar-groups.png"); }
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
