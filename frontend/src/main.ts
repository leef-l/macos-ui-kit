import {Events, System, WML} from "@wailsio/runtime";
import {GreetService, WindowService} from "../bindings/changeme";
import type {WindowState} from "../bindings/changeme/models";
import {AppNavigate as appNavigateEvent, WindowState as windowStateEvent} from "../bindings/events";

// The kit's foundation (tokens, fonts, scrollbars) is imported by src/ui/index.ts
// as a side effect, so importing any component is enough to bring the design
// system with it. No separate stylesheet imports are needed here.

import {
    Badge,
    Button,
    Checkbox,
    ComboBox,
    DatePicker,
    Dialog,
    Disclosure,
    Menu,
    MobileShell,
    NumberField,
    Popover,
    Progress,
    SegmentedControl,
    Select,
    Sheet,
    Sidebar,
    Slider,
    Spinner,
    SplitView,
    StatusBar,
    Switch,
    Table,
    TabView,
    TextArea,
    TextField,
    TitleBar,
    Toast,
    Toolbar,
    Tooltip,
    looksLikeMobile,
} from "@leef-l/macos-ui-kit";
import {buildShowcase} from "./showcase/showcase";

/* =============================================================================
   Application shell.

   Two shells, one component kit (see src/ui/DESIGN.md):
   - desktop: draggable frameless window, traffic lights, sidebar
   - mobile:  full-screen, safe-area aware, bottom tab bar

   Wails integration rules applied here:
   - every binding returns a Promise, so every call is awaited or .catch()ed;
   - every Events.On() unsubscribe handle is kept and released on teardown;
   - any native window state that arrives is applied idempotently.
   ========================================================================== */

WML.Enable();

/** Teardown hooks, run on unload so nothing outlives the window. */
const teardown: Array<() => void> = [];

const ICONS = {
    overview:
        "M3 3 h7.5 v7.5 h-7.5 Z M13.5 3 h7.5 v7.5 h-7.5 Z M3 13.5 h7.5 v7.5 h-7.5 Z M13.5 13.5 h7.5 v7.5 h-7.5 Z",
    greeting:
        "M21 11.5 a8.4 8.4 0 0 1 -9 8.4 8.9 8.9 0 0 1 -4 -0.9 L3 21 l1.9 -4.9 a8.4 8.4 0 0 1 -0.9 -3.9 8.4 8.4 0 0 1 8.4 -8.4 8.4 8.4 0 0 1 8.6 8.4 Z",
    activity: "M3 12 h4 l2.5 -6 l4 12 L16 12 h5",
    // A 2x2 of rounded blocks: the conventional "components" mark.
    showcase:
        "M4 4 h6.5 v6.5 h-6.5 Z M13.5 4 h6.5 v6.5 h-6.5 Z M4 13.5 h6.5 v6.5 h-6.5 Z M13.5 13.5 h6.5 v6.5 h-6.5 Z",
    settings:
        "M12 15 a3 3 0 1 0 0 -6 a3 3 0 0 0 0 6 Z M19.4 15 a1.7 1.7 0 0 0 0.3 1.9 l0.1 0.1 a2 2 0 1 1 -2.8 2.8 l-0.1 -0.1 a1.7 1.7 0 0 0 -2.9 1.2 v0.1 a2 2 0 1 1 -4 0 v-0.1 a1.7 1.7 0 0 0 -2.9 -1.2 l-0.1 0.1 a2 2 0 1 1 -2.8 -2.8 l0.1 -0.1 a1.7 1.7 0 0 0 -1.2 -2.9 h-0.1 a2 2 0 1 1 0 -4 h0.1 a1.7 1.7 0 0 0 1.2 -2.9 l-0.1 -0.1 a2 2 0 1 1 2.8 -2.8 l0.1 0.1 a1.7 1.7 0 0 0 2.9 -1.2 v-0.1 a2 2 0 1 1 4 0 v0.1 a1.7 1.7 0 0 0 2.9 1.2 l0.1 -0.1 a2 2 0 1 1 2.8 2.8 l-0.1 0.1 a1.7 1.7 0 0 0 1.2 2.9 h0.1 a2 2 0 1 1 0 4 h-0.1 a1.7 1.7 0 0 0 -1.2 2.9 Z",
    search: "M11 18 a7 7 0 1 0 0 -14 a7 7 0 0 0 0 14 Z M16.5 16.5 L21 21",
} as const;

/* -----------------------------------------------------------------------------
   Section registry — the single source of truth for navigation.
   -------------------------------------------------------------------------- */

