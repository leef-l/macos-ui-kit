import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./shell.css";

export interface MobileTab {
    /** Stable key. */
    id: string;
    /** Short label under the icon. */
    label: string;
    /** SVG path data for the tab icon. */
    icon: string;
}

export interface MobileShellOptions {
    /** Large navigation title shown above the content. */
    title: string;
    /** Tab bar entries. Empty hides the bar (a single-pane screen). */
    tabs?: MobileTab[];
    /** Initially visible tab. */
    selected?: string;
    /** Fired when the tab changes. */
    onTabChange?: (id: string) => void;
    /** Optional trailing action on the navigation bar. */
    action?: HTMLElement;
}

/**
 * The mobile counterpart of the desktop shell.
 *
 * Deliberately separate from `layout/TitleBar` rather than a media-query variant
 * of it. A phone has no draggable window, no traffic lights and no persistent
 * sidebar; navigation lives in a bottom tab bar, which is the platform-native
 * pattern. Sharing markup between the two would mean every style rule carrying
 * a device exception, which is harder to reason about than two focused modules.
 *
 * Panes are plain containers the host app fills, so this stays layout-only.
 */
export class MobileShell extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly titleNode: HTMLHeadingElement;
    private readonly contentNode: HTMLDivElement;
    private readonly tabBar: HTMLElement | null;
    private readonly onTabChange?: (id: string) => void;
    private selected: string | null;

    constructor(options: MobileShellOptions) {
        super();

        const {title, tabs = [], selected, onTabChange, action} = options;

        this.selected = selected ?? tabs[0]?.id ?? null;
        this.onTabChange = onTabChange;

        this.root = el("div", {class: "mac-mobile"});

        // --- Navigation bar -------------------------------------------------
        const navbar = el("header", {class: "mac-mobile__navbar"});
        this.titleNode = el("h1", {class: "mac-mobile__title", text: title});
        navbar.appendChild(this.titleNode);

        if (action) {
            const slot = el("div", {class: "mac-mobile__action"});
            slot.appendChild(action);
            navbar.appendChild(slot);
        }

        // --- Content region --------------------------------------------------
        this.contentNode = el("div", {class: "mac-mobile__content"});
        // --- Tab bar ---------------------------------------------------------
        const tabBar = tabs.length > 0
            ? el("nav", {class: "mac-mobile__tabbar", role: "tablist"})
            : null;
        this.tabBar = tabBar;

        if (tabBar) {
            for (const tab of tabs) {
                const button = el("button", {
                    class: `mac-mobile__tab${tab.id === this.selected ? " is-selected" : ""}`,
                    type: "button",
                    role: "tab",
                    "aria-selected": String(tab.id === this.selected),
                    dataset: {id: tab.id},
                });
                button.append(svgIcon(tab.icon, 22), el("span", {text: tab.label}));
                tabBar.appendChild(button);
            }

            // Delegated: one listener regardless of tab count.
            this.listen(tabBar, "click", (event) => {
                const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
                    ".mac-mobile__tab",
                );
                if (!button) return;
                const id = button.dataset.id;
                if (id) this.setSelected(id, true);
            });
        }

        this.root.append(navbar, this.contentNode);
        if (tabBar) this.root.appendChild(tabBar);
    }

    /** The region host panes are appended to. */
    get content(): HTMLElement {
        return this.contentNode;
    }

    /** Update the large title. */
    setTitle(title: string): void {
        if (this.titleNode.textContent === title) return;
        this.titleNode.textContent = title;
    }

    /** Switch the active tab. */
    setSelected(id: string, notify = false): void {
        if (this.selected === id) return;
        this.selected = id;

        if (this.tabBar) {
            for (const node of this.tabBar.querySelectorAll<HTMLButtonElement>(".mac-mobile__tab")) {
                const match = node.dataset.id === id;
                node.classList.toggle("is-selected", match);
                node.setAttribute("aria-selected", String(match));
            }
        }

        if (notify) this.onTabChange?.(id);
    }

    /** The active tab id, or null when the shell has no tabs. */
    get selection(): string | null {
        return this.selected;
    }
}

/**
 * Detect whether this build is running inside a mobile Wails shell.
 *
 * Wails reports the host through `runtime.GOOS` on the Go side, but the
 * frontend also needs an answer before any binding round-trip, so this checks
 * the viewport instead: a coarse pointer plus a narrow window is a phone or
 * tablet. The host app can override the decision either way.
 */
export function looksLikeMobile(): boolean {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 720px)").matches;
    return coarse && narrow;
}
