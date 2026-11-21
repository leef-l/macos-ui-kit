import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./treeview.css";

export interface TreeNode {
    /** Reported to `onSelect`; also the identity used to match `value`/`expanded`. */
    value: string;
    /** The visible text. */
    label: string;
    /** Trailing secondary text in tertiary ink. */
    detail?: string;
    /** Leading SVG path data in the kit's 24×24 viewBox; drawn at 16px. */
    icon?: string;
    /** Short trailing marker: a count, or a state such as "新建". */
    badge?: string;
    disabled?: boolean;
    /** Initial state for a node that has children. `expanded` option wins. */
    expanded?: boolean;
    children?: TreeNode[];
}

export interface TreeViewOptions {
    nodes: TreeNode[];
    /** Initially selected value. */
    value?: string;
    /**
     * Values of the parents to open. Overrides every node's own `expanded` flag,
     * so a caller can open one subtree without rewriting the data it passed.
     */
    expanded?: string[];
    /** Pixels of indentation per level. Default 16. */
    indent?: number;
    ariaLabel?: string;
    /** Fires when the user selects a node; setters stay silent. */
    onSelect?: (value: string) => void;
    /** Fires only from a user gesture, never from `setExpanded`. */
    onToggle?: (value: string, expanded: boolean) => void;
}

/** Disclosure chevron: points right when collapsed, rotated down when open. */
const TWISTY_PATH = "M9 6 L15 12 L9 18";

/** One rendered node, addressed by value. Rebuilt by every `render`. */
interface RowEntry {
    value: string;
    label: string;
    row: HTMLDivElement;
    /** Absent on a leaf — an entry with no group has nothing to collapse. */
    group: HTMLDivElement | null;
    twisty: HTMLButtonElement | null;
    parent: HTMLDivElement | null;
}

/**
 * An outline view: a tree of rows, collapsible, single selection.
 *
 * Built as the ARIA tree pattern rather than a nest of `<ul>`s: a list cannot
 * express "this row is a parent of that row", cannot be collapsed with one
 * attribute, and leaves the arrow keys unimplemented. `role="treeitem"` with
 * `aria-level` carries the hierarchy, `aria-expanded` the state, and the rows
 * themselves hold the single tab stop.
 *
 * Rows are `<div>`, not `<button>`: a button's native Space activation fires on
 * keyup *and* a `disabled` button cannot take focus at all — and a disabled row
 * here must stay focusable so the tree can be read. They carry `aria-disabled`
 * instead, which is the correct ARIA treatment for an option-like element.
 *
 * Indentation is a custom property per row, never a computed padding string:
 * `--mac-treeview-depth` is written once per row and one CSS rule turns it into
 * `padding-inline-start`. Nothing above a row contributes padding, so a nested
 * row's offset is exactly `depth × indent` instead of a sum down the chain.
 */
