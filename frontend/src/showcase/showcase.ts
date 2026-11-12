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
    Toolbar,
    Tooltip,
    getDensity,
    setDensity,
    showToast,
    themeManager,
} from "../ui";
import type {ThemeDefinition} from "../ui";
import "./showcase.css";

/**
 * The component showcase.
 *
 * Every one of the kit's 30 components is instantiated here with working
 * interaction, not merely described. That distinction matters: a component can
 * type check and still mount nothing, and this kit already shipped one whose
 * constructor forgot to assign its rows.
 *
 * The theme and density switches at the top are part of the demo. They are the
 * cheapest way to see whether the two-layer token system reaches every component,
 * because flipping either one repaints the entire page.
 *
 * Overlays (Menu, Tooltip, Dialog, Popover, Sheet, Toast) are opened from
 * buttons rather than rendered inline: they are position-fixed and would escape
 * the grid.
 */

/* -----------------------------------------------------------------------------
   Small builders
   -------------------------------------------------------------------------- */

/**
 * Build one demo cell: a name, a live specimen, then a live state readout and a
 * static hint underneath.
 *
 * State belongs *inside* the cell rather than in a sibling cell of its own: the
 * readout is one line of text, and giving it a full grid slot left most of the
 * row empty while pushing the real components off screen. The hint stays next
 * to the readout because the two say different things: the readout is the
 * current value, the hint is what to try in order to change it.
 */
function cell(
    name: string,
    demo: Node,
    options: {wide?: boolean; hint?: string; state?: {node: HTMLElement}} = {},
): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = `mac-showcase__cell${options.wide ? " mac-showcase__cell--wide" : ""}`;

    const title = document.createElement("div");
    title.className = "mac-showcase__name";
    title.textContent = name;

    const body = document.createElement("div");
    body.className = "mac-showcase__demo";
    body.appendChild(demo);

    wrap.append(title, body);

    // The readout leads (it is the line that changes) and the hint follows it.
    // Both use the same muted style, so a cell with one looks no different from
    // a cell with both.
    if (options.state) {
        wrap.appendChild(options.state.node);
    }
    if (options.hint) {
        const hint = document.createElement("div");
        hint.className = "mac-showcase__state";
        hint.textContent = options.hint;
        wrap.appendChild(hint);
    }

    return wrap;
}

/** Build a section: a heading with a component count, then a grid of cells. */
function section(title: string, count: number, cells: HTMLElement[]): HTMLElement {
    const wrap = document.createElement("section");
    wrap.className = "mac-showcase__section";

    const heading = document.createElement("div");
    heading.className = "mac-showcase__heading";

    const h = document.createElement("h2");
    h.className = "mac-showcase__title";
    h.textContent = title;

    const c = document.createElement("span");
    c.className = "mac-showcase__count";
    c.textContent = `${count} 个`;

    heading.append(h, c);

    const grid = document.createElement("div");
    grid.className = "mac-showcase__grid";
    grid.append(...cells);

    wrap.append(heading, grid);
    return wrap;
}

/**
 * A state readout the interactive demos update.
 *
 * The opening text is required instead of a "—" placeholder: every demo knows
 * its own initial state (the slider starts at 60, the switch starts on), and a
 * readout that shows nothing until the first interaction cannot be used to
 * confirm what the component's opening state is.
 */
function readout(initial: string): {node: HTMLElement; set: (text: string) => void} {
    const node = document.createElement("div");
    node.className = "mac-showcase__state";
    node.textContent = initial;
    return {
        node,
        set: (text: string) => {
            if (node.textContent === text) return;
            node.textContent = text;
        },
    };
}

/** A plain filled block for the split-view panes. */
function pane(text: string): HTMLElement {
    const node = document.createElement("div");
    node.style.padding = "var(--mac-space-3)";
    node.style.color = "var(--mac-text-secondary)";
    node.style.fontSize = "var(--mac-text-md)";
    node.textContent = text;
    return node;
}

/** A column stack, used where a cell holds more than one element. */
function stack(...children: Node[]): HTMLElement {
    const node = document.createElement("div");
    node.style.display = "flex";
    node.style.flexDirection = "column";
    node.style.gap = "var(--mac-space-2)";
    node.append(...children);
    return node;
}

/** A horizontal row that wraps, used for groups of small controls. */
function row(...children: Node[]): HTMLElement {
    const node = document.createElement("div");
    node.style.display = "flex";
    node.style.flexWrap = "wrap";
    node.style.alignItems = "center";
    node.style.gap = "var(--mac-space-2)";
    node.append(...children);
    return node;
}

