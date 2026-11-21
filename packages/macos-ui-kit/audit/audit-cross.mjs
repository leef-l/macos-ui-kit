// Cross-cutting audit: dark appearance, keyboard focus rings, coarse-pointer targets.
//
// These three checks are the ones a per-component audit cannot make: they only
// fail when one component disagrees with the other fifty-eight.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8401;
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
    "--headless=new", "--remote-debugging-port=9661", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot18")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9661/json/list")).json();
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

const shot = async (expr, file, scale = 1, pad = 0) => {
    const okk = await evalJs(`(()=>{const e=(${expr}); if(!e) return null; e.scrollIntoView({block:'center'}); return true;})()`);
    if (!okk) return console.log("MISSING", expr);
    await new Promise((r) => setTimeout(r, 400));
    const b = await evalJs(`(()=>{const r=(${expr}).getBoundingClientRect();
        return {x:Math.round(r.left+window.scrollX)-${pad},y:Math.round(r.top+window.scrollY)-${pad},
                w:Math.round(r.width)+${pad * 2},h:Math.round(r.height)+${pad * 2}};})()`);
    const s = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: true,
        clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale}});
    if (s?.data) { writeFileSync(join(process.cwd(), file), Buffer.from(s.data, "base64")); console.log("saved", file); }
};

const heading = await evalJs(`document.querySelector('.mac-showcase__heading')?.textContent.replace(/\\s+/g,'')`);
ok(/Controls44/.test(heading ?? ""), "the page under test is the 44-control build", heading);

// ---------------------------------------------------------------------------
// 1. Dark appearance: nothing may paint an appearance-independent colour.
// ---------------------------------------------------------------------------
{
    const dark = await evalJs(`(async()=>{
        document.documentElement.dataset.appearance = 'dark';
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        await new Promise(r=>setTimeout(r,120));

        const scope = document.querySelector('.mac-showcase__grid');
        const parse = (v)=>{
            const m = v.match(/rgba?\\(([^)]+)\\)/);
            if (!m) return null;
            const parts = m[1].split(',').map(x=>parseFloat(x.trim()));
            return {r:parts[0],g:parts[1],b:parts[2],a:parts.length>3?parts[3]:1};
        };
        const isWhite = (c)=>c && c.a>0.9 && c.r>250 && c.g>250 && c.b>250;
        const isBlack = (c)=>c && c.a>0.9 && c.r<6 && c.g<6 && c.b<6;

        const whiteBoxes = [];
        const blackText = [];
        const whiteText = [];
        let checked = 0;

        for (const el of scope.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
            // Only elements that are really painted: an element with a transparent
            // background inherits the pane, so its colour is the pane's business.
            const bg = parse(cs.backgroundColor);
            checked++;
            const hasContent = el.children.length > 0 || (el.textContent ?? '').trim().length > 0;
            if (isWhite(bg) && hasContent) {
                whiteBoxes.push({cls: (el.className || el.tagName).toString().slice(0, 60), w: Math.round(rect.width), h: Math.round(rect.height)});
            }
            const fg = parse(cs.color);
            if (isBlack(fg) && (el.textContent ?? '').trim().length > 0) {
                blackText.push({cls: (el.className || el.tagName).toString().slice(0, 60), text: el.textContent.trim().slice(0, 24)});
            }
            if (isWhite(fg) && (el.textContent ?? '').trim().length > 0) {
                whiteText.push({cls: (el.className || el.tagName).toString().slice(0, 60), text: el.textContent.trim().slice(0, 24)});
            }
        }

        const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
        return {
            checked,
            appearance: document.documentElement.dataset.appearance,
            bodyBg,
            whiteBoxes: whiteBoxes.slice(0, 12),
            whiteBoxCount: whiteBoxes.length,
            blackText: blackText.slice(0, 12),
            blackTextCount: blackText.length,
            whiteTextCount: whiteText.length,
        };})()`);
    ok(dark.appearance === "dark", "the dark appearance is applied to the document", dark.appearance);
    ok(dark.bodyBg && dark.bodyBg.r < 90, "the page background actually went dark", dark.bodyBg);
    ok(dark.checked > 300, "the scan covered the whole showcase", dark.checked);
    ok(dark.whiteBoxCount === 0, "no component paints a hardcoded white panel in the dark", dark.whiteBoxes);
    ok(dark.blackTextCount === 0, "no component paints hardcoded black text in the dark", dark.blackText);

    await shot(`document.querySelector('.mac-showcase__grid')`, "p6-dark.png", 0.5);
}