const SECTIONS = [
    {id: "overview", label: "概览", icon: ICONS.overview},
    {id: "greeting", label: "问候", icon: ICONS.greeting},
    {id: "activity", label: "活动", icon: ICONS.activity},
    {id: "showcase", label: "组件", icon: ICONS.showcase},
    {id: "settings", label: "设置", icon: ICONS.settings},
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/* -----------------------------------------------------------------------------
   Shared panes: built once, reused by whichever shell is active.
   -------------------------------------------------------------------------- */

/** Build the body of a section. */
function buildPane(section: SectionId): HTMLElement {
    const pane = document.createElement("section");
    pane.className = "pane";
    pane.dataset.pane = section;

    switch (section) {
        case "overview":
            pane.append(
                heading("概览", "Go 后端与 TypeScript 前端，运行在原生窗口中。"),
                overviewCards(),
                greetForm(),
            );
            break;
        case "greeting":
            pane.append(
                heading("问候", "每条回复都由 Go 服务返回。"),
                emptyState("还没有问候", "在「概览」里输入名字并点击问候，回复会出现在这里。"),
                createLog("log"),
            );
            break;
        case "activity":
            pane.append(
                heading("活动", "窗口事件与后端消息，可按类型过滤。"),
                activityPane(),
            );
            break;
        case "settings":
            pane.append(
                heading("设置", "界面的外观与行为。"),
                settingsList(),
            );
            break;
        case "showcase": {
            // The showcase builds the whole component kit live, so it is mounted
            // as one block rather than through the small helpers above.
            pane.append(
                heading("组件", "全部 31 个组件，可直接交互；顶部可切换主题与密度。"),
                buildShowcase(),
                componentWorkbench(),
            );
            break;
        }
    }

    return pane;
}

function heading(title: string, subtitle: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "pane__head";
    const h = document.createElement("h1");
    h.className = "pane__title";
    h.textContent = title;
    const p = document.createElement("p");
    p.className = "pane__subtitle";
    p.textContent = subtitle;
    wrap.append(h, p);
    return wrap;
}

function emptyState(title: string, text: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "empty";
    wrap.id = "greeting-empty";
    const t = document.createElement("p");
    t.className = "empty__title";
    t.textContent = title;
    const d = document.createElement("p");
    d.className = "empty__text";
    d.textContent = text;
    wrap.append(t, d);
    return wrap;
}

function createLog(id: string): HTMLUListElement {
    const list = document.createElement("ul");
    list.className = "log";
    list.id = id;
    return list;
}

/* -----------------------------------------------------------------------------
   Overview content
   -------------------------------------------------------------------------- */

let statPlatformNode: HTMLElement | null = null;
let statWindowNode: HTMLElement | null = null;
let statTimeNode: HTMLElement | null = null;

function overviewCards(): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "cards";

    const make = (label: string, hint: string, assign: (node: HTMLElement) => void) => {
        const card = document.createElement("article");
        card.className = "card";
        const l = document.createElement("span");
        l.className = "card__label";
        l.textContent = label;
        const v = document.createElement("strong");
        v.className = "card__value";
        v.textContent = "—";
        const h = document.createElement("span");
        h.className = "card__hint";
        h.textContent = hint;
        card.append(l, v, h);
        assign(v);
        return card;
    };

    grid.append(
        make("平台", "当前运行平台", (n) => (statPlatformNode = n)),
        make("窗口", "双击标题栏可缩放", (n) => (statWindowNode = n)),
        make("时间", "每秒由 Go 推送", (n) => (statTimeNode = n)),
    );
    return grid;
}

/* -----------------------------------------------------------------------------
   Greet form (uses the kit's TextField and Button)
   -------------------------------------------------------------------------- */

let nameField: TextField | null = null;
let greetButton: Button | null = null;
let messageArea: TextArea | null = null;
let templateCombo: ComboBox | null = null;
let templateMenu: Menu | null = null;

/**
 * Message templates offered by the compose form.
 *
 * Each one fills the body with a starting sentence and sets the greeting style
 * used when the message is sent, so the menu changes what is produced rather
 * than being a decorative control.
 */
const TEMPLATES = [
    {label: "问候", value: "greeting", body: "你好，很高兴见到你！"},
    {label: "感谢", value: "thanks", body: "非常感谢你的帮助，这次真的帮了大忙。"},
    {label: "告别", value: "farewell", body: "先到这里，我们下次再聊。"},
] as const;

