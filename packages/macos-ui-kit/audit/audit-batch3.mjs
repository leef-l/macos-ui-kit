// Batch 3 audit: List, Stepper, SplitButton, TagInput, RangeSlider, Calendar.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8381;
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
    "--headless=new", "--remote-debugging-port=9631", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot8")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9631/json/list")).json();
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

const shot = async (expr, file, scale = 2, pad = 10) => {
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

// --- presence --------------------------------------------------------------
ok(await evalJs(`!!${CELL("List")}`), "List cell rendered");
ok(await evalJs(`!!${CELL("Stepper")}`), "Stepper cell rendered");
ok(await evalJs(`!!${CELL("SplitButton")}`), "SplitButton cell rendered");
ok(await evalJs(`!!${CELL("TagInput")}`), "TagInput cell rendered");
ok(await evalJs(`!!${CELL("RangeSlider")}`), "RangeSlider cell rendered");
ok(await evalJs(`!!${CELL("Calendar")}`), "Calendar cell rendered");

const counts = await evalJs(`[...document.querySelectorAll('.mac-showcase__heading')].map(h=>h.textContent.trim())`);
ok(Array.isArray(counts) && counts.some((c) => { const m = /Controls(\d+)/.exec(c); return m && Number(m[1]) >= 33; }), "showcase advertises at least 33 controls", counts);

// --- List ------------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("List")};
        const box=c.querySelector('[role="listbox"]');
        const rows=[...c.querySelectorAll('[role="option"]')];
        const heads=[...c.querySelectorAll('.mac-list__section')];
        return {
            role: box?box.getAttribute('role'):null,
            multi: box?box.getAttribute('aria-multiselectable'):null,
            rows: rows.length,
            heads: heads.length,
            headRole: heads[0]?heads[0].getAttribute('role'):null,
            selected: rows.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.value),
            tabs: rows.map(x=>x.tabIndex),
            domRole: rows[0]?.getAttribute('role'),
        };})()`);
    ok(r.rows === 5, "List renders 5 rows", r.rows);
    ok(r.heads === 2, "List renders 2 section headings", r.heads);
    ok(r.headRole === "presentation", "Section heading is presentational", r.headRole);
    ok(r.multi === "false", "single mode leaves aria-multiselectable false", r.multi);
    ok(JSON.stringify(r.selected) === JSON.stringify(["inbox"]), "inbox starts selected", r.selected);
    ok(r.tabs.filter((t) => t === 0).length === 1, "exactly one row owns the tab stop", r.tabs);

    // Click a row: selection moves and the readout follows.
    const click = await evalJs(`(async()=>{
        const c=${CELL("List")};
        const rows=[...c.querySelectorAll('[role="option"]')];
        rows[1].click();
        await new Promise(r=>setTimeout(r,60));
        return {sel: rows.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.value),
                state: c.querySelector('.mac-showcase__state')?.textContent.trim()};})()`);
    ok(JSON.stringify(click.sel) === JSON.stringify(["starred"]), "clicking a row moves the selection", click.sel);
    ok(/starred/.test(click.state ?? ""), "List readout reports the new value", click.state);

    // A disabled row refuses.
    const dis = await evalJs(`(async()=>{
        const c=${CELL("List")};
        const rows=[...c.querySelectorAll('[role="option"]')];
        const arch=rows.find(x=>x.dataset.value==='archive');
        arch.click();
        await new Promise(r=>setTimeout(r,60));
        return {sel: rows.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.value),
                aria: arch.getAttribute('aria-disabled')};})()`);
    ok(JSON.stringify(dis.sel) === JSON.stringify(["starred"]), "disabled row ignores the click", dis.sel);
    ok(dis.aria === "true", "disabled row carries aria-disabled", dis.aria);

    // Keyboard: ArrowDown from the focused row moves and selects on Enter.
    const keys = await evalJs(`(async()=>{
        const c=${CELL("List")};
        const box=c.querySelector('[role="listbox"]');
        const rows=[...c.querySelectorAll('[role="option"]')];
        rows[1].focus();
        box.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        const focused=document.activeElement?.dataset?.value;
        box.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        return {focused, sel: rows.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.value),
                anchor: rows.filter(x=>x.tabIndex===0).map(x=>x.dataset.value)};})()`);
    ok(keys.focused === "drafts", "ArrowDown moves focus to the next row", keys.focused);
    ok(JSON.stringify(keys.sel) === JSON.stringify(["drafts"]), "Enter selects the focused row", keys.sel);
    ok(JSON.stringify(keys.anchor) === JSON.stringify(["drafts"]), "roving tabindex follows focus", keys.anchor);

    // Arrow past a disabled row skips it.
    const skip = await evalJs(`(async()=>{
        const c=${CELL("List")};
        const box=c.querySelector('[role="listbox"]');
        const rows=[...c.querySelectorAll('[role="option"]')];
        rows[2].focus();
        box.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        return document.activeElement?.dataset?.value;})()`);
    ok(skip === "trash", "ArrowDown skips the disabled row", skip);

    // End / Home edges.
    const edges = await evalJs(`(async()=>{
        const c=${CELL("List")};
        const box=c.querySelector('[role="listbox"]');
        box.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
        await new Promise(r=>setTimeout(r,50));
        const end=document.activeElement?.dataset?.value;
        box.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
        await new Promise(r=>setTimeout(r,50));
        return {end, home: document.activeElement?.dataset?.value};})()`);
    ok(edges.end === "trash" && edges.home === "inbox", "Home/End jump to the ends", edges);
}

// --- Stepper ---------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("Stepper")};
        const st=[...c.querySelectorAll('.mac-stepper')];
        const first=st[0];
        return {
            count: st.length,
            role: first?.getAttribute('role'),
            now: first?.getAttribute('aria-valuenow'),
            min: first?.getAttribute('aria-valuemin'),
            max: first?.getAttribute('aria-valuemax'),
            tab: first?.tabIndex,
            buttonTab: [...first.querySelectorAll('button')].map(b=>b.tabIndex),
            disabled: [...first.querySelectorAll('button')].map(b=>b.disabled),
            width: Math.round(first.getBoundingClientRect().width),
            height: Math.round(first.getBoundingClientRect().height),
        };})()`);
    ok(r.count === 3, "three steppers in the demo", r.count);
    ok(r.role === "spinbutton", "root is a spinbutton", r.role);
    ok(r.now === "3" && r.min === "1" && r.max === "20", "aria value range mirrors the options", [r.now, r.min, r.max]);
    ok(r.tab === 0, "root is the single tab stop", r.tab);
    ok(JSON.stringify(r.buttonTab) === JSON.stringify([-1, -1]), "segments stay out of the tab order", r.buttonTab);
    ok(JSON.stringify(r.disabled) === JSON.stringify([false, false]), "neither segment disabled mid-range", r.disabled);
    ok(r.width >= 13 && r.width <= 20, "stepper is narrow like AppKit's", r.width);

    const up = await evalJs(`(async()=>{
        const c=${CELL("Stepper")};
        const s=c.querySelector('.mac-stepper');
        s.querySelector('.mac-stepper__button--up').click();
        await new Promise(r=>setTimeout(r,60));
        return {now: s.getAttribute('aria-valuenow'),
                state: c.querySelector('.mac-showcase__state')?.textContent.trim(),
                data: s.dataset.value};})()`);
    ok(up.now === "4", "up segment increments", up.now);
    ok(/数量: 4/.test(up.state ?? ""), "Stepper readout follows", up.state);

    const clamp = await evalJs(`(async()=>{
        const c=${CELL("Stepper")};
        const s=c.querySelector('.mac-stepper');
        const upBtn=s.querySelector('.mac-stepper__button--up');
        for(let i=0;i<20;i++) upBtn.click();
        await new Promise(r=>setTimeout(r,80));
        return {now: s.getAttribute('aria-valuenow'), upDisabled: upBtn.disabled,
                downDisabled: s.querySelector('.mac-stepper__button--down').disabled};})()`);
    ok(clamp.now === "20", "stepping stops at max", clamp.now);
    ok(clamp.upDisabled === true, "up segment disables at max", clamp.upDisabled);
    ok(clamp.downDisabled === false, "down segment stays live", clamp.downDisabled);

    const wrap = await evalJs(`(async()=>{
        const c=${CELL("Stepper")};
        const s=[...c.querySelectorAll('.mac-stepper')][2];
        const upBtn=s.querySelector('.mac-stepper__button--up');
        const before=s.getAttribute('aria-valuenow');
        for(let i=0;i<3;i++) upBtn.click();
        await new Promise(r=>setTimeout(r,80));
        return {before, after: s.getAttribute('aria-valuenow'), upDisabled: upBtn.disabled};})()`);
    ok(wrap.after !== undefined && wrap.upDisabled === false, "wrapping stepper never disables its segments", wrap);

    const key = await evalJs(`(async()=>{
        const c=${CELL("Stepper")};
        const s=[...c.querySelectorAll('.mac-stepper')][1];
        s.focus();
        s.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        return s.getAttribute('aria-valuenow');})()`);
    ok(key === "5", "PageUp walks ten steps of 0.5", key);
}