// ---------------------------------------------------------------------------
// 2. Focus rings: every tab stop must show a visible indicator.
// ---------------------------------------------------------------------------
{
    await evalJs(`(async()=>{
        document.documentElement.dataset.appearance = 'light';
        await new Promise(r=>setTimeout(r,120));
        window.scrollTo(0,0);
        // Baseline: what every element looks like while nothing is focused. A ring
        // is only a ring if it differs from this.
        // The signature covers the pseudo-elements too: a control may draw its focus
        // ring on ::after (the table's column divider does exactly that), and a
        // check that only reads the element itself would call that missing.
        const sig = (el) => {
            const cs = getComputedStyle(el);
            const parts = [cs.outlineStyle, cs.outlineWidth, cs.boxShadow, cs.borderColor];
            for (const pseudo of ['::before', '::after']) {
                const ps = getComputedStyle(el, pseudo);
                parts.push(ps.content, ps.backgroundColor, ps.width, ps.height, ps.outlineStyle);
            }
            return parts.join('|');
        };
        window.__sig = sig;
        window.__base = new Map();
        for (const el of document.querySelectorAll('.mac-showcase *')) {
            window.__base.set(el, sig(el));
        }
        document.body.setAttribute('tabindex','-1');
        document.body.focus();
        return true;})()`);

    const stops = [];
    for (let i = 0; i < 80; i++) {
        await send("Input.dispatchKeyEvent", {type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9});
        await send("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9});
        const info = await evalJs(`(()=>{
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const base = window.__base;
            const chain = [];
            let node = el;
            for (let i=0; i<3 && node; i++, node = node.parentElement) chain.push(node);
            let changed = null;
            for (const n of chain) {
                const now = window.__sig(n);
                const was = base.get(n);
                if (was !== undefined && was !== now) { changed = {tag:n.tagName, cls:(n.className||'').toString().slice(0,40), sig: now, was}; break; }
            }
            return {
                tag: el.tagName,
                cls: (el.className || '').toString().slice(0, 48),
                role: el.getAttribute('role'),
                label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20),
                inShowcase: !!el.closest('.mac-showcase'),
                changed,
            };})()`);
        if (!info) break;
        stops.push(info);
        if (!info.inShowcase && info.tag === "BODY") break;
    }

    const inside = stops.filter((s) => s.inShowcase);
    const missing = inside.filter((s) => !s.changed);
    ok(inside.length >= 40, "the page has a real keyboard walk", inside.length);
    ok(missing.length === 0, "every tab stop inside the showcase draws a focus indicator",
        missing.slice(0, 10).map((s) => `${s.tag}.${s.cls}`));
    console.log("     stops:", inside.length, "with indicator:", inside.length - missing.length);

    // Leave focus somewhere harmless before the next section.
    await evalJs(`(async()=>{document.activeElement?.blur(); window.scrollTo(0,0); return true;})()`);
}

// ---------------------------------------------------------------------------
// 3. Coarse pointer: the controls that declare a 44px rule have to reach it.
//
// `Emulation.setEmulatedMedia` cannot flip `pointer`; only real touch emulation
// does. And the kit is deliberately macOS-dense: buttons stay 28px on a touch
// screen, because a 44px button would be an iOS control, not a macOS one. So the
// assertion is scoped to the components whose own stylesheet promises 44px.
// ---------------------------------------------------------------------------
{
    const before = await evalJs(`(()=>{
        const pick = (sel)=>{const e=document.querySelector(sel); return e?Math.round(e.getBoundingClientRect().height):null;};
        return {date: pick('.mac-datepicker__control'), button: pick('.mac-button'),
                tab: pick('.mac-tabbar__item'), coarse: matchMedia('(pointer: coarse)').matches};})()`);
    ok(before.coarse === false, "the desktop run is a fine pointer", before.coarse);

    await send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 5});
    await send("Emulation.setDeviceMetricsOverride", {width: 1400, height: 1000, deviceScaleFactor: 2, mobile: true});
    await new Promise((r) => setTimeout(r, 400));

    const coarse = await evalJs(`(()=>{
        const pick = (sel)=>{const e=document.querySelector(sel); return e?Math.round(e.getBoundingClientRect().height):null;};
        const media = {
            pointer: matchMedia('(pointer: coarse)').matches,
            anyPointer: matchMedia('(any-pointer: coarse)').matches,
            hoverNone: matchMedia('(hover: none)').matches,
        };
        return {
            media,
            date: pick('.mac-datepicker__control'),
            time: pick('.mac-timepicker__control'),
            tab: pick('.mac-tabbar__item'),
            button: pick('.mac-button'),
            search: pick('.mac-searchfield__control'),
        };})()`);

    ok(coarse.media.anyPointer === true, "touch emulation is in effect", coarse.media);
    ok(coarse.media.pointer === true,
        "the engine reports a coarse primary pointer, so the size rules apply", coarse.media.pointer);

    if (coarse.media.pointer) {
        ok(coarse.date === 44, "DatePicker grows to a 44px tap target", {fine: before.date, coarse: coarse.date});
        ok(coarse.time === 44, "TimePicker grows to a 44px tap target", coarse.time);
        ok(coarse.tab >= 44, "a TabBar item is at least 44px tall", coarse.tab);
        ok(coarse.search === 44, "a search field is a 44px tap target too", coarse.search);
    }

    await send("Emulation.setTouchEmulationEnabled", {enabled: false});
    await send("Emulation.setDeviceMetricsOverride", {width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false});
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
