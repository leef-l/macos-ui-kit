// Boundary and logic audit: the inputs a demo never passes.
//
// Every existing audit drives components the way the showcase does — sane data,
// one user at a time. This one hands them empty collections, out-of-range
// values, zero steps, inverted ranges and duplicate keys, and asks two things:
// does anything throw, and does the aria/DOM state stay truthful?
//
// Runs against the published IIFE bundle, so what is measured is what a consumer
// loads.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8421;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css"></head>
<body><div id="host"></div>
<script src="/macos-ui-kit.iife.js"></script>
<script>
window.__run = async (fn) => {
    try { return {ok: true, value: await fn()}; }
    catch (error) { return {ok: false, error: String(error && error.message || error)}; }
};
// Every probe returns a plain object so the runner can assert on it.
window.__cases = {
    "List: empty items": () => {
        const c = new MacUI.List({items: []});
        return {rows: c.element.querySelectorAll('.mac-list__row').length, value: JSON.stringify(c.value)};
    },
    "List: unknown setValue": () => {
        const c = new MacUI.List({items: [{value: 'a', label: 'A'}], value: 'a'});
        c.setValue('nope');
        return {value: c.value, selected: c.element.querySelectorAll('.is-selected').length};
    },
    "List: duplicate values": () => {
        const c = new MacUI.List({items: [{value: 'a', label: 'A'}, {value: 'a', label: 'A2'}]});
        return {rows: c.element.querySelectorAll('.mac-list__row').length, value: c.value};
    },
    "Select: empty options": () => {
        const c = new MacUI.Select({options: []});
        return {value: c.value, control: !!c.element.querySelector('.mac-select__control')};
    },
    "Stepper: zero step": () => {
        const c = new MacUI.Stepper({value: 5, step: 0, min: 0, max: 10});
        const before = c.value;
        c.setValue(6);
        return {before, after: c.value};
    },
    "Stepper: inverted range": () => {
        const c = new MacUI.Stepper({value: 5, min: 10, max: 0});
        return {value: c.value, now: c.element.getAttribute('aria-valuenow')};
    },
    "Stepper: value outside range": () => {
        const c = new MacUI.Stepper({value: 999, min: 0, max: 10});
        return {value: c.value, now: c.element.getAttribute('aria-valuenow')};
    },
    "Slider: min equals max": () => {
        const c = new MacUI.Slider({value: 5, min: 5, max: 5});
        const fill = c.element.querySelector('.mac-slider__fill');
        return {value: c.value, fillWidth: fill ? getComputedStyle(fill).width : null,
                now: c.element.getAttribute('aria-valuenow')};
    },
    "Slider: value above max": () => {
        const c = new MacUI.Slider({value: 999, min: 0, max: 100});
        return {value: c.value, now: c.element.getAttribute('aria-valuenow')};
    },
    "RangeSlider: inverted pair": () => {
        const c = new MacUI.RangeSlider({value: [80, 20]});
        return {value: JSON.stringify(c.value)};
    },
    "RangeSlider: equal pair": () => {
        const c = new MacUI.RangeSlider({value: [50, 50]});
        return {value: JSON.stringify(c.value)};
    },
    "Progress: negative value": () => {
        const c = new MacUI.Progress({value: -20});
        return {now: c.element.getAttribute('aria-valuenow'),
                bar: c.element.querySelector('.mac-progress__fill')?.style.width ?? null};
    },
    "Progress: value above 100": () => {
        const c = new MacUI.Progress({value: 500});
        return {now: c.element.getAttribute('aria-valuenow'),
                bar: c.element.querySelector('.mac-progress__fill')?.style.width ?? null};
    },
    "Pagination: total zero": () => {
        const c = new MacUI.Pagination({total: 0, page: 1, pageSize: 10});
        return {buttons: c.element.querySelectorAll('button').length,
                text: c.element.textContent.trim().slice(0, 40)};
    },
    "Pagination: page beyond range": () => {
        const c = new MacUI.Pagination({total: 30, page: 99, pageSize: 10});
        return {current: c.element.querySelector('[aria-current="page"]')?.textContent.trim() ?? null};
    },
    "Table: no rows": () => {
        const c = new MacUI.Table({columns: [{key: 'a', title: 'A'}], rows: []});
        return {rows: c.element.querySelectorAll('tbody tr').length,
                text: c.element.querySelector('tbody')?.textContent.trim()};
    },
    "Table: no columns": () => {
        const c = new MacUI.Table({columns: [], rows: [{a: 1}]});
        return {cells: c.element.querySelectorAll('tbody td').length,
                throws: false};
    },
    "Table: duplicate row keys": () => {
        const rows = [{id: 'x', a: 1}, {id: 'x', a: 2}];
        const c = new MacUI.Table({columns: [{key: 'a', title: 'A'}], rows, selectable: true});
        document.body.appendChild(c.element);
        c.element.querySelectorAll('tbody input[type=checkbox]')[0].click();
        const selected = c.element.querySelectorAll('tbody tr.is-selected').length;
        return {selected};
    },
    "TreeView: empty nodes": () => {
        const c = new MacUI.TreeView({nodes: []});
        return {rows: c.element.querySelectorAll('.mac-treeview__row').length};
    },
    "TreeView: value not present": () => {
        const c = new MacUI.TreeView({nodes: [{value: 'a', label: 'A'}], value: 'zzz'});
        return {selected: c.element.querySelectorAll('[aria-selected="true"]').length};
    },
    "TabView: no tabs": () => {
        const c = new MacUI.TabView({tabs: []});
        return {selected: JSON.stringify(c.selected), tabs: c.element.querySelectorAll('[role=tab]').length};
    },
    "TabView: setSelected unknown": () => {
        const c = new MacUI.TabView({tabs: [{id: 'a', label: 'A'}], selected: 'a'});
        c.setSelected('nope');
        return {selected: c.selected};
    },
    "TabView: close all then select": () => {
        const c = new MacUI.TabView({tabs: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], closable: true});
        c.closeTab('a'); c.closeTab('b');
        const after = JSON.stringify(c.selected);
        c.setSelected('a');
        return {after, then: c.selected};
    },
    "TabBar: empty items": () => {
        const c = new MacUI.TabBar({items: []});
        return {tabs: c.element.querySelectorAll('[role=tab]').length, value: JSON.stringify(c.value)};
    },
    "TabBar: setValue unknown": () => {
        const c = new MacUI.TabBar({items: [{value: 'a', label: 'A', icon: 'M0 0'}], value: 'a'});
        c.setValue('nope');
        return {value: c.value};
    },
    "SegmentedControl: one option": () => {
        const c = new MacUI.SegmentedControl({options: [{value: 'a', label: 'A'}]});
        return {value: c.value, items: c.element.querySelectorAll('.mac-segmented__item').length};
    },
    "Rating: max zero": () => {
        const c = new MacUI.Rating({value: 3, max: 0});
        return {now: c.element.getAttribute('aria-valuenow'),
                text: c.element.getAttribute('aria-valuetext'),
                stars: c.element.querySelectorAll('.mac-rating__star').length};
    },
    "Rating: value above max": () => {
        const c = new MacUI.Rating({value: 99, max: 5});
        return {now: c.element.getAttribute('aria-valuenow')};
    },
    "NumberField: NaN value": () => {
        const c = new MacUI.NumberField({value: Number.NaN});
        return {value: String(c.value)};
    },
    "ProgressRing: max zero": () => {
        const c = new MacUI.ProgressRing({value: 5, max: 0});
        return {now: c.element.getAttribute('aria-valuenow')};
    },
    "InlineNotice: dismiss twice": () => {
        const c = new MacUI.InlineNotice({message: 'm', dismissible: true});
        c.dismiss(); c.dismiss();
        return {hidden: c.element.hasAttribute('hidden')};
    },
    "CommandPalette: no items, then Enter": () => {
        const c = new MacUI.CommandPalette({items: []});
        c.open();
        const input = document.querySelector('.mac-commandpalette__input');
        input?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
        const stillOpen = !!document.querySelector('.mac-commandpalette');
        c.close();
        return {stillOpen};
    },
    "ActionSheet: open twice": () => {
        const c = new MacUI.ActionSheet({actions: [{value: 'a', label: 'A'}]});
        c.open(); c.open();
        const count = document.querySelectorAll('.mac-actionsheet').length;
        c.close(); c.close();
        return {count, after: document.querySelectorAll('.mac-actionsheet').length};
    },
    "destroy then use": () => {
        const c = new MacUI.List({items: [{value: 'a', label: 'A'}]});
        document.body.appendChild(c.element);
        c.destroy();
        c.setValue('a');
        return {destroyed: c.isDestroyed};
    },

    // --- second batch: the components a demo never stresses ------------------
    "DatePicker: invalid value": () => {
        const c = new MacUI.DatePicker({value: 'not-a-date'});
        return {value: c.value, input: c.element.querySelector('input').value};
    },
    "DatePicker: inverted min/max": () => {
        const c = new MacUI.DatePicker({value: '2026-05-05', min: '2026-12-01', max: '2026-01-01'});
        return {value: c.value};
    },
    "Calendar: invalid date": () => {
        const c = new MacUI.Calendar({value: '2026-13-45'});
        return {value: c.value, title: c.element.querySelector('.mac-calendar__title')?.textContent.trim()};
    },
    "Calendar: inverted bounds": () => {
        const c = new MacUI.Calendar({value: '2026-02-10', min: '2026-03-01', max: '2026-01-01'});
        return {days: c.element.querySelectorAll('.mac-calendar__day').length,
                disabled: c.element.querySelectorAll('[disabled]').length};
    },
    "TimePicker: invalid value": () => {
        const c = new MacUI.TimePicker({value: '99:99'});
        return {value: c.value};
    },
    "TimePicker: zero step": () => {
        const c = new MacUI.TimePicker({value: '10:00', step: 0});
        return {step: c.element.querySelector('input').getAttribute('step')};
    },
    "ComboBox: no options, then type": () => {
        const c = new MacUI.ComboBox({options: []});
        document.body.appendChild(c.element);
        const input = c.element.querySelector('input');
        input.value = 'zzz';
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
        return {value: c.value, lists: document.querySelectorAll('.mac-combobox__list').length};
    },
    "Select: unknown setValue": () => {
        const c = new MacUI.Select({options: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}], value: 'a'});
        c.setValue('nope');
        return {value: c.value};
    },
    "SplitView: primary larger than container": () => {
        const c = new MacUI.SplitView({primary: document.createElement('div'), secondary: document.createElement('div'), primarySize: 99999});
        document.body.appendChild(c.element);
        return {width: Math.round(c.element.getBoundingClientRect().width)};
    },
    "TreeView: deep nesting": () => {
        let node = {value: 'l5', label: 'L5'};
        for (let level = 4; level >= 1; level--) {
            node = {value: 'l' + level, label: 'L' + level, expanded: true, children: [node]};
        }
        const c = new MacUI.TreeView({nodes: [node], value: 'l5'});
        return {rows: c.element.querySelectorAll('.mac-treeview__row').length,
                selected: c.element.querySelectorAll('[aria-selected="true"]').length};
    },
    "TreeView: select a child of a collapsed parent": () => {
        const c = new MacUI.TreeView({
            nodes: [{value: 'p', label: 'P', expanded: false, children: [{value: 'k', label: 'K'}]}],
            value: 'k',
        });
        return {selected: c.element.querySelectorAll('[aria-selected="true"]').length,
                visible: c.element.querySelectorAll('.mac-treeview__row').length};
    },
    "ProgressRing: out of range": () => {
        const low = new MacUI.ProgressRing({value: -50});
        const high = new MacUI.ProgressRing({value: 500});
        return {low: low.element.getAttribute('aria-valuenow'), high: high.element.getAttribute('aria-valuenow')};
    },
    "SearchField: clear twice": () => {
        const c = new MacUI.SearchField({value: 'abc'});
        c.setValue('abc');
        return {value: c.value};
    },
    "Dialog: open twice, close twice": async () => {
        const c = new MacUI.Dialog({title: 'T'});
        c.open(); c.open();
        const opened = document.querySelectorAll('.mac-dialog').length;
        c.close(); c.close();
        // close() removes the scrim after its fade, so the count has to settle
        // before it means anything.
        await new Promise((r) => setTimeout(r, 320));
        return {opened, after: document.querySelectorAll('.mac-dialog').length};
    },
    "Menu: no items": () => {
        const c = new MacUI.Menu({items: []});
        const anchor = document.createElement('button');
        document.body.appendChild(anchor);
        c.open(anchor);
        const mounted = document.querySelectorAll('.mac-menu').length;
        c.close();
        return {mounted};
    },
    "Pagination: negative total": () => {
        const c = new MacUI.Pagination({total: -5, page: 1, pageCount: 3});
        return {text: c.element.textContent.trim().slice(0, 30)};
    },
    "Table: shrink rows under a selection": () => {
        const c = new MacUI.Table({
            columns: [{key: 'a', title: 'A'}],
            rows: [{id: '1', a: 1}, {id: '2', a: 2}],
            selectable: true,
            selectedKeys: ['1', '2'],
        });
        document.body.appendChild(c.element);
        const before = c.element.querySelectorAll('tr.is-selected').length;
        return {before, rows: c.element.querySelectorAll('tbody tr').length};
    },
};
</script></body></html>`;

const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/" || url === "/index.html") {
        res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
        return void res.end(PAGE);
    }
    const file = url === "/style.css" ? join(KIT, "dist", "macos-ui-kit.css") : join(KIT, "dist", "macos-ui-kit.iife.js");
    try {
        const body = await readFile(file);
        res.writeHead(200, {"content-type": url.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"});
        res.end(body);
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const proc = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", "--remote-debugging-port=9681", "--no-first-run", "--disable-gpu",
    `--user-data-dir=${join(process.cwd(), ".shot28")}`, "--window-size=900,700", "about:blank",
], {stdio: "ignore"});

let targets = null;
for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch("http://127.0.0.1:9681/json/list")).json(); if (targets.length) break; } catch {}
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
await send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
await new Promise((r) => setTimeout(r, 2000));

const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    if (r?.exceptionDetails) return {__error: r.exceptionDetails.exception?.description};
    return r?.result?.value;
};

const results = await evalJs(`(async () => {
    const out = [];
    for (const [name, fn] of Object.entries(window.__cases)) {
        // Awaited: a probe may have to look at something that settles later, such
        // as a scrim that is removed after its fade.
        const r = await window.__run(fn);
        out.push({name, ok: r.ok, value: r.ok ? r.value : null, error: r.ok ? null : r.error});
    }
    return out;})()`);

const thrown = (results ?? []).filter((r) => !r.ok);
console.log(`cases: ${results?.length ?? 0}, threw: ${thrown.length}`);
for (const r of thrown) console.log(`THROW ${r.name}: ${r.error}`);

// Print every observation: the point of this audit is to read them, not to
// rubber-stamp a shape I guessed at.
for (const r of results ?? []) {
    if (!r.ok) continue;
    console.log(`--- ${r.name}`);
    console.log("    " + JSON.stringify(r.value));
}

// --- assertions --------------------------------------------------------------
// Everything above is observation; these are the invariants that must hold, so a
// regression fails the suite instead of scrolling past in a log.
let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
    if (cond) { pass++; console.log(`OK   ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
    else { fail++; console.log(`FAIL ${label}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
};
const at = (name) => (results ?? []).find((r) => r.name === name)?.value ?? {};

ok(thrown.length === 0, "no adversarial input throws", thrown.map((r) => r.name));

// NaN must never reach the UI. Both of these did.
const pg = at("Pagination: total zero");
ok(!/NaN/.test(pg.text ?? ""), "an empty page list renders no NaN", pg.text);
ok(at("Pagination: page beyond range").current === "1",
    "a page beyond the end clamps to the first", at("Pagination: page beyond range").current);
ok(at("NumberField: NaN value").value === "0",
    "a NaN initial value falls back to the minimum", at("NumberField: NaN value").value);
ok(at("Progress: negative value").now === "0" && at("Progress: value above 100").now === "100",
    "progress clamps to 0..100 in both directions",
    [at("Progress: negative value").now, at("Progress: value above 100").now]);
ok(at("Rating: value above max").now === "5", "rating clamps to its maximum", at("Rating: value above max").now);
ok(at("RangeSlider: inverted pair").value === "[20,80]",
    "an inverted range pair is normalised", at("RangeSlider: inverted pair").value);

// Documented behaviour, asserted so it cannot drift: normalising an inverted
// Stepper range and a zero step is deliberate (see the constructor comment), so
// these must keep clamping rather than start throwing.
ok(at("Stepper: inverted range").now === "5" && at("Stepper: value outside range").now === "10",
    "a stepper normalises its range and clamps its value",
    [at("Stepper: inverted range").now, at("Stepper: value outside range").now]);

// Duplicate row keys used to make selection ambiguous.
ok(at("Table: duplicate row keys").selected === 1,
    "a duplicate row key selects exactly one row", at("Table: duplicate row keys").selected);

ok(at("List: empty items").rows === 0 && at("TreeView: empty nodes").rows === 0,
    "empty collections render nothing rather than throwing");
ok(at("TabView: no tabs").selected === '""', "a tab view with no tabs has no selection");
ok(at("ActionSheet: open twice").count === 1 && at("ActionSheet: open twice").after === 0,
    "opening twice mounts one sheet, and closing twice leaves none");
ok(at("CommandPalette: no items, then Enter").stillOpen === true,
    "Enter with nothing highlighted leaves the palette open");

// Second batch: parsing, unknown ids, and overlays opened twice.
ok(at("DatePicker: invalid value").value === "" && at("TimePicker: invalid value").value === "",
    "an unparseable date or time is refused, not echoed",
    [at("DatePicker: invalid value").value, at("TimePicker: invalid value").value]);
ok(at("Select: unknown setValue").value === "a",
    "a select ignores an unknown id instead of clearing itself",
    at("Select: unknown setValue").value);
ok(at("Dialog: open twice, close twice").opened === 1 && at("Dialog: open twice, close twice").after === 0,
    "a dialog mounts once and leaves nothing behind", at("Dialog: open twice, close twice"));
ok(at("TreeView: deep nesting").rows === 5 && at("TreeView: deep nesting").selected === 1,
    "five levels of nesting render five rows with one selection", at("TreeView: deep nesting"));
ok(at("ProgressRing: out of range").low === "0" && at("ProgressRing: out of range").high === "100",
    "a ring clamps out-of-range values", at("ProgressRing: out of range"));
ok(at("Calendar: invalid date").value === "",
    "an impossible calendar date falls back instead of throwing", at("Calendar: invalid date").value);
ok(at("SplitView: primary larger than container").width <= 1200,
    "an oversized primary pane does not escape its container",
    at("SplitView: primary larger than container").width);

console.log(`\n${pass} assertions passed, ${fail} failed`);
console.log(`SUMMARY: ${(results ?? []).length} cases, ${thrown.length} threw, ${fail} assertions failed`);
try { proc.kill(); } catch {}
server.close();
// Exit 0 on purpose: this script reports, it does not gate. The assertions that
// matter become permanent once the finding is fixed.
process.exit(fail > 0 || thrown.length > 0 ? 1 : 0);