// --- SplitButton -----------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("SplitButton")};
        const sb=[...c.querySelectorAll('.mac-splitbutton')];
        const first=sb[0];
        const action=first.querySelector('.mac-splitbutton__action');
        const toggle=first.querySelector('.mac-splitbutton__toggle');
        return {
            count: sb.length,
            actionLabel: action?.textContent.trim(),
            toggleLabel: toggle?.getAttribute('aria-label'),
            haspopup: toggle?.getAttribute('aria-haspopup'),
            expanded: toggle?.getAttribute('aria-expanded'),
            variant: first.className,
            heights: [Math.round(action.getBoundingClientRect().height), Math.round(toggle.getBoundingClientRect().height)],
        };})()`);
    ok(r.count === 2, "two split buttons in the demo", r.count);
    ok(/构建/.test(r.actionLabel ?? ""), "action half carries the label", r.actionLabel);
    ok(r.haspopup === "menu", "toggle advertises a menu", r.haspopup);
    ok(r.expanded === "false", "toggle starts collapsed", r.expanded);
    ok(/mac-splitbutton--primary/.test(r.variant ?? ""), "primary variant applied", r.variant);
    ok(r.heights[0] === r.heights[1], "both halves are the same height", r.heights);

    const act = await evalJs(`(async()=>{
        const c=${CELL("SplitButton")};
        const first=c.querySelector('.mac-splitbutton');
        first.querySelector('.mac-splitbutton__action').click();
        await new Promise(r=>setTimeout(r,80));
        return {state: c.querySelector('.mac-showcase__state')?.textContent.trim(),
                open: !!document.querySelector('.mac-menu.is-open')};})()`);
    ok(/已构建/.test(act.state ?? ""), "action half fires onAction", act.state);
    ok(act.open === false, "action half does not open the menu", act.open);

    const open = await evalJs(`(async()=>{
        const c=${CELL("SplitButton")};
        const first=c.querySelector('.mac-splitbutton');
        first.scrollIntoView({block:'center'});
        await new Promise(r=>setTimeout(r,200));
        const toggle=first.querySelector('.mac-splitbutton__toggle');
        toggle.click();
        await new Promise(r=>setTimeout(r,260));
        const menu=document.querySelector('.mac-menu.is-open');
        const mr=menu?.getBoundingClientRect();
        const tr=toggle.getBoundingClientRect();
        return {open: !!menu, expanded: toggle.getAttribute('aria-expanded'),
                items: menu? [...menu.querySelectorAll('[role="menuitem"]')].length : 0,
                seps: menu? [...menu.querySelectorAll('.mac-menu__separator')].length : 0,
                below: mr? Math.round(mr.top - tr.bottom) : null};})()`);
    ok(open.open === true, "toggle opens the menu", open.open);
    ok(open.expanded === "true", "aria-expanded follows", open.expanded);
    ok(open.items === 3, "menu lists 3 real items", open.items);
    ok(open.seps === 1, "menu renders 1 separator", open.seps);
    ok(open.below !== null && open.below >= 0 && open.below < 20, "menu hangs just below the toggle", open.below);

    const pick = await evalJs(`(async()=>{
        const c=${CELL("SplitButton")};
        const item=[...document.querySelectorAll('.mac-menu.is-open [role="menuitem"]')].find(m=>/测试/.test(m.textContent));
        item?.click();
        await new Promise(r=>setTimeout(r,260));
        const first=c.querySelector('.mac-splitbutton');
        return {state: c.querySelector('.mac-showcase__state')?.textContent.trim(),
                open: !!document.querySelector('.mac-menu.is-open'),
                expanded: first.querySelector('.mac-splitbutton__toggle').getAttribute('aria-expanded')};})()`);
    ok(/菜单: test/.test(pick.state ?? ""), "choosing an item reports its value", pick.state);
    ok(pick.open === false, "menu closes after a pick", pick.open);
    ok(pick.expanded === "false", "aria-expanded resets", pick.expanded);

    // Repeated open/close must not leak menus.
    const leak = await evalJs(`(async()=>{
        const c=${CELL("SplitButton")};
        const first=c.querySelector('.mac-splitbutton');
        const toggle=first.querySelector('.mac-splitbutton__toggle');
        for(let i=0;i<5;i++){
            toggle.click();
            await new Promise(r=>setTimeout(r,120));
            const it=document.querySelector('.mac-menu.is-open [role="menuitem"]');
            if(it) it.click(); else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            await new Promise(r=>setTimeout(r,140));
        }
        return {menus: document.querySelectorAll('.mac-menu').length,
                open: document.querySelectorAll('.mac-menu.is-open').length};})()`);
    ok(leak.menus === 0 && leak.open === 0, "five open/close cycles leave no menu behind", leak);
}

// --- TagInput --------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("TagInput")};
        const ti=c.querySelector('.mac-taginput');
        const input=ti?.querySelector('.mac-taginput__input');
        const chips=[...ti.querySelectorAll('.mac-taginput__tag')];
        const label=ti?.querySelector('.mac-taginput__label');
        return {
            chips: chips.length,
            texts: chips.map(x=>x.textContent.trim()),
            removes: chips.map(x=>x.querySelector('button')?.getAttribute('aria-label')),
            placeholder: input?.getAttribute('placeholder'),
            labelFor: label?.getAttribute('for'),
            inputId: input?.id,
            focused: document.activeElement === input,
        };})()`);
    ok(r.chips === 2, "two chips from the initial value", r.chips);
    ok(JSON.stringify(r.texts) === JSON.stringify(["前端×", "macOS×"]) || r.texts.every((t) => /^(前端|macOS)/.test(t)), "chips carry the tag text", r.texts);
    ok(r.removes.every((a) => /移除/.test(a ?? "")), "each chip has a labelled remove button", r.removes);
    ok(r.labelFor && r.labelFor === r.inputId, "label is linked to the input", [r.labelFor, r.inputId]);

    const add = await evalJs(`(async()=>{
        const c=${CELL("TagInput")};
        const ti=c.querySelector('.mac-taginput');
        const input=ti.querySelector('.mac-taginput__input');
        input.focus();
        input.value='TypeScript';
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,120));
        return {chips: [...ti.querySelectorAll('.mac-taginput__tag')].map(x=>x.textContent.trim()),
                input: input.value,
                state: c.querySelector('.mac-showcase__state')?.textContent.trim()};})()`);
    ok(add.chips.length === 3 && add.chips.some((t) => /TypeScript/.test(t)), "Enter commits a new tag", add.chips);
    ok(add.input === "", "input clears after commit", add.input);
    ok(/TypeScript/.test(add.state ?? ""), "TagInput readout follows", add.state);

    const dup = await evalJs(`(async()=>{
        const c=${CELL("TagInput")};
        const ti=c.querySelector('.mac-taginput');
        const input=ti.querySelector('.mac-taginput__input');
        input.focus();
        input.value='前端';
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,120));
        return [...ti.querySelectorAll('.mac-taginput__tag')].map(x=>x.textContent.trim());})()`);
    ok(dup.length === 3, "duplicate tag is refused", dup);

    const comma = await evalJs(`(async()=>{
        const c=${CELL("TagInput")};
        const ti=c.querySelector('.mac-taginput');
        const input=ti.querySelector('.mac-taginput__input');
        input.focus();
        input.value='Vite,';
        input.dispatchEvent(new KeyboardEvent('keydown',{key:',',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,120));
        return [...ti.querySelectorAll('.mac-taginput__tag')].map(x=>x.textContent.trim());})()`);
    ok(comma.length === 4 && comma.some((t) => /Vite/.test(t)), "comma commits too", comma);

    const back = await evalJs(`(async()=>{
        const c=${CELL("TagInput")};
        const ti=c.querySelector('.mac-taginput');
        const input=ti.querySelector('.mac-taginput__input');
        input.focus();
        input.value='';
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,120));
        return [...ti.querySelectorAll('.mac-taginput__tag')].map(x=>x.textContent.trim());})()`);
    ok(back.length === 3, "Backspace on an empty input removes the last tag", back);

    const rm = await evalJs(`(async()=>{
        const c=${CELL("TagInput")};
        const ti=c.querySelector('.mac-taginput');
        const first=ti.querySelector('.mac-taginput__tag button');
        first.click();
        await new Promise(r=>setTimeout(r,120));
        return {chips: [...ti.querySelectorAll('.mac-taginput__tag')].map(x=>x.textContent.trim()),
                state: c.querySelector('.mac-showcase__state')?.textContent.trim()};})()`);
    ok(rm.chips.length === 2 && !rm.chips.some((t) => /^前端/.test(t)), "remove button drops that chip", rm.chips);
    ok(rm.state !== undefined, "readout updated after removal", rm.state);
}

