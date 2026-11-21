// Batch 4 audit: TreeView, Skeleton, CommandPalette, InlineNotice, Rating, Card,
// plus the new Table sort/filter behaviour.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8385;
const BASE = "/macos-ui-kit/";
const TY = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ttf": "font/ttf", ".woff2": "font/woff2"};

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
    "--headless=new", "--remote-debugging-port=9645", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot10")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        targets = await (await fetch("http://127.0.0.1:9645/json/list")).json();
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
for (const name of ["TreeView", "Skeleton", "CommandPalette", "InlineNotice", "Rating", "Card"]) {
    ok(await evalJs(`!!${CELL(name)}`), `${name} cell rendered`);
}

const counts = await evalJs(`[...document.querySelectorAll('.mac-showcase__heading')].map(h=>h.textContent.replace(/\\s+/g,'').trim())`);
ok(Array.isArray(counts) && counts.some((c) => { const m = /Controls(\d+)/.exec(c); return m && Number(m[1]) >= 39; }), "showcase advertises at least 39 controls", counts);

// --- TreeView --------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("TreeView")};
        const tree=c.querySelector('[role="tree"]');
        const rows=[...c.querySelectorAll('.mac-treeview__row')];
        const vis=rows.filter(x=>x.getClientRects().length>0);
        const tw=[...c.querySelectorAll('.mac-treeview__twisty')];
        const sp=[...c.querySelectorAll('.mac-treeview__spacer')];
        return {
            treeLabel: tree?tree.getAttribute('aria-label'):null,
            rows: rows.length,
            visible: vis.length,
            levels: rows.map(x=>x.getAttribute('aria-level')),
            expanded: rows.filter(x=>x.getAttribute('aria-expanded')!==null)
                        .map(x=>x.getAttribute('aria-expanded')),
            twisties: tw.length,
            spacers: sp.length,
            roles: tw.map(x=>x.tagName+':'+x.getAttribute('role')),
            tabs: vis.map(x=>x.tabIndex),
            tabStops: vis.filter(x=>x.tabIndex===0).length,
            selected: rows.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.value),
            pad: ['src','controls','table.ts'].map(v=>{
                const row=rows.find(x=>x.querySelector('.mac-treeview__label')?.textContent.trim()===v);
                return row?Math.round(parseFloat(getComputedStyle(row).paddingLeft)*100)/100:null;
            }),
            twistyW: tw[0]?Math.round(tw[0].getBoundingClientRect().width):null,
            spacerW: sp[0]?Math.round(sp[0].getBoundingClientRect().width):null,
            disabled: rows.filter(x=>x.getAttribute('aria-disabled')==='true').map(x=>x.dataset.value),
        };})()`);
    ok(r.treeLabel === "项目文件", "tree carries its aria-label", r.treeLabel);
    ok(r.rows === 8, "8 tree rows in the DOM", r.rows);
    ok(r.visible === 8, "both folders start expanded, so all 8 rows are visible", r.visible);
    ok(JSON.stringify(r.levels) === JSON.stringify(["1", "2", "3", "3", "2", "2", "1", "1"]),
        "aria-level walks 1/2/3/1 by depth", r.levels);
    ok(r.expanded.length === 2 && r.expanded.every((e) => e === "true"),
        "the two parents expose aria-expanded=true", r.expanded);
    ok(r.twisties === 2, "only parents get a twisty", r.twisties);
    ok(r.spacers === 6 && Math.abs(r.twistyW - r.spacerW) <= 1,
        "leaves get a spacer as wide as the twisty", {spacers: r.spacers, twisty: r.twistyW, spacer: r.spacerW});
    ok(r.roles.every((x) => x === "BUTTON:null" || x === "BUTTON:"), "twisties are plain buttons", r.roles);
    ok(r.tabStops === 1, "exactly one row owns the tab stop", r.tabs);
    ok(r.selected.length === 1 && r.selected[0] === "src", "src starts selected", r.selected);
    ok(r.pad.every((d) => d !== null) && Math.abs(r.pad[1] - r.pad[0] - 14) < 0.75 && Math.abs(r.pad[2] - r.pad[1] - 14) < 0.75,
        "indent is exactly 14px per level", r.pad);    ok(r.disabled.join(",") === "dist" && r.disabled.length === 1, "only dist is disabled", r.disabled);

    // Keyboard: ArrowDown moves to the next visible row.
    const kb = await evalJs(`(async()=>{
        const c=${CELL("TreeView")};
        const rows=[...c.querySelectorAll('.mac-treeview__row')];
        const lab=i=>rows[i].querySelector('.mac-treeview__label').textContent.trim();
        rows[0].focus();
        const fire=(k)=>{const t=document.activeElement;
            t.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));};
        fire('ArrowDown');
        await new Promise(r=>setTimeout(r,40));
        const afterDown=[...rows].indexOf(document.activeElement);
        fire('ArrowRight');
        await new Promise(r=>setTimeout(r,40));
        const afterRight=[...rows].indexOf(document.activeElement);
        fire('ArrowLeft');
        await new Promise(r=>setTimeout(r,40));
        const afterLeft=[...rows].indexOf(document.activeElement);
        fire('ArrowLeft');
        await new Promise(r=>setTimeout(r,80));
        const controlsExpanded=rows[1].getAttribute('aria-expanded');
        const vis=[...rows].filter(x=>x.getClientRects().length>0).length;
        const stopped=[...rows].filter(x=>x.getClientRects().length>0 && x.tabIndex===0).length;
        return {afterDown, afterDownLabel: rows[afterDown]?(rows[afterDown].querySelector('.mac-treeview__label')?.textContent.trim()):null,
                afterRight, afterRightLabel: rows[afterRight]?rows[afterRight].querySelector('.mac-treeview__label')?.textContent.trim():null,
                afterLeft, afterLeftLabel: rows[afterLeft]?rows[afterLeft].querySelector('.mac-treeview__label')?.textContent.trim():null,
                controlsExpanded, vis, stopped,
                focusedIndex: rows.indexOf(document.activeElement),
                toggle: c.querySelector('.mac-treeview')?.dataset.toggle};})()`);
    ok(kb.afterDown === 1 && kb.afterDownLabel === "controls", "ArrowDown walks to the next visible row", kb.afterDownLabel);
    ok(kb.afterRight === 2 && kb.afterRightLabel === "table.ts",
        "ArrowRight on an expanded parent enters its first child", kb.afterRightLabel);
    ok(kb.afterLeft === 1, "ArrowLeft returns to the parent row", kb.afterLeftLabel);
    ok(kb.controlsExpanded === "false", "a second ArrowLeft collapses the parent", kb.controlsExpanded);
    ok(kb.vis === 6, "the collapsed subtree leaves 6 visible rows", kb.vis);
    ok(kb.stopped === 1, "the roving tab stop survives the collapse", kb.stopped);
    ok(kb.focusedIndex === 1, "focus stays on the row that collapsed", kb.focusedIndex);
    ok(kb.toggle === "controls:false", "onToggle reported the collapse", kb.toggle);

    await shot(`${CELL("TreeView")}`, "p4-treeview.png");
}

// --- Skeleton --------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("Skeleton")};
        const roots=[...c.querySelectorAll('.mac-skeleton')];
        const pick=(v)=>roots.find(x=>x.classList.contains('mac-skeleton--'+v));
        const text=pick('text'), circle=pick('circle'), rect=pick('rect');
        const bars=(e)=>[...e.querySelectorAll('.mac-skeleton__bar')];
        const g=(e)=>{const b=e.getBoundingClientRect(); return {w:Math.round(b.width), h:Math.round(b.height)};};
        const tb=bars(text);
        const cs=getComputedStyle(tb[0]);
        return {
            count: roots.length,
            hidden: roots.every(x=>x.getAttribute('aria-hidden')==='true'),
            animated: roots.every(x=>x.classList.contains('is-animated')),
            textBars: tb.length,
            textH: tb.map(x=>Math.round(x.getBoundingClientRect().height)),
            textW: tb.map(x=>Math.round(x.getBoundingClientRect().width)),
            textBox: g(text),
            lastRatio: +(tb[2].getBoundingClientRect().width / text.getBoundingClientRect().width).toFixed(3),
            circleBox: g(circle),
            rectBox: g(rect),
            gradient: cs.backgroundImage !== 'none',
            overflow: getComputedStyle(text).overflow,
            textGap: Math.round(tb[1].getBoundingClientRect().top - tb[0].getBoundingClientRect().bottom),
        };})()`);
    ok(r.count === 3, "three skeletons rendered", r.count);
    ok(r.hidden, "skeletons are aria-hidden", r.hidden);
    ok(r.animated, "the shimmer class is on by default", r.animated);
    ok(r.gradient, "bars paint a gradient, not a flat fill");
    ok(r.textBars === 3, "text variant honours lines: 3", r.textBars);
    ok(r.textH.every((h) => h >= 7 && h <= 12), "text bars are line-height sized", r.textH);
    ok(r.textBox.w === 220, "text skeleton honours width: 220", r.textBox.w);
    ok(Math.abs(r.lastRatio - 0.6) < 0.02, "the last text bar is 60% of the box", r.lastRatio);
    ok(r.circleBox.w === 40 && r.circleBox.h === 40, "circle is a 40x40 box", r.circleBox);
    ok(r.rectBox.w === 140 && r.rectBox.h === 56, "rect honours 140x56", r.rectBox);
    ok(r.textGap > 0 && r.textGap <= 12, "lines have a real gap between them", r.textGap);

    // setWidth / setHeight / variant swap, then restore.
    const mut = await evalJs(`(async()=>{
        const c=${CELL("Skeleton")};
        const rect=[...c.querySelectorAll('.mac-skeleton')].find(x=>x.classList.contains('mac-skeleton--rect'));
        const before=Math.round(rect.getBoundingClientRect().width);
        const bar=rect.querySelector('.mac-skeleton__bar');
        const barH=Math.round(bar.getBoundingClientRect().height);
        return {before, barH, hasAnim: rect.classList.contains('is-animated')};})()`);
    ok(mut.before === 140 && mut.barH === 56, "rect height lives on the bar, width on the root", mut);

    await shot(`${CELL("Skeleton")}`, "p4-skeleton.png");
}

