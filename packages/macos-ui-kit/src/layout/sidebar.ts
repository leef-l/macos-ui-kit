import {Component} from "../component";
import {el, svgIcon, uid} from "../dom";
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
    /**
     * Second line under the label — a setting's current value, a summary, a path.
     * A row with a subtitle is taller; the layout follows the content.
     */
    subtitle?: string;
    /**
     * Chevron at the trailing edge. A settings list uses this to say "this row
     * opens a detail pane", the way System Settings does.
     */
    chevron?: boolean;
    disabled?: boolean;
}

/** One block of rows, with an optional heading that can double as its handle. */
export interface SidebarGroup {
    heading?: string;
    items: SidebarItem[];
    /** Override the sidebar's `collapsible` for this group. */
    collapsible?: boolean;
    /** Start collapsed. Only meaningful together with collapsible. */
    collapsed?: boolean;
}

export interface SidebarOptions {
    /** Grouped items; each group renders as a block with optional heading. */
    groups: SidebarGroup[];
    /** Initially selected item id. */
    selected?: string;
    /** Fires when the selection changes. */
    onSelect?: (id: string) => void;
    /**
     * Make every heading a disclosure that folds its rows away.
     *
     * A group with no heading stays open: there is nothing to click, and a
     * collapsed group with no handle could never be reopened.
     */
    collapsible?: boolean;
    /** Fires with the group index and its new state. */
    onToggleGroup?: (index: number, collapsed: boolean) => void;
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
    private readonly collapsible: boolean;
    private readonly onToggleGroup?: (index: number, collapsed: boolean) => void;

    /** Per group: the disclosure button (when it has a heading) and the row box. */
    private readonly groupHandles = new Map<number, HTMLButtonElement>();
    private readonly groupBodies = new Map<number, HTMLDivElement>();

    constructor(options: SidebarOptions) {
        super();

        this.selectedId = options.selected ?? null;
        this.onSelect = options.onSelect;
        this.collapsible = options.collapsible ?? false;
        this.onToggleGroup = options.onToggleGroup;

        this.root = el("aside", {class: "mac-sidebar"});

        options.groups.forEach((group, index) => {
            const groupNode = el("nav", {
                class: "mac-sidebar__group",
                "aria-label": group.heading ?? "导航",
            });

            const collapsible = (group.collapsible ?? this.collapsible) && group.heading !== undefined;
            const bodyId = uid("mac-sidebar-group");
            const body = el("div", {class: "mac-sidebar__items", id: bodyId});
            for (const item of group.items) {
                body.appendChild(this.makeItem(item));
            }

            if (group.heading) {
                if (!collapsible) {
                    groupNode.appendChild(el("div", {class: "mac-sidebar__heading", text: group.heading}));
                } else {
                    // The heading becomes the handle. A `<button>`, not a div with a
                    // click listener: it has to be reachable by Tab and it has to
                    // announce its state, and `aria-expanded` is what says whether
                    // the rows below are showing.
                    const collapsed = group.collapsed ?? false;
                    const handle = el("button", {
                        class: "mac-sidebar__heading mac-sidebar__heading--disclosure",
                        type: "button",
                        "aria-expanded": String(!collapsed),
                        "aria-controls": bodyId,
                        dataset: {group: String(index)},
                    });
                    handle.appendChild(el("span", {class: "mac-sidebar__disclosure", "aria-hidden": "true"}));
                    handle.appendChild(el("span", {class: "mac-sidebar__heading-text", text: group.heading}));
                    groupNode.appendChild(handle);
                    this.groupHandles.set(index, handle);
                    // `hidden` rather than a class: a collapsed group must leave the
                    // tab order, or Tab would walk into rows nobody can see.
                    body.hidden = collapsed;
                }
            }

            groupNode.appendChild(body);
            this.groupBodies.set(index, body);
            this.root.appendChild(groupNode);
        });

        // One delegated listener for every row.
        this.listen(this.root, "click", (event) => {
            const target = event.target as HTMLElement;

            const handle = target.closest<HTMLButtonElement>(".mac-sidebar__heading--disclosure");
            if (handle) {
                const index = Number(handle.dataset.group);
                if (Number.isFinite(index)) this.toggleGroup(index, undefined, true);
                return;
            }

            const button = target.closest<HTMLButtonElement>(".mac-sidebar__item");
            if (!button || button.disabled) return;
            const id = button.dataset.id;
            if (id) this.setSelected(id, true);
        });
    }

    /** Fold or unfold a group. `collapsed` omitted means "flip it". Silent unless reported. */
    toggleGroup(index: number, collapsed?: boolean, notify = false): void {
        const body = this.groupBodies.get(index);
        const handle = this.groupHandles.get(index);
        if (!body || !handle) return;

        const next = collapsed ?? body.hidden !== true;
        if (body.hidden === next) return;
        body.hidden = next;
        handle.setAttribute("aria-expanded", String(!next));
        if (notify) this.onToggleGroup?.(index, next);
    }

    /** Whether a group's rows are folded away. */
    isCollapsed(index: number): boolean {
        return this.groupBodies.get(index)?.hidden === true;
    }

    /** Build one row. */
    private makeItem(item: SidebarItem): HTMLButtonElement {
        const selected = item.id === this.selectedId;

        const button = el("button", {
            class: `mac-sidebar__item${selected ? " is-selected" : ""}${
                item.subtitle ? " mac-sidebar__item--two-line" : ""
            }`,
            type: "button",
            disabled: item.disabled ?? false,
            dataset: {id: item.id, section: item.id},
            "aria-current": selected ? "page" : "false",
        });

        if (item.icon) {
            button.appendChild(svgIcon(item.icon, 16));
        }

        // The label and its subtitle share a column so the subtitle lines up under
        // the text rather than under the icon.
        const text = el("span", {class: "mac-sidebar__text"});
        text.appendChild(el("span", {class: "mac-sidebar__label", text: item.label}));
        if (item.subtitle) {
            text.appendChild(
                el("span", {class: "mac-sidebar__subtitle", text: item.subtitle}),
            );
        }
        button.appendChild(text);

        if (item.count !== undefined) {
            button.appendChild(
                el("span", {class: "mac-sidebar__count", text: String(item.count)}),
            );
        }

        if (item.chevron) {
            const chevron = svgIcon("M9 6 L15 12 L9 18", 12);
            chevron.classList.add("mac-sidebar__chevron");
            button.appendChild(chevron);
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