function greetForm(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "greet";

    const row = document.createElement("div");
    row.className = "input-box";

    nameField = new TextField({
        placeholder: "你的名字",
    });
    // TextField renders its own input; give it the id the styles expect.
    nameField.element.classList.add("greet__field");
    nameField.element.querySelector("input")?.setAttribute("aria-label", "名字");

    greetButton = new Button({
        label: "问候",
        icon: "M5 12 h14 M12 5 l7 7 l-7 7",
        variant: "primary",
        onClick: () => void sendGreeting(),
    });

    row.append(nameField.element, greetButton.element);
    wrap.append(row);

    // --- Compose row: recipient + template picker ---------------------------
    const composeRow = document.createElement("div");
    composeRow.className = "compose-row";

    templateCombo = new ComboBox({
        options: [
            {label: "张三", value: "zhangsan"},
            {label: "李四", value: "lisi"},
            {label: "王五", value: "wangwu"},
        ],
        placeholder: "收件人",
        onChange: (value) => {
            addComposeLog(`收件人: ${value}`);
        },
    });
    composeRow.appendChild(templateCombo.element);

    // The menu is the template picker. It is anchored to a button rather than
    // being always visible, which is how a real compose form offers presets.
    const templateButton = new Button({label: "选择模板"});
    const templateTooltip = new Tooltip({
        content: "选择一个模板填充正文",
        placement: "top",
    });
    templateTooltip.attachTo(templateButton.element);

    templateMenu = new Menu({
        items: TEMPLATES.map((t) => ({label: t.label, value: t.value})),
        onSelect: (value) => {
            const template = TEMPLATES.find((t) => t.value === value);
            if (!template) return;
            messageArea?.setValue(template.body);
            addComposeLog(`已套用模板「${template.label}」`);
        },
    });

    templateButton.element.addEventListener("click", () => {
        templateMenu?.open(templateButton.element);
    });
    composeRow.appendChild(templateButton.element);

    // A tooltip on the send button explains the shortcut, which is otherwise
    // invisible on a touch device.
    const sendHint = new Tooltip({
        content: "⌘↵ 快速发送",
        placement: "top",
    });
    sendHint.attachTo(greetButton.element);

    wrap.appendChild(composeRow);

    // --- Body: multi-line message -------------------------------------------
    messageArea = new TextArea({
        placeholder: "写点什么…",
        rows: 3,
        maxLength: 200,
    });
    wrap.appendChild(messageArea.element);

    const composeLog = document.createElement("div");
    composeLog.className = "compose-log";
    composeLog.id = "compose-log";
    wrap.appendChild(composeLog);

    return wrap;
}

/** Append a line to the compose log, keeping it short. */
function addComposeLog(text: string): void {
    const log = document.getElementById("compose-log");
    if (!log) return;
    const line = document.createElement("div");
    line.className = "compose-log__line";
    line.textContent = text;
    log.prepend(line);
    while (log.children.length > 3) log.lastElementChild?.remove();
}

/* -----------------------------------------------------------------------------
   Settings (uses TabView, Switch, SegmentedControl, Select, Slider, Checkbox,
   NumberField, DatePicker, Disclosure, Dialog)
   -------------------------------------------------------------------------- */

let sidebarSwitch: Switch | null = null;
let appearanceSegmented: SegmentedControl | null = null;

/** One settings row: a name, an explanation, and the control that changes it. */
function settingRow(name: string, hint: string, control: HTMLElement): HTMLElement {
    const item = document.createElement("div");
    item.className = "setting";
    const text = document.createElement("div");
    text.className = "setting__text";
    const n = document.createElement("span");
    n.className = "setting__name";
    n.textContent = name;
    const h = document.createElement("span");
    h.className = "setting__hint";
    h.textContent = hint;
    text.append(n, h);
    item.append(text, control);
    return item;
}

/**
 * Settings, split across tabs.
 *
 * Three tabs rather than one long column because the sections answer different
 * questions — what it looks like, how it behaves, and the sharp-edged options —
 * and a single scroll would mix them.
 */
function settingsList(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "settings-tabs";

    const tabs = new TabView({
        tabs: [
            {id: "appearance", label: "外观"},
            {id: "behaviour", label: "行为"},
            {id: "advanced", label: "高级"},
        ],
        selected: "appearance",
    });

    tabs.addPanel("appearance", appearanceSettings());
    tabs.addPanel("behaviour", behaviourSettings());
    tabs.addPanel("advanced", advancedSettings());

    wrap.appendChild(tabs.element);
    return wrap;
}

/** 外观 tab: theme, text scale, motion. */
function appearanceSettings(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "settings";

    appearanceSegmented = new SegmentedControl({
        options: [
            {label: "跟随系统", value: "system"},
            {label: "浅色", value: "light"},
            {label: "深色", value: "dark"},
        ],
        value: "system",
        onChange: (value) => applyAppearance(value as AppearanceMode),
    });

    // The slider drives the kit's own scale factor, so moving it resizes the
    // whole interface rather than only the preview text.
    const scaleSlider = new Slider({
        min: 85,
        max: 130,
        step: 5,
        value: 100,
        showValue: true,
        onChange: (value) => {
            document.documentElement.style.setProperty("--mac-scale", String(value / 100));
        },
    });

    const reduceMotion = new Checkbox({
        checked: false,
        label: "减少动效",
        onChange: (checked) => {
            document.documentElement.classList.toggle("reduce-motion", checked);
        },
    });

    panel.append(
        settingRow("外观", "浅色 / 深色 / 跟随系统。", appearanceSegmented.element),
        settingRow("界面缩放", "整体放大或缩小，影响所有组件。", scaleSlider.element),
        settingRow("动效", "关闭过渡动画。", reduceMotion.element),
    );
    return panel;
}

