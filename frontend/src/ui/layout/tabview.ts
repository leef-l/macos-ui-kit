import {Component} from "../component";
import {el, svgIcon, uid} from "../dom";
import "./tabview.css";

export interface TabItem {
    /** Stable key; also the value passed to `onSelect`, `select` and `addPanel`. */
    id: string;
    /** Visible text on the tab. */
    label: string;
    /** Leading SVG path data. */
    icon?: string;
    /** Disabled tabs stay visible but are skipped by the keyboard. */
    disabled?: boolean;
}

export interface TabViewOptions {
    tabs: TabItem[];
    /** Initially selected tab. Defaults to the first enabled tab. */
    selected?: string;
    /** Fires when the user changes the tab (not on programmatic `select`). */
    onSelect?: (id: string) => void;
    /** Accessible name for the tab list. */
    ariaLabel?: string;
}

/**
 * A macOS tab view.
 *
 * The ARIA tabs pattern has three parts and all three are wired here, because a
 * tab strip that only *looks* right is unusable with a screen reader:
 *
 * 1. `role="tablist"` on the strip; `role="tab"` + `aria-selected` +
 *    `aria-controls` on each tab; `role="tabpanel"` + `aria-labelledby` on each
 *    panel. The panel is created with its tab, so `aria-controls` always
 *    resolves to a real element even before the host injects content.
 * 2. **Roving tabindex**: exactly one tab is tabbable — the selected one. Tab
 *    then leaves the strip instead of walking through every tab, which is what
 *    a native NSTabView does.
 * 3. Arrow keys move the selection *and* focus together (automatic activation),
 *    Home/End jump to the ends, and disabled tabs are stepped over rather than
 *    focused-and-swallowed.
 *
 * Panels are injected as nodes, so the view owns no content and a panel can be
 * swapped without touching the strip. Panels are never detached: inactive ones
 * are `hidden`, which preserves scroll position and any focus inside them —
 * detaching would silently reset each pane on every switch.
 */
export class TabView extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly tabs: TabItem[];
    private readonly onSelect?: (id: string) => void;
    private readonly listNode: HTMLDivElement;
    private readonly panelHost: HTMLDivElement;

    /** Tab id → its button in the strip. */
    private readonly tabButtons = new Map<string, HTMLButtonElement>();
    /** Tab id → its panel element. Both are created together in the constructor. */
    private readonly panels = new Map<string, HTMLDivElement>();

    private selectedId: string;

    constructor(options: TabViewOptions) {
        super();

        this.tabs = options.tabs;
        this.onSelect = options.onSelect;

        // Fall back to the first enabled tab so the view always has a selection,
        // like NSTabView. An all-disabled strip simply starts with no selection.
        this.selectedId =
            options.selected ?? this.tabs.find((tab) => !tab.disabled)?.id ?? "";

        this.root = el("div", {class: "mac-tabview"});

        this.listNode = el("div", {
            class: "mac-tabview__list",
            role: "tablist",
            "aria-orientation": "horizontal",
        });
        if (options.ariaLabel) this.listNode.setAttribute("aria-label", options.ariaLabel);

        this.panelHost = el("div", {class: "mac-tabview__panels"});

        for (const tab of this.tabs) {
            const selected = tab.id === this.selectedId;
            const tabId = uid("mac-tabview-tab");
            const panelId = uid("mac-tabview-panel");

            const button = el("button", {
                class: `mac-tabview__tab${selected ? " is-selected" : ""}`,
                type: "button",
                role: "tab",
                id: tabId,
                "aria-selected": String(selected),
                "aria-controls": panelId,
                // Roving tabindex: only the selected tab is in the tab order.
                tabindex: selected ? 0 : -1,
                disabled: tab.disabled ?? false,
                dataset: {id: tab.id},
            });

            if (tab.icon) button.appendChild(svgIcon(tab.icon, 14));
            button.appendChild(el("span", {class: "mac-tabview__label", text: tab.label}));

            const panel = el("div", {
                class: "mac-tabview__panel",
                role: "tabpanel",
                id: panelId,
                "aria-labelledby": tabId,
                // Focusable as a fallback: a panel with no focusable content of
                // its own must still be reachable with Tab.
                tabindex: 0,
                hidden: !selected,
            });

            this.tabButtons.set(tab.id, button);
            this.panels.set(tab.id, panel);

            this.listNode.appendChild(button);
            this.panelHost.appendChild(panel);
        }

        // Delegated activation: constant listener count however many tabs exist.
        this.listen(this.listNode, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
                ".mac-tabview__tab",
            );
            if (!button || button.disabled) return;
            const id = button.dataset.id;
            if (!id || id === this.selectedId) return;
            this.apply(id);
            this.onSelect?.(id);
        });

        this.listen(this.listNode, "keydown", (event) => this.onKeyDown(event));

        this.root.append(this.listNode, this.panelHost);
    }

    /**
     * Attach content to a tab.
     *
     * Replacing the panel's children keeps repeated calls idempotent instead of
     * stacking content. An unknown id is ignored: the panel set is fixed when
     * the view is constructed, so a typo must not create an orphan panel that
     * no tab can ever reveal.
     */
    addPanel(id: string, node: Node): void {
        const panel = this.panels.get(id);
        if (!panel) return;
        panel.replaceChildren(node);
    }

    /** Select a tab programmatically. Does not fire `onSelect`. */
    setSelected(id: string): void {
        if (id === this.selectedId) return;
        const tab = this.tabs.find((entry) => entry.id === id);
        if (!tab || tab.disabled) return;
        this.apply(id);
    }

    /** The selected tab id, or an empty string when no tab is selectable. */
    get selected(): string {
        return this.selectedId;
    }

    /** Write the selection: state, ARIA, roving tabindex and the visible panel. */
    private apply(id: string): void {
        this.selectedId = id;

        for (const [tabId, button] of this.tabButtons) {
            const match = tabId === id;
            button.classList.toggle("is-selected", match);
            button.setAttribute("aria-selected", String(match));
            button.tabIndex = match ? 0 : -1;
        }

        for (const [panelId, panel] of this.panels) {
            panel.hidden = panelId !== id;
        }
    }

    /** Arrow keys, Home and End: move selection and focus as one gesture. */
    private onKeyDown(event: KeyboardEvent): void {
        const enabled = this.tabs.filter(
            (tab) => !tab.disabled && this.tabButtons.has(tab.id),
        );
        if (enabled.length === 0) return;

        const current = enabled.findIndex((tab) => tab.id === this.selectedId);
        let next = current;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                next = current === -1 ? 0 : (current + 1) % enabled.length;
                break;
            case "ArrowLeft":
            case "ArrowUp":
                next =
                    current === -1
                        ? enabled.length - 1
                        : (current - 1 + enabled.length) % enabled.length;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = enabled.length - 1;
                break;
            default:
                return;
        }

        event.preventDefault();
        const target = enabled[next];
        this.apply(target.id);
        // Focus follows the selection (automatic activation), so the roving
        // tabindex and the focus ring never point at different tabs.
        this.tabButtons.get(target.id)?.focus();
        this.onSelect?.(target.id);
    }

    override destroy(): void {
        this.panels.clear();
        this.tabButtons.clear();
        super.destroy();
    }
}
