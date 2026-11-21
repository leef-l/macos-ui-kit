import {
    ActionSheet,
    Alert,
    Avatar,
    Badge,
    Breadcrumb,
    Button,
    Calendar,
    Card,
    Checkbox,
    ColorWell,
    ComboBox,
    CommandPalette,
    ContextMenu,
    DatePicker,
    Dialog,
    Disclosure,
    Divider,
    EmptyState,
    Form,
    InlineNotice,
    Kbd,
    LevelIndicator,
    List,
    Menu,
    MobileShell,
    NumberField,
    Pagination,
    Popover,
    Progress,
    ProgressRing,
    RadioGroup,
    RangeSlider,
    Rating,
    SearchField,
    SegmentedControl,
    Select,
    Sheet,
    Sidebar,
    Skeleton,
    Slider,
    Spinner,
    SplitButton,
    SplitView,
    StatusBar,
    Stepper,
    Switch,
    TabBar,
    Table,
    TabView,
    TagInput,
    TextArea,
    TextField,
    TimePicker,
    TitleBar,
    Toast,
    Toolbar,
    Tooltip,
    TreeView,
    getDensity,
    setDensity,
    showToast,
    themeManager,
} from "@leef-l/macos-ui-kit";
import type {ThemeDefinition} from "@leef-l/macos-ui-kit";
import "./showcase.css";

/**
 * Glyphs used by the demos that take raw SVG path data.
 *
 * All of them are drawn on the kit's 24×24 viewBox as open strokes, matching the
 * paths inside the components themselves, so a demo icon and a built-in icon
 * share a line weight instead of one looking filled and the other outlined.
 */
const INBOX_ICON = "M4 13 L7 5 H17 L20 13 V20 H4 Z M4 13 H9 L10 15 H14 L15 13 H20";
const STAR_ICON = "M12 3 L14.6 9 L21 9.6 L16.2 13.9 L17.6 20.4 L12 17 L6.4 20.4 L7.8 13.9 L3 9.6 L9.4 9 Z";
const DRAFT_ICON = "M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19";
const ARCHIVE_ICON = "M3 7 H21 V11 H3 Z M5 11 V20 H19 V11 M10 15 H14";
const TRASH_ICON = "M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 21 H17 L18 7 M10 11 V17 M14 11 V17";
const PLAY_ICON = "M8 5 L19 12 L8 19 Z";
const FOLDER_ICON = "M3 7 H10 L12 9.5 H21 V19 H3 Z";

