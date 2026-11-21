// Batch 5 audit: ColorWell, LevelIndicator, TimePicker, TabBar, ActionSheet.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8393;
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
    "--headless=new", "--remote-debugging-port=9653", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot14")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9653/json/list")).json();
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
for (const name of ["ColorWell", "LevelIndicator", "TimePicker", "TabBar", "ActionSheet"]) {
    ok(await evalJs(`!!${CELL(name)}`), `${name} cell rendered`);
}

const heading = await evalJs(`[...document.querySelectorAll('.mac-showcase__heading')].map(h=>h.textContent.replace(/\\s+/g,'').trim()).find(t=>/Controls/.test(t))`);
ok(/Controls44/.test(heading ?? ""), "the section heading counts 44 controls", heading);

// --- ColorWell -------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("ColorWell")};
        const well=c.querySelector('.mac-colorwell');
        const input=well.querySelector('input');
        const swatch=well.querySelector('.mac-colorwell__swatch');
        const ib=input.getBoundingClientRect(), sb=swatch.getBoundingClientRect();
        const cs=getComputedStyle(swatch);
        return {
            type: input.getAttribute('type'),
            opacity: getComputedStyle(input).opacity,
            label: input.getAttribute('aria-label'),
            swatchHidden: swatch.getAttribute('aria-hidden'),
            sameBox: Math.round(ib.width)===Math.round(sb.width) && Math.round(ib.height)===Math.round(sb.height),
            box: [Math.round(sb.width), Math.round(sb.height)],
            bg: cs.backgroundColor,
            // Each layer ends in "<colour> <x> <y> <blur> <spread>"; counting the
            // spread tokens is immune to the commas inside the colour functions.
            shadowLayers: (cs.boxShadow.match(/0px 0px 0px \\d+px/g) || []).length,
            shadow: cs.boxShadow,
            inputValue: input.value,
            cursor: getComputedStyle(input).cursor,
        };})()`);
    ok(r.type === "color", "the well wraps a native colour input", r.type);
    ok(r.opacity === "0", "the native chip is invisible but still clickable", r.opacity);
    ok(r.label === "强调色", "the input carries the accessible name", r.label);
    ok(r.swatchHidden === "true", "the swatch is decoration only", r.swatchHidden);
    ok(r.sameBox, "the input covers the swatch exactly", r.box);
    ok(r.box[0] === r.box[1] && r.box[0] >= 20, "the well is square", r.box);
    ok(r.bg === "rgb(10, 132, 255)", "the swatch paints the value", r.bg);
    ok(r.inputValue === "#0a84ff", "the native input is given the same colour as #rrggbb", r.inputValue);
    ok(r.cursor === "pointer", "the well reads as clickable", r.cursor);
    ok(/inset/.test(r.shadow ?? "") && /0px 0px 0px 1px/.test(r.shadow ?? ""),
        "two rings: an outer hairline and an inner white one", r.shadow);
    ok(r.shadowLayers === 2, "exactly two shadow layers while idle", r.shadowLayers);

    const focused = await evalJs(`(async()=>{
        const c=${CELL("ColorWell")};
        const input=c.querySelector('.mac-colorwell input');
        const swatch=c.querySelector('.mac-colorwell__swatch');
        input.focus();
        await new Promise(r=>setTimeout(r,220));
        return {shadow: getComputedStyle(swatch).boxShadow,
                focused: document.activeElement===input};})()`);
    ok(focused.focused, "the input takes focus");
    ok(/0px 0px 0px 3px/.test(focused.shadow ?? ""), "focus draws the ring on the swatch", focused.shadow);

    const picked = await evalJs(`(async()=>{
        const c=${CELL("ColorWell")};
        const input=c.querySelector('.mac-colorwell input');
        const swatch=c.querySelector('.mac-colorwell__swatch');
        input.value='#ff3b30';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        const during=getComputedStyle(swatch).backgroundColor;
        const stateBefore=c.querySelector('.mac-showcase__state').textContent.trim();
        input.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,80));
        return {during, stateBefore, after: c.querySelector('.mac-showcase__state').textContent.trim(),
                bg: getComputedStyle(swatch).backgroundColor};})()`);
    ok(picked.during === "rgb(255, 59, 48)", "`input` repaints the swatch live", picked.during);
    ok(/0a84ff/.test(picked.stateBefore ?? ""), "`input` alone reports nothing", picked.stateBefore);
    ok(/ff3b30/.test(picked.after ?? ""), "`change` reports the committed colour", picked.after);

    await shot(`${CELL("ColorWell")}`, "p5-colorwell.png");
}

// --- LevelIndicator --------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("LevelIndicator")};
        const meters=[...c.querySelectorAll('.mac-levelindicator')];
        const flat=meters[0], tall=meters[1];
        const segs=(m)=>[...m.querySelectorAll('.mac-levelindicator__segment')];
        const bands=(m)=>{const out={ok:0,warn:0,hot:0};
            for(const s of segs(m)) out[s.dataset.band]++; return out;};
        return {
            count: meters.length,
            role: flat.getAttribute('role'),
            min: flat.getAttribute('aria-valuemin'),
            max: flat.getAttribute('aria-valuemax'),
            now: flat.getAttribute('aria-valuenow'),
            text: flat.getAttribute('aria-valuetext'),
            label: flat.getAttribute('aria-label'),
            tab: flat.tabIndex,
            segs: segs(flat).length,
            lit: segs(flat).filter(s=>s.classList.contains('is-on')).length,
            bands: bands(flat),
            litColor: getComputedStyle(segs(flat)[0]).backgroundColor,
            litColor13: getComputedStyle(segs(flat)[12]).backgroundColor,
            unlitColor: getComputedStyle(segs(flat)[19]).backgroundColor,
            tallSegs: segs(tall).length,
            tallLit: segs(tall).filter(s=>s.classList.contains('is-on')).length,
            tallBands: bands(tall),
            tallDirection: getComputedStyle(tall).flexDirection,
            tallColor: getComputedStyle(segs(tall)[0]).backgroundColor,
            tallNow: tall.getAttribute('aria-valuenow'),
            firstRadius: getComputedStyle(segs(flat)[0]).borderTopLeftRadius,
            firstTopRight: getComputedStyle(segs(flat)[0]).borderTopRightRadius,
            midRadius: getComputedStyle(segs(flat)[5]).borderTopLeftRadius,
        };})()`);
    ok(r.count === 2, "two meters rendered", r.count);
    ok(r.role === "meter", "the root is a meter", r.role);
    ok(r.min === "0" && r.max === "100", "the scale is 0..100 percent", [r.min, r.max]);
    ok(r.now === "62" && r.text === "62%", "0.62 reads as 62%", [r.now, r.text]);
    ok(r.label === "输入电平", "the meter carries its name", r.label);
    ok(r.tab === -1, "a meter is not a tab stop", r.tab);
    ok(r.segs === 20, "twenty segments", r.segs);
    ok(r.lit === 13, "13 of 20 lit for 0.62 (rounded up)", r.lit);
    ok(r.bands.ok === 14 && r.bands.warn === 4 && r.bands.hot === 2,
        "bands sit at fixed positions: 14 green, 4 amber, 2 red", r.bands);
    ok(r.litColor === "rgb(52, 199, 89)" || /rgb\(52, 199/.test(r.litColor ?? ""),
        "a lit segment uses the success colour", r.litColor);
    ok(!/rgb\(52, 199/.test(r.unlitColor ?? ""), "an unlit segment keeps the track colour", r.unlitColor);
    ok(r.tallSegs === 16 && r.tallLit === 16, "0.94 lights all sixteen segments", [r.tallSegs, r.tallLit]);
    ok(r.tallDirection === "column-reverse", "a vertical meter grows upward", r.tallDirection);
    ok(r.tallNow === "94", "the vertical meter reports its own level", r.tallNow);
    ok(r.tallBands.ok === 11 && r.tallBands.warn === 3 && r.tallBands.hot === 2,
        "sixteen segments split 11/3/2", r.tallBands);
    ok(r.firstRadius !== "0px" && r.firstTopRight === "0px" && r.midRadius === "1px",
        "only the two end segments are rounded, and only on their outer corners",
        [r.firstRadius, r.firstTopRight, r.midRadius]);

    await shot(`${CELL("LevelIndicator")}`, "p5-level.png");
}

// --- TimePicker ------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("TimePicker")};
        const root=c.querySelector('.mac-timepicker');
        const input=root.querySelector('input');
        const label=root.querySelector('.mac-timepicker__label');
        const icon=root.querySelector('.mac-timepicker__icon');
        const control=root.querySelector('.mac-timepicker__control');
        const cb=control.getBoundingClientRect();
        return {
            type: input.getAttribute('type'),
            step: input.getAttribute('step'),
            value: input.value,
            id: input.id,
            labelFor: label?label.getAttribute('for'):null,
            labelText: label?label.textContent.trim():null,
            controlH: Math.round(cb.height),
            iconPointer: icon?getComputedStyle(icon).pointerEvents:null,
            iconInside: icon?icon.getBoundingClientRect().right <= cb.right+0.5:null,
            numeric: getComputedStyle(input).fontVariantNumeric,
            border: getComputedStyle(control).borderTopWidth,
        };})()`);
    ok(r.type === "time", "a native time input is inside", r.type);
    ok(r.step === "60", "the step reaches the native attribute", r.step);
    ok(r.value === "09:30", "the initial time is set", r.value);
    ok(r.labelFor === r.id && r.labelText === "开始时间", "the label is wired to the input", r.labelFor);
    ok(r.controlH >= 18 && r.controlH <= 40, "the field is one control tall", r.controlH);
    ok(r.border === "1px", "the shell draws the hairline", r.border);
    ok(r.iconPointer === "none", "the glyph never eats the click", r.iconPointer);
    ok(r.iconInside === true, "the glyph sits inside the shell", r.iconInside);
    ok(r.numeric === "tabular-nums", "digits are tabular so the field does not jitter", r.numeric);

    const committed = await evalJs(`(async()=>{
        const c=${CELL("TimePicker")};
        const input=c.querySelector('.mac-timepicker input');
        input.value='14:15';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,60));
        const before=c.querySelector('.mac-showcase__state').textContent.trim();
        input.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,80));
        return {before, after: c.querySelector('.mac-showcase__state').textContent.trim()};})()`);
    ok(/09:30/.test(committed.before ?? ""), "`input` alone reports nothing", committed.before);
    ok(/14:15/.test(committed.after ?? ""), "`change` reports the committed time", committed.after);

    await evalJs(`(async()=>{const i=${CELL("TimePicker")}.querySelector('.mac-timepicker input'); i.value='09:30';
        i.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,60)); return true;})()`);
    await shot(`${CELL("TimePicker")}`, "p5-time.png");
}

// --- TabBar ----------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("TabBar")};
        const bar=c.querySelector('.mac-tabbar');
        const items=[...bar.querySelectorAll('[role="tab"]')];
        const b=bar.getBoundingClientRect();
        return {
            role: bar.getAttribute('role'),
            label: bar.getAttribute('aria-label'),
            tag: bar.tagName,
            items: items.length,
            labels: items.map(i=>i.querySelector('.mac-tabbar__label').textContent.trim()),
            selected: items.filter(i=>i.getAttribute('aria-selected')==='true').map(i=>i.dataset.value),
            tabStops: items.filter(i=>i.tabIndex===0).length,
            tabs: items.map(i=>i.tabIndex),
            badges: items.map(i=>i.querySelector('.mac-tabbar__badge')?.textContent.trim() ?? null),
            badgePos: (()=>{const bd=items[0].querySelector('.mac-tabbar__badge');
                return bd?getComputedStyle(bd).position:null;})(),
            height: Math.round(b.height),
            selectedColor: getComputedStyle(items[0]).color,
            idleColor: getComputedStyle(items[1]).color,
            borderTop: getComputedStyle(bar).borderTopWidth,
            icons: items.map(i=>!!i.querySelector('.mac-tabbar__icon svg')),
            iconAbove: (()=>{const ic=items[0].querySelector('.mac-tabbar__icon').getBoundingClientRect();
                const lb=items[0].querySelector('.mac-tabbar__label').getBoundingClientRect();
                return ic.top < lb.top;})(),
        };})()`);
    ok(r.tag === "NAV" && r.role === "tablist", "the bar is a nav holding a tablist", [r.tag, r.role]);
    ok(r.label === "示例标签栏", "the list is named", r.label);
    ok(r.items === 4, "four tabs", r.items);
    ok(JSON.stringify(r.labels) === JSON.stringify(["收件箱", "星标", "草稿", "归档"]),
        "captions render in order", r.labels);
    ok(JSON.stringify(r.selected) === JSON.stringify(["inbox"]), "inbox starts selected", r.selected);
    ok(r.tabStops === 1, "the whole bar is one tab stop", r.tabs);
    ok(JSON.stringify(r.badges) === JSON.stringify(["3", null, null, null]),
        "only the first tab carries a badge", r.badges);
    ok(r.badgePos === "absolute", "the badge is pinned to the glyph", r.badgePos);
    ok(r.height >= 44 && r.height <= 62, "the bar is a platform-height bar", r.height);
    ok(r.selectedColor === "rgb(0, 122, 255)", "the selected tab is accent", r.selectedColor);
    ok(r.idleColor !== r.selectedColor, "an idle tab is not", r.idleColor);
    ok(r.borderTop === "1px", "a hairline separates the bar from the pane", r.borderTop);
    ok(r.icons.every(Boolean), "every tab draws a glyph");
    ok(r.iconAbove === true, "the glyph sits above the caption", r.iconAbove);

    const kb = await evalJs(`(async()=>{
        const c=${CELL("TabBar")};
        const bar=c.querySelector('.mac-tabbar');
        const items=[...bar.querySelectorAll('[role="tab"]')];
        const fire=(k)=>{bar.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));};
        const snap=()=>({sel: items.filter(i=>i.getAttribute('aria-selected')==='true').map(i=>i.dataset.value)[0],
                         focused: items.indexOf(document.activeElement),
                         state: c.querySelector('.mac-showcase__state').textContent.trim()});
        items[0].focus();
        fire('ArrowRight'); await new Promise(r=>setTimeout(r,60)); const right=snap();
        fire('End'); await new Promise(r=>setTimeout(r,60)); const end=snap();
        fire('ArrowRight'); await new Promise(r=>setTimeout(r,60)); const wrap=snap();
        fire('Home'); await new Promise(r=>setTimeout(r,60)); const home=snap();
        return {right, end, wrap, home, tabStops: items.filter(i=>i.tabIndex===0).length};})()`);
    ok(kb.right.sel === "starred" && kb.right.focused === 1,
        "ArrowRight selects and focuses the next tab", kb.right);
    ok(/starred/.test(kb.right.state ?? ""), "onChange reported the move", kb.right.state);
    ok(kb.end.sel === "archive" && kb.end.focused === 3, "End jumps to the last tab", kb.end.sel);
    ok(kb.wrap.sel === "inbox" && kb.wrap.focused === 0, "ArrowRight on the last tab wraps", kb.wrap.sel);
    ok(kb.home.sel === "inbox" && kb.home.focused === 0, "Home returns to the first", kb.home.sel);
    ok(kb.tabStops === 1, "the roving tab stop survives the walk", kb.tabStops);

    await shot(`${CELL("TabBar")}`, "p5-tabbar.png");
}