/* -----------------------------------------------------------------------------
   Theme and density controls
   -------------------------------------------------------------------------- */

const THEMES = [
    {label: "macOS 深色", value: "macos-dark"},
    {label: "macOS 浅色", value: "macos-light"},
    {label: "高对比度 深色", value: "hc-dark"},
    {label: "高对比度 浅色", value: "hc-light"},
];

const DENSITIES = [
    {label: "紧凑", value: "compact"},
    {label: "舒适", value: "comfortable"},
    {label: "触屏", value: "touch"},
];

/** A labelled control block in the toolbar strip. */
function labelled(label: string, control: Node): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "mac-showcase__control";

    const text = document.createElement("span");
    text.className = "mac-showcase__control-label";
    text.textContent = label;

    wrap.append(text, control);
    return wrap;
}

function buildThemeControls(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "mac-showcase__controls";

    const themeSelect = new Select({
        options: THEMES,
        value: themeManager.active.name,
        ariaLabel: "主题",
        onChange: (value) => themeManager.apply(value),
    });

    const density = getDensity();
    const densityControl = new SegmentedControl({
        options: DENSITIES,
        value: density === "touch" ? "touch" : density === "compact" ? "compact" : "comfortable",
        onChange: (value) => setDensity(value as "compact" | "comfortable" | "touch"),
    });

    // A custom theme demonstrates the override path: three tokens restyle the
    // whole page, which is the payoff of the two-layer split.
    const brand = new Button({
        label: "应用品牌色",
        onClick: () => {
            const theme: ThemeDefinition = {
                name: "showcase-brand",
                appearance: "dark",
                tokens: {
                    accent: "#ff6b35",
                    "bg-window": "#141018",
                    "bg-titlebar": "#1c1622",
                },
            };
            themeManager.register(theme);
            themeManager.apply("showcase-brand");
        },
    });

    const reset = new Button({
        label: "恢复默认",
        onClick: () => themeManager.apply("macos-dark"),
    });

    bar.append(
        labelled("主题", themeSelect.element),
        labelled("密度", densityControl.element),
        labelled("自定义", row(brand.element, reset.element)),
    );
    return bar;
}

/* -----------------------------------------------------------------------------
   Controls — 17 components
   -------------------------------------------------------------------------- */