/**
 * The component showcase.
 *
 * Every one of the kit's 59 components is instantiated here with working
 * interaction, not merely described. That distinction matters: a component can
 * type check and still mount nothing, and this kit already shipped one whose
 * constructor forgot to assign its rows.
 *
 * The theme and density switches at the top are part of the demo. They are the
 * cheapest way to see whether the two-layer token system reaches every component,
 * because flipping either one repaints the entire page.
 *
 * Overlays (Menu, Tooltip, Dialog, Popover, Sheet, Toast, Alert, ContextMenu)
 * are opened from buttons or gestures rather than rendered inline: they are
 * position-fixed and would escape the grid.
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
   Controls — 44 components
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

    // Password field: the reveal toggle is part of the control, not a separate
    // button a caller has to wire up.
    const passwordState = readout("已隐藏");
    const passwordField = new TextField({
        type: "password",
        placeholder: "密码",
        value: "correct horse",
        onInput: () => passwordState.set(passwordField.isRevealed ? "已显示" : "已隐藏"),
    });
    const passwordCell = cell("TextField · password", passwordField.element, {
        state: passwordState,
        hint: "点眼睛图标切换显示",
    });
    // The toggle is inside the control, so the readout needs to follow its click
    // rather than the input event (which does not fire when only the type flips).
    passwordField.element
        .querySelector(".mac-textfield__reveal")
        ?.addEventListener("click", () => {
            passwordState.set(passwordField.isRevealed ? "已显示" : "已隐藏");
        });
    cells.push(passwordCell);

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
        cell("Slider", slider.element, {state: sliderState, hint: "拖动会同步下方进度条"}),
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
            {state: checkState, hint: "含半选态"},
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
        cell("SegmentedControl", segmented.element, {
            state: segmentState,
            hint: "方向键可切换",
        }),
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
        cell("Select", select.element, {state: selectState, hint: "含禁用项"}),
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
        cell("ComboBox", comboBox.element, {state: comboState, hint: "键盘可导航"}),
    );

    const dateState = readout("日期: 2026-01-01");
    const datePicker = new DatePicker({
        value: "2026-01-01",
        label: "日期",
        onChange: (value) => dateState.set(`日期: ${value}`),
    });
    cells.push(cell("DatePicker", datePicker.element, {state: dateState}));

    // --- RadioGroup -----------------------------------------------------------
    const radioState = readout("选中: builtin");
    const radioGroup = new RadioGroup({
        value: "builtin",
        options: [
            {label: "内置浏览器", value: "builtin", hint: "随应用分发，无需额外安装"},
            {label: "本机 Chrome", value: "chrome", hint: "需要开启远程调试端口"},
            {label: "自建服务", value: "remote", disabled: true, hint: "未配置"},
        ],
        onChange: (value) => radioState.set(`选中: ${value}`),
    });
    cells.push(
        cell("RadioGroup", radioGroup.element, {
            state: radioState,
            hint: "方向键在组内切换",
        }),
    );

    // --- SearchField ----------------------------------------------------------
    // The readout shows the debounced value: that is the one a caller wires a
    // filter to, and the delay is the whole point of the control.
    const searchState = readout("搜索: （空）");
    const searchField = new SearchField({
        placeholder: "搜索环境…",
        onInput: () => searchState.set("正在输入…"),
        onChange: (value) => searchState.set(`搜索: "${value}"`),
    });
    cells.push(
        cell("SearchField", searchField.element, {
            state: searchState,
            hint: "输入停顿后触发；Esc 清空",
        }),
    );

    // --- Divider --------------------------------------------------------------
    // The demo container is a row flex, so the stack needs an explicit width;
    // otherwise it shrink-wraps and the rules have nothing to span.
    const dividerDemo = stack(
        (() => {
            const a = document.createElement("div");
            a.textContent = "上方内容";
            a.style.fontSize = "var(--mac-text-md)";
            return a;
        })(),
        new Divider().element,
        (() => {
            const b = document.createElement("div");
            b.textContent = "下方内容";
            b.style.fontSize = "var(--mac-text-md)";
            return b;
        })(),
        new Divider({label: "或"}).element,
        row(
            new Button({label: "左", size: "small"}).element,
            new Divider({orientation: "vertical"}).element,
            new Button({label: "右", size: "small"}).element,
        ),
    );
    dividerDemo.style.width = "100%";
    cells.push(
        cell("Divider", dividerDemo, {hint: "横/竖/带文字三种形态"}),
    );

    // --- Kbd ------------------------------------------------------------------
    const kbdDemo = row(
        new Kbd({keys: "cmd+s"}).element,
        new Kbd({keys: "cmd+shift+p"}).element,
        new Kbd({keys: ["⌃", "⌥", "⌫"]}).element,
        new Kbd({keys: "esc", size: "s"}).element,
        new Kbd({keys: "⌘K", variant: "plain"}).element,
    );
    cells.push(cell("Kbd", kbdDemo, {hint: "长名称自动转成 ⌘ ⇧ ⌥ 字形"}));

    // --- Pagination -----------------------------------------------------------
    // Sits in a row-flex demo, so it needs the width spelled out; otherwise it
    // shrink-wraps and the summary/buttons stop being spread apart.
    const pageState = readout("第 1 页 / 共 12 页");
    const pagination = new Pagination({
        page: 1,
        pageCount: 12,
        total: 248,
        showEnds: true,
        onChange: (page) => pageState.set(`第 ${page} 页 / 共 12 页`),
    });
    pagination.element.style.width = "100%";
    cells.push(
        cell("Pagination", pagination.element, {
            wide: true,
            state: pageState,
            hint: "数字超出范围时中间折叠成 …",
        }),
    );

    // --- Breadcrumb -----------------------------------------------------------
    const crumbState = readout("当前位置: 组件");
    const breadcrumb = new Breadcrumb({
        maxItems: 4,
        items: [
            {label: "用户", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0", onClick: () => crumbState.set("跳转到: 用户")},
            {label: "文档", onClick: () => crumbState.set("跳转到: 文档")},
            {label: "项目", onClick: () => crumbState.set("跳转到: 项目")},
            {label: "macos-ui-kit", onClick: () => crumbState.set("跳转到: macos-ui-kit")},
            {label: "组件"},
        ],
    });
    cells.push(
        cell("Breadcrumb", breadcrumb.element, {
            state: crumbState,
            hint: "末项不可点；超长自动折叠",
        }),
    );

    // --- Avatar ---------------------------------------------------------------
    const avatarDemo = row(
        new Avatar({name: "李小明", size: "s"}).element,
        new Avatar({name: "Ada Lovelace", status: "online"}).element,
        new Avatar({name: "周", status: "busy"}).element,
        new Avatar({name: "Yuki Tanaka", size: "l", status: "away"}).element,
        new Avatar({name: "leef", size: "xl", shape: "square", status: "offline"}).element,
    );
    cells.push(
        cell("Avatar", avatarDemo, {hint: "颜色由名字哈希决定，同名恒同色"}),
    );

    // --- ProgressRing ---------------------------------------------------------
    const ringDemo = row(
        new ProgressRing({value: 42, size: "m", showValue: true}).element,
        new ProgressRing({value: 78, size: "l", thickness: 5, showValue: true}).element,
        new ProgressRing({value: 100, size: "s", showValue: true}).element,
        new ProgressRing({indeterminate: true, size: "m"}).element,
        new ProgressRing({indeterminate: true, size: "s"}).element,
    );
    cells.push(
        cell("ProgressRing", ringDemo, {hint: "pathLength=100，虚线长度即百分比"}),
    );

    // --- List -----------------------------------------------------------------
    const listState = readout("已选: inbox");
    const listDemo = new List({
        ariaLabel: "邮箱文件夹",
        items: [
            {value: "inbox", label: "收件箱", section: "邮箱", icon: INBOX_ICON, badge: "12"},
            {value: "starred", label: "已标星", icon: STAR_ICON},
            {value: "drafts", label: "草稿", icon: DRAFT_ICON, badge: "3"},
            {value: "archive", label: "归档", section: "其他", icon: ARCHIVE_ICON, disabled: true},
            {value: "trash", label: "废纸篓", icon: TRASH_ICON},
        ],
        value: "inbox",
        reorderable: true,
        onSelect: (value) => {
            listState.set(`已选: ${value}`);
            listDemo.element.dataset.selected = String(value);
        },
        onReorder: (values) => {
            listState.set(`顺序: ${values.join(" → ")}`);
            listDemo.element.dataset.order = values.join(",");
        },
    });
    listDemo.element.style.width = "100%";
    cells.push(
        cell("List", listDemo.element, {
            hint: "拖行改顺序（跨分组会并入该组）；Alt+↑↓ 键盘移动；↑↓ 只走焦点",
            state: listState,
        }),
    );

    // --- Stepper --------------------------------------------------------------
    const stepperValue = readout("数量: 3");
    const stepper = new Stepper({
        value: 3,
        min: 1,
        max: 20,
        ariaLabel: "数量",
        onChange: (value) => {
            stepperValue.set(`数量: ${value}`);
            stepper.element.dataset.value = String(value);
        },
    });
    const stepperDemo = row(
        stepper.element,
        new Stepper({value: 0, min: 0, max: 10, step: 0.5, ariaLabel: "精度"}).element,
        new Stepper({value: 5, min: 1, max: 5, wrapping: true, ariaLabel: "循环"}).element,
    );
    cells.push(
        cell("Stepper", stepperDemo, {
            hint: "到达边界时该段自动禁用；⌘ 拖动不适用，PageUp 走 10 步",
            state: stepperValue,
        }),
    );

    // --- SplitButton ----------------------------------------------------------
    const splitState = readout("未操作");
    const splitButton = new SplitButton({
        label: "构建",
        variant: "primary",
        icon: PLAY_ICON,
        items: [
            {value: "run", label: "运行", shortcut: "⌘R"},
            {value: "test", label: "测试", shortcut: "⌘T"},
            {value: "separator", label: "", separator: true},
            {value: "release", label: "发布…"},
        ],
        onAction: () => splitState.set("已构建"),
        onSelect: (value) => splitState.set(`菜单: ${value}`),
    });
    const splitDemo = row(
        splitButton.element,
        new SplitButton({
            label: "更多操作",
            items: [
                {value: "copy", label: "复制"},
                {value: "move", label: "移动…"},
            ],
            onAction: () => splitState.set("已复制"),
            onSelect: (value) => splitState.set(`菜单: ${value}`),
        }).element,
    );
    cells.push(
        cell("SplitButton", splitDemo, {
            hint: "左半执行主操作，右半开菜单",
            state: splitState,
        }),
    );

    // --- TagInput -------------------------------------------------------------
    const tagState = readout("标签: 前端, macOS");
    const tagInput = new TagInput({
        value: ["前端", "macOS"],
        placeholder: "添加标签…",
        label: "标签",
        onChange: (tags) => {
            tagState.set(`标签: ${tags.join(", ") || "（空）"}`);
            tagInput.element.dataset.tags = tags.join(",");
        },
    });
    tagInput.element.style.width = "100%";
    cells.push(
        cell("TagInput", tagInput.element, {
            hint: "回车或逗号提交，退格删除末尾标签",
            state: tagState,
        }),
    );

    // --- RangeSlider ----------------------------------------------------------
    const rangeState = readout("区间: 20 – 80");
    const rangeSlider = new RangeSlider({
        min: 0,
        max: 100,
        value: [20, 80],
        step: 5,
        showValue: true,
        onChange: (value) => {
            rangeState.set(`区间: ${value[0]} – ${value[1]}`);
            rangeSlider.element.dataset.range = value.join("-");
        },
    });
    cells.push(
        cell("RangeSlider", rangeSlider.element, {
            hint: "两个滑块都可 Tab 聚焦，互不穿越",
            state: rangeState,
            wide: true,
        }),
    );

    // --- Calendar -------------------------------------------------------------
    const calendarState = readout("已选: 2026-02-14");
    const calendar = new Calendar({
        value: "2026-02-14",
        month: "2026-02",
        onSelect: (value) => {
            calendarState.set(`已选: ${value}`);
            calendar.element.dataset.selected = value;
        },
    });
    cells.push(
        cell("Calendar", calendar.element, {
            hint: "方向键换日，PageUp/PageDown 换月",
            state: calendarState,
        }),
    );

    // --- TreeView -------------------------------------------------------------
    const treeState = readout("已选: src");
    const treeView = new TreeView({
        ariaLabel: "项目文件",
        indent: 14,
        value: "src",
        nodes: [
            {
                value: "src",
                label: "src",
                icon: FOLDER_ICON,
                expanded: true,
                children: [
                    {
                        value: "controls",
                        label: "controls",
                        icon: FOLDER_ICON,
                        expanded: true,
                        children: [
                            {value: "table.ts", label: "table.ts", detail: "37 KB"},
                            {value: "treeview.ts", label: "treeview.ts", detail: "21 KB"},
                        ],
                    },
                    {value: "index.ts", label: "index.ts", detail: "6.1 KB", badge: "48"},
                    {value: "dom.ts", label: "dom.ts", detail: "6.1 KB"},
                ],
            },
            {value: "package.json", label: "package.json", detail: "1.7 KB"},
            {value: "dist", label: "dist", icon: FOLDER_ICON, disabled: true, detail: "构建产物"},
        ],
        onSelect: (value) => {
            treeState.set(`已选: ${value}`);
            treeView.element.dataset.selected = value;
        },
        onToggle: (value, expanded) => {
            treeView.element.dataset.toggle = `${value}:${expanded}`;
        },
    });
    cells.push(
        cell("TreeView", treeView.element, {
            hint: "↑↓ 走可见行；→ 展开或进入子级，← 收起或回到父级",
            state: treeState,
            wide: true,
        }),
    );

    // --- Skeleton -------------------------------------------------------------
    const skeletonDemo = row(
        new Skeleton({variant: "circle", width: 40, height: 40}).element,
        new Skeleton({variant: "text", lines: 3, width: 220}).element,
        new Skeleton({variant: "rect", width: 140, height: 56}).element,
    );
    cells.push(
        cell("Skeleton", skeletonDemo, {
            hint: "灰条只占版式；shimmer 只动 background-position，不触发布局",
            wide: true,
        }),
    );

    // --- CommandPalette -------------------------------------------------------
    const paletteState = readout("未执行命令");
    const palette = new CommandPalette({
        items: [
            {value: "new-file", label: "新建文件", group: "文件", shortcut: "⌘N"},
            {value: "open-folder", label: "打开文件夹…", group: "文件", shortcut: "⌘O"},
            {value: "export-pdf", label: "导出为 PDF", group: "导出"},
            {value: "export-all", label: "导出全部", group: "导出"},
            {value: "toggle-appearance", label: "切换深色外观", group: "视图", shortcut: "⌘⇧D"},
            {value: "reload", label: "重新载入窗口", group: "视图", shortcut: "⌘R"},
        ],
        onSelect: (value) => paletteState.set(`执行: ${value}`),
    });
    const paletteButton = new Button({
        label: "打开命令面板",
        onClick: () => palette.open(),
    });
    cells.push(
        cell("CommandPalette", stack(paletteButton.element, paletteState.node), {
            hint: "⌘K / Ctrl+K 随时唤出；子序列匹配，首行默认高亮",
            wide: true,
        }),
    );

    // --- InlineNotice ---------------------------------------------------------
    const noticeState = readout("未操作");
    const infoNotice = new InlineNotice({
        title: "有新版本可用",
        message: "当前 0.4.4，最新 0.5.0。更新不会改变现有布局。",
        tone: "info",
        dismissible: true,
        action: {label: "查看", onAction: () => noticeState.set("打开更新说明")},
        onDismiss: () => noticeState.set("已关闭通知"),
    });
    const dangerNotice = new InlineNotice({
        message: "构建失败：找不到 src/index.ts 的 default export。",
        tone: "danger",
    });
    const noticeDemo = stack(infoNotice.element, dangerNotice.element);
    noticeDemo.style.width = "100%";
    cells.push(
        cell("InlineNotice", noticeDemo, {
            hint: "danger 用 role=alert，其余 role=status；色调同时由图标重复",
            state: noticeState,
            wide: true,
        }),
    );

    // --- Rating ---------------------------------------------------------------
    const ratingState = readout("评分: 3.5");
    const rating = new Rating({
        value: 3.5,
        allowHalf: true,
        label: "产品评分",
        onChange: (value) => {
            ratingState.set(`评分: ${value}`);
            rating.element.dataset.value = String(value);
        },
    });
    const ratingAverage = new Rating({
        value: 4.2,
        readOnly: true,
        size: "small",
        label: "平均分",
    });
    cells.push(
        cell("Rating", row(rating.element, ratingAverage.element), {
            hint: "小数如实显示（不是整星取整）；← → 按整星走，Home/End 归零/满值",
            state: ratingState,
        }),
    );

    // --- Card -----------------------------------------------------------------
    // A row of the kind a settings pane is made of: a label and its control. The
    // grouped card draws the hairline between these without touching their DOM.
    const settingRow = (text: string, control: Node): HTMLElement => {
        const line = document.createElement("div");
        line.style.display = "flex";
        line.style.alignItems = "center";
        line.style.justifyContent = "space-between";
        line.style.gap = "12px";
        line.style.padding = "7px 0";
        const label = document.createElement("span");
        label.textContent = text;
        line.append(label, control);
        return line;
    };
    const card = new Card({
        title: "同步设置",
        subtitle: "更改会立即生效",
        trailing: new Badge({text: "已开启", variant: "success"}).element,
        variant: "grouped",
        body: [
            settingRow("自动同步", new Switch({checked: true}).element),
            settingRow("同步剪贴板", new Switch({checked: false}).element),
            settingRow("保留历史", (() => {
                // A stepper is a bare chevron pair: it draws no value of its own, so
                // the number it edits has to sit beside it (see Stepper's docstring).
                const readout = document.createElement("span");
                readout.style.fontVariantNumeric = "tabular-nums";
                readout.style.color = "var(--mac-text-secondary)";
                const stepper = new Stepper({
                    value: 7,
                    min: 1,
                    max: 30,
                    ariaLabel: "保留历史天数",
                    onChange: (value) => {
                        readout.textContent = `${value} 天`;
                    },
                });
                readout.textContent = `${stepper.value} 天`;
                const group = document.createElement("span");
                group.style.display = "inline-flex";
                group.style.alignItems = "center";
                group.style.gap = "8px";
                group.append(readout, stepper.element);
                return group;
            })()),
        ],
        footer: [new Button({label: "恢复默认"}).element],
    });
    card.element.style.maxWidth = "380px";
    cells.push(
        cell("Card", card.element, {
            hint: "grouped 变体就是设置面板的分组框，子项之间是内缩分隔线",
            wide: true,
        }),
    );

    // --- ColorWell ------------------------------------------------------------
    const colorState = readout("颜色: #0a84ff");
    const colorWell = new ColorWell({
        value: "#0a84ff",
        label: "强调色",
        onChange: (value) => {
            colorState.set(`颜色: ${value}`);
            colorWell.element.dataset.value = value;
        },
    });
    cells.push(
        cell("ColorWell", row(colorWell.element, colorState.node), {
            hint: "点击开系统取色面板；change 才回调，拖动中不刷",
            state: colorState,
        }),
    );

    // --- LevelIndicator -------------------------------------------------------
    const levelMeter = new LevelIndicator({value: 0.62, segments: 20, label: "输入电平"});
    const levelTall = new LevelIndicator({
        value: 0.94,
        segments: 16,
        tone: "accent",
        orientation: "vertical",
        label: "负载",
    });
    const levelRow = row(levelMeter.element, levelTall.element);
    levelRow.style.alignItems = "center";
    levelRow.style.width = "100%";
    // A horizontal meter fills whatever it is given, so the demo gives it a width;
    // without one it would be zero wide inside the shrink-wrapping row.
    levelMeter.element.style.width = "260px";
    levelMeter.element.style.flex = "0 0 auto";
    cells.push(
        cell("LevelIndicator", levelRow, {
            hint: "按位置分档（绿→黄→红），不是按填充长度分档",
            wide: true,
        }),
    );

    // --- TimePicker -----------------------------------------------------------
    const timeState = readout("时间: 09:30");
    const timePicker = new TimePicker({
        value: "09:30",
        label: "开始时间",
        onChange: (value) => timeState.set(`时间: ${value}`),
    });
    timePicker.element.style.maxWidth = "200px";
    cells.push(
        cell("TimePicker", stack(timePicker.element, timeState.node), {
            hint: "原生 time 控件加外壳：各段可键盘编辑，弹层由系统给",
            state: timeState,
        }),
    );

    // --- TabBar ---------------------------------------------------------------
    const tabState = readout("当前: inbox");
    const tabBar = new TabBar({
        value: "inbox",
        ariaLabel: "示例标签栏",
        items: [
            {value: "inbox", label: "收件箱", icon: INBOX_ICON, badge: "3"},
            {value: "starred", label: "星标", icon: STAR_ICON},
            {value: "drafts", label: "草稿", icon: DRAFT_ICON},
            {value: "archive", label: "归档", icon: ARCHIVE_ICON},
        ],
        onChange: (value) => tabState.set(`当前: ${value}`),
    });
    const tabFrame = stack(tabBar.element, tabState.node);
    tabFrame.style.width = "360px";
    tabFrame.style.borderRadius = "var(--mac-radius-l)";
    tabFrame.style.overflow = "hidden";
    cells.push(
        cell("TabBar", tabFrame, {
            hint: "一个 tab 停靠点，← → 走项；aria-selected 承载选中态",
            state: tabState,
        }),
    );

    // --- ActionSheet ----------------------------------------------------------
    const sheetState = readout("未选择");
    const actionSheet = new ActionSheet({
        title: "删除这个容器？",
        message: "容器和它的卷会一起删除，此操作无法撤销。",
        actions: [
            {value: "stop", label: "先停止"},
            {value: "delete", label: "删除", tone: "destructive"},
            {value: "cancel", label: "取消", tone: "cancel"},
        ],
        onSelect: (value) => sheetState.set(`已选择: ${value}`),
    });
    const sheetButton = new Button({
        label: "弹出操作表",
        onClick: () => actionSheet.open(),
    });
    cells.push(
        cell("ActionSheet", stack(sheetButton.element, sheetState.node), {
            hint: "取消独立成组：拇指够「删除」时不会误触它",
            wide: true,
            state: sheetState,
        }),
    );

    // --- EmptyState -----------------------------------------------------------
    const emptyState = new EmptyState({
        title: "没有匹配的项目",
        message: "试试放宽筛选条件，或新建一个项目开始。",
        action: {
            label: "新建项目",
            variant: "primary",
            onClick: () => emptyState.element.setAttribute("data-clicked", "1"),
        },
    });
    // The demo container is a row flex, so a block-level placeholder has to be
    // told to span it — otherwise it shrink-wraps its own text.
    emptyState.element.style.width = "100%";
    cells.push(
        cell("EmptyState", emptyState.element, {
            wide: true,
            hint: "图标走第三层级墨色，只有按钮用强调色",
        }),
    );


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
    const tableSortState = readout("排序: 原序");
    const tableSizeState = readout("列宽: 未调整");
    const table = new Table({
        // Sorting is opt-in per column: a header that reorders the data on click
        // has to announce itself, or a reader triggers it while selecting text.
        columns: [
            {key: "name", title: "名称", sortable: true},
            {
                key: "status",
                title: "状态",
                sortable: true,
                // The render callback is the table's main extension point: return
                // any node and it is placed in the cell as live UI.
                render: (value) =>
                    new Badge({
                        text: String(value),
                        variant: value === "运行中" ? "success" : "default",
                    }).element,
            },
            {
                key: "cpu",
                title: "CPU",
                align: "right",
                sortable: true,
                // The cell reads "42%"; the order has to come from the number.
                sortValue: (row) => {
                    const percent = Number.parseFloat(String(row.cpu));
                    return Number.isFinite(percent) ? percent : null;
                },
            },
            {key: "region", title: "区域", width: 120, sortable: true},
            {key: "uptime", title: "运行时长", width: 110},
            {key: "memory", title: "内存", width: 100},
            {key: "image", title: "镜像", width: 260},
            {
                // Action column: pinned to the right so it stays reachable while
                // the middle columns scroll.
                key: "",
                title: "",
                width: 96,
                align: "right",
                pinned: "right",
                actions: (row) => [
                    {
                        label: row.status === "运行中" ? "停止" : "启动",
                        onClick: (r) => showToast(`${r.name} → ${r.status === "运行中" ? "已停止" : "已启动"}`),
                    },
                ],
            },
        ],
        rows: [
            {id: "1", name: "web-01", status: "运行中", cpu: "42%", region: "us-east-1", uptime: "12d 4h", memory: "1.2 GB", image: "nginx:1.27-alpine"},
            {id: "2", name: "api-01", status: "运行中", cpu: "18%", region: "eu-west-2", uptime: "3d 1h", memory: "760 MB", image: "ghcr.io/acme/api:2024.11"},
            {id: "3", name: "db-01", status: "已停止", cpu: "—", region: "ap-south-1", uptime: "—", memory: "—", image: "postgres:16-bookworm"},
        ],
        selectable: true,
        resizable: true,
        filterEmptyText: "没有匹配的实例",
        onSelectionChange: (keys) => tableState.set(`已选: ${keys.join(", ") || "无"}`),
        onColumnResize: (key, width) => tableSizeState.set(`列宽: ${key || "操作"} = ${width}px`),
        onSortChange: (sort) =>
            tableSortState.set(
                sort === null
                    ? "排序: 原序"
                    : `排序: ${sort.key} ${sort.direction === "ascending" ? "↑" : "↓"}`,
            ),
    });
    // Filtering is a view concern: the callback sees the row and its index in
    // `rows`, so it never has to know that the table also sorts.
    const tableFilter = new TextField({
        placeholder: "按名称或区域筛选…",
        ariaLabel: "筛选实例",
        onInput: (value) => {
            const needle = value.trim().toLowerCase();
            table.setFilter(
                needle === ""
                    ? null
                    : (row) => `${row.name} ${row.region}`.toLowerCase().includes(needle),
            );
        },
    });
    const tableWrap = document.createElement("div");
    tableWrap.style.width = "100%";
    // Narrower than the table, so the middle columns scroll and the pinned
    // actions column stays put — the behaviour this demo is here to show.
    tableWrap.style.maxWidth = "860px";
    tableFilter.element.style.marginBottom = "8px";
    tableWrap.append(tableFilter.element, table.element, tableSortState.node, tableSizeState.node, tableState.node);
    cells.push(
        cell("Table", tableWrap, {
            wide: true,
            hint: "点表头 升序→降序→原序；拖表头分隔条改列宽（双击复位）；输入框实时筛选；操作列固定",
            state: tableState,
        }),
    );

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

    // --- Form (wide) ----------------------------------------------------------
    // The two-column layout a settings screen needs: labels in one column,
    // controls in the other, aligned across rows.
    const formSelect = new Select({
        options: [
            {label: "内置浏览器", value: "builtin"},
            {label: "本机 Chrome", value: "chrome"},
        ],
        value: "builtin",
        ariaLabel: "实现",
    });
    const formAddress = new TextField({placeholder: "http://127.0.0.1:9222"});
    const formToggle = new Switch({checked: true});
    const form = new Form({
        ariaLabel: "表单示例",
        rows: [
            {label: "实现", control: formSelect.element},
            {label: "API 地址", control: formAddress.element, wide: true, hint: "留空则自动检测"},
            {label: "启用", control: formToggle.element},
        ],
    });
    cells.push(cell("Form", form.element, {wide: true, hint: "两列表单：标签 + 控件"}));

    return section("控件 Controls", 44, cells);
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
        closable: true,
        onSelect: (id) => tabState.set(`当前: ${id}`),
        onClose: (id) => tabState.set(`已关闭: ${id}`),
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
    cells.push(cell("TabView", tabSurface, {wide: true, state: tabState, hint: "方向键切换；× 或 Delete / 中键关闭，关闭后焦点落到相邻标签"}));

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
            {
                // Subtitles carry a setting's current value; the chevron says the
                // row opens a detail pane, the way System Settings does.
                heading: "设置",
                items: [
                    {id: "browser", label: "浏览器", subtitle: "内置浏览器", chevron: true},
                    {id: "concurrency", label: "并发", subtitle: "8 个任务", chevron: true},
                ],
            },
        ],
        selected: "all",
        collapsible: true,
        onToggleGroup: (index, collapsed) => {
            sidebar.element.dataset.group = `${index}:${collapsed ? "collapsed" : "expanded"}`;
        },
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

    // Toast. Two buttons: a plain one, and one whose body is a node and which
    // carries an action, which is what "a toast with a link or a button" means.
    const toastButton = new Button({label: "显示提示条"});
    toastButton.element.addEventListener("click", () => {
        showToast("操作已完成", {variant: "success", duration: 2500});
    });

    const toastActionButton = new Button({label: "带操作"});
    toastActionButton.element.addEventListener("click", () => {
        const toast = new Toast({
            variant: "default",
            duration: 6000,
            message: "已删除 3 条记录",
            detail: "可以在 30 秒内撤销",
            action: {
                label: "撤销",
                onClick: () => showToast("已撤销", {variant: "success"}),
            },
        });
        toast.show();
    });

    cells.push(
        cell("Toast", stack(toastButton.element, toastActionButton.element), {
            hint: "右上角；第二个带按钮",
        }),
    );

    // Alert — the promise API, plus a destructive choice to show the button
    // variants carry through.
    const alertState = readout("尚未打开");
    const alertButton = new Button({label: "打开警告"});
    alertButton.element.addEventListener("click", () => {
        const alert = new Alert({
            title: "删除 3 个环境？",
            message: "同时会释放它们占用的代理与邮箱。这一步无法撤销。",
            icon: "warning",
            suppressLabel: "不再提示",
            buttons: [
                {label: "取消", value: "cancel", isCancel: true},
                {label: "删除", value: "delete", variant: "destructive", isDefault: true},
            ],
        });
        void alert.open().then((value) => {
            const suppressed = alert.isSuppressed ? "（不再提示）" : "";
            alertState.set(`选择: ${value === "delete" ? "删除" : "取消"}${suppressed}`);
        });
    });
    cells.push(
        cell("Alert", stack(alertButton.element, alertState.node), {
            hint: "Enter 确认，Esc 取消",
        }),
    );

    // ContextMenu — attached to a surface, opened by a gesture. The items are a
    // function here so the demo shows that a per-row list can be built lazily
    // from the event that asked for it.
    const ctxState = readout("尚未打开");
    // Tracks whether the close was a choice or a dismissal, so the readout can
    // say which one happened instead of always reporting "已关闭".
    let ctxPicked = false;
    const ctxTarget = document.createElement("div");
    ctxTarget.className = "mac-showcase__ctx-target";
    ctxTarget.tabIndex = 0;
    ctxTarget.textContent = "右键或按菜单键";
    const contextMenu = new ContextMenu({
        items: (event) => [
            {label: "打开", value: "open", shortcut: "⌘O", icon: "M4 5.5h11v13H4z M4 9h11"},
            {
                label: event ? "在访达中显示" : "显示所在位置",
                value: "reveal",
                icon: "M3 7.5h6l1.5 2h7.5v9H3z",
            },
            {label: "", value: "sep-1", separator: true},
            {label: "重命名", value: "rename", disabled: true, shortcut: "↩"},
            {label: "移到废纸篓", value: "trash", shortcut: "⌘⌫"},
        ],
        onSelect: (value) => {
            ctxPicked = true;
            ctxState.set(`已选: ${value}`);
        },
        onClose: () => {
            if (!ctxPicked) ctxState.set("已关闭（未选择）");
            ctxPicked = false;
        },
    });
    contextMenu.attachTo(ctxTarget);
    cells.push(
        cell("ContextMenu", ctxTarget, {
            state: ctxState,
            hint: "右键 / ⌃点击 / 菜单键；滚动即关闭",
        }),
    );

    return section("浮层 Overlays", 8, cells);
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