// --- ActionSheet -----------------------------------------------------------
{
    const before = await evalJs(`(()=>({
        open: !!document.querySelector('.mac-actionsheet'),
        buttons: ${CELL("ActionSheet")}.querySelectorAll('button').length,
    }))()`);
    ok(before.open === false, "the sheet is not in the document until it opens");

    const opened = await evalJs(`(async()=>{
        const trigger=${CELL("ActionSheet")}.querySelector('button');
        trigger.focus();
        trigger.click();
        await new Promise(r=>setTimeout(r,260));
        const panel=document.querySelector('.mac-actionsheet');
        if(!panel) return {missing:true};
        const scrim=panel.parentElement;
        const pb=panel.getBoundingClientRect();
        const actions=[...panel.querySelectorAll('.mac-actionsheet__action')];
        const cancel=[...panel.querySelectorAll('.mac-actionsheet__cancel')];
        const destructive=panel.querySelector('[data-tone="destructive"]');
        const list=panel.querySelector('.mac-actionsheet__list');
        return {
            scrimClass: scrim.className,
            role: panel.getAttribute('role'),
            modal: panel.getAttribute('aria-modal'),
            title: panel.querySelector('.mac-actionsheet__title')?.textContent.trim(),
            message: panel.querySelector('.mac-actionsheet__message')?.textContent.trim(),
            actions: actions.map(a=>a.dataset.value),
            actionLabels: actions.map(a=>a.textContent.trim()),
            cancel: cancel.map(b=>b.textContent.trim()),
            destructiveColor: destructive?getComputedStyle(destructive).color:null,
            bottomGap: Math.round(window.innerHeight - pb.bottom),
            width: Math.round(pb.width),
            centred: Math.abs((pb.left+pb.width/2) - window.innerWidth/2),
            listRadius: getComputedStyle(list).borderTopLeftRadius,
            focusInside: !!panel.contains(document.activeElement),
            divider: (()=>{const s=getComputedStyle(actions[1],'::before');
                return {h:s.height, pe:s.pointerEvents, bg:s.backgroundColor};})(),
            cancelSeparate: cancel[0].parentElement === panel,
            headerRadius: getComputedStyle(panel.querySelector('.mac-actionsheet__header')).borderTopLeftRadius,
        };})()`);
    ok(opened.scrimClass === "mac-dialog__scrim mac-actionsheet__backdrop is-open",
        "the backdrop reuses the dialog scrim and reaches its open state", opened.scrimClass);
    ok(opened.role === "dialog" && opened.modal === "true", "the panel is a modal dialog", [opened.role, opened.modal]);
    ok(opened.title === "删除这个容器？" && /无法撤销/.test(opened.message ?? ""),
        "title and message render", [opened.title]);
    ok(JSON.stringify(opened.actions) === JSON.stringify(["stop", "delete"]),
        "two actions in the list, cancel torn out of it", opened.actions);
    ok(JSON.stringify(opened.cancel) === JSON.stringify(["取消"]),
        "cancel is its own button", opened.cancel);
    ok(opened.cancelSeparate === true, "cancel is a child of the panel, not of the list", opened.cancelSeparate);
    ok(opened.destructiveColor === "rgb(255, 59, 48)",
        "the destructive row is red", opened.destructiveColor);
    ok(opened.bottomGap === 0, "the sheet is flush with the bottom edge", opened.bottomGap);
    ok(opened.centred <= 1 && opened.width <= 520, "it is centred and capped to a phone width",
        {wc: opened.width, off: opened.centred});
    ok(opened.focusInside === true, "focus moved into the sheet");
    ok(opened.divider.h === "1px" && opened.divider.pe === "none",
        "the row divider is a click-through hairline", opened.divider);
    ok(parseFloat(opened.listRadius) >= 8 && parseFloat(opened.headerRadius) >= 8,
        "both groups are rounded blocks", [opened.listRadius, opened.headerRadius]);

    await shot(`document.querySelector('.mac-actionsheet')`, "p5-sheet.png", 2, 24);

    const esc = await evalJs(`(async()=>{
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,240));
        return {open: !!document.querySelector('.mac-actionsheet'),
                focusText: document.activeElement?.textContent?.trim(),
                inCell: ${CELL("ActionSheet")}.contains(document.activeElement),
                state: ${CELL("ActionSheet")}.querySelector('.mac-showcase__state').textContent.trim()};})()`);
    ok(esc.open === false, "Escape closes the sheet");
    ok(esc.inCell === true && /弹出操作表/.test(esc.focusText ?? ""),
        "focus returns to the trigger", esc.focusText);
    ok(/未选择/.test(esc.state ?? ""), "closing without picking reports nothing", esc.state);

    const picked = await evalJs(`(async()=>{
        const c=${CELL("ActionSheet")};
        c.querySelector('button').click();
        await new Promise(r=>setTimeout(r,260));
        const destructive=document.querySelector('.mac-actionsheet [data-tone="destructive"]');
        destructive.click();
        await new Promise(r=>setTimeout(r,240));
        return {open: !!document.querySelector('.mac-actionsheet'),
                state: c.querySelector('.mac-showcase__state').textContent.trim()};})()`);
    ok(picked.open === false, "picking an action dismisses the sheet");
    ok(/delete/.test(picked.state ?? ""), "onSelect reported the action", picked.state);

    const backdrop = await evalJs(`(async()=>{
        const c=${CELL("ActionSheet")};
        c.querySelector('button').click();
        await new Promise(r=>setTimeout(r,240));
        const scrim=document.querySelector('.mac-actionsheet__backdrop');
        scrim.click();
        await new Promise(r=>setTimeout(r,240));
        return {open: !!document.querySelector('.mac-actionsheet')};})()`);
    ok(backdrop.open === false, "a click on the backdrop dismisses the sheet");

    const cancelPath = await evalJs(`(async()=>{
        const c=${CELL("ActionSheet")};
        c.querySelector('button').click();
        await new Promise(r=>setTimeout(r,240));
        document.querySelector('.mac-actionsheet .mac-actionsheet__cancel').click();
        await new Promise(r=>setTimeout(r,240));
        return {open: !!document.querySelector('.mac-actionsheet'),
                state: c.querySelector('.mac-showcase__state').textContent.trim()};})()`);
    ok(cancelPath.open === false, "Cancel dismisses the sheet");
    ok(/delete/.test(cancelPath.state ?? ""), "Cancel reports no action of its own", cancelPath.state);
}

ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
