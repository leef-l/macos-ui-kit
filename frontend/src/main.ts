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
    MobileShell,
    SegmentedControl,
    Sidebar,
    StatusBar,
    Switch,
    TextField,
    TitleBar,
    Toast,
    looksLikeMobile,
} from "./ui";
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
                heading("活动", "窗口事件与后端消息的时间线。"),
                createLog("activity"),
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
                heading("组件", "全部 30 个组件，可直接交互；顶部可切换主题与密度。"),
                buildShowcase(),
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
    return wrap;
}

/* -----------------------------------------------------------------------------
   Settings list (uses Switch, SegmentedControl, Badge)
   -------------------------------------------------------------------------- */

let sidebarSwitch: Switch | null = null;
let appearanceSegmented: SegmentedControl | null = null;

function settingsList(): HTMLElement {
    const list = document.createElement("div");
    list.className = "settings";

    const row = (name: string, hint: string, control: HTMLElement): HTMLElement => {
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
    };

    sidebarSwitch = new Switch({
        checked: true,
        label: "显示侧边栏",
        onChange: (checked) => setSidebarVisible(checked),
    });

    appearanceSegmented = new SegmentedControl({
        options: [
            {label: "跟随系统", value: "system"},
            {label: "浅色", value: "light"},
            {label: "深色", value: "dark"},
        ],
        value: "system",
        onChange: (value) => applyAppearance(value as AppearanceMode),
    });

    const versionBadge = new Badge({text: "v3.1.0", variant: "accent"});

    list.append(
        row("侧边栏", "显示或隐藏左侧导航。", sidebarSwitch.element),
        row("外观", "浅色 / 深色 / 跟随系统。", appearanceSegmented.element),
        row("版本", "Wails v3 · Go + TypeScript", versionBadge.element),
    );
    return list;
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

/** Append an entry, keeping the list bounded so it cannot grow forever. */
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

/* -----------------------------------------------------------------------------
   Greet action
   -------------------------------------------------------------------------- */

let toast: Toast | null = null;

async function sendGreeting(): Promise<void> {
    const name = nameField?.getValue().trim() || "anonymous";

    greetButton?.setDisabled(true);
    try {
        // Binding calls return promises; await so the toast reflects the result.
        const greeting = await GreetService.Greet(name);

        toast ??= new Toast({variant: "success"});
        toast.show(greeting);

        appendLog("log", greeting, "Go");
        appendLog("activity", `调用 GreetService.Greet("${name}")`, "调用");
        document.getElementById("greeting-empty")?.classList.add("is-hidden");
    } catch (error) {
        // A rejected promise carries the Go error message.
        const message = error instanceof Error ? error.message : String(error);
        appendLog("activity", `Greet 失败：${message}`, "错误");

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

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once: true});
} else {
    boot();
}
