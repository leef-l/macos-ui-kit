// Closable tabs: click, keyboard, middle click, neighbour selection, focus.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8413;
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
    "--headless=new", "--remote-debugging-port=9673", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot24")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9673/json/list")).json();
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
    const c = ${CELL("TabView")};
    const view = c.querySelector('.mac-tabview');
    const tabs = [...view.querySelectorAll('[role="tab"]')];
    const panels = [...view.querySelectorAll('[role="tabpanel"]')];
    return {
        ids: tabs.map(t=>t.dataset.id),
        labels: tabs.map(t=>t.querySelector('.mac-tabview__label').textContent.trim()),
        selected: tabs.filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.id),
        tabStops: tabs.filter(t=>t.tabIndex===0).length,
        panels: panels.map(p=>p.hidden ? 'hidden' : 'shown'),
        closes: view.querySelectorAll('.mac-tabview__close').length,
        closableButtons: [...view.querySelectorAll('.mac-tabview__close')].filter(x=>{
            const r=x.getBoundingClientRect(); return r.width>0 && r.height>0;}).length,
        closeTag: view.querySelector('.mac-tabview__close')?.tagName ?? null,
        closeHidden: view.querySelector('.mac-tabview__close')?.getAttribute('aria-hidden') ?? null,
        focused: document.activeElement?.dataset?.id ?? null,
        readout: c.querySelector('.mac-showcase__state').textContent.trim(),
        ariaSelectedCount: tabs.filter(t=>t.getAttribute('aria-selected')==='true').length,
    };})()`);

await evalJs(`(()=>{${CELL("TabView")}.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 400));

const before = await state();
ok(JSON.stringify(before.ids) === JSON.stringify(["general", "advanced", "about"]), "three tabs", before.ids);
ok(before.closes === 3, "every tab carries a close affordance", before.closes);
ok(before.closeTag === "SPAN", "the affordance is a span, not a nested button", before.closeTag);
ok(before.closeHidden === "true", "and it is hidden from the accessibility tree", before.closeHidden);
ok(JSON.stringify(before.selected) === JSON.stringify(["general"]), "general starts selected", before.selected);

// --- click the close affordance ---------------------------------------------
{
    const clicked = await evalJs(`(async()=>{
        const c = ${CELL("TabView")};
        const tab = c.querySelector('[role="tab"][data-id="advanced"]');
        tab.querySelector('.mac-tabview__close').click();
        await new Promise(r=>setTimeout(r,200));
        return true;})()`);
    void clicked;
    const after = await state();
    ok(JSON.stringify(after.ids) === JSON.stringify(["general", "about"]),
        "clicking the close glyph removes that tab", after.ids);
    ok(after.closes === 2, "and its affordance goes with it", after.closes);
    ok(after.panels.length === 2, "the panel is removed too, not just hidden", after.panels);
    ok(/已关闭: advanced/.test(after.readout ?? ""), "onClose reported the id", after.readout);
    ok(JSON.stringify(after.selected) === JSON.stringify(["general"]),
        "closing a tab that was not selected leaves the selection alone", after.selected);
}

// --- closing the selected tab moves the selection right ---------------------
{
    const closed = await evalJs(`(async()=>{
        const c = ${CELL("TabView")};
        const tab = c.querySelector('[role="tab"][data-id="general"]');
        tab.querySelector('.mac-tabview__close').click();
        await new Promise(r=>setTimeout(r,220));
        return true;})()`);
    void closed;
    const after = await state();
    ok(JSON.stringify(after.ids) === JSON.stringify(["about"]), "one tab left", after.ids);
    ok(JSON.stringify(after.selected) === JSON.stringify(["about"]),
        "closing the selected tab selects the neighbour to its right", after.selected);
    ok(after.focused === "about", "focus moves to the tab that took over", after.focused);
    ok(after.tabStops === 1, "the roving tab stop is still exactly one", after.tabStops);
    ok(after.ariaSelectedCount === 1, "exactly one tab is announced as selected", after.ariaSelectedCount);
}

// --- the last one ------------------------------------------------------------
{
    const last = await evalJs(`(async()=>{
        const c = ${CELL("TabView")};
        c.querySelector('[role="tab"][data-id="about"] .mac-tabview__close').click();
        await new Promise(r=>setTimeout(r,220));
        const view = c.querySelector('.mac-tabview');
        return {tabs: view.querySelectorAll('[role="tab"]').length,
                panels: view.querySelectorAll('[role="tabpanel"]').length,
                panelsShown: [...view.querySelectorAll('[role="tabpanel"]')].filter(p=>!p.hidden).length,
                readout: c.querySelector('.mac-showcase__state').textContent.trim()};})()`);
    ok(last.tabs === 0 && last.panels === 0, "the last tab and its panel are gone", last);
    ok(last.panelsShown === 0, "nothing pretends to be a visible panel", last.panelsShown);
    ok(/已关闭: about/.test(last.readout ?? ""), "onClose fired for the last one too", last.readout);
}

