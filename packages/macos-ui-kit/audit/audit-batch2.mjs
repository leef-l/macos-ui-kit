import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {existsSync, writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8371;
const BASE = "/macos-ui-kit/";
const T = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ttf": "font/ttf"};

const server = createServer(async (req, res) => {
    let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (p.startsWith(BASE)) p = p.slice(BASE.length - 1);
    else p = "/";
    const rel = p === "/" || p === "" ? "index.html" : p.replace(/^\/+/, "");
    const f = normalize(join(ROOT, rel));
    if (!f.startsWith(ROOT)) return void res.writeHead(403).end();
    try {
        const b = await readFile(f);
        res.writeHead(200, {"content-type": T[extname(f)] ?? "application/octet-stream"});
        res.end(b);
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find((p) => existsSync(p));
const proc = spawn(chrome, [
    "--headless=new", "--remote-debugging-port=9621", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot5")}`,
    "--window-size=1400,1000", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        const r = await fetch("http://127.0.0.1:9621/json/list");
        targets = await r.json();
        if (targets.length) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
}
const page = targets.find((t) => t.type === "page") ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
});
await new Promise((r) => ws.on("open", r));
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({id: i, method: m, params: p})); });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false});
await send("Page.navigate", {url: `http://127.0.0.1:${PORT}${BASE}`});
await new Promise((r) => setTimeout(r, 3200));

const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (r?.exceptionDetails) return {error: r.exceptionDetails.exception?.description ?? "exception"};
    return r?.result?.value;
};