function buildControlsSection(): HTMLElement {
    const cells: HTMLElement[] = [];

    // --- Button ---------------------------------------------------------------
    const buttonState = readout("点击 0 次");
    let clicks = 0;
    const primary = new Button({
        label: "主要",
        variant: "primary",
        onClick: () => {
            clicks += 1;
            buttonState.set(`点击 ${clicks} 次`);
        },
    });
    cells.push(
        cell(
            "Button",
            row(
                primary.element,
                new Button({label: "默认"}).element,
                new Button({label: "危险", variant: "destructive"}).element,
                new Button({label: "小号", size: "small"}).element,
                new Button({label: "禁用", disabled: true}).element,
            ),
            {state: buttonState},
        ),
    );

    // --- Text inputs ----------------------------------------------------------
    const textState = readout('输入: ""');
    const textField = new TextField({
        placeholder: "输入文字",
        clearable: true,
        onInput: (value) => textState.set(`输入: "${value}"`),
    });
    cells.push(
        cell("TextField", textField.element, {state: textState, hint: "带清除按钮"}),
    );

    const areaState = readout("长度: 0/120");
    const textArea = new TextArea({
        placeholder: "多行文本…",
        rows: 3,
        maxLength: 120,
        onInput: (value) => areaState.set(`长度: ${value.length}/120`),
    });
    cells.push(
        cell("TextArea", textArea.element, {state: areaState, hint: "多行输入，带计数"}),
    );

    const numberState = readout("值: 42");
    const numberField = new NumberField({
        min: 0,
        max: 100,
        step: 1,
        value: 42,
        onChange: (value) => numberState.set(`值: ${value}`),
    });
    cells.push(
        cell("NumberField", numberField.element, {state: numberState, hint: "范围 0–100"}),
    );

    // --- Slider drives the progress bar below it -----------------------------
    const sliderState = readout("值: 60");
    const progress = new Progress({value: 60});
    const slider = new Slider({
        min: 0,
        max: 100,
        value: 60,
        showValue: true,
        onChange: (value) => {
            sliderState.set(`值: ${value}`);
            progress.setValue(value);
        },
    });
    cells.push(
        cell("Slider", slider.element, {hint: "拖动会同步下方进度条"}),
        cell("Progress", progress.element, {hint: "由上方滑块驱动"}),
        cell("Spinner", new Spinner({label: "加载中…"}).element),
    );

    // --- Badge ----------------------------------------------------------------
    const badgeRow = row();
    for (const variant of ["default", "accent", "success", "warning", "danger"] as const) {
        badgeRow.appendChild(new Badge({text: variant, variant}).element);
    }
    cells.push(cell("Badge", badgeRow, {hint: "5 种语义变体"}));

    // --- Switch / Checkbox ----------------------------------------------------
    const switchState = readout("开关: true");
    const switchControl = new Switch({
        checked: true,
        label: "启用",
        onChange: (checked) => switchState.set(`开关: ${checked}`),
    });
    cells.push(cell("Switch", switchControl.element, {state: switchState}));

    const checkState = readout("选中: true");
    const checkbox = new Checkbox({
        checked: true,
        label: "记住我",
        onChange: (checked) => checkState.set(`选中: ${checked}`),
    });
    cells.push(
        cell(
            "Checkbox",
            stack(checkbox.element, new Checkbox({indeterminate: true, label: "半选"}).element),
            {hint: "含半选态"},
        ),
    );

    // --- Selection controls ---------------------------------------------------
    const segmentState = readout("选中: week");
    const segmented = new SegmentedControl({
        options: [
            {label: "日", value: "day"},
            {label: "周", value: "week"},
            {label: "月", value: "month"},
        ],
        value: "week",
        onChange: (value) => segmentState.set(`选中: ${value}`),
    });
    cells.push(
        cell("SegmentedControl", segmented.element, {hint: "方向键可切换"}),
    );

    const selectState = readout("选中: a");
    const select = new Select({
        options: [
            {label: "选项一", value: "a"},
            {label: "选项二", value: "b"},
            {label: "已禁用", value: "c", disabled: true},
        ],
        value: "a",
        ariaLabel: "选项",
        onChange: (value) => selectState.set(`选中: ${value}`),
    });
    cells.push(
        cell("Select", select.element, {hint: "含禁用项"}),
    );

    const comboState = readout("尚未选择");
    const comboBox = new ComboBox({
        options: [
            {label: "Apple", value: "apple"},
            {label: "Banana", value: "banana"},
            {label: "Cherry", value: "cherry"},
        ],
        placeholder: "输入以筛选",
        onChange: (value) => comboState.set(`选中: ${value}`),
    });
    cells.push(
        cell("ComboBox", comboBox.element, {hint: "键盘可导航"}),
    );

    const dateState = readout("日期: 2026-01-01");
    const datePicker = new DatePicker({
        value: "2026-01-01",
        label: "日期",
        onChange: (value) => dateState.set(`日期: ${value}`),
    });
    cells.push(cell("DatePicker", datePicker.element, {state: dateState}));

    // --- Disclosure -----------------------------------------------------------
    const disclosureState = readout("已收起");
    const disclosure = new Disclosure({
        title: "高级选项",
        content: "这里是可折叠的内容区域。",
        meta: "3 项",
        onToggle: (open) => disclosureState.set(open ? "已展开" : "已收起"),
    });
    cells.push(
        cell("Disclosure", disclosure.element, {
            state: disclosureState,
            hint: "点击标题展开或收起",
        }),
    );

    // --- Table (wide) ---------------------------------------------------------
    const tableState = readout("已选: 无");
    const table = new Table({
        columns: [
            {key: "name", title: "名称"},
            {
                key: "status",
                title: "状态",
                // The render callback is the table's main extension point: return
                // any node and it is placed in the cell as live UI.
                render: (value) =>
                    new Badge({
                        text: String(value),
                        variant: value === "运行中" ? "success" : "default",
                    }).element,
            },
            {key: "cpu", title: "CPU", align: "right"},
        ],
        rows: [
            {id: "1", name: "web-01", status: "运行中", cpu: "42%"},
            {id: "2", name: "api-01", status: "运行中", cpu: "18%"},
            {id: "3", name: "db-01", status: "已停止", cpu: "—"},
        ],
        selectable: true,
        onSelectionChange: (keys) => tableState.set(`已选: ${keys.join(", ") || "无"}`),
    });
    const tableWrap = document.createElement("div");
    tableWrap.style.width = "100%";
    tableWrap.append(table.element, tableState.node);
    cells.push(cell("Table", tableWrap, {wide: true, hint: "列渲染回调 + 行选择"}));

    // --- SplitView (wide) -----------------------------------------------------
    const splitView = new SplitView({
        orientation: "horizontal",
        primary: pane("左栏（可拖拽）"),
        secondary: pane("右栏"),
        primarySize: 160,
    });
    const splitWrap = document.createElement("div");
    splitWrap.style.width = "100%";
    splitWrap.appendChild(splitView.element);
    cells.push(cell("SplitView", splitWrap, {wide: true, hint: "拖拽中间分隔条"}));

    return section("控件 Controls", 17, cells);
}