export class TreeView extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly tree: HTMLDivElement;
    private readonly onSelect?: (value: string) => void;
    private readonly onToggle?: (value: string, expanded: boolean) => void;

    private nodes: TreeNode[];
    private readonly expandedSet = new Set<string>();
    private current: string;

    /** value → its row, group and parent row. Rebuilt by every `render`. */
    private readonly index = new Map<string, RowEntry>();

    /** The one visible row that owns the tree's single tab stop. */
    private anchor: HTMLDivElement | null = null;

    constructor(options: TreeViewOptions) {
        super();

        this.nodes = options.nodes;
        this.onSelect = options.onSelect;
        this.onToggle = options.onToggle;
        this.current = options.value ?? "";

        this.root = el("div", {class: "mac-treeview"});

        this.tree = el("div", {class: "mac-treeview__tree", role: "tree"});
        if (options.ariaLabel) this.tree.setAttribute("aria-label", options.ariaLabel);
        this.root.appendChild(this.tree);

        // The stylesheet owns the default indent. Writing the property here
        // unconditionally would make that default dead — the progressring lesson.
        if (options.indent !== undefined) {
            this.root.style.setProperty("--mac-treeview-indent", `${options.indent}px`);
        }

        if (options.expanded) {
            for (const value of options.expanded) this.expandedSet.add(value);
        } else {
            collectExpanded(this.nodes, this.expandedSet);
        }

        // Delegated from the tree element, which outlives every render.
        this.listen(this.tree, "click", (event) => this.onClick(event));
        this.listen(this.tree, "keydown", (event) => this.onKeyDown(event));
        // The pointer can land focus on a row, so the tab stop follows it.
        this.listen(this.tree, "focusin", (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const row = target.closest<HTMLDivElement>(".mac-treeview__row");
            if (!row) return;
            this.anchor = row;
            this.syncAnchor();
        });

        this.render();
    }

    /** The selected value, or "" when nothing is selected. */
    get value(): string {
        return this.current;
    }

    /** Values of the parents that are open, in document order. */
    get expanded(): string[] {
        const values: string[] = [];
        for (const entry of this.index.values()) {
            if (entry.group && this.expandedSet.has(entry.value)) values.push(entry.value);
        }
        return values;
    }

    /**
     * Replace the tree.
     *
     * The selection and the expanded set survive for values that still exist and
     * are dropped for values that do not — keeping a stale value would make it
     * reappear the moment `setNodes` brings the node back. Silent.
     */
    setNodes(nodes: TreeNode[]): void {
        // Focus is lost by the rebuild (the old rows are detached), so it is
        // carried across: replacing data under a focused tree must not drop the
        // user out of the tree and back to the top of the page.
        const hadFocus = this.root.contains(document.activeElement);
        this.nodes = nodes;
        this.render();
        if (hadFocus) this.anchor?.focus();
    }

    /**
     * Select a value programmatically. Silent, and a value that is not in the
     * tree is ignored rather than reported as a selection with no row.
     */
    setValue(value: string): void {
        if (value !== "" && !this.index.has(value)) return;
        this.current = value;

        // A selection the user cannot see is a bug report waiting to happen, so
        // the ancestors open to reveal it. Silent, like every other setter.
        if (value) this.reveal(value);

        this.paintExpanded();
        this.syncSelected();
    }

    /** Open exactly the given parents. Silent, then repaint. */
    setExpanded(values: string[]): void {
        this.expandedSet.clear();
        for (const value of values) this.expandedSet.add(value);
        this.pruneExpanded();
        this.paintExpanded();
    }

    /** Move focus onto the tree's tab stop. */
    focus(): void {
        this.anchor?.focus();
    }

    // --- rendering -----------------------------------------------------------

    /**
     * Rebuild the tree.
     *
     * One insertion for the whole hierarchy: appending level by level re-runs
     * layout once per row, which on a deep tree is the difference between one
     * frame and a visible stall.
     */
    private render(): void {
        this.index.clear();

        this.tree.replaceChildren(this.buildLevel(this.nodes));

        // A value with no row cannot stay selected or expanded. Pruning here
        // rather than in the setters means a `setNodes` that drops a subtree
        // leaves no ghosts behind, whatever the caller passed.
        if (this.current && !this.index.has(this.current)) this.current = "";
        this.pruneExpanded();

        // The previous anchor is a detached element now.
        this.anchor = null;
        this.paintExpanded();
        this.syncSelected();
    }

    /** Build one level, recursing into each parent's group. */
    private buildLevel(nodes: TreeNode[], depth = 1, parent: HTMLDivElement | null = null): DocumentFragment {
        const fragment = document.createDocumentFragment();

        for (const node of nodes) {
            const row = this.makeRow(node, depth);
            fragment.appendChild(row);

            // Registered before the children are built so the map's insertion
            // order — which `get expanded` relies on — stays document order.
            const entry: RowEntry = {
                value: node.value,
                label: node.label,
                row,
                group: null,
                twisty: null,
                parent,
            };
            this.index.set(node.value, entry);

            const children = node.children ?? [];
            if (children.length === 0) continue;

            const group = el("div", {class: "mac-treeview__group", role: "group"});
            group.appendChild(this.buildLevel(children, depth + 1, row));
            fragment.appendChild(group);
            entry.group = group;
        }

        return fragment;
    }

    private makeRow(node: TreeNode, depth: number): HTMLDivElement {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const expanded = this.expandedSet.has(node.value);

        const row = el("div", {
            class: "mac-treeview__row",
            role: "treeitem",
            // `aria-level` is 1-based; the CSS depth is 0-based. Both are written
            // so the row can be indented without reading its ancestors.
            "aria-level": String(depth),
            "aria-selected": String(node.value === this.current),
            "aria-disabled": node.disabled ? "true" : undefined,
            tabindex: -1,
            dataset: {value: node.value},
        });
        row.style.setProperty("--mac-treeview-depth", String(depth - 1));

        if (hasChildren) {
            const twisty = el("button", {
                class: `mac-treeview__twisty${expanded ? " is-expanded" : ""}`,
                type: "button",
                // Out of the tab order: the tree is one tab stop, and the arrow
                // keys are the keyboard route into a disclosure control. A
                // tabbable twisty would make Tab walk every branch instead.
                tabindex: -1,
                "aria-label": `${expanded ? "折叠" : "展开"} ${node.label}`,
                dataset: {value: node.value},
            });
            twisty.appendChild(svgIcon(TWISTY_PATH, 12));
            row.appendChild(twisty);
        } else {
            // A leaf keeps the label column aligned with its siblings' labels.
            row.appendChild(el("span", {class: "mac-treeview__spacer", "aria-hidden": "true"}));
        }

        if (node.icon) row.appendChild(svgIcon(node.icon, 16));
        row.appendChild(el("span", {class: "mac-treeview__label", text: node.label}));
        if (node.detail) {
            row.appendChild(el("span", {class: "mac-treeview__detail", text: node.detail}));
        }
        if (node.badge) {
            row.appendChild(el("span", {class: "mac-treeview__badge", text: node.badge}));
        }

        return row;
    }

    /**
     * Paint the open/closed state of every parent, then repair the tab stop.
     *
     * Collapsing a group can hide the row that owns the tab stop; a
     * `display: none` row cannot take focus, so Tab would leave the tree
     * entirely. Parking the stop on the nearest visible ancestor keeps the tree
     * reachable.
     */
    private paintExpanded(): void {
        for (const entry of this.index.values()) {
            if (!entry.group) continue;
            const expanded = this.expandedSet.has(entry.value);

            entry.group.hidden = !expanded;
            entry.row.setAttribute("aria-expanded", String(expanded));
            if (entry.twisty) {
                entry.twisty.classList.toggle("is-expanded", expanded);
                entry.twisty.setAttribute(
                    "aria-label",
                    `${expanded ? "折叠" : "展开"} ${entry.label}`,
                );
            }
        }

        if (this.anchor && !this.isVisible(this.anchor)) {
            this.anchor = this.nearestVisibleRow(this.anchor);
        }
        this.syncAnchor();
    }

    /** Mirror the selection into the rows. */
    private syncSelected(): void {
        for (const entry of this.index.values()) {
            const on = entry.value === this.current;
            entry.row.classList.toggle("is-selected", on);
            entry.row.setAttribute("aria-selected", String(on));
        }
    }

    /**
     * Keep exactly one *visible* row at `tabindex="0"`.
     *
     * Hidden rows are demoted too, not just skipped: two tab stops in a
     * collapsed tree would let Tab land on a row nobody can see.
     */
    private syncAnchor(): void {
        const visible = this.visibleRows();

        if (!this.anchor || !visible.includes(this.anchor)) {
            this.anchor =
                visible.find((row) => row.dataset.value === this.current) ??
                visible[0] ??
                null;
        }

        for (const row of this.allRows()) {
            row.tabIndex = row === this.anchor ? 0 : -1;
        }
    }

    // --- open state ----------------------------------------------------------

    /** Open every ancestor of a value so the row it names is on screen. */
    private reveal(value: string): void {
        let entry = this.index.get(value);
        while (entry?.parent) {
            const parent = this.entryFor(entry.parent);
            if (parent) {
                this.expandedSet.add(parent.value);
                entry = parent;
            } else {
                entry = undefined;
            }
        }
    }

    /** Drop expanded values that are not parents in the current tree. */
    private pruneExpanded(): void {
        for (const value of Array.from(this.expandedSet)) {
            const entry = this.index.get(value);
            if (!entry || !entry.group) this.expandedSet.delete(value);
        }
    }

    /**
     * Open or close one parent.
     *
     * `notify` is true only for a user gesture, so `setExpanded`, `setValue` and
     * `setNodes` never report a toggle.
     */
    private toggle(value: string, notify: boolean): void {
        const entry = this.index.get(value);
        if (!entry || !entry.group) return;

        const expanded = this.expandedSet.has(value);
        if (expanded) this.expandedSet.delete(value);
        else this.expandedSet.add(value);

        this.paintExpanded();
        if (notify) this.onToggle?.(value, !expanded);
    }

    // --- selection -----------------------------------------------------------

    private selectRow(row: HTMLDivElement, notify: boolean): void {
        const entry = this.entryFor(row);
        if (!entry || this.isDisabled(row)) return;

        // The same value twice is not a change: no state write, no callback.
        if (entry.value === this.current) return;

        this.current = entry.value;
        this.syncSelected();

        this.anchor = row;
        this.syncAnchor();

        if (notify) this.onSelect?.(entry.value);
    }

    // --- input ---------------------------------------------------------------

    private onClick(event: MouseEvent): void {
        const target = event.target;
        if (!(target instanceof Element)) return;

        // The twisty sits inside the row, so it is tested first and returns:
        // opening a branch must not also select it.
        const twisty = target.closest<HTMLButtonElement>(".mac-treeview__twisty");
        if (twisty) {
            const value = twisty.dataset.value;
            if (value !== undefined) this.toggle(value, true);
            return;
        }

        const row = target.closest<HTMLDivElement>(".mac-treeview__row");
        if (row) this.selectRow(row, true);
    }

    private onKeyDown(event: KeyboardEvent): void {
        const row = this.focusedRow();
        if (!row) return;
        const entry = this.entryFor(row);
        if (!entry) return;

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.moveFocus(row, 1);
                return;
            case "ArrowUp":
                event.preventDefault();
                this.moveFocus(row, -1);
                return;
            case "ArrowRight":
                event.preventDefault();
                this.expandOrEnter(entry);
                return;
            case "ArrowLeft":
                event.preventDefault();
                this.collapseOrLeave(entry);
                return;
            case "Home":
                event.preventDefault();
                this.focusEdge(1);
                return;
            case "End":
                event.preventDefault();
                this.focusEdge(-1);
                return;
            case "Enter":
            case " ":
                event.preventDefault();
                this.selectRow(row, true);
                return;
            default:
                return;
        }
    }

    /**
     * Right: open a closed parent, or step into an open one's first child.
     *
     * That two-stage behaviour is the platform contract — the second press is
     * what "enters" the branch, so a user can open a subtree without also
     * losing their place in it.
     */
    private expandOrEnter(entry: RowEntry): void {
        if (!entry.group) return;

        if (!this.expandedSet.has(entry.value)) {
            this.toggle(entry.value, true);
            return;
        }

        const first = entry.group.firstElementChild;
        if (first instanceof HTMLDivElement) this.focusRow(first);
    }

    /** Left: close an open parent, otherwise step out to the parent row. */
    private collapseOrLeave(entry: RowEntry): void {
        if (entry.group && this.expandedSet.has(entry.value)) {
            this.toggle(entry.value, true);
            return;
        }

        if (entry.parent) this.focusRow(entry.parent);
    }

    /** Move one visible row up or down; stops at both ends rather than wrapping. */
    private moveFocus(row: HTMLDivElement, direction: 1 | -1): void {
        const visible = this.visibleRows();
        const index = visible.indexOf(row);
        if (index === -1) return;

        const next = visible[index + direction];
        if (next) this.focusRow(next);
    }

    private focusEdge(direction: 1 | -1): void {
        const visible = this.visibleRows();
        const next = direction === 1 ? visible[0] : visible[visible.length - 1];
        if (next) this.focusRow(next);
    }

    private focusRow(row: HTMLDivElement): void {
        this.anchor = row;
        this.syncAnchor();
        row.focus();
    }

    // --- helpers -------------------------------------------------------------

    /** Every row in the tree, visible or not, in document order. */
    private allRows(): HTMLDivElement[] {
        return Array.from(
            this.tree.querySelectorAll<HTMLDivElement>(".mac-treeview__row"),
        );
    }

    /** Rows with no hidden ancestor group. */
    private visibleRows(): HTMLDivElement[] {
        return this.allRows().filter((row) => this.isVisible(row));
    }

    /**
     * Whether a row is inside a closed group.
     *
     * The collected selector answers this without a layout read: `hidden` sets
     * `display: none`, so `offsetParent` would do it too, but only after a style
     * flush — this runs inside a key handler.
     */
    private isVisible(row: HTMLElement): boolean {
        return row.closest(".mac-treeview__group[hidden]") === null;
    }

    private focusedRow(): HTMLDivElement | null {
        const active = document.activeElement;
        if (!(active instanceof Element)) return null;
        const row = active.closest<HTMLDivElement>(".mac-treeview__row");
        return row && this.tree.contains(row) ? row : null;
    }

    private entryFor(row: HTMLElement): RowEntry | undefined {
        const value = row.dataset.value;
        return value === undefined ? undefined : this.index.get(value);
    }

    /** The row a group belongs to: groups follow their parent row. */
    private parentRow(row: HTMLDivElement): HTMLDivElement | null {
        const group = row.parentElement;
        if (!group || !group.classList.contains("mac-treeview__group")) return null;
        const parent = group.previousElementSibling;
        return parent instanceof HTMLDivElement ? parent : null;
    }

    /** Closest row that is still on screen after a collapse, or null. */
    private nearestVisibleRow(row: HTMLDivElement): HTMLDivElement | null {
        let current: HTMLDivElement | null = row;
        while (current && !this.isVisible(current)) {
            current = this.parentRow(current);
        }
        return current;
    }

    private isDisabled(row: HTMLElement): boolean {
        return row.getAttribute("aria-disabled") === "true";
    }
}

/** Seed the expanded set from the nodes' own `expanded` flags. */
function collectExpanded(nodes: TreeNode[], into: Set<string>): void {
    for (const node of nodes) {
        const children = node.children ?? [];
        if (children.length > 0 && node.expanded) into.add(node.value);
        collectExpanded(children, into);
    }
}