/** 行为 tab: navigation and locale. */
function behaviourSettings(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "settings";

    sidebarSwitch = new Switch({
        checked: true,
        label: "显示侧边栏",
        onChange: (checked) => setSidebarVisible(checked),
    });

    const language = new Select({
        options: [
            {label: "简体中文", value: "zh-CN"},
            {label: "English", value: "en-US"},
            {label: "日本語", value: "ja-JP"},
        ],
        value: "zh-CN",
        onChange: (value) => {
            // No i18n runtime in this demo; record the choice in the activity
            // table so the control visibly does something.
            recordActivity("backend", `界面语言改为 ${value}`);
        },
    });

    const autoSave = new Switch({
        checked: true,
        label: "自动保存",
    });

    panel.append(
        settingRow("侧边栏", "显示或隐藏左侧导航。", sidebarSwitch.element),
        settingRow("语言", "界面显示语言。", language.element),
        settingRow("自动保存", "离开页面前保存改动。", autoSave.element),
    );
    return panel;
}

/** 高级 tab: cache size, clean-up date, and a guarded destructive action. */
function advancedSettings(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "settings";

    const cacheRows = new NumberField({
        min: 100,
        max: 5000,
        step: 100,
        value: 1000,
        onChange: (value) => {
            recordActivity("backend", `缓存上限改为 ${value} 条`);
        },
    });

    const cleanDate = new DatePicker({
        label: "清理截止",
        onChange: (value) => {
            recordActivity("backend", `清理截止日期设为 ${value || "未设置"}`);
        },
    });

    // Destructive options sit behind a disclosure so they are not adjacent to
    // ordinary controls.
    const dangerContent = document.createElement("div");
    dangerContent.className = "danger-zone";
    const dangerHint = document.createElement("p");
    dangerHint.className = "danger-zone__hint";
    dangerHint.textContent = "清空后无法恢复，活动历史会被永久删除。";

    const clearButton = new Button({label: "清空活动历史", variant: "destructive"});
    clearButton.element.addEventListener("click", () => {
        const dialog = new Dialog({
            title: "清空活动历史？",
            body: `将删除 ${activityEvents.length} 条记录，此操作无法撤销。`,
            confirmLabel: "清空",
            cancelLabel: "取消",
            onConfirm: () => {
                activityEvents.length = 0;
                renderActivity();
                recordActivity("backend", "活动历史已清空");
            },
        });
        dialog.open();
    });

    dangerContent.append(dangerHint, clearButton.element);

    const danger = new Disclosure({
        title: "危险操作",
        meta: "不可恢复",
        content: dangerContent,
    });

    panel.append(
        settingRow("缓存条数上限", "超过后丢弃最旧的记录。", cacheRows.element),
        settingRow("清理截止日期", "早于此日期的事件可以清除。", cleanDate.element),
        danger.element,
    );
    return panel;
}

/* -----------------------------------------------------------------------------
   Appearance
   -------------------------------------------------------------------------- */

type AppearanceMode = "system" | "light" | "dark";

let appearanceMode: AppearanceMode = "system";

async function applyAppearance(mode: AppearanceMode): Promise<void> {
    appearanceMode = mode;

    if (mode !== "system") {
        document.documentElement.dataset.theme = mode;
        return;
    }

    try {
        const dark = await System.IsDarkMode();
        document.documentElement.dataset.theme = dark ? "dark" : "light";
    } catch (error) {
        // Keep whatever theme is currently applied rather than blanking it.
        console.error("mac ui: cannot read system theme", error);
    }
}

/* -----------------------------------------------------------------------------
   Logging helpers
   -------------------------------------------------------------------------- */

const MAX_LOG_ENTRIES = 60;

function clockString(date = new Date()): string {
    return date.toLocaleTimeString("zh-CN", {hour12: false});
}

/**
 * Append one entry to a simple log list.
 *
 * Used by the greeting history, which is an ordered list of messages. The
 * activity pane does not use this: its events are kept as data so the table can
 * filter and re-render them (see recordActivity below).
 */
function appendLog(id: string, text: string, badge?: string): void {
    const list = document.getElementById(id);
    if (!list) return;

    const item = document.createElement("li");
    item.className = "log__item";

    const time = document.createElement("span");
    time.className = "log__time";
    time.textContent = clockString();

    const body = document.createElement("span");
    body.className = "log__text";
    body.textContent = text;

    item.append(time, body);

    if (badge) {
        const tag = document.createElement("span");
        tag.className = "log__badge";
        tag.textContent = badge;
        item.append(tag);
    }

    list.prepend(item);
    while (list.children.length > MAX_LOG_ENTRIES) {
        list.lastElementChild?.remove();
    }
}

/** One row in the activity table. */
interface ActivityEvent {
    id: string;
    time: string;
    kind: "window" | "backend";
    text: string;
}

/**
 * The activity history.
 *
 * Held as data rather than as DOM: the activity pane renders it through a Table,
 * and a filtered view must be able to re-render the same rows. Appending straight
 * to the document would make filtering impossible without scraping the DOM back
 * into objects.
 */