const results = [];
const check = (name, ok, detail) => {
    results.push(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const CELL = (n) => `[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===${JSON.stringify(n)})`;

// ---------------------------------------------------------------- Pagination
const pag = await evalJs(`(async()=>{
    const c=${CELL("Pagination")}; if(!c) return {error:'no cell'};
    const nav=c.querySelector('.mac-pagination');
    if(!nav) return {error:'no pagination'};
    const state=c.querySelector('.mac-showcase__state');
    const read=()=>{
        const pages=[...nav.querySelectorAll('.mac-pagination__page')];
        const arrows=[...nav.querySelectorAll('.mac-pagination__arrow')];
        return {
            labels: pages.map(p=>p.textContent),
            gaps: [...nav.querySelectorAll('.mac-pagination__gap')].length,
            current: pages.find(p=>p.getAttribute('aria-current')==='page')?.textContent,
            next: arrows.find(a=>a.classList.contains('mac-pagination__arrow--next')),
            prev: arrows.find(a=>a.classList.contains('mac-pagination__arrow--prev')),
            last: arrows.find(a=>a.classList.contains('mac-pagination__arrow--last')),
            first: arrows.find(a=>a.classList.contains('mac-pagination__arrow--first')),
            arrows: arrows.length,
            gapIsSpan: [...nav.querySelectorAll('.mac-pagination__gap')].every(g=>g.tagName==='SPAN'),
        };
    };
    const click=(label)=>{
        const b=[...nav.querySelectorAll('.mac-pagination__page')].find(p=>p.textContent===label);
        if(!b) return false;
        b.click();
        return true;
    };
    const wait=()=>new Promise(r=>setTimeout(r,60));

    const a=read();
    const summary=nav.querySelector('.mac-pagination__summary')?.textContent;
    const box=a.labels.length? nav.querySelector('.mac-pagination__page').getBoundingClientRect() : null;
    const arrowBox=nav.querySelector('.mac-pagination__arrow').getBoundingClientRect();
    const curEl=[...nav.querySelectorAll('.mac-pagination__page')].find(p=>p.getAttribute('aria-current')==='page');

    const out={
        navLabel: nav.getAttribute('aria-label'),
        summary,
        initial: pick(a),
        accentFill: getComputedStyle(curEl).backgroundColor,
        pageH: Math.round(box.height), pageW: Math.round(box.width),
        arrowH: Math.round(arrowBox.height),
        prevDisabled: a.prev.disabled,
        firstDisabled: a.first.disabled,
    };

    // 1 → 4 (a visible number, one click).
    out.clicked4=click('4'); await wait();
    out.at4={state: state.textContent, ...pick(read())};

    // 4 → 5, now that 5 exists.
    out.clicked5=click('5'); await wait();
    out.at5={state: state.textContent, ...pick(read())};

    // Re-clicking the current page must stay silent.
    const before=state.textContent;
    click('5'); await wait();
    out.noRepeat = state.textContent === before && state.textContent === out.at5.state;

    // Arrow forward.
    read().next.click(); await wait();
    out.afterNext=state.textContent;

    // Jump to the end.
    read().last.click(); await wait();
    const end=read();
    out.atEnd={state: state.textContent, ...pick(end),
        nextDisabled: end.next.disabled, lastDisabled: end.last.disabled,
        prevDisabled: end.prev.disabled, firstDisabled: end.first.disabled};

    function pick(r){ const {next, prev, last, first, ...rest}=r; return rest; }
    return out;
})()`);
check("Pagination is a labelled nav", pag.navLabel === "分页", String(pag.navLabel));
check("Pagination summary reads 共 248 条", pag.summary === "共 248 条", String(pag.summary));
check("Pagination opens on 1 2 3 4 … 12", JSON.stringify(pag.initial?.labels) === JSON.stringify(["1", "2", "3", "4", "12"]), JSON.stringify(pag.initial?.labels));
check("Pagination elides the tail once", pag.initial?.gaps === 1, String(pag.initial?.gaps));
check("Pagination gap is not a focusable button", pag.initial?.gapIsSpan === true, String(pag.initial?.gapIsSpan));
check("Pagination marks page 1 as current", pag.initial?.current === "1", String(pag.initial?.current));
check("Pagination current page is accent-filled", pag.accentFill !== "rgba(0, 0, 0, 0)" && pag.accentFill !== "transparent", String(pag.accentFill));
check("Pagination buttons match arrow height", pag.pageH === pag.arrowH && pag.pageH >= 22 && pag.pageH <= 34, `page ${pag.pageW}x${pag.pageH} arrow h${pag.arrowH}`);
check("Pagination has 4 arrows with showEnds", pag.initial?.arrows === 4, String(pag.initial?.arrows));
check("Pagination prev/first disabled on page 1", pag.prevDisabled === true && pag.firstDisabled === true, `${pag.prevDisabled}/${pag.firstDisabled}`);
check("Pagination click 4 reports page 4", pag.at4?.state === "第 4 页 / 共 12 页" && pag.at4?.current === "4", JSON.stringify(pag.at4));
check("Pagination window at page 4 is 1 … 3 4 5 … 12", JSON.stringify(pag.at4?.labels) === JSON.stringify(["1", "3", "4", "5", "12"]) && pag.at4?.gaps === 2, `${JSON.stringify(pag.at4?.labels)} gaps=${pag.at4?.gaps}`);
check("Pagination window at page 5 centres the run", JSON.stringify(pag.at5?.labels) === JSON.stringify(["1", "4", "5", "6", "12"]) && pag.at5?.gaps === 2, `${JSON.stringify(pag.at5?.labels)} gaps=${pag.at5?.gaps}`);
check("Pagination never re-reports the current page", pag.noRepeat === true, String(pag.noRepeat));
check("Pagination next arrow advances one", pag.afterNext === "第 6 页 / 共 12 页", String(pag.afterNext));
check("Pagination last arrow jumps to 12", pag.atEnd?.state === "第 12 页 / 共 12 页" && pag.atEnd?.current === "12", JSON.stringify(pag.atEnd?.state));
check("Pagination end state is 1 … 9 10 11 12", JSON.stringify(pag.atEnd?.labels) === JSON.stringify(["1", "9", "10", "11", "12"]) && pag.atEnd?.gaps === 1, `${JSON.stringify(pag.atEnd?.labels)} gaps=${pag.atEnd?.gaps}`);
check("Pagination next/last disabled on the last page", pag.atEnd?.nextDisabled === true && pag.atEnd?.lastDisabled === true, `${pag.atEnd?.nextDisabled}/${pag.atEnd?.lastDisabled}`);
check("Pagination prev enabled on the last page", pag.atEnd?.prevDisabled === false, String(pag.atEnd?.prevDisabled));

// ---------------------------------------------------------------- Breadcrumb
const crumb = await evalJs(`(async()=>{
    const c=${CELL("Breadcrumb")}; if(!c) return {error:'no cell'};
    const nav=c.querySelector('.mac-breadcrumb');
    if(!nav) return {error:'no breadcrumb'};
    const items=[...nav.querySelectorAll('.mac-breadcrumb__item')];
    const links=[...nav.querySelectorAll('.mac-breadcrumb__link')];
    const seps=[...nav.querySelectorAll('.mac-breadcrumb__separator')];
    const cur=nav.querySelector('[aria-current="page"]');
    const state=c.querySelector('.mac-showcase__state');
    const ell=nav.querySelector('.mac-breadcrumb__ellipsis');
    const out={
        label: nav.getAttribute('aria-label'),
        items: items.length,
        order: items.map(i=>i.querySelector('.mac-breadcrumb__link,.mac-breadcrumb__text,.mac-breadcrumb__ellipsis')?.textContent),
        linkCount: links.length,
        sepCount: seps.length,
        sepSvg: !!seps[0]?.querySelector('svg'),
        sepFirstChild: items[1]?.firstElementChild?.className,
        current: cur?.textContent,
        currentTag: cur?.tagName,
        ellipsisTag: ell?.tagName,
        ellipsisLabel: ell?.getAttribute('aria-label'),
        hoverable: links.every(l=>l.tagName==='BUTTON'),
        hasIcon: !!nav.querySelector('.mac-breadcrumb__icon svg'),
        iconFirst: items[0]?.firstElementChild?.className,
    };
    links[0].click();
    await new Promise(r=>setTimeout(r,50));
    out.afterRootClick=state.textContent;
    const last=links[links.length-1];
    last.click();
    await new Promise(r=>setTimeout(r,50));
    out.afterLastLinkClick=state.textContent;
    return out;
})()`);
check("Breadcrumb is a labelled nav", crumb.label === "面包屑", String(crumb.label));
check("Breadcrumb collapses 5 entries to 4", crumb.items === 4, JSON.stringify(crumb.order));
check("Breadcrumb hides the middle behind one ellipsis", crumb.ellipsisTag === "BUTTON", String(crumb.ellipsisTag));
check("Breadcrumb ellipsis is labelled", crumb.ellipsisLabel === "展开隐藏的路径", String(crumb.ellipsisLabel));
check("Breadcrumb last entry is a current span, not a button", crumb.current === "组件" && crumb.currentTag === "SPAN", `${crumb.current}/${crumb.currentTag}`);
check("Breadcrumb draws one chevron per non-first entry", crumb.sepCount === 3 && crumb.sepSvg === true, `${crumb.sepCount}/${crumb.sepSvg}`);
check("Breadcrumb ancestors are real buttons", crumb.linkCount === 2 && crumb.hoverable === true, String(crumb.linkCount));
check("Breadcrumb root carries an icon before its label", crumb.hasIcon === true && /icon/.test(String(crumb.iconFirst)), String(crumb.iconFirst));
check("Breadcrumb click reports the segment", crumb.afterRootClick === "跳转到: 用户", String(crumb.afterRootClick));

// ---------------------------------------------------------------- Avatar
const avatar = await evalJs(`(()=>{
    const c=${CELL("Avatar")}; if(!c) return {error:'no cell'};
    const all=[...c.querySelectorAll('.mac-avatar')];
    if(!all.length) return {error:'no avatars'};
    return {
        count: all.length,
        initials: all.map(a=>a.querySelector('.mac-avatar__initials')?.textContent),
        tones: all.map(a=>Number(a.dataset.tone)),
        widths: all.map(a=>Math.round(a.getBoundingClientRect().width)),
        radii: all.map(a=>getComputedStyle(a).borderTopLeftRadius),
        dots: all.map(a=>{const d=a.querySelector('.mac-avatar__status');
            return d? Math.round(d.getBoundingClientRect().width) : 0;}),
        roles: all.map(a=>a.getAttribute('role')),
        labels: all.map(a=>a.getAttribute('aria-label')),
        toneBg: all.map(a=>getComputedStyle(a).backgroundColor),
        dotBg: all.map(a=>{const d=a.querySelector('.mac-avatar__status');
            return d? getComputedStyle(d).backgroundColor : null;}),
        dotRing: (()=>{const d=all[1].querySelector('.mac-avatar__status');
            return getComputedStyle(d).boxShadow;})(),
        single: all[4].querySelector('.mac-avatar__initials')?.textContent,
    };
})()`);
check("Avatar renders 5 chips", avatar.count === 5, String(avatar.count));
check("CJK name abbreviates to the given name", avatar.initials?.[0] === "明", String(avatar.initials?.[0]));
check("Latin name abbreviates to two initials", avatar.initials?.[1] === "AL", String(avatar.initials?.[1]));
check("Single latin word yields one letter", avatar.single === "L", String(avatar.single));
check("Avatar tones are deterministic 0–5", avatar.tones?.every((t) => t >= 0 && t <= 5), JSON.stringify(avatar.tones));
check("Avatar rolls several distinct tones", new Set(avatar.tones ?? []).size >= 3, JSON.stringify(avatar.tones));
check("Avatar sizes s=20 m=28 l=40 xl=64", JSON.stringify([avatar.widths?.[0], avatar.widths?.[1], avatar.widths?.[3], avatar.widths?.[4]]) === JSON.stringify([20, 28, 40, 64]), JSON.stringify(avatar.widths));
check("Avatar is circular", avatar.radii?.[0] === "50%", String(avatar.radii?.[0]));
check("Avatar square variant is a rounded square", parseFloat(avatar.radii?.[4]) > 8 && parseFloat(avatar.radii?.[4]) < 20, String(avatar.radii?.[4]));
check("Avatar presence dot scales with the chip", avatar.dots?.[1] === 8 && avatar.dots?.[3] > avatar.dots?.[1], JSON.stringify(avatar.dots));
check("Avatar exposes role=img", avatar.roles?.every((r) => r === "img"), JSON.stringify(avatar.roles));
check("Avatar announces the name", avatar.labels?.[0] === "李小明", String(avatar.labels?.[0]));
check("Avatar announces the presence state", /在线$/.test(String(avatar.labels?.[1])), String(avatar.labels?.[1]));
check("Avatar dot wears a window-coloured ring", /rgb\(/.test(String(avatar.dotRing)), String(avatar.dotRing));
check("Avatar tones are solid, not tints", avatar.toneBg?.every((c) => /^rgb\(\d/.test(String(c))), JSON.stringify(avatar.toneBg));

// ---------------------------------------------------------------- ProgressRing
const ring = await evalJs(`(()=>{
    const c=${CELL("ProgressRing")}; if(!c) return {error:'no cell'};
    const all=[...c.querySelectorAll('.mac-progressring')];
    if(!all.length) return {error:'no rings'};
    const arc=g=>g.querySelector('.mac-progressring__arc');
    const num=g=>parseFloat(getComputedStyle(arc(g)).strokeDasharray);
    return {
        count: all.length,
        widths: all.map(g=>Math.round(g.getBoundingClientRect().width)),
        dashes: all.map(num),
        second: (()=>{const s=getComputedStyle(arc(all[0])).strokeDasharray;
            return s.split(/[\\s,]+/).filter(Boolean).map(v=>parseFloat(v));})(),
        now: all.map(g=>g.getAttribute('aria-valuenow')),
        valuetext: all.map(g=>g.getAttribute('aria-valuetext')),
        readouts: all.map(g=>g.querySelector('.mac-progressring__readout')?.textContent),
        spinning: all.map(g=>g.classList.contains('is-indeterminate')),
        rotation: getComputedStyle(all[0].querySelector('.mac-progressring__svg')).transform,
        anim: getComputedStyle(all[3].querySelector('.mac-progressring__svg')).animationName,
        strokeW: getComputedStyle(arc(all[0])).strokeWidth,
        bigStrokeW: getComputedStyle(arc(all[1])).strokeWidth,
        trackW: getComputedStyle(all[0].querySelector('.mac-progressring__track')).strokeWidth,
        arcColour: getComputedStyle(arc(all[0])).stroke,
        trackColour: getComputedStyle(all[0].querySelector('.mac-progressring__track')).stroke,
        pathLength: arc(all[0]).getAttribute('pathLength'),
        roles: all.map(g=>g.getAttribute('role')),
        readoutVisible: (()=>{const r=all[2].querySelector('.mac-progressring__readout');
            return r? getComputedStyle(r).display : 'absent';})(),
    };
})()`);
check("ProgressRing renders 5 rings", ring.count === 5, String(ring.count));
check("ProgressRing sizes are 40 / 64 / 20", JSON.stringify([ring.widths?.[0], ring.widths?.[1], ring.widths?.[2]]) === JSON.stringify([40, 64, 20]), JSON.stringify(ring.widths));
check("ProgressRing normalises the path to 100", ring.pathLength === "100", String(ring.pathLength));
check("42% draws a 42-long dash of 100", Math.round(ring.dashes?.[0]) === 42 && Math.round(ring.second?.[1]) === 100, `${ring.dashes?.[0]} / ${JSON.stringify(ring.second)}`);check("78% draws 78", Math.round(ring.dashes?.[1]) === 78, String(ring.dashes?.[1]));
check("100% is a full ring", Math.round(ring.dashes?.[2]) === 100, String(ring.dashes?.[2]));
check("ProgressRing prints the percentage", ring.readouts?.[0] === "42%", String(ring.readouts?.[0]));
check("ProgressRing reports aria-valuenow / valuetext", ring.now?.[0] === "42" && ring.valuetext?.[0] === "42%", `${ring.now?.[0]} / ${ring.valuetext?.[0]}`);
check("ProgressRing drops aria-valuenow when indeterminate", ring.now?.[3] === null && ring.now?.[4] === null, JSON.stringify(ring.now));
check("ProgressRing spins when indeterminate", ring.anim === "mac-ring-spin" || ring.anim === "mac-ring-fade", String(ring.anim));
check("ProgressRing hides the readout at size s", ring.readoutVisible === "none", String(ring.readoutVisible));check("ProgressRing svg pre-rotates -90deg", /matrix\(0,\s*-1,\s*1,\s*0/.test(String(ring.rotation)), String(ring.rotation));
check("ProgressRing stroke widths are 3px and 5px on screen", ring.strokeW === "3px" && ring.bigStrokeW === "5px", `${ring.strokeW}/${ring.bigStrokeW}`);
check("ProgressRing track and arc differ in colour", ring.arcColour !== ring.trackColour && !/none/.test(String(ring.arcColour)), `${ring.arcColour} vs ${ring.trackColour}`);
check("ProgressRing is role=progressbar", ring.roles?.every((r) => r === "progressbar"), JSON.stringify(ring.roles));

const ringLive = await evalJs(`(async()=>{
    const c=${CELL("ProgressRing")};
    const arc=c.querySelector('.mac-progressring__arc');
    arc.style.setProperty('--mac-ring-value','90');
    await new Promise(r=>setTimeout(r,900));
    return parseFloat(getComputedStyle(arc).strokeDasharray);
})()`);
check("ProgressRing dash tracks --mac-ring-value", Math.round(ringLive) === 90, String(ringLive));

// ---------------------------------------------------------------- EmptyState
const empty = await evalJs(`(async()=>{
    const c=${CELL("EmptyState")}; if(!c) return {error:'no cell'};
    const e=c.querySelector('.mac-emptystate');
    if(!e) return {error:'no emptystate'};
    const r=e.getBoundingClientRect();
    const btn=e.querySelector('.mac-emptystate__actions .mac-button');
    const title=e.querySelector('.mac-emptystate__title');
    const t=title.getBoundingClientRect();
    const out={
        role: e.getAttribute('role'),
        title: title.textContent,
        message: e.querySelector('.mac-emptystate__message')?.textContent,
        glyph: !!e.querySelector('.mac-emptystate__glyph svg'),
        glyphW: Math.round(e.querySelector('.mac-emptystate__glyph').getBoundingClientRect().width),
        glyphOpacity: getComputedStyle(e.querySelector('.mac-emptystate__glyph')).opacity,
        glyphColour: getComputedStyle(e.querySelector('.mac-emptystate__glyph')).color,
        titleColour: getComputedStyle(title).color,
        centred: Math.abs((t.left+t.width/2)-(r.left+r.width/2)) < 2,
        width: Math.round(r.width),
        height: Math.round(r.height),
        buttonClass: btn.className,
        buttonText: btn.textContent,
        buttonH: Math.round(btn.getBoundingClientRect().height),
    };
    btn.click();
    await new Promise(r=>setTimeout(r,50));
    out.clicked=e.getAttribute('data-clicked');
    return out;
})()`);
check("EmptyState is role=status", empty.role === "status", String(empty.role));
check("EmptyState shows title and message", empty.title === "没有匹配的项目" && /放宽筛选/.test(String(empty.message)), `${empty.title} / ${empty.message}`);
check("EmptyState draws a 44px outline glyph", empty.glyph === true && empty.glyphW === 44, `${empty.glyph}/${empty.glyphW}`);
check("EmptyState glyph is de-emphasised", Number(empty.glyphOpacity) < 1 && empty.glyphColour !== empty.titleColour, `${empty.glyphOpacity} ${empty.glyphColour} vs ${empty.titleColour}`);
check("EmptyState centres in its pane", empty.centred === true, String(empty.centred));
check("EmptyState spans the wide cell", empty.width > 600, String(empty.width));
check("EmptyState action is a primary button", /mac-button--primary/.test(String(empty.buttonClass)) && empty.buttonText === "新建项目", `${empty.buttonClass}`);
check("EmptyState action is a full-height button", empty.buttonH >= 28, String(empty.buttonH));
check("EmptyState action fires", empty.clicked === "1", String(empty.clicked));

// ---------------------------------------------------------------- ContextMenu
const ctx = await evalJs(`(async()=>{
    const c=${CELL("ContextMenu")}; if(!c) return {error:'no cell'};
    const target=c.querySelector('.mac-showcase__ctx-target');
    if(!target) return {error:'no target'};
    const state=c.querySelector('.mac-showcase__state');
    // The cell lives far down the page; without scrolling it into view its
    // client rect is below the fold and a "cursor" near it is off-screen.
    target.scrollIntoView({block:'center'});
    await new Promise(res=>setTimeout(res,400));
    const r=target.getBoundingClientRect();
    const x=Math.round(r.left+24), y=Math.round(r.top+18);
    const open=(cx=x,cy=y)=>{
        const ev=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:2,buttons:2});
        target.dispatchEvent(ev);
        return ev;
    };
    const wait=(ms=90)=>new Promise(res=>setTimeout(res,ms));

    const ev=open();
    await wait();
    const menu=document.querySelector('.mac-menu.is-open');
    if(!menu) return {error:'menu did not open', prevented: ev.defaultPrevented};
    const mr=menu.getBoundingClientRect();
    const items=[...menu.querySelectorAll('.mac-menu__item')];
    const out={
        prevented: ev.defaultPrevented,
        role: menu.getAttribute('role'),
        labels: items.map(i=>i.textContent.trim()),
        seps: menu.querySelectorAll('.mac-menu__separator').length,
        box: [Math.round(mr.left), Math.round(mr.top), Math.round(mr.width), Math.round(mr.height)],
        cursor: [x,y],
        onCursor: Math.abs(mr.left-x)<=2 && Math.abs(mr.top-y)<=2,
        disabled: items.filter(i=>i.disabled).length,
        shortcuts: [...menu.querySelectorAll('.mac-menu__shortcut')].map(s=>s.textContent),
        icons: menu.querySelectorAll('.mac-menu__item svg').length,
        inBody: menu.parentElement === document.body,
        anchors: document.querySelectorAll('.mac-contextmenu-anchor').length,
        anchorPE: getComputedStyle(document.querySelector('.mac-contextmenu-anchor')).pointerEvents,
    };

    items[0].click();
    await wait(160);
    out.pick={state: state.textContent, gone: !document.querySelector('.mac-menu.is-open'),
        anchors: document.querySelectorAll('.mac-contextmenu-anchor').length};

    open(); await wait();
    out.reopened=!!document.querySelector('.mac-menu.is-open');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await wait(320);
    out.esc={state: state.textContent, gone: !document.querySelector('.mac-menu.is-open'),
        anchors: document.querySelectorAll('.mac-contextmenu-anchor').length};

    open(); await wait();
    out.beforeScroll=!!document.querySelector('.mac-menu.is-open');
    document.dispatchEvent(new Event('scroll'));
    await wait(320);
    out.scroll={gone: !document.querySelector('.mac-menu.is-open'),
        anchors: document.querySelectorAll('.mac-contextmenu-anchor').length};

    // Out-of-range position must flip inside the viewport.
    const far=open(innerWidth-6, innerHeight-6); await wait();
    const m2=document.querySelector('.mac-menu.is-open');
    out.clamped = m2 ? (()=>{const b=m2.getBoundingClientRect();
        return {left: Math.round(b.left), top: Math.round(b.top),
            inside: b.right <= innerWidth+1 && b.bottom <= innerHeight+1};})() : null;
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await wait(320);
    return out;
})()`);
check("ContextMenu suppresses the engine menu", ctx.prevented === true, String(ctx.prevented));
check("ContextMenu opens a menu", ctx.role === "menu", String(ctx.role));
check("ContextMenu lists 4 items and 1 separator", ctx.labels?.length === 4 && ctx.seps === 1, `${JSON.stringify(ctx.labels)} sep=${ctx.seps}`);
check("ContextMenu corner sits on the cursor", ctx.onCursor === true, `${ctx.box?.slice(0,2)} vs ${ctx.cursor}`);
check("ContextMenu renders leading icons", ctx.icons >= 2, String(ctx.icons));
check("ContextMenu shows shortcut glyphs", JSON.stringify(ctx.shortcuts) === JSON.stringify(["⌘O", "↩", "⌘⌫"]), JSON.stringify(ctx.shortcuts));
check("ContextMenu marks the disabled item", ctx.disabled === 1, String(ctx.disabled));
check("ContextMenu mounts on body", ctx.inBody === true, String(ctx.inBody));
check("ContextMenu anchor is hit-test transparent", ctx.anchorPE === "none", String(ctx.anchorPE));
check("ContextMenu reports the chosen value", ctx.pick?.state === "已选: open", String(ctx.pick?.state));
check("ContextMenu closes and releases the anchor", ctx.pick?.gone === true && ctx.pick?.anchors === 0, JSON.stringify(ctx.pick));
check("ContextMenu reopens after a pick", ctx.reopened === true, String(ctx.reopened));
check("ContextMenu Escape closes as a dismissal", ctx.esc?.gone === true && ctx.esc?.state === "已关闭（未选择）", JSON.stringify(ctx.esc));
check("ContextMenu closes on scroll", ctx.scroll?.gone === true && ctx.scroll?.anchors === 0, JSON.stringify(ctx.scroll));
check("ContextMenu stays inside the viewport at the far corner", ctx.clamped?.inside === true, JSON.stringify(ctx.clamped));

const leak = await evalJs(`(async()=>{
    const c=${CELL("ContextMenu")};
    const target=c.querySelector('.mac-showcase__ctx-target');
    const r=target.getBoundingClientRect();
    for(let i=0;i<6;i++){
        target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+12,clientY:r.top+12,button:2}));
        await new Promise(res=>setTimeout(res,50));
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        await new Promise(res=>setTimeout(res,260));
    }
    return {menus: document.querySelectorAll('.mac-menu').length,
        anchors: document.querySelectorAll('.mac-contextmenu-anchor').length,
        open: document.querySelectorAll('.mac-menu.is-open').length};
})()`);
check("6 open/close cycles leave nothing behind", leak.menus === 0 && leak.anchors === 0 && leak.open === 0, JSON.stringify(leak));

// ---------------------------------------------------------------- showcase counts
const counts = await evalJs(`(()=>{
    return {heads: [...document.querySelectorAll('.mac-showcase__heading')].map(h=>h.textContent.replace(/\\s+/g,' ').trim())};
})()`);
check("Showcase advertises at least 27 controls", (counts.heads ?? []).some((h) => { const m = /(\d+) 个/.exec(h); return m && Number(m[1]) >= 27; }), JSON.stringify(counts.heads));

const errors = await evalJs(`(()=>{const e=window.__macErrors||[];return e.length;})()`);
check("no runtime errors captured", errors === 0 || errors === undefined, String(errors));

console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} assertions OK`);

const shotCell = async (name, file) => {
    const ok = await evalJs(`(()=>{const c=${CELL(name)};if(!c)return null;c.scrollIntoView({block:'center'});return true;})()`);
    if (!ok) return console.log("no cell", name);
    await new Promise((r) => setTimeout(r, 450));
    const b = await evalJs(`(()=>{const c=${CELL(name)};const r=c.getBoundingClientRect();
        return {x:Math.round(r.left+window.scrollX),y:Math.round(r.top+window.scrollY),w:Math.round(r.width),h:Math.round(r.height)};})()`);
    const shot = await send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: true,
        clip: {x: b.x, y: b.y, width: b.w, height: b.h, scale: 2},
    });
    writeFileSync(join(process.cwd(), file), Buffer.from(shot.data, "base64"));
    console.log("saved", file, JSON.stringify(b));
};

for (const [name, file] of [
    ["Pagination", "p2-pagination.png"],
    ["Breadcrumb", "p2-breadcrumb.png"],
    ["Avatar", "p2-avatar.png"],
    ["ProgressRing", "p2-ring.png"],
    ["EmptyState", "p2-empty.png"],
    ["ContextMenu", "p2-contextmenu.png"],
]) {
    await shotCell(name, file);
}

ws.close();
proc.kill();
server.close();
setTimeout(() => process.exit(fails > 0 ? 1 : 0), 200);
