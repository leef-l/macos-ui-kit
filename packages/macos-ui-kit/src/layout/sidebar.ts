import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./sidebar.css";

export interface SidebarItem {
    /** Stable key used to identify the item. */
    id: string;
    /** Visible text. */
    label: string;
    /** Optional leading SVG path data. */
    icon?: string;
    /** Optional trailing count badge. */
    count?: number;
    disabled?: boolean;
}

export interface SidebarOptions {
    /** Grouped items; each group renders as a block with optional heading. */
    groups: Array<{heading?: string; items: SidebarItem[]}>;
    /** Initially selected item id. */
    selected?: string;
    /** Fires when the selection changes. */
    onSelect?: (id: string) => void;
}

/**
 * A macOS source list.
 *
 * Rows are `<button>` elements so each one is natively focusable and announces
 * its state; a single delegated listener on the container handles activation,
 * which keeps the listener count constant no matter how many rows exist.
 */
export class Sidebar extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private selectedId: string | null;
    private readonly onSelect?: (id: string) => void;

    constructor(options: SidebarOptions) {
        super();

        this.selectedId = options.selected ?? null;
        this.onSelect = options.onSelect;

        this.root = el("aside", {class: "mac-sidebar"});

        for (const group of options.groups) {
            const groupNode = el("nav", {
                class: "mac-sidebar__group",
                "aria-label": group.heading ?? "导航",
            });

            if (group.heading) {
                groupNode.appendChild(
                    el("div", {class: "mac-sidebar__heading", text: group.heading}),
                );
            }

            for (const item of group.items) {
                groupNode.appendChild(this.makeItem(item));
            }

            this.root.appendChild(groupNode);
        }

        // One delegated listener for every row.
        this.listen(this.root, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
                ".mac-sidebar__item",
            );
            if (!button || button.disabled) return;
            const id = button.dataset.id;
            if (id) this.setSelected(id, true);
        });
    }

    /** Build one row. */
    private makeItem(item: SidebarItem): HTMLButtonElement {
        const selected = item.id === this.selectedId;

        const button = el("button", {
            class: `mac-sidebar__item${selected ? " is-selected" : ""}`,
            type: "button",
            disabled: item.disabled ?? false,
            dataset: {id: item.id, section: item.id},
            "aria-current": selected ? "page" : "false",
        });

        if (item.icon) {
            button.appendChild(svgIcon(item.icon, 16));
        }

        const label = el("span", {text: item.label});
        button.appendChild(label);

        if (item.count !== undefined) {
            button.appendChild(
                el("span", {class: "mac-sidebar__count", text: String(item.count)}),
            );
        }

        return button;
    }

    /** Select an item by id and optionally notify the caller. */
    setSelected(id: string, notify = false): void {
        if (this.selectedId === id && !notify) return;
        if (this.selectedId === id) return;

        this.selectedId = id;

        for (const node of this.root.querySelectorAll<HTMLButtonElement>(".mac-sidebar__item")) {
            const isMatch = node.dataset.id === id;
            node.classList.toggle("is-selected", isMatch);
            node.setAttribute("aria-current", isMatch ? "page" : "false");
        }

        if (notify) this.onSelect?.(id);
    }

    /** The currently selected item id. */
    get selected(): string | null {
        return this.selectedId;
    }

    /** Collapse or expand the sidebar. */
    setCollapsed(collapsed: boolean): void {
        if (this.root.classList.contains("is-collapsed") === collapsed) return;
        this.root.classList.toggle("is-collapsed", collapsed);
        this.root.setAttribute("aria-hidden", String(collapsed));
    }

    /** True when the sidebar is collapsed. */
    get collapsed(): boolean {
        return this.root.classList.contains("is-collapsed");
    }
}