const activityEvents: ActivityEvent[] = [];
const MAX_ACTIVITY = 60;
let activityTable: Table | null = null;
let activityFilter: "all" | "window" | "backend" = "all";
let activityCapacity: Progress | null = null;
/// Previous snapshot, used to diff window events into readable rows.
let previousWindowState: WindowState | null = null;

/** Record one activity event and refresh the rendered table. */
function recordActivity(kind: ActivityEvent["kind"], text: string): void {
    activityEvents.unshift({
        id: `ev-${Date.now()}-${activityEvents.length}`,
        time: clockString(),
        kind,
        text,
    });
    while (activityEvents.length > MAX_ACTIVITY) activityEvents.pop();
    renderActivity();
}

/** Re-render the activity table for the current filter. */
function renderActivity(): void {
    if (!activityTable) return;
    const rows =
        activityFilter === "all"
            ? activityEvents
            : activityEvents.filter((event) => event.kind === activityFilter);
    activityTable.setRows(rows);

    // Capacity shows how close the history buffer is to dropping entries.
    activityCapacity?.setValue(Math.round((activityEvents.length / MAX_ACTIVITY) * 100));
}

/**
 * The activity pane: a filter, the table, and a capacity bar.
 *
 * The table is the reason this pane exists as a component demo — it is a real
 * data grid over real events, not a static sample.
 */
function activityPane(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "activity";

    const toolbar = document.createElement("div");
    toolbar.className = "activity__toolbar";

    const filter = new SegmentedControl({
        options: [
            {label: "全部", value: "all"},
            {label: "窗口", value: "window"},
            {label: "后端", value: "backend"},
        ],
        value: "all",
        onChange: (value) => {
            activityFilter = value as typeof activityFilter;
            renderActivity();
        },
    });
    toolbar.appendChild(filter.element);

    // An explicit refresh shows the Spinner while it re-reads state from Go.
    const refreshButton = new Button({label: "刷新"});
    const spinner = new Spinner({size: "small"});
    spinner.element.hidden = true;
    refreshButton.element.addEventListener("click", () => {
        spinner.element.hidden = false;
        void refreshWindowState()
            .then(() => {
                recordActivity("window", "手动刷新窗口状态");
            })
            .catch(logBindingError("refresh"))
            .finally(() => {
                spinner.element.hidden = true;
            });
    });
    toolbar.append(refreshButton.element, spinner.element);

    wrap.appendChild(toolbar);

    activityTable = new Table({
        columns: [
            {key: "time", title: "时间", width: 90},
            {
                key: "kind",
                title: "类型",
                width: 80,
                render: (value) =>
                    new Badge({
                        text: value === "window" ? "窗口" : "后端",
                        variant: value === "window" ? "default" : "accent",
                    }).element,
            },
            {key: "text", title: "内容"},
        ],
        rows: activityEvents,
        rowKey: (row) => (row as ActivityEvent).id,
        selectable: true,
        emptyText: "还没有事件",
    });
    wrap.appendChild(activityTable.element);

    // Capacity bar under the table.
    const capacityRow = document.createElement("div");
    capacityRow.className = "activity__capacity";
    const capacityLabel = document.createElement("span");
    capacityLabel.className = "activity__capacity-label";
    capacityLabel.textContent = "历史容量";
    activityCapacity = new Progress({value: 0});
    capacityRow.append(capacityLabel, activityCapacity.element);
    wrap.appendChild(capacityRow);

    return wrap;
}

/* -----------------------------------------------------------------------------
   Greet action
   -------------------------------------------------------------------------- */

let toast: Toast | null = null;

async function sendGreeting(): Promise<void> {
    const name = nameField?.value.trim() || "anonymous";
    const body = messageArea?.value.trim() ?? "";
    const recipient = templateCombo?.value ?? "";

    greetButton?.setDisabled(true);
    try {
        // Binding calls return promises; await so the toast reflects the result.
        const greeting = await GreetService.Greet(name);

        toast ??= new Toast({variant: "success"});
        toast.show(greeting);

        appendLog("log", greeting, "Go");
        // The message body is what the user composed, so it belongs in the
        // history next to the reply rather than being silently dropped.
        if (body) {
            appendLog("log", body, "消息");
        }
        if (recipient) {
            addComposeLog(`发送给: ${recipient}`);
        }
        recordActivity("backend", `调用 GreetService.Greet("${name}")`);
        document.getElementById("greeting-empty")?.classList.add("is-hidden");

        // Clear the composer so the next message starts empty.
        messageArea?.setValue("");
    } catch (error) {
        // A rejected promise carries the Go error message.
        const message = error instanceof Error ? error.message : String(error);
        recordActivity("backend", `Greet 失败：${message}`);

        toast ??= new Toast({variant: "error"});
        toast.show("问候失败", message);
    } finally {
        greetButton?.setDisabled(false);
    }
}

/* -----------------------------------------------------------------------------
   Section switching (shared by both shells)
   -------------------------------------------------------------------------- */