/* -----------------------------------------------------------------------------
   Layout — 6 components
   -------------------------------------------------------------------------- */

function buildLayoutSection(): HTMLElement {
    const cells: HTMLElement[] = [];

    // Toolbar.
    const toolbar = new Toolbar({
        leading: [
            new Button({label: "新建", size: "small"}).element,
            new Button({label: "打开", size: "small"}).element,
        ],
        trailing: [new Button({label: "更多", size: "small"}).element],
    });
    const toolbarSurface = document.createElement("div");
    toolbarSurface.className = "mac-showcase__surface";
    toolbarSurface.appendChild(toolbar.element);
    cells.push(cell("Toolbar", toolbarSurface, {wide: true, hint: "左中右三槽位"}));

    // TabView.
    const tabState = readout("当前: general");
    const tabView = new TabView({
        tabs: [
            {id: "general", label: "通用"},
            {id: "advanced", label: "高级"},
            {id: "about", label: "关于"},
        ],
        selected: "general",
        onSelect: (id) => tabState.set(`当前: ${id}`),
    });
    for (const [id, text] of [
        ["general", "通用设置面板"],
        ["advanced", "高级设置面板"],
        ["about", "关于本应用"],
    ] as const) {
        tabView.addPanel(id, pane(text));
    }
    const tabSurface = document.createElement("div");
    tabSurface.className = "mac-showcase__surface";
    tabSurface.appendChild(tabView.element);
    cells.push(cell("TabView", tabSurface, {wide: true, state: tabState, hint: "方向键可切换标签"}));

    // Sidebar.
    const sidebar = new Sidebar({
        groups: [
            {
                heading: "资源库",
                items: [
                    {id: "all", label: "全部项目", count: 12},
                    {id: "fav", label: "收藏", count: 3},
                ],
            },
        ],
        selected: "all",
    });
    const sidebarFrame = document.createElement("div");
    sidebarFrame.className = "mac-showcase__surface";
    sidebarFrame.style.justifyContent = "flex-start";
    sidebarFrame.appendChild(sidebar.element);
    cells.push(cell("Sidebar", sidebarFrame, {wide: true, hint: "源列表，含计数"}));

    // StatusBar.
    const statusBar = new StatusBar({text: "已连接", state: "ok", trailing: "14:08"});
    const statusSurface = document.createElement("div");
    statusSurface.className = "mac-showcase__surface";
    statusSurface.style.justifyContent = "flex-end";
    statusSurface.appendChild(statusBar.element);
    cells.push(cell("StatusBar", statusSurface, {wide: true}));

    // TitleBar + TrafficLights.
    const titleBar = new TitleBar({
        title: "示例窗口",
        trailing: [new Button({label: "操作", size: "small"}).element],
    });
    const titleSurface = document.createElement("div");
    titleSurface.className = "mac-showcase__surface";
    titleSurface.appendChild(titleBar.element);
    cells.push(
        cell("TitleBar + TrafficLights", titleSurface, {
            wide: true,
            hint: "演示用，不控制真实窗口",
        }),
    );

    return section("布局 Layout", 6, cells);
}

/* -----------------------------------------------------------------------------
   Overlays — 6 components
   -------------------------------------------------------------------------- */