// --- CommandPalette --------------------------------------------------------
{
    const before = await evalJs(`(()=>({
        open: !!document.querySelector('.mac-commandpalette'),
        buttons: ${CELL("CommandPalette")}.querySelectorAll('button').length,
        state: ${CELL("CommandPalette")}.querySelector('.mac-showcase__state')?.textContent.trim(),
    }))()`);
    ok(before.open === false, "the palette is not in the DOM until it opens");
    ok(before.buttons === 1, "the cell holds one trigger button", before.buttons);

    const opened = await evalJs(`(async()=>{
        ${CELL("CommandPalette")}.querySelector('button').click();
        await new Promise(r=>setTimeout(r,220));
        const dlg=document.querySelector('.mac-commandpalette');
        if(!dlg) return {missing:true};
        const scrim=dlg.parentElement;
        const input=dlg.querySelector('.mac-commandpalette__input');
        const opts=[...dlg.querySelectorAll('[role="option"]')];
        const list=dlg.querySelector('[role="listbox"]');
        const b=dlg.getBoundingClientRect();
        return {
            scrimClass: scrim?scrim.className:null,
            role: dlg.getAttribute('role'),
            modal: dlg.getAttribute('aria-modal'),
            label: dlg.getAttribute('aria-label'),
            centred: Math.abs((b.left+b.width/2) - window.innerWidth/2),
            topThird: b.top < window.innerHeight/2,
            inputFocused: document.activeElement===input,
            combo: input.getAttribute('role'),
            expanded: input.getAttribute('aria-expanded'),
            controls: input.getAttribute('aria-controls')===list?.id,
            auto: input.getAttribute('aria-autocomplete'),
            options: opts.length,
            groups: [...dlg.querySelectorAll('.mac-commandpalette__group')].length,
            activeDesc: input.getAttribute('aria-activedescendant'),
            firstSelected: opts[0]?.getAttribute('aria-selected'),
            activeMatchesFirst: input.getAttribute('aria-activedescendant')===opts[0]?.id,
            empty: dlg.querySelector('.mac-commandpalette__empty')?.hasAttribute('hidden'),
            isOpenClass: scrim?scrim.classList.contains('is-open'):null,
        };})()`);
    ok(opened.scrimClass === "mac-dialog__scrim mac-commandpalette__backdrop is-open",
        "the backdrop reuses the dialog scrim and lands in its open state", opened.scrimClass);
    ok(opened.role === "dialog" && opened.modal === "true", "the panel is a modal dialog", [opened.role, opened.modal]);
    ok(opened.centred <= 1 && opened.topThird, "the panel is horizontally centred and in the top half",
        {off: opened.centred});
    ok(opened.inputFocused, "opening focuses the search input");
    ok(opened.combo === "combobox" && opened.expanded === "true" && opened.auto === "list",
        "the input is a combobox wired to the list", [opened.combo, opened.expanded, opened.auto]);
    ok(opened.controls === true, "aria-controls points at the listbox id");
    ok(opened.options === 6, "all six commands are listed", opened.options);
    ok(opened.groups === 3, "commands are grouped into 3 sections", opened.groups);
    ok(opened.activeMatchesFirst && opened.firstSelected === "true",
        "the first row starts as the active descendant", opened.activeDesc);
    ok(opened.empty === true, "the empty state stays hidden while there are matches", opened.empty);

    // Type a query: subsequence matching, group pruning, count.
    const typed = await evalJs(`(async()=>{
        const dlg=document.querySelector('.mac-commandpalette');
        const input=dlg.querySelector('.mac-commandpalette__input');
        input.value='导出';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,160));
        const opts=[...dlg.querySelectorAll('[role="option"]')];
        return {count: opts.length,
                labels: opts.map(o=>o.textContent.replace(/\\s+/g,' ').trim()),
                groups: [...dlg.querySelectorAll('.mac-commandpalette__group')].length,
                active: input.getAttribute('aria-activedescendant'),
                firstId: opts[0]?.id,
                empty: dlg.querySelector('.mac-commandpalette__empty')?.hasAttribute('hidden')};})()`);
    ok(typed.count === 2, "the query narrows the list to 2 rows", typed.count);
    ok(typed.groups === 1, "the emptied group is removed, not left as a header", typed.groups);
    ok(typed.active === typed.firstId, "the active descendant follows the filtered first row", typed.active);
    ok(typed.empty === true, "no-match text stays hidden when there is a match", typed.empty);

    // A query with no hits shows the empty row.
    const none = await evalJs(`(async()=>{
        const dlg=document.querySelector('.mac-commandpalette');
        const input=dlg.querySelector('.mac-commandpalette__input');
        input.value='zzzz';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,160));
        const empty=dlg.querySelector('.mac-commandpalette__empty');
        return {opts: dlg.querySelectorAll('[role="option"]').length,
                emptyHidden: empty?.hasAttribute('hidden'),
                emptyText: empty?.textContent.trim(),
                listHidden: dlg.querySelector('[role="listbox"]')?.hasAttribute('hidden'),
                expanded: input.getAttribute('aria-expanded')};})()`);
    ok(none.opts === 0 && none.emptyHidden === false, "a miss reveals the empty row", none);
    ok(typeof none.emptyText === "string" && none.emptyText.length > 0, "the empty row explains itself", none.emptyText);
    ok(none.expanded === "false", "aria-expanded drops to false when nothing matches", none.expanded);

    // Run a command with Enter.
    const ran = await evalJs(`(async()=>{
        const dlg=document.querySelector('.mac-commandpalette');
        const input=dlg.querySelector('.mac-commandpalette__input');
        input.value='';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r,160));
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,200));
        return {open: !!document.querySelector('.mac-commandpalette'),
                state: ${CELL("CommandPalette")}.querySelector('.mac-showcase__state')?.textContent.trim(),
                focus: document.activeElement?.textContent?.trim()};})()`);
    ok(ran.open === false, "Enter closes the palette");
    ok(/new-file/.test(ran.state ?? ""), "Enter ran the highlighted command", ran.state);

    await shot(`${CELL("CommandPalette")}`, "p4-palette-closed.png");

    // Ctrl+K reopens it from anywhere.
    const ctrlK = await evalJs(`(async()=>{
        // Focus the trigger first: the palette restores focus to whatever held it
        // when it opened, and a programmatic click does not move focus.
        ${CELL("CommandPalette")}.querySelector('button').focus();
        document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'k',code:'KeyK',ctrlKey:true,bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,220));
        const dlg=document.querySelector('.mac-commandpalette');
        return {open: !!dlg, focused: dlg?document.activeElement===dlg.querySelector('.mac-commandpalette__input'):null};})()`);
    ok(ctrlK.open === true, "Ctrl+K reopens the palette", ctrlK);
    ok(ctrlK.focused === true, "Ctrl+K focuses the input");

    // Escape closes and restores focus to the trigger.
    const esc = await evalJs(`(async()=>{
        const dlg=document.querySelector('.mac-commandpalette');
        const input=dlg.querySelector('.mac-commandpalette__input');
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        await new Promise(r=>setTimeout(r,220));
        return {open: !!document.querySelector('.mac-commandpalette'),
                focusText: document.activeElement?.textContent?.trim(),
                inCell: !!${CELL("CommandPalette")}.contains(document.activeElement)};})()`);
    ok(esc.open === false, "Escape closes the palette");
    ok(esc.inCell === true && /打开命令面板/.test(esc.focusText ?? ""),
        "Escape restores focus to the trigger", esc.focusText);

    // Reopen for the screenshot, which is taken from the trigger cell below.
    const shotOpen = await evalJs(`(async()=>{
        ${CELL("CommandPalette")}.querySelector('button').click();
        await new Promise(r=>setTimeout(r,260));
        return !!document.querySelector('.mac-commandpalette');})()`);
    if (shotOpen) await shot(`document.querySelector('.mac-commandpalette')`, "p4-palette.png");
    await evalJs(`(async()=>{const dlg=document.querySelector('.mac-commandpalette');
        if(dlg){dlg.querySelector('.mac-commandpalette__input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));}
        await new Promise(r=>setTimeout(r,200)); return true;})()`);
}