/** Show one section and mark its controls as active. */
function activateSection(id: SectionId): void {
    for (const pane of document.querySelectorAll<HTMLElement>(".pane[data-pane]")) {
        pane.classList.toggle("is-active", pane.dataset.pane === id);
    }
    for (const node of document.querySelectorAll<HTMLElement>("[data-section]")) {
        node.classList.toggle("is-active", node.dataset.section === id);
    }
    document.querySelector(".mac-mobile__content")?.scrollTo({top: 0});
    document.querySelector(".content")?.scrollTo({top: 0});
}

/* -----------------------------------------------------------------------------
   Sidebar visibility
   -------------------------------------------------------------------------- */

let sidebar: Sidebar | null = null;
let sidebarVisible = true;

function setSidebarVisible(visible: boolean): void {
    sidebarVisible = visible;
    sidebar?.setCollapsed(!visible);
    sidebarSwitch?.setChecked(visible);
    document.getElementById("window")?.classList.toggle("is-sidebar-hidden", !visible);
}

/* -----------------------------------------------------------------------------
   Window state
   -------------------------------------------------------------------------- */

let titleBar: TitleBar | null = null;
let statusBar: StatusBar | null = null;

function applyWindowState(state: WindowState): void {
    const win = document.getElementById("window");
    if (win) {
        win.dataset.platform = state.platform || "windows";
        win.classList.toggle("is-maximised", state.maximised);
        win.classList.toggle("is-focused", state.focused);

        // macOS already rounds a frameless NSWindow and draws its shadow, so the
        // CSS corner must step aside there or the two edges double up. Windows
        // and Linux have no native rounding to rely on, so they keep ours.
        win.dataset.nativeChrome = state.platform === "darwin" ? "appkit" : "none";
    }

    titleBar?.trafficLights?.setZoomed(state.maximised);
    titleBar?.trafficLights?.setFocused(state.focused);

    if (statWindowNode) {
        statWindowNode.textContent = state.fullscreen
            ? "全屏"
            : state.maximised
                ? "已缩放"
                : "普通";
    }

    // Record the shape of the change rather than raw booleans, so the activity
    // table reads as history instead of a state dump. Skipped on the very first
    // state, which is the initial snapshot rather than something the user did.
    if (previousWindowState) {
        const change = describeWindowChange(previousWindowState, state);
        if (change) recordActivity("window", change);
    }
    previousWindowState = state;
}

/**
 * Describe what changed between two window states, or null when nothing did.
 *
 * Comparing the pair means a single native event does not produce a row per
 * unchanged flag, which would bury the events the user actually caused.
 */
function describeWindowChange(before: WindowState, after: WindowState): string | null {
    if (before.maximised !== after.maximised) {
        return after.maximised ? "窗口已缩放" : "窗口已还原";
    }
    if (before.fullscreen !== after.fullscreen) {
        return after.fullscreen ? "进入全屏" : "退出全屏";
    }
    if (before.focused !== after.focused) {
        return after.focused ? "窗口获得焦点" : "窗口失去焦点";
    }
    return null;
}

/** Ask Go for the current state once; the event stream keeps it current. */
async function refreshWindowState(): Promise<void> {
    try {
        applyWindowState(await WindowService.State());
    } catch (error) {
        // The window may not answer immediately after load; the first native
        // event will correct the state.
        console.error("mac ui: window state unavailable", error);
    }
}

/* -----------------------------------------------------------------------------
   Desktop shell
   -------------------------------------------------------------------------- */

function mountDesktop(mount: HTMLElement): void {
    const searchField = new TextField({
        placeholder: "搜索",
        icon: ICONS.search,
        onInput: (value) => {
            const query = value.trim().toLowerCase();
            for (const node of document.querySelectorAll<HTMLElement>(".mac-sidebar__item")) {
                const label = (node.textContent ?? "").toLowerCase();
                node.style.display = query && !label.includes(query) ? "none" : "";
            }
        },
    });
    searchField.element.classList.add("mac-titlebar__search");
    searchField.element.querySelector("input")?.setAttribute("aria-label", "搜索");

    const sidebarToggle = new Button({
        label: "切换侧边栏",
        icon: "M3 4 h18 v16 h-18 Z M9.5 4 v16",
        variant: "plain",
        onClick: () => setSidebarVisible(!sidebarVisible),
    });

    titleBar = new TitleBar({
        title: "myapp",
        // Behaviour is injected: the kit knows nothing about Wails.
        onClose: () => void WindowService.Close().catch(logBindingError("close")),
        onMinimise: () => void WindowService.Minimise().catch(logBindingError("minimise")),
        onZoom: (event) =>
            void (event.altKey ? WindowService.ToggleFullscreen() : WindowService.ToggleZoom())
                .catch(logBindingError("zoom")),
        // Wails implements title-bar double-click zoom on macOS only, so the kit
        // wires it for every platform.
        onDoubleClick: () => void WindowService.ToggleZoom().catch(logBindingError("zoom")),
        trailing: [searchField.element, sidebarToggle.element],
    });

    sidebar = new Sidebar({
        groups: [{items: SECTIONS.map((s) => ({id: s.id, label: s.label, icon: s.icon}))}],
        selected: "overview",
        onSelect: (id) => activateSection(id as SectionId),
    });

    statusBar = new StatusBar({text: "已连接", state: "ok", trailing: "—"});

    const content = document.createElement("main");
    content.className = "content";
    for (const section of SECTIONS) {
        content.appendChild(buildPane(section.id));
    }

    const body = document.createElement("div");
    body.className = "body";
    body.append(sidebar.element, content);

    const win = document.createElement("div");
    win.className = "window";
    win.id = "window";
    win.append(titleBar.element, body, statusBar.element);

    mount.replaceChildren(win);
}

