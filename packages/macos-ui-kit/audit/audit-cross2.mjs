// Cross-cutting audit, part 2: reduced motion, high-contrast themes, RTL.
//
// Same rule as part 1: these only fail when one component disagrees with the rest.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8405;
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
    "--headless=new", "--remote-debugging-port=9665", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot20")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9665/json/list")).json();
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

// Only the kit's own elements: `.mac-showcase__*` is the demo page's styling and is
// not shipped in the package.
const KIT_SEL = `[class*="mac-"]:not([class*="mac-showcase"])`;

// ---------------------------------------------------------------------------
// 1. Reduced motion: no component may keep a duration of its own.
// ---------------------------------------------------------------------------
{
    await send("Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
    await evalJs(`new Promise(r=>setTimeout(r,250))`);

    const motion = await evalJs(`(()=>{
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const durations = (v)=>v.split(',').map(x=>parseFloat(x)||0);
        const moving = [];
        const animated = [];
        let scanned = 0;
        for (const el of document.querySelectorAll(${JSON.stringify(KIT_SEL)})) {
            const cs = getComputedStyle(el);
            scanned++;
            const t = durations(cs.transitionDuration);
            if (t.some((d)=>d > 0)) {
                moving.push({cls: (el.className||'').toString().slice(0,52), d: cs.transitionDuration});
            }
            const a = durations(cs.animationDuration);
            if (cs.animationName !== 'none' && a.some((d)=>d > 0)) {
                animated.push({cls: (el.className||'').toString().slice(0,52), name: cs.animationName, d: cs.animationDuration});
            }
        }
        return {reduce, scanned, moving: moving.slice(0,12), movingCount: moving.length,
                animated: animated.slice(0,8), animatedCount: animated.length};})()`);
    ok(motion.reduce === true, "the engine applies the reduced-motion preference", motion.reduce);
    ok(motion.scanned > 300, "the scan covered the kit's elements", motion.scanned);
    ok(motion.movingCount === 0, "no component keeps a transition duration under reduced motion", motion.moving);
    console.log("     animated:", motion.animatedCount, "moving:", motion.movingCount);

    await send("Emulation.setEmulatedMedia", {features: []});
    await evalJs(`new Promise(r=>setTimeout(r,200))`);
}

// ---------------------------------------------------------------------------
// 2. High-contrast themes: the same appearance-independence scan, twice.
// ---------------------------------------------------------------------------
for (const theme of ["hc-dark", "hc-light"]) {
    const scan = await evalJs(`(async()=>{
        const root = document.documentElement;
        root.dataset.theme = ${JSON.stringify(theme)};
        root.dataset.appearance = ${JSON.stringify(theme)}.endsWith('dark') ? 'dark' : 'light';
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        await new Promise(r=>setTimeout(r,180));

        const parse = (v)=>{
            const m = v.match(/rgba?\\(([^)]+)\\)/);
            if (!m) return null;
            const p = m[1].split(',').map(x=>parseFloat(x.trim()));
            return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};
        };
        const isWhite = (c)=>c && c.a>0.9 && c.r>250 && c.g>250 && c.b>250;
        const isBlack = (c)=>c && c.a>0.9 && c.r<6 && c.g<6 && c.b<6;

        const scope = document.querySelector('.mac-showcase__grid');
        let checked = 0;
        const whiteBoxes = [];
        const blackText = [];
        for (const el of scope.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
            checked++;
            const hasContent = el.children.length > 0 || (el.textContent ?? '').trim().length > 0;
            if (isWhite(parse(cs.backgroundColor)) && hasContent) {
                whiteBoxes.push({cls:(el.className||el.tagName).toString().slice(0,48)});
            }
            if (isBlack(parse(cs.color)) && (el.textContent ?? '').trim().length > 0) {
                blackText.push({cls:(el.className||el.tagName).toString().slice(0,48), text: el.textContent.trim().slice(0,20)});
            }
        }
        const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
        const textColor = parse(getComputedStyle(document.querySelector('.mac-showcase__grid')).color);
        return {checked, bodyBg, textColor, whiteBoxes: whiteBoxes.slice(0,8), whiteBoxCount: whiteBoxes.length,
                blackText: blackText.slice(0,8), blackTextCount: blackText.length};})()`);
    ok(scan.checked > 300, `${theme}: the scan covered the showcase`, scan.checked);
    // White panels are legitimate in a light appearance — that is what a macOS
    // pane and a macOS button are. The scan that means something is the dark one.
    if (theme.endsWith("dark")) {
        ok(scan.whiteBoxCount === 0, `${theme}: no hardcoded white panel`, scan.whiteBoxes);
    }
    ok(scan.blackTextCount === 0, `${theme}: no hardcoded black text`, scan.blackText);
    if (theme === "hc-dark") {
        ok(scan.bodyBg && scan.bodyBg.r < 40, `${theme}: the page is dark`, scan.bodyBg);
    }
}

await evalJs(`(async()=>{const r=document.documentElement; delete r.dataset.theme; r.dataset.appearance='light';
    await new Promise(x=>setTimeout(x,200)); return true;})()`);

// ---------------------------------------------------------------------------
// 3. RTL: the layout has to mirror, not to break.
// ---------------------------------------------------------------------------
{
    const before = await evalJs(`(()=>{
        const row = [...document.querySelectorAll('.mac-treeview__row')].find(r=>r.querySelector('.mac-treeview__label')?.textContent.trim()==='controls');
        const cs = row ? getComputedStyle(row) : null;
        const icon = document.querySelector('.mac-datepicker__icon');
        const field = document.querySelector('.mac-datepicker__control');
        return {
            ltrPad: cs ? [cs.paddingLeft, cs.paddingRight] : null,
            iconRight: icon ? getComputedStyle(icon).right : null,
            iconLeft: icon ? getComputedStyle(icon).left : null,
            iconFromEnd: icon && field ? Math.abs(Math.round(field.getBoundingClientRect().right - icon.getBoundingClientRect().right)) : null,
        };})()`);

    const rtl = await evalJs(`(async()=>{
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'ar';
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        await new Promise(r=>setTimeout(r,260));

        const row = [...document.querySelectorAll('.mac-treeview__row')].find(r=>r.querySelector('.mac-treeview__label')?.textContent.trim()==='controls');
        const cs = row ? getComputedStyle(row) : null;
        const icon = document.querySelector('.mac-datepicker__icon');
        const field = document.querySelector('.mac-datepicker__control');
        const input = document.querySelector('.mac-datepicker__input');

        // Horizontal overflow: a mirrored layout that is 2px too wide is worse than
        // one that is 20px too narrow.
        const overflowing = [];
        for (const el of document.querySelectorAll('.mac-showcase__grid [class*="mac-"]')) {
            // An svg with overflow: visible reports its stroke bounds as the
            // parent's scrollWidth, which is the drawing being allowed to breathe
            // rather than content escaping a box. Same for the element holding it.
            if (el instanceof SVGElement) continue;
            const svg = el.querySelector('svg');
            if (svg && getComputedStyle(svg).overflow === 'visible') continue;
            if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
                const cs2 = getComputedStyle(el);
                if (cs2.overflowX === 'visible' && cs2.display !== 'inline') {
                    overflowing.push({cls:(el.className||el.tagName).toString().slice(0,44),
                        scroll: el.scrollWidth, client: el.clientWidth});
                }
            }
        }
        return {
            pad: cs ? [cs.paddingLeft, cs.paddingRight] : null,
            iconRight: icon ? getComputedStyle(icon).right : null,
            iconLeft: icon ? getComputedStyle(icon).left : null,
            iconFromEnd: icon && field ? Math.abs(Math.round(field.getBoundingClientRect().left - icon.getBoundingClientRect().left)) : null,
            inputPadRight: input ? getComputedStyle(input).paddingRight : null,
            overflowing: overflowing.slice(0,10),
            dir: document.documentElement.dir,
        };})()`);

    ok(rtl.dir === "rtl", "the document is in RTL", rtl.dir);
    ok(before.ltrPad && rtl.pad &&
        rtl.pad[0] === before.ltrPad[1] && rtl.pad[1] === before.ltrPad[0] &&
        before.ltrPad[0] !== before.ltrPad[1],
        "the tree indent follows the inline start, so it flips sides",
        {ltr: before.ltrPad, rtl: rtl.pad});
    ok(rtl.overflowing.length === 0, "nothing overflows its box in RTL", rtl.overflowing);

    // The trailing glyph has to sit on the trailing side in both directions.
    const sameSide = before.iconFromEnd !== null && rtl.iconFromEnd !== null;
    ok(sameSide && Math.abs(before.iconFromEnd - rtl.iconFromEnd) <= 2,
        "the date field's glyph stays on the trailing edge after mirroring",
        {ltr: before.iconFromEnd, rtl: rtl.iconFromEnd});

    await evalJs(`(async()=>{document.documentElement.dir='ltr'; document.documentElement.lang='zh-CN';
        await new Promise(r=>setTimeout(r,150)); return true;})()`);
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