// --- InlineNotice ----------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("InlineNotice")};
        const n=[...c.querySelectorAll('.mac-inline-notice')];
        const cs=n.map(x=>getComputedStyle(x));
        const bl=(x)=>{const s=getComputedStyle(x); return s.borderLeftWidth+'|'+s.borderLeftColor;};
        const iconColor=(x)=>{const s=x.querySelector('.mac-inline-notice__icon svg'); return s?getComputedStyle(s).color:null;};
        return {
            count: n.length,
            tones: n.map(x=>x.dataset.tone),
            roles: n.map(x=>x.getAttribute('role')),
            edges: n.map(bl),
            icons: n.map(iconColor),
            closeVisible: n.map(x=>{const b=x.querySelector('.mac-inline-notice__close'); return b?b.getClientRects().length>0:null;}),
            actionVisible: n.map(x=>{const b=x.querySelector('.mac-inline-notice__action'); return b?b.getClientRects().length>0:null;}),
            titles: n.map(x=>{const t=x.querySelector('.mac-inline-notice__title');
                return t&&!t.hasAttribute('hidden')?t.textContent.trim():null;}),
            iconSvg: n.map(x=>!!x.querySelector('.mac-inline-notice__icon svg')),
        };})()`);
    ok(r.count === 2, "two notices rendered", r.count);
    ok(JSON.stringify(r.tones) === JSON.stringify(["info", "danger"]), "tones are info then danger", r.tones);
    ok(JSON.stringify(r.roles) === JSON.stringify(["status", "alert"]),
        "info is role=status and danger is role=alert", r.roles);
    ok(r.edges[0].split("|")[0] === "3px" && r.edges[1].split("|")[0] === "3px",
        "both notices carry a 3px leading edge", r.edges.map((e) => e.split("|")[0]));
    ok(r.edges[0].split("|")[1] !== r.edges[1].split("|")[1],
        "the edge colour differs by tone", r.edges.map((e) => e.split("|")[1]));
    ok(r.icons[0] === r.edges[0].split("|")[1] && r.icons[1] === r.edges[1].split("|")[1],
        "the glyph repeats the edge colour exactly", r.icons);
    ok(r.iconSvg.every(Boolean), "both notices draw a glyph");
    ok(JSON.stringify(r.closeVisible) === JSON.stringify([true, false]),
        "only the dismissible notice shows a close button", r.closeVisible);
    ok(JSON.stringify(r.actionVisible) === JSON.stringify([true, null]),
        "the notice with an action shows one; the bare one has none at all", r.actionVisible);
    ok(r.titles[0] === "有新版本可用" && r.titles[1] === null,
        "the title line is present only where it was given", r.titles);

    const act = await evalJs(`(async()=>{
        const c=${CELL("InlineNotice")};
        const n=c.querySelector('.mac-inline-notice');
        n.querySelector('.mac-inline-notice__action').click();
        await new Promise(r=>setTimeout(r,80));
        return c.querySelector('.mac-showcase__state')?.textContent.trim();})()`);
    ok(/打开更新说明/.test(act ?? ""), "the action button reports through onAction", act);

    await shot(`${CELL("InlineNotice")}`, "p4-notice.png");

    const dis = await evalJs(`(async()=>{
        const c=${CELL("InlineNotice")};
        const n=c.querySelector('.mac-inline-notice');
        n.querySelector('.mac-inline-notice__close').click();
        await new Promise(r=>setTimeout(r,160));
        return {hiddenAttr: n.hasAttribute('hidden'),
                painted: n.getClientRects().length,
                display: getComputedStyle(n).display,
                state: c.querySelector('.mac-showcase__state')?.textContent.trim()};})()`);
    ok(dis.hiddenAttr === true, "dismiss sets the hidden attribute", dis.hiddenAttr);
    ok(dis.painted === 0 && dis.display === "none",
        "the dismissed notice paints nothing", {painted: dis.painted, display: dis.display});
    ok(/已关闭通知/.test(dis.state ?? ""), "onDismiss fired", dis.state);
}

// --- Rating ----------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("Rating")};
        const all=[...c.querySelectorAll('.mac-rating')];
        const main=all[0], avg=all[1];
        const stars=(e)=>[...e.querySelectorAll('.mac-rating__star')];
        const fills=(e)=>[...e.querySelectorAll('.mac-rating__clip')].map(x=>x.style.getPropertyValue('--mac-rating-fill').trim());
        const clipW=(e)=>[...e.querySelectorAll('.mac-rating__clip')].map(x=>{
            const s=x.parentElement.getBoundingClientRect(), b=x.getBoundingClientRect();
            return s.width?+(b.width/s.width).toFixed(2):null;});
        return {
            count: all.length,
            stars: stars(main).length,
            avgStars: stars(avg).length,
            role: main.getAttribute('role'),
            min: main.getAttribute('aria-valuemin'),
            max: main.getAttribute('aria-valuemax'),
            now: main.getAttribute('aria-valuenow'),
            text: main.getAttribute('aria-valuetext'),
            label: main.getAttribute('aria-label'),
            readonlyAttr: main.getAttribute('aria-readonly'),
            avgReadonly: avg.getAttribute('aria-readonly'),
            avgTab: avg.tabIndex,
            mainTab: main.tabIndex,
            fills: fills(main),
            clipW: clipW(main),
            avgFills: fills(avg),
            sizeSmall: avg.classList.contains('mac-rating--small'),
            avgSmaller: stars(avg)[0].getBoundingClientRect().width < stars(main)[0].getBoundingClientRect().width,
            outlines: main.querySelectorAll('.mac-rating__outline').length,
        };})()`);
    ok(r.count === 2, "two ratings rendered", r.count);
    ok(r.stars === 5 && r.avgStars === 5, "both draw five stars", [r.stars, r.avgStars]);
    ok(r.role === "slider" && r.min === "0" && r.max === "5", "it is a 0..5 slider", [r.role, r.min, r.max]);
    ok(r.now === "3.5", "aria-valuenow keeps the half step", r.now);
    ok(r.text === "3.5 星，共 5 星", "aria-valuetext speaks the total once", r.text);
    ok(r.label === "产品评分", "the label reaches aria-label", r.label);
    ok(r.readonlyAttr === "false" && r.avgReadonly === "true", "readOnly is reflected, not implied");
    ok(r.mainTab === 0 && r.avgTab === -1, "only the interactive one is focusable", [r.mainTab, r.avgTab]);
    ok(JSON.stringify(r.fills) === JSON.stringify(["100.0000%", "100.0000%", "100.0000%", "50.0000%", "0.0000%"]),
        "3.5 fills three stars fully and one halfway", r.fills);
    ok(JSON.stringify(r.clipW) === JSON.stringify([1, 1, 1, 0.5, 0]),
        "the painted clip width matches the custom property", r.clipW);
    ok(Math.abs(parseFloat(r.avgFills[4]) - 20) < 0.01 && r.avgFills.slice(0, 4).every((f) => f === "100.0000%"),
        "4.2 fills the first four stars and a fifth of the last", r.avgFills);
    ok(r.sizeSmall && r.avgSmaller, "the small variant really is smaller", r.avgSmaller);
    ok(r.outlines === 5, "each star has one outline glyph", r.outlines);

    // Photographed before the keyboard run: 3.5 is the state the demo documents,
    // and a keyboard step can only land on whole stars.
    await shot(`${CELL("Rating")}`, "p4-rating.png");

    // Keyboard stepping, plus the readout.
    const kb = await evalJs(`(async()=>{
        const c=${CELL("Rating")};
        const main=c.querySelector('.mac-rating');
        const fire=(k)=>main.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
        main.focus();
        const seq=[];
        for(const k of ['ArrowRight','ArrowRight','ArrowLeft','Home','End']){
            fire(k);
            await new Promise(r=>setTimeout(r,60));
            seq.push([k, main.getAttribute('aria-valuenow')]);
        }
        return {seq, fills:[...main.querySelectorAll('.mac-rating__clip')].map(x=>x.style.getPropertyValue('--mac-rating-fill').trim()),
                state: c.querySelector('.mac-showcase__state')?.textContent.trim(),
                dataset: main.dataset.value};})()`);
    ok(JSON.stringify(kb.seq) === JSON.stringify([["ArrowRight", "4"], ["ArrowRight", "5"], ["ArrowLeft", "4"], ["Home", "0"], ["End", "5"]]),
        "arrows step by one whole star, Home/End jump to the ends", kb.seq);
    ok(kb.fills.every((f) => f === "100.0000%"), "End fills every star", kb.fills);
    ok(/5/.test(kb.state ?? ""), "onChange reported the value", kb.state);
}