function buildOverlaysSection(): HTMLElement {
    const cells: HTMLElement[] = [];

    // Menu — anchored to the button that opens it.
    const menuButton = new Button({label: "打开菜单"});
    const menuState = readout("尚未选择");
    const menu = new Menu({
        items: [
            {label: "新建", value: "new", shortcut: "⌘N"},
            {label: "打开", value: "open", shortcut: "⌘O"},
            {label: "", value: "", separator: true},
            {label: "显示边栏", value: "sidebar", checked: true},
            {label: "禁用项", value: "disabled", disabled: true},
        ],
        onSelect: (value) => menuState.set(`已选择: ${value}`),
    });
    menuButton.element.addEventListener("click", () => menu.open(menuButton.element));
    cells.push(
        cell("Menu", stack(menuButton.element, menuState.node), {
            hint: "方向键 + Enter + Esc",
        }),
    );

    // Tooltip — attaches to the button, opens on hover or focus.
    const tooltipButton = new Button({label: "悬停查看提示"});
    const tooltip = new Tooltip({content: "这是一个提示", placement: "top"});
    tooltip.attachTo(tooltipButton.element);
    cells.push(cell("Tooltip", tooltipButton.element, {hint: "悬停或聚焦触发"}));

    // Dialog.
    const dialogState = readout("尚未打开");
    const dialogButton = new Button({label: "打开对话框"});
    dialogButton.element.addEventListener("click", () => {
        const dialog = new Dialog({
            title: "确认操作",
            body: "这是一个模态对话框，键盘焦点被限制在内部。",
            confirmLabel: "确认",
            cancelLabel: "取消",
            onConfirm: () => dialogState.set("已确认"),
            onCancel: () => dialogState.set("已取消"),
        });
        dialog.open();
    });
    cells.push(
        cell("Dialog", stack(dialogButton.element, dialogState.node), {
            hint: "焦点陷阱 + Esc 关闭",
        }),
    );

    // Popover.
    const popoverButton = new Button({label: "打开浮层"});
    const popover = new Popover({
        content: stack(
            (() => {
                const label = document.createElement("div");
                label.textContent = "浮层可以放任意内容";
                label.style.fontSize = "var(--mac-text-md)";
                label.style.color = "var(--mac-text)";
                return label;
            })(),
            new Button({label: "浮层内按钮", size: "small"}).element,
        ),
    });
    popoverButton.element.addEventListener("click", () => {
        if (popover.isOpen) {
            popover.close();
        } else {
            popover.open(popoverButton.element);
        }
    });
    cells.push(cell("Popover", popoverButton.element, {hint: "点击外部关闭"}));

    // Sheet.
    const sheetState = readout("尚未打开");
    const sheetButton = new Button({label: "打开面板"});
    sheetButton.element.addEventListener("click", () => {
        const sheet = new Sheet({
            title: "面板标题",
            body: "这是一个从窗口顶部滑入的面板（sheet）。",
            onConfirm: () => sheetState.set("已确认"),
            onCancel: () => sheetState.set("已取消"),
        });
        sheet.open();
    });
    cells.push(
        cell("Sheet", stack(sheetButton.element, sheetState.node), {hint: "从顶部滑入"}),
    );

    // Toast.
    const toastButton = new Button({label: "显示提示条"});
    toastButton.element.addEventListener("click", () => {
        showToast("操作已完成", {variant: "success", duration: 2500});
    });
    cells.push(cell("Toast", toastButton.element, {hint: "右上角，自动消失"}));

    return section("浮层 Overlays", 6, cells);
}

/* -----------------------------------------------------------------------------
   Mobile — 1 component
   -------------------------------------------------------------------------- */

function buildMobileSection(): HTMLElement {
    // The mobile shell fills its viewport by design, so it is shown inside a
    // bounded frame rather than at document size.
    const frame = document.createElement("div");
    frame.style.position = "relative";
    frame.style.width = "100%";
    frame.style.height = "calc(var(--mac-control-height) * 10)";
    frame.style.border = "var(--mac-hairline) solid var(--mac-border)";
    frame.style.borderRadius = "var(--mac-radius-l)";
    frame.style.overflow = "hidden";

    const shell = new MobileShell({
        title: "移动端示例",
        tabs: [
            {id: "home", label: "首页", icon: "M3 3 h7.5 v7.5 h-7.5 Z M13.5 3 h7.5 v7.5 h-7.5 Z"},
            {id: "search", label: "搜索", icon: "M11 18 a7 7 0 1 0 0 -14 a7 7 0 0 0 0 14 Z"},
            {id: "me", label: "我的", icon: "M12 15 a3 3 0 1 0 0 -6 a3 3 0 0 0 0 6 Z"},
        ],
        selected: "home",
    });
    shell.content.appendChild(pane("移动端外壳包含安全区处理与底部标签栏。"));
    frame.appendChild(shell.element);

    return section("移动端 Mobile", 1, [
        cell("MobileShell", frame, {wide: true, hint: "安全区 + 底部标签栏"}),
    ]);
}

/* -----------------------------------------------------------------------------
   Entry point
   -------------------------------------------------------------------------- */

/**
 * Build the whole showcase and return its root element.
 *
 * The app mounts this as a session pane, so it is a plain element rather than a
 * component: it has no behaviour of its own beyond building the demos.
 */
export function buildShowcase(): HTMLElement {
    const root = document.createElement("div");
    root.className = "mac-showcase";
    root.append(
        buildThemeControls(),
        buildControlsSection(),
        buildLayoutSection(),
        buildOverlaysSection(),
        buildMobileSection(),
    );
    return root;
}