/* -----------------------------------------------------------------------------
   Mobile shell
   -------------------------------------------------------------------------- */

function mountMobile(mount: HTMLElement): void {
    const shell = new MobileShell({
        title: "概览",
        tabs: SECTIONS.map((s) => ({id: s.id, label: s.label, icon: s.icon})),
        selected: "overview",
        onTabChange: (id) => {
            const section = id as SectionId;
            activateSection(section);
            shell.setTitle(SECTIONS.find((s) => s.id === section)?.label ?? "");
        },
    });

    for (const section of SECTIONS) {
        const pane = buildPane(section.id);
        pane.classList.add("mac-mobile__pane");
        shell.content.appendChild(pane);
    }

    mount.replaceChildren(shell.element);
}

/* -----------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function logBindingError(action: string): (error: unknown) => void {
    return (error) => console.error(`mac ui: ${action} failed`, error);
}

/* -----------------------------------------------------------------------------
   Shell selection
   -------------------------------------------------------------------------- */

/**
 * Pick the desktop or mobile shell.
 *
 * The backend is the authority: `WindowService.State()` reports the real GOOS,
 * so an Android/iOS build always gets the mobile shell no matter how wide the
 * device is, and a desktop build never does even in a narrow window.
 *
 * The viewport heuristic is only a fallback for the moment before the binding
 * answers, or when it fails entirely — a blank window would be worse than a
 * shell that might be swapped one frame later.
 */
function mountShell(mount: HTMLElement): void {
    mountDesktop(mount);

    void WindowService.State()
        .then((state) => {
            const platform = state.platform;
            if (platform === "android" || platform === "ios") {
                mountMobile(mount);
                return;
            }
            // A desktop platform: honour the narrow-window heuristic only as a
            // convenience for small windows on a touch laptop.
            if (platform === "windows" || platform === "linux" || platform === "darwin") {
                if (looksLikeMobile() && platform !== "darwin") {
                    mountMobile(mount);
                }
            }
        })
        .catch((error) => {
            console.error("mac ui: platform unknown, keeping the desktop shell", error);
        });
}

/* -----------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function boot(): void {
    const mount = document.getElementById("app");
    if (!mount) {
        console.error("mac ui: #app mount point missing");
        return;
    }

    mountShell(mount);

    // Seed the activity history with the one event that has always happened by
    // the time the window is up. Without it the table opens empty, which reads
    // as "this pane is broken" rather than "nothing has happened yet".
    recordActivity("window", "应用已启动");

    activateSection("overview");
    void applyAppearance("system");
    void refreshWindowState();

    // --- Time event (from Go, once a second) ------------------------------
    const offTime = Events.On("time", (event) => {
        const full = String(event.data);
        const clock = (full.match(/\d{1,2}:\d{2}:\d{2}/) ?? [full])[0];
        if (statTimeNode) statTimeNode.textContent = clock;
        statusBar?.setTrailing(clock);
    });
    teardown.push(offTime);

    // --- Native window state ---------------------------------------------
    const offWindowState = Events.On(windowStateEvent, (event) => {
        applyWindowState(event.data as WindowState);
    });
    teardown.push(offWindowState);

    // --- System appearance ------------------------------------------------
    const offTheme = Events.On("common:ThemeChanged", () => {
        void applyAppearance(appearanceMode);
    });
    teardown.push(offTheme);

    // --- Native navigation (macOS menu bar) --------------------------------
    // The application menu lives outside the webview, so items such as
    // "Preferences…" (⌘,) cannot touch the UI directly. Go emits the target
    // section and the frontend owns the actual switch, which keeps navigation
    // state in one place.
    const offNavigate = Events.On(appNavigateEvent, (event) => {
        const section = String(event.data) as SectionId;
        if (!SECTIONS.some((item) => item.id === section)) {
            console.error(`mac ui: unknown section "${section}"`);
            return;
        }
        activateSection(section);
    });
    teardown.push(offNavigate);

    // --- Platform label ---------------------------------------------------
    void WindowService.IsMacOS()
        .then((isMac) => {
            if (statPlatformNode) {
                statPlatformNode.textContent = isMac
                    ? "macOS"
                    : navigator.userAgent.includes("Windows")
                        ? "Windows"
                        : "Linux";
            }
        })
        .catch(logBindingError("platform"));

    // --- Global shortcuts -------------------------------------------------
    const onKeyDown = (event: KeyboardEvent) => {
        const mod = event.metaKey || event.ctrlKey;
        if (!mod) return;

        if (event.key.toLowerCase() === "b") {
            event.preventDefault();
            setSidebarVisible(!sidebarVisible);
        }
    };
    window.addEventListener("keydown", onKeyDown);
    teardown.push(() => window.removeEventListener("keydown", onKeyDown));

    // --- Teardown ---------------------------------------------------------
    const cleanup = () => {
        for (const fn of teardown.splice(0)) {
            try {
                fn();
            } catch (error) {
                console.error("mac ui: teardown failed", error);
            }
        }
        sidebar?.destroy();
        titleBar?.destroy();
        statusBar?.destroy();
        toast?.destroy();
    };
    window.addEventListener("beforeunload", cleanup, {once: true});
}

/* -----------------------------------------------------------------------------
   Component workbench (uses Toolbar, SplitView, Popover, Sheet)
   -------------------------------------------------------------------------- */