// --- Card ------------------------------------------------------------------
{
    const r = await evalJs(`(()=>{
        const c=${CELL("Card")};
        const card=c.querySelector('.mac-card');
        const cs=getComputedStyle(card);
        const body=card.querySelector('.mac-card__body');
        const kids=[...body.children];
        const sep=(k)=>{const s=getComputedStyle(k,'::before');
            return {content:s.content, height:s.height, bg:s.backgroundColor,
                    left:s.left, right:s.right, pointer:s.pointerEvents};};
        const header=card.querySelector('.mac-card__header');
        const footer=card.querySelector('.mac-card__footer');
        const b=card.getBoundingClientRect();
        return {
            tag: card.tagName,
            grouped: card.classList.contains('mac-card--grouped'),
            border: cs.borderTopWidth,
            radius: cs.borderTopLeftRadius,
            width: Math.round(b.width),
            kids: kids.length,
            posts: kids.map(k=>getComputedStyle(k).position),
            seps: kids.slice(1).map(sep),
            firstSep: kids[0]?getComputedStyle(kids[0],'::before').content:null,
            title: card.querySelector('.mac-card__title')?.textContent.trim(),
            subtitle: card.querySelector('.mac-card__subtitle')?.textContent.trim(),
            trailing: card.querySelector('.mac-card__trailing')?.textContent.trim(),
            badge: !!card.querySelector('.mac-card__trailing .mac-badge'),
            headerBorder: getComputedStyle(header).borderBottomWidth,
            footerBorder: getComputedStyle(footer).borderTopWidth,
            bodyPadX: parseFloat(getComputedStyle(body).paddingLeft),
            childW: Math.round(kids[1].getBoundingClientRect().width),
            bodyW: Math.round(body.getBoundingClientRect().width),
            labelledBy: card.querySelector('.mac-card__title')?.id,
            aria: card.getAttribute('aria-labelledby'),
        };})()`);
    ok(r.tag === "SECTION", "the card is a section, not a div", r.tag);
    ok(r.grouped === true, "the demo uses the grouped variant");
    ok(r.border === "1px" && parseFloat(r.radius) >= 8, "grouped puts a hairline border and a large radius on the box", [r.border, r.radius]);
    ok(r.width <= 380, "the card honours its max-width", r.width);
    ok(r.kids === 3, "three rows in the body", r.kids);
    ok(r.posts[0] === "static" && r.posts.slice(1).every((p) => p === "relative"),
        "only the rows after the first are positioned for a divider", r.posts);
    ok(r.firstSep === "none" || r.firstSep === "normal", "the first row gets no divider", r.firstSep);
    ok(r.seps.every((s) => s.content === '""' && parseFloat(s.height) === 1 && s.pointer === "none"),
        "dividers are 1px, decorative and click-through", r.seps.map((s) => [s.content, s.height, s.pointer]));
    ok(r.seps.every((s) => s.bg !== "rgba(0, 0, 0, 0)"), "the divider paints a separator colour", r.seps[0]?.bg);
    ok(r.seps.every((s) => s.left === "0px" && s.right === "0px"),
        "dividers span the row box, which the body padding insets", r.seps.map((s) => [s.left, s.right]));
    ok(r.childW === r.bodyW - 2 * r.bodyPadX,
        "the row is inset from the card body by the padding", {child: r.childW, body: r.bodyW, pad: r.bodyPadX});
    ok(r.title === "同步设置" && r.subtitle === "更改会立即生效", "title and subtitle render", [r.title, r.subtitle]);
    ok(r.badge && /已开启/.test(r.trailing ?? ""), "the trailing slot holds the badge", r.trailing);
    ok(r.footerBorder === "1px", "the footer is separated by a hairline", r.footerBorder);
    ok(r.labelledBy && r.aria === r.labelledBy, "the title id is wired to aria-labelledby", r.aria);

    const mut = await evalJs(`(async()=>{
        const c=${CELL("Card")};
        const card=c.querySelector('.mac-card');
        const before=[...card.classList];
        const body=card.querySelector('.mac-card__body');
        const rows=body.children.length;
        return {before, rows};})()`);
    ok(mut.before.includes("mac-card--grouped"), "variant class is a modifier on the same element", mut.before);

    await shot(`${CELL("Card")}`, "p4-card.png");
}