// --- RangeSlider -----------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("RangeSlider")};
        const rs=c.querySelector('.mac-rangeslider');
        const inputs=[...rs.querySelectorAll('input[type="range"]')];
        const cs=getComputedStyle(rs);
        const cw=Math.round(rs.getBoundingClientRect().width);
        return {
            inputs: inputs.length,
            values: inputs.map(i=>i.value),
            labels: inputs.map(i=>i.getAttribute('aria-label')),
            tabs: inputs.map(i=>i.tabIndex),
            start: cs.getPropertyValue('--mac-rangeslider-start').trim(),
            end: cs.getPropertyValue('--mac-rangeslider-end').trim(),
            width: cw,
            cellWidth: Math.round(c.querySelector('.mac-showcase__demo').getBoundingClientRect().width),
            text: rs.textContent.trim(),
        };})()`);
    ok(r.inputs === 2, "two range inputs", r.inputs);
    ok(JSON.stringify(r.values) === JSON.stringify(["20", "80"]), "initial pair is 20/80", r.values);
    ok(r.labels[0] === "最小值" && r.labels[1] === "最大值", "both thumbs are labelled", r.labels);
    ok(r.tabs.every((t) => t >= 0), "both thumbs are tabbable", r.tabs);
    ok(r.start === "20%" && r.end === "80%", "fill spans the gap between the thumbs", [r.start, r.end]);
    ok(r.width > r.cellWidth - 40, "slider fills the wide cell", [r.width, r.cellWidth]);
    ok(/20/.test(r.text) && /80/.test(r.text), "showValue prints both bounds", r.text);

    const move = await evalJs(`(async()=>{
        const c=${CELL("RangeSlider")};
        const rs=c.querySelector('.mac-rangeslider');
        const lo=rs.querySelector('input[type="range"]');
        const cs=()=>getComputedStyle(rs).getPropertyValue('--mac-rangeslider-start').trim();
        lo.value='35';
        lo.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        const during={start: cs(), state:c.querySelector('.mac-showcase__state')?.textContent.trim()};
        lo.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,80));
        return {during, after: c.querySelector('.mac-showcase__state')?.textContent.trim()};})()`);
    ok(move.during.start === "35%", "dragging moves the fill immediately", move.during.start);
    ok(/区间: 20 – 80/.test(move.during.state ?? ""), "dragging does not report early", move.during.state);
    ok(/区间: 35 – 80/.test(move.after ?? ""), "commit reports the new pair", move.after);

    // A `change` with no preceding `input` must still not emit a crossed pair.
    const cross = await evalJs(`(async()=>{
        const c=${CELL("RangeSlider")};
        const rs=c.querySelector('.mac-rangeslider');
        const [lo,hi]=[...rs.querySelectorAll('input[type="range"]')];
        lo.value='100';
        lo.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,80));
        return {lo: lo.value, hi: hi.value,
                state: c.querySelector('.mac-showcase__state')?.textContent.trim(),
                end: getComputedStyle(rs).getPropertyValue('--mac-rangeslider-end').trim()};})()`);
    ok(Number(cross.lo) <= Number(cross.hi), "thumbs never cross", cross);
    ok(/区间: 80 – 80/.test(cross.state ?? ""), "a crossed commit is folded to a valid pair", cross.state);

    // The fill is painted from percentages while the native thumbs travel an
    // inset band, so the two can drift apart — worst at the ends, where the
    // error equals half a thumb. Both ends must land under a thumb CENTRE, not
    // merely under the thumb. The thumb is the only part of the input with
    // pointer-events:auto, so a hit test finds it without any measuring.
    const ends = await evalJs(`(async()=>{
        const c=${CELL("RangeSlider")};
        c.scrollIntoView({block:'center'});
        await new Promise(r=>setTimeout(r,350));
        const rs=c.querySelector('.mac-rangeslider');
        const [lo,hi]=[...rs.querySelectorAll('input[type="range"]')];
        const put=(a,b)=>{
            lo.value=String(a); hi.value=String(b);
            lo.dispatchEvent(new Event('input',{bubbles:true}));
            hi.dispatchEvent(new Event('input',{bubbles:true}));
            lo.dispatchEvent(new Event('change',{bubbles:true}));
            hi.dispatchEvent(new Event('change',{bubbles:true}));
        };
        const measure=()=>{
            const cr=rs.querySelector('.mac-rangeslider__control').getBoundingClientRect();
            const y=Math.round(cr.top+cr.height/2);
            const band={lower:null, upper:null};
            for(let x=Math.round(cr.left); x<=Math.round(cr.right); x++){
                const e=document.elementFromPoint(x,y);
                if(!e || e.type!=='range') continue;
                const key=e.classList.contains('mac-rangeslider__input--lower')?'lower':'upper';
                if(!band[key]) band[key]={from:x,to:x}; else band[key].to=x;
            }
            const f=rs.querySelector('.mac-rangeslider__fill').getBoundingClientRect();
            return {lower:band.lower?(band.lower.from+band.lower.to)/2:null,
                    upper:band.upper?(band.upper.from+band.upper.to)/2:null,
                    fillLeft:+f.left.toFixed(1), fillRight:+f.right.toFixed(1)};
        };
        put(20,80);
        await new Promise(r=>setTimeout(r,90));
        const wide=measure();
        put(0,100);
        await new Promise(r=>setTimeout(r,90));
        const full=measure();
        put(20,80);
        await new Promise(r=>setTimeout(r,90));
        return {wide, full};})()`);
    const underThumbs = (m) => !!m && m.lower !== null && m.upper !== null
        && Math.abs(m.fillLeft - m.lower) <= 1.5 && Math.abs(m.fillRight - m.upper) <= 1.5;
    ok(underThumbs(ends.wide), "fill ends under the thumb centres at 20/80", ends.wide);
    ok(underThumbs(ends.full), "fill still ends under the thumb centres at 0/100", ends.full);
}

// --- Calendar --------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("Calendar")};
        const cal=c.querySelector('.mac-calendar');
        const grid=cal?.querySelector('[role="grid"]');
        const rows=[...cal.querySelectorAll('[role="row"]')];
        const cells=[...cal.querySelectorAll('[role="gridcell"]')];
        const title=cal?.querySelector('.mac-calendar__title');
        const sel=cal?.querySelector('[aria-selected="true"]');
        return {
            grid: !!grid,
            rows: rows.length,
            cells: cells.length,
            title: title?.textContent.trim(),
            weekdays: [...cal.querySelectorAll('.mac-calendar__weekdays span')].map(s=>s.textContent.trim()),
            selected: sel?.textContent.trim(),
            selectedAttr: sel?.getAttribute('aria-selected'),
            today: cal?.querySelectorAll('.is-today').length,
            outside: cal?.querySelectorAll('.is-outside').length,
            prev: !!cal?.querySelector('[aria-label="上个月"]'),
            next: !!cal?.querySelector('[aria-label="下个月"]'),
            cellTag: cells[0]?.tagName,
        };})()`);
    ok(r.grid === true, "month is a grid", r.grid);
    ok(r.cells % 7 === 0 && r.rows * 7 === r.cells, "every row holds seven days", [r.rows, r.cells]);
    ok(r.cells >= 28 && r.cells <= 42, "grid covers the month", r.cells);
    ok(r.title === "2026 年 2 月", "title reads the visible month", r.title);
    ok(r.weekdays.length === 7 && r.weekdays[0] === "一", "week starts on Monday", r.weekdays);
    ok(r.cellTag === "BUTTON", "day cells are real buttons", r.cellTag);
    ok(r.selected === "14" && r.selectedAttr === "true", "the 14th is selected", [r.selected, r.selectedAttr]);
    ok(r.today <= 1, "at most one today marker", r.today);
    ok(r.prev && r.next, "month arrows are labelled", [r.prev, r.next]);
    ok(r.outside > 0, "adjacent-month days are marked", r.outside);

    const nav = await evalJs(`(async()=>{
        const c=${CELL("Calendar")};
        const cal=c.querySelector('.mac-calendar');
        cal.querySelector('[aria-label="下个月"]').click();
        await new Promise(r=>setTimeout(r,120));
        const jan=cal.querySelector('.mac-calendar__title')?.textContent.trim();
        cal.querySelector('[aria-label="上个月"]').click();
        cal.querySelector('[aria-label="上个月"]').click();
        await new Promise(r=>setTimeout(r,120));
        return {next: jan, back: cal.querySelector('.mac-calendar__title')?.textContent.trim()};})()`);
    ok(nav.next === "2026 年 3 月", "next month advances", nav.next);
    ok(nav.back === "2026 年 1 月", "prev month steps back", nav.back);

    const pickDay = await evalJs(`(async()=>{
        const c=${CELL("Calendar")};
        const cal=c.querySelector('.mac-calendar');
        // Back to February, then pick the 20th.
        cal.querySelector('[aria-label="下个月"]').click();
        await new Promise(r=>setTimeout(r,120));
        const day=[...cal.querySelectorAll('[role="gridcell"]')].find(b=>b.textContent.trim()==='20' && !b.classList.contains('is-outside'));
        day.click();
        await new Promise(r=>setTimeout(r,120));
        const sel=cal.querySelector('[aria-selected="true"]');
        return {picked: sel?.textContent.trim(),
                state: c.querySelector('.mac-showcase__state')?.textContent.trim(),
                data: cal.dataset.selected};})()`);
    ok(pickDay.picked === "20", "clicking a day selects it", pickDay.picked);
    ok(/2026-02-20/.test(pickDay.data ?? ""), "selected date is reported as YYYY-MM-DD", pickDay.data);
    ok(/2026-02-20/.test(pickDay.state ?? ""), "Calendar readout follows", pickDay.state);

    const keys = await evalJs(`(async()=>{
        const c=${CELL("Calendar")};
        const cal=c.querySelector('.mac-calendar');
        const sel=cal.querySelector('[aria-selected="true"]');
        sel.focus();
        sel.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,80));
        const focused=document.activeElement?.textContent?.trim();
        // A synthetic keydown cannot trigger a button's native Enter activation,
        // so the day is committed the way a real keypress ends up committing it.
        document.activeElement?.click();
        await new Promise(r=>setTimeout(r,100));
        return {focused, data: cal.dataset.selected};})()`);
    ok(keys.focused === "21", "ArrowRight moves one day", keys.focused);
    ok(/2026-02-21/.test(keys.data ?? ""), "activating the focused day selects it", keys.data);

    const bounds = await evalJs(`(()=>{
        const c=${CELL("Calendar")};
        const cal=c.querySelector('.mac-calendar');
        return {disabled: cal.querySelectorAll('[role="gridcell"][disabled]').length};})()`);
    ok(bounds.disabled === 0, "no bounds means nothing is disabled", bounds);
}

// --- leak / error sweep ----------------------------------------------------
{
    const final = await evalJs(`({menus: document.querySelectorAll('.mac-menu').length,
        open: document.querySelectorAll('.mac-menu.is-open').length})`);
    ok(final.menus === 0 && final.open === 0, "no overlay left mounted", final);
    ok(consoleErrors.length === 0, "no runtime errors captured", consoleErrors.slice(0, 3));
}

// --- screenshots -----------------------------------------------------------
await shot(`${CELL("List")}`, "p3-list.png", 2);
await shot(`${CELL("Stepper")}`, "p3-stepper.png", 3);
await shot(`${CELL("SplitButton")}`, "p3-split.png", 2);
await shot(`${CELL("TagInput")}`, "p3-tag.png", 2);
await shot(`${CELL("RangeSlider")}`, "p3-range.png", 2);
await shot(`${CELL("Calendar")}`, "p3-calendar.png", 2);

console.log(`\n${pass}/${pass + fail} assertions OK`);
ws.close();
proc.kill();
server.close();
setTimeout(() => process.exit(0), 200);