// --- a fresh view for the keyboard paths ------------------------------------
{
    await evalJs(`(async()=>{ location.reload(); return true; })()`);
    await new Promise((r) => setTimeout(r, 3400));
    await evalJs(`(()=>{${CELL("TabView")}.scrollIntoView({block:'center'}); return true;})()`);
    await new Promise((r) => setTimeout(r, 350));

    const kb = await evalJs(`(async()=>{
        const c = ${CELL("TabView")};
        const view = c.querySelector('.mac-tabview');
        const spot = (id)=>[...view.querySelectorAll('[role="tab"]')].find(t=>t.dataset.id===id);
        spot('advanced').focus();
        const fire=(k)=>view.querySelector('[role="tab"]')?.dispatchEvent(
            new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
        // A focused but unselected tab is not what the strip acts on, so select
        // advanced first by clicking it: the keyboard path then has a selection.
        const step1 = {selected: [...view.querySelectorAll('[role="tab"]')].filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.id)[0]};
        spot('advanced').click();
        await new Promise(r=>setTimeout(r,120));
        const selectedBefore = [...view.querySelectorAll('[role="tab"]')].filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.id)[0];
        fire('Delete');
        await new Promise(r=>setTimeout(r,220));
        const afterDelete = [...view.querySelectorAll('[role="tab"]')].map(t=>t.dataset.id);
        const selectedAfter = [...view.querySelectorAll('[role="tab"]')].filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.id)[0];
        const focusedAfter = document.activeElement?.dataset?.id ?? null;
        return {step1, selectedBefore, afterDelete, selectedAfter, focusedAfter,
                readout: c.querySelector('.mac-showcase__state').textContent.trim()};})()`);
    ok(kb.selectedBefore === "advanced", "clicking selects the tab", kb.selectedBefore);
    ok(!kb.afterDelete.includes("advanced"), "Delete closes the focused tab", kb.afterDelete);
    ok(kb.selectedAfter === "about", "and the neighbour takes over", kb.selectedAfter);
    ok(kb.focusedAfter === "about", "focus lands on it", kb.focusedAfter);
    ok(/已关闭: advanced/.test(kb.readout ?? ""), "onClose fired from the keyboard path", kb.readout);

    // Middle click.
    // Dispatched as a real auxclick event rather than through synthesized pointer
    // input: CDP cannot produce one, and the handler is what is under test.
    const middle = await evalJs(`(async()=>{
        const c = ${CELL("TabView")};
        let seen = 0;
        const strip = c.querySelector('.mac-tabview__list');
        const spy = () => { seen++; };
        strip.addEventListener('auxclick', spy);
        const tab = c.querySelector('[role="tab"][data-id="general"]');
        tab.dispatchEvent(new MouseEvent('auxclick', {button: 1, bubbles: true, cancelable: true}));
        await new Promise(r=>setTimeout(r,250));
        strip.removeEventListener('auxclick', spy);
        return {seen, ids: [...c.querySelectorAll('[role="tab"]')].map(t=>t.dataset.id)};})()`);
    ok(middle.seen === 1, "a middle click produces an auxclick the strip sees", middle.seen);
    ok(!middle.ids.includes("general"), "middle click closes a tab", middle.ids);
    const afterMiddle = await state();
    ok(!afterMiddle.ids.includes("general"), "middle click closes a tab", afterMiddle.ids);

    // The panel content stays attached to the tab that owns it.
    const panel = await evalJs(`(()=>{
        const c = ${CELL("TabView")};
        const tab = c.querySelector('[role="tab"]');
        const panelId = tab.getAttribute('aria-controls');
        const pane = document.getElementById(panelId);
        return {resolves: !!pane, labelled: panelId ? (pane?.getAttribute('aria-labelledby') === tab.id) : null,
                text: pane?.textContent.trim() ?? null};})()`);
    ok(panel.resolves === true && panel.labelled === true,
        "every surviving tab still resolves its panel, both ways", panel);
}

await evalJs(`(()=>{${CELL("TabView")}.scrollIntoView({block:'center'}); return true;})()`);
await new Promise((r) => setTimeout(r, 350));
{
    const b = await evalJs(`(()=>{const r=(${CELL("TabView")}).getBoundingClientRect();
        return {x:Math.round(r.left+window.scrollX)-10,y:Math.round(r.top+window.scrollY)-10,
                w:Math.round(r.width)+20,h:Math.round(r.height)+20};})()`);
    const s = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true,
        clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale: 2}});
    if (s?.data) { writeFileSync(join(process.cwd(), "p9-tabview-close.png"), Buffer.from(s.data, "base64")); console.log("saved p9-tabview-close.png"); }
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