/**
 * A small inspector for the component kit itself.
 *
 * The showcase below is a catalogue: it proves each component renders. This
 * workbench proves they compose — a toolbar over a split view, with a popover
 * and a sheet hanging off the toolbar's own controls. It is the shape an editor
 * pane would take, which is the most demanding arrangement of these components.
 */
function componentWorkbench(): HTMLElement {
    const wrap = document.createElement("section");
    wrap.className = "workbench";

    const title = document.createElement("h2");
    title.className = "workbench__title";
    title.textContent = "组合示例";
    wrap.appendChild(title);

    const note = document.createElement("p");
    note.className = "workbench__note";
    note.textContent = "工具条 + 分栏 + 浮层，组合成一个检查器面板。";
    wrap.appendChild(note);

    // --- Panes --------------------------------------------------------------
    const listPane = document.createElement("div");
    listPane.className = "workbench__list";

    const detailPane = document.createElement("div");
    detailPane.className = "workbench__detail";

    interface Entry {
        name: string;
        note: string;
    }
    const entries: Entry[] = [
        {name: "Button", note: "带图标的按钮，支持 loading 与 disabled。"},
        {name: "Table", note: "列宽、对齐、行选择与空状态。"},
        {name: "SplitView", note: "可拖拽分隔条，支持水平与垂直。"},
        {name: "Popover", note: "锚定浮层，空间不足时自动翻转。"},
    ];

    let selected = 0;

    /** Render the detail pane for the current selection. */
    const renderDetail = (): void => {
        detailPane.replaceChildren();
        const entry = entries[selected];
        const headingNode = document.createElement("h3");
        headingNode.className = "workbench__detail-title";
        headingNode.textContent = entry.name;
        const body = document.createElement("p");
        body.className = "workbench__detail-body";
        body.textContent = entry.note;
        detailPane.append(headingNode, body);
    };

    entries.forEach((entry, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "workbench__item";
        item.textContent = entry.name;
        item.addEventListener("click", () => {
            selected = index;
            wrap.querySelectorAll(".workbench__item").forEach((el, i) => {
                el.classList.toggle("is-selected", i === index);
            });
            renderDetail();
        });
        if (index === 0) item.classList.add("is-selected");
        listPane.appendChild(item);
    });
    renderDetail();

    const split = new SplitView({
        orientation: "horizontal",
        primary: listPane,
        secondary: detailPane,
        primarySize: 180,
        minPrimary: 120,
        minSecondary: 200,
    });

    // --- Toolbar ------------------------------------------------------------
    const infoButton = new Button({label: "说明"});
    const sheetButton = new Button({label: "许可", variant: "primary"});

    // A popover explains the workbench inline, without leaving the pane.
    const popover = new Popover({
        content: "左侧选择组件，右侧查看说明。分栏可拖拽。",
        placement: "bottom",
        arrow: true,
        ariaLabel: "组合示例说明",
    });
    infoButton.element.addEventListener("click", () => {
        popover.open(infoButton.element);
    });

    // A sheet carries the longer text that would crowd a popover.
    const sheet = new Sheet({
        title: "许可",
        body: "组件库以 MIT 许可发布。字体 Inter 使用 SIL Open Font License 1.1。",
        confirmLabel: "知道了",
        cancelLabel: "关闭",
        onConfirm: () => addComposeLog("已阅读许可"),
    });
    sheetButton.element.addEventListener("click", () => {
        sheet.open();
    });

    const toolbar = new Toolbar({
        leading: [infoButton.element, sheetButton.element],
        trailing: [new Badge({text: "组合示例", variant: "default"}).element],
        position: "top",
        ariaLabel: "组合示例工具条",
    });

    wrap.append(toolbar.element, split.element);
    return wrap;
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once: true});
} else {
    boot();
}
