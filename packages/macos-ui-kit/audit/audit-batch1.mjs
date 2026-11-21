import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, extname, join, normalize} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {existsSync, writeFileSync} from "node:fs";
import WebSocket from "ws";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist-preview");
const PORT = 8364;
const BASE = "/macos-ui-kit/";
const T = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ttf": "font/ttf"};

const server = createServer(async (req, res) => {
    let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (p.startsWith(BASE)) p = p.slice(BASE.length - 1);
    else p = "/";
    let rel = p === "/" || p === "" ? "index.html" : p.replace(/^\/+/, "");
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
    "--headless=new", "--remote-debugging-port=9614", "--no-first-run", "--disable-gpu",
    "--hide-scrollbars", `--user-data-dir=${join(process.cwd(), ".shot4")}`,
    "--window-size=1280,900", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try {
        const r = await fetch("http://127.0.0.1:9614/json/list");
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
await send("Emulation.setDeviceMetricsOverride", {width: 1280, height: 900, deviceScaleFactor: 2, mobile: false});
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

// ---------------------------------------------------------------- Kbd
const kbd = await evalJs(`(()=>{
    const cells=[...document.querySelectorAll('.mac-showcase__grid > *')];
    const find=n=>cells.find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===n);
    const c=find('Kbd'); if(!c) return {error:'no Kbd cell'};
    const groups=[...c.querySelectorAll('.mac-kbd')];
    return {
        count: groups.length,
        first: groups[0].textContent,
        second: groups[1].textContent,
        third: groups[2].textContent,
        capHeight: Math.round(groups[0].querySelector('.mac-kbd__key').getBoundingClientRect().height),
        aria: groups[1].getAttribute('aria-label'),
        sameRow: new Set(groups.map(g=>Math.round(g.getBoundingClientRect().top))).size,
    };
})()`);
check("Kbd renders 5 groups", kbd.count === 5, JSON.stringify(kbd));
check("Kbd orders cmd+shift+p as ⇧⌘P", kbd.second === "⇧⌘P", String(kbd.second));
check("Kbd maps ⌃⌥⌫", kbd.third === "⌃⌥⌫", String(kbd.third));
check("Kbd keycap height 18", kbd.capHeight === 18, String(kbd.capHeight));
check("Kbd aria spells it out", kbd.aria === "Shift Command P", String(kbd.aria));

// ---------------------------------------------------------------- Divider
const divider = await evalJs(`(()=>{
    const cells=[...document.querySelectorAll('.mac-showcase__grid > *')];
    const find=n=>cells.find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===n);
    const c=find('Divider'); if(!c) return {error:'no Divider cell'};
    const all=[...c.querySelectorAll('.mac-divider')];
    const v=all.find(d=>d.getAttribute('aria-orientation')==='vertical');
    const h=all.find(d=>d.getAttribute('aria-orientation')==='horizontal'&&!d.classList.contains('mac-divider--labelled'));
    const l=all.find(d=>d.classList.contains('mac-divider--labelled'));
    const hr=h.getBoundingClientRect(), vr=v.getBoundingClientRect();
    return {
        total: all.length,
        hHeight: hr.height, hWidth: Math.round(hr.width),
        vWidth: vr.width, vHeight: Math.round(vr.height),
        labelText: l?.querySelector('.mac-divider__text')?.textContent,
        labelRules: l? l.querySelectorAll('.mac-divider__rule').length : 0,
    };
})()`);
check("Divider renders 3 rules", divider.total === 3, JSON.stringify(divider));
check("Divider horizontal is a hairline", divider.hHeight <= 1.5 && divider.hWidth > 100, `h=${divider.hWidth}x${divider.hHeight}`);
check("Divider vertical is a hairline column", divider.vWidth <= 1.5 && divider.vHeight >= 20, `v=${divider.vWidth}x${divider.vHeight}`);
check("Divider label '或' flanked by 2 rules", divider.labelText === "或" && divider.labelRules === 2, `${divider.labelText}/${divider.labelRules}`);

// ---------------------------------------------------------------- RadioGroup
const radio = await evalJs(`(()=>{
    const cells=[...document.querySelectorAll('.mac-showcase__grid > *')];
    const find=n=>cells.find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===n);
    const c=find('RadioGroup'); if(!c) return {error:'no RadioGroup cell'};
    const g=c.querySelector('.mac-radios');
    const inputs=[...g.querySelectorAll('input')];
    const names=new Set(inputs.map(i=>i.name));
    const dots=inputs.map(i=>i.nextElementSibling.getBoundingClientRect());
    const checked=inputs.filter(i=>i.checked).map(i=>i.value);
    const disabledIdx=inputs.map((i,idx)=>i.disabled?idx:-1).filter(i=>i>=0);
    return {
        role: g.getAttribute('role'),
        count: inputs.length,
        names: names.size,
        name: inputs[0].name,
        checked,
        disabledIdx,
        dotSize: dots.map(d=>Math.round(d.width)),
        rowsStacked: new Set(dots.map(d=>Math.round(d.top))).size,
        poweredByNative: inputs[0].type,
        // The checkbox box uses the same --mac-icon-sm token; the two must agree.
        iconSm: (()=>{const b=[...document.querySelectorAll('.mac-checkbox__box')][0];return b?Math.round(b.getBoundingClientRect().width):-1;})(),
    };
})()`);
check("RadioGroup uses role=radiogroup", radio.role === "radiogroup", String(radio.role));
check("RadioGroup shares one name", radio.names === 1, String(radio.name));
check("RadioGroup native radios", radio.poweredByNative === "radio", String(radio.poweredByNative));
check("RadioGroup initial selection", String(radio.checked) === "builtin", JSON.stringify(radio.checked));
check("RadioGroup third option disabled", String(radio.disabledIdx) === "2", JSON.stringify(radio.disabledIdx));
check("RadioGroup dots match --mac-icon-sm", radio.dotSize.every((d) => d === radio.iconSm), `${JSON.stringify(radio.dotSize)} vs token ${radio.iconSm}`);
check("RadioGroup stacks vertically", radio.rowsStacked === 3, String(radio.rowsStacked));

// keyboard: focus the checked radio and press Down — the browser moves selection.
const radioKeys = await evalJs(`(async()=>{
    const c=[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()==='RadioGroup');
    const inputs=[...c.querySelectorAll('input')];
    inputs[0].focus();
    return {focused: document.activeElement === inputs[0]};
})()`);
check("RadioGroup checked radio is focusable", radioKeys.focused === true, JSON.stringify(radioKeys));

// ---------------------------------------------------------------- SearchField
const search = await evalJs(`(async()=>{
    const c=[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()==='SearchField');
    const root=c.querySelector('.mac-searchfield');
    const control=root.querySelector('.mac-searchfield__control');
    const input=root.querySelector('input');
    const clear=root.querySelector('.mac-searchfield__clear');
    const r=control.getBoundingClientRect();
    const radius=parseFloat(getComputedStyle(control).borderTopLeftRadius);
    const before={clearHidden: clear.hidden, readout: c.querySelector('.mac-showcase__state').textContent};

    // Type: onInput fires at once, onChange only after the debounce.
    input.focus();
    input.value='nginx';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const during=c.querySelector('.mac-showcase__state').textContent;
    const clearAfterTyping=clear.hidden;
    await new Promise(r=>setTimeout(r,400));
    const after=c.querySelector('.mac-showcase__state').textContent;

    // Escape clears.
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    const afterEsc={value: input.value, readout: c.querySelector('.mac-showcase__state').textContent};

    return {height: Math.round(r.height), radius, isPill: radius >= r.height/2,
            radiusWider: Math.abs(r.width - r.height) > 40,
            before, during, after, clearAfterTyping, afterEsc,
            hasIcon: !!root.querySelector('.mac-searchfield__icon svg')};
})()`);
check("SearchField is a pill (radius = h/2)", search.isPill === true, `r=${search.radius} h=${search.height}`);
check("SearchField has a leading magnifier", search.hasIcon === true, String(search.hasIcon));
check("SearchField clear hidden while empty", search.before.clearHidden === true, JSON.stringify(search.before));
check("SearchField onInput is immediate", search.during === "正在输入…", String(search.during));
check("SearchField shows clear while typing", search.clearAfterTyping === false, String(search.clearAfterTyping));
check("SearchField onChange after debounce", search.after === '搜索: "nginx"', String(search.after));
check("SearchField Escape clears", search.afterEsc.value === "" && search.afterEsc.readout === '搜索: ""', JSON.stringify(search.afterEsc));

// ---------------------------------------------------------------- Alert
const alert = await evalJs(`(async()=>{
    const c=[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()==='Alert');
    const btn=c.querySelector('.mac-button');
    btn.click();
    await new Promise(r=>setTimeout(r,260));
    const scrim=document.querySelector('.mac-alert__scrim');
    if(!scrim) return {error:'no scrim'};
    const panel=scrim.querySelector('.mac-alert');
    const r=panel.getBoundingClientRect();
    const buttons=[...panel.querySelectorAll('.mac-button')];
    const focusInside=panel.contains(document.activeElement);
    const out={
        role: panel.getAttribute('role'),
        modal: panel.getAttribute('aria-modal'),
        width: Math.round(r.width),
        centred: Math.abs((r.left + r.width/2) - innerWidth/2) < 3 && Math.abs((r.top + r.height/2) - innerHeight/2) < 3,
        buttons: buttons.map(b=>b.textContent.trim()),
        hasIcon: !!panel.querySelector('.mac-alert__icon--warning'),
        hasSuppress: !!panel.querySelector('.mac-checkbox'),
        focusInside,
        openClass: scrim.classList.contains('is-open'),
        title: panel.querySelector('.mac-alert__title').textContent,
    };
    // Escape resolves with the cancel button.
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await new Promise(r=>setTimeout(r,320));
    out.afterEsc=sag=>0;
    out.readout=c.querySelector('.mac-showcase__state').textContent;
    out.goneAfterEsc=!document.querySelector('.mac-alert__scrim.is-open');
    return out;
})()`);
check("Alert is an alertdialog", alert.role === "alertdialog" && alert.modal === "true", `${alert.role}/${alert.modal}`);
check("Alert panel is 400px", alert.width === 400, String(alert.width));
check("Alert is centred in the viewport", alert.centred === true, String(alert.centred));
check("Alert buttons are 取消/删除", JSON.stringify(alert.buttons) === JSON.stringify(["取消", "删除"]), JSON.stringify(alert.buttons));
check("Alert warning icon", alert.hasIcon === true, String(alert.hasIcon));
check("Alert suppress row", alert.hasSuppress === true, String(alert.hasSuppress));
check("Alert traps focus", alert.focusInside === true, String(alert.focusInside));
check("Alert Escape resolves cancel", alert.readout === "选择: 取消", String(alert.readout));

// ---------------------------------------------------------------- console errors
const errors = await evalJs(`(()=>{const e=window.__macErrors||[];return e.length;})()`);
check("no runtime errors captured", errors === 0 || errors === undefined, String(errors));

console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} assertions OK`);

// Screenshot each new cell.
// `captureScreenshot` clips in PAGE coordinates, while getBoundingClientRect is
// viewport-relative; the scroll offset has to be added or the clip lands on
// whatever sits at the top of the document.
const shotCell = async (name, file) => {
    const box = await evalJs(`(()=>{
        const c=[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===${JSON.stringify(name)});
        if(!c) return null;
        c.scrollIntoView({block:'center'});
        return true;
    })()`);
    if (!box) return console.log("no cell", name);
    await new Promise((r) => setTimeout(r, 450));
    const b2 = await evalJs(`(()=>{
        const c=[...document.querySelectorAll('.mac-showcase__grid > *')].find(c=>c.querySelector('.mac-showcase__name')?.textContent?.trim()===${JSON.stringify(name)});
        const r=c.getBoundingClientRect();
        return {
            x: Math.round(r.left + window.scrollX),
            y: Math.round(r.top + window.scrollY),
            w: Math.round(r.width),
            h: Math.round(r.height),
            viewportTop: Math.round(r.top),
        };
    })()`);
    const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: {x: b2.x, y: b2.y, width: b2.w, height: b2.h, scale: 2},
    });
    writeFileSync(join(process.cwd(), file), Buffer.from(shot.data, "base64"));
    console.log("saved", file, JSON.stringify(b2));
};

for (const [name, file] of [["Kbd", "new-kbd.png"], ["Divider", "new-divider.png"], ["RadioGroup", "new-radio.png"], ["SearchField", "new-search.png"], ["Alert", "new-alert.png"]]) {
    await shotCell(name, file);
}

ws.close();
proc.kill();
server.close();
setTimeout(() => process.exit(fails > 0 ? 1 : 0), 200);