// --- Table sort + filter ---------------------------------------------------
// The demo table is 9 columns wide: a leading selection cell, then name, status,
// cpu, region, uptime, memory, image, and the pinned actions column.
{
    const r = await evalJs(`(()=>{
        const c=${CELL("Table")};
        const table=c.querySelector('.mac-table');
        const heads=[...table.querySelectorAll('thead th')];
        const sortable=heads.filter(h=>h.classList.contains('mac-table__th--sortable'));
        return {
            tables: c.querySelectorAll('.mac-table').length,
            heads: heads.length,
            sortable: sortable.length,
            hasButton: sortable.every(h=>!!h.querySelector('button.mac-table__sort')),
            sortButtons: c.querySelectorAll('button.mac-table__sort').length,
            arrows: c.querySelectorAll('.mac-table__sort-arrow').length,
            arrowOpacity: [...c.querySelectorAll('.mac-table__sort-arrow')].map(a=>getComputedStyle(a).opacity),
            sorts: heads.map(h=>h.getAttribute('aria-sort')),
            keys: sortable.map(h=>h.dataset.sortKey),
            rows: c.querySelectorAll('tbody tr').length,
            colspan: c.querySelector('thead th')?.getAttribute('colspan') ?? heads.length,
            names: [...c.querySelectorAll('tbody tr')].map(t=>t.querySelector('td:nth-child(2)')?.textContent.trim()),
            states: [...c.querySelectorAll('.mac-showcase__state')].map(s=>s.textContent.trim()),
            filterInput: !!c.querySelector('input[type="text"], input[type="search"]'),
        };})()`);
    ok(r.tables === 1 && r.heads === 9, "one table with nine columns", [r.tables, r.heads]);
    ok(r.sortable === 4, "four of them are sortable", r.sortable);
    ok(r.hasButton && r.sortButtons === 4, "each sortable header is a real button", r.sortButtons);
    ok(JSON.stringify(r.keys) === JSON.stringify(["name", "status", "cpu", "region"]),
        "the sortable headers carry their column key", r.keys);
    ok(r.arrows === 4 && r.arrowOpacity.every((o) => o === "0"),
        "arrows exist but stay invisible until sorted", r.arrowOpacity);
    ok(r.sorts.filter((s) => s !== null).every((s) => s === "none"),
        "every sortable column starts aria-sort=none", r.sorts.filter((s) => s !== null));
    ok(r.rows === 3 && r.names.length === 3, "three body rows", r.rows);
    ok(r.filterInput, "the filter field is present");
    const original = r.names;

    // The sortable headers are at indices 1..4 (index 0 is the selection cell), so
    // every reading below comes from `th.mac-table__th--sortable`, not from `th`.
    const clickCol = async (idx) => await evalJs(`(async()=>{
        const c=${CELL("Table")};
        const btns=[...c.querySelectorAll('button.mac-table__sort')];
        btns[${idx}].click();
        await new Promise(r=>setTimeout(r,420));
        const ths=[...c.querySelectorAll('th.mac-table__th--sortable')];
        const rows=[...c.querySelectorAll('tbody tr')];
        const arrow=(h)=>h.querySelector('.mac-table__sort-arrow');
        return {names: rows.map(t=>t.querySelector('td:nth-child(2)')?.textContent.trim()),
                sorts: ths.map(h=>h.getAttribute('aria-sort')),
                sorted: ths.map(h=>h.classList.contains('is-sorted')),
                opacity: ths.map(h=>+getComputedStyle(arrow(h)).opacity),
                rotate: ths.map(h=>getComputedStyle(arrow(h)).transform),
                states: [...c.querySelectorAll('.mac-showcase__state')].map(s=>s.textContent.trim())};})()`);

    const asc = await clickCol(0);
    ok(asc.sorts[0] === "ascending", "first click sorts ascending", asc.sorts[0]);
    ok(JSON.stringify(asc.names) === JSON.stringify(["api-01", "db-01", "web-01"]),
        "ascending sorts by name", asc.names);
    ok(asc.sorted[0] === true && asc.opacity[0] === 1,
        "the active column is marked and its arrow is visible", [asc.sorted[0], asc.opacity[0]]);
    ok(asc.rotate[0] === "none" || asc.rotate[0] === "matrix(1, 0, 0, 1, 0, 0)",
        "ascending leaves the up-chevron alone", asc.rotate[0]);
    ok(asc.states.some((s) => /name/.test(s)), "onSortChange reported the column", asc.states);

    const desc = await clickCol(0);
    ok(desc.sorts[0] === "descending", "second click flips to descending", desc.sorts[0]);
    ok(JSON.stringify(desc.names) === JSON.stringify(["web-01", "db-01", "api-01"]),
        "descending reverses it", desc.names);
    ok(/matrix\(-1(,| )/.test(desc.rotate[0] ?? ""), "descending rotates the chevron 180°", desc.rotate[0]);

    const off = await clickCol(0);
    ok(off.sorts[0] === "none", "third click clears the sort", off.sorts[0]);
    ok(JSON.stringify(off.names) === JSON.stringify(original), "clearing restores the source order", off.names);
    ok(off.sorted[0] === false && off.opacity[0] === 0,
        "the cleared arrow fades back out", [off.sorted[0], off.opacity[0]]);

    // Numeric sort via sortValue, with the "—" cell sinking last both ways.
    const cpu = await clickCol(2);
    ok(cpu.sorts[2] === "ascending", "the cpu column sorts ascending", cpu.sorts[2]);
    ok(cpu.names[0] === "api-01" && cpu.names[2] === "db-01",
        "it sorts 18 before 42, and an empty cell sinks", cpu.names);
    const cpuDesc = await clickCol(2);
    ok(cpuDesc.names[0] === "web-01" && cpuDesc.names[2] === "db-01",
        "flipping the order leaves the empty cell last", cpuDesc.names);
    await clickCol(2); // back to unsorted

    // Filter.
    const filt = await evalJs(`(async()=>{
        const c=${CELL("Table")};
        const input=c.querySelector('input');
        const set=(v)=>{input.value=v; input.dispatchEvent(new Event('input',{bubbles:true}));};
        set('eu');
        await new Promise(r=>setTimeout(r,200));
        const a=[...c.querySelectorAll('tbody tr')].map(t=>t.querySelector('td:nth-child(2)')?.textContent.trim());
        set('zzz');
        await new Promise(r=>setTimeout(r,200));
        const b={rows:c.querySelectorAll('tbody tr').length,
                 text:c.querySelector('tbody tr')?.textContent.replace(/\\s+/g,' ').trim(),
                 colspan:c.querySelector('tbody tr td')?.getAttribute('colspan')};
        set('');
        await new Promise(r=>setTimeout(r,200));
        const d=[...c.querySelectorAll('tbody tr')].map(t=>t.querySelector('td:nth-child(2)')?.textContent.trim());
        return {a, b, d};})()`);
    ok(filt.a.length === 1 && filt.a[0] === "api-01",
        "the filter matches name or region and narrows to one row", filt.a);
    ok(filt.b.rows === 1 && /没有匹配的实例/.test(filt.b.text ?? ""),
        "a miss shows the configured empty text", filt.b.text);
    ok(filt.b.colspan === "9", "the empty row spans every column", filt.b.colspan);
    ok(JSON.stringify(filt.d) === JSON.stringify(original), "clearing the filter restores every row", filt.d);

    await shot(`${CELL("Table")}`, "p4-table.png");
}

// --- console ---------------------------------------------------------------
ok(consoleErrors.length === 0, "no console errors during the run", consoleErrors.slice(0, 4));

console.log(`\n${pass} passed, ${fail} failed`);
try { proc.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
