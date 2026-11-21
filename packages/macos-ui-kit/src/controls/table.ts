import {Component} from "../component";
import {append, el, svgIcon} from "../dom";
import {Button, type ButtonVariant} from "./button";
import "./table.css";

/** Horizontal alignment of a column's header and cells. */
export type TableAlign = "left" | "center" | "right";

/** Which way a sorted column runs. */
export type TableSortDirection = "ascending" | "descending";

/** The active sort: one column and a direction. */
export interface TableSort {
    /** `key` of the sorted column. */
    key: string;
    direction: TableSortDirection;
}

/** One column definition. */
export interface TableColumn {
    /** Property name read from each row object. */
    key: string;
    /** Header label. */
    title: string;
    /** Fixed width in CSS pixels; columns without one share the rest. */
    width?: number;    /** Alignment for the header and every cell in the column. Default `left`. */
    align?: TableAlign;
    /**
     * Custom cell renderer — the main extension point.
     *
     * Called once per cell during a render with the value at `column.key`, the
     * whole row and the row index. Returning a `Node` lets the cell hold live
     * UI (a badge, a button, a switch); returning a string renders as text.
     * Omit it to get the default `String(value)` treatment.
     */
    render?: (value: any, row: any, index: number) => Node | string;
    /**
     * Keep this column in view while the table scrolls horizontally.
     *
     * Pin the actions column to `"right"` and the checkbox or identifier column
     * to `"left"`; everything between them scrolls. Several columns can be
     * pinned to the same edge — their offsets stack in visual order.
     *
     * Works with or without `width`: a width fixes the column, no width lets the
     * column size to its content.
     */
    pinned?: "left" | "right";
    /**
     * Buttons for this cell — one set per row.
     *
     * `render` can already return a button, but every table that has an actions
     * column writes the same wrapper, so this states the shape once. Use one or
     * the other, not both: `actions` wins when present.
     */
    actions?: (row: any, index: number) => TableAction[];
    /**
     * Make the header a sort button.
     *
     * Clicking cycles ascending → descending → unsorted, which gives the reader a
     * way back to the order the data arrived in; a two-state toggle cannot.
     */
    sortable?: boolean;
    /**
     * What to sort this column by, when that is not the raw cell value.
     *
     * A cell often shows formatted text — a date, a currency, `render`'s output —
     * while the useful order is the underlying number or timestamp. Defaults to
     * `row[column.key]`.
     */
    sortValue?: (row: any) => unknown;
}

/** One button inside an action column. */
export interface TableAction {
    /** Visible text. */
    label: string;
    /** Called with the row that was clicked. */
    onClick: (row: any) => void;
    /** Button style. Default `default`. */
    variant?: ButtonVariant;
    /** Disable the button, or decide per row. */
    disabled?: boolean | ((row: any) => boolean);
    /** Accessible name when the label is short or an icon substitute. */
    ariaLabel?: string;
}

export interface TableOptions {
    columns: TableColumn[];
    rows: any[];
    /**
     * Stable identity per row, used by selection and by the `is-selected`
     * class. Defaults to a primitive `row.id` when present, otherwise the row
     * index — so pass one if rows are reordered or paginated.
     */
    rowKey?: (row: any, index: number) => string;
    /** Render a leading checkbox column with select-all in the header. */
    selectable?: boolean;
    /** Keys selected on first paint; only meaningful with `selectable`. */
    selectedKeys?: string[];
    /** Fires after a user-driven selection change, with the new key list. */
    onSelectionChange?: (keys: string[]) => void;
    /**
     * Hide rows that do not pass the test.
     *
     * Filtering is a view concern, so the callback sees the row and its index in
     * the array you passed to `rows` — never an index into the filtered result,
     * which would change as the reader types.
     */
    filter?: (row: any, index: number) => boolean;
    /** Sort applied on first paint. */
    sort?: TableSort | null;
    /** Fires when the reader clicks a sortable header. */
    onSortChange?: (sort: TableSort | null) => void;
    /** Text shown in place of rows when `rows` is empty. */
    emptyText?: string;
    /** Text shown when rows exist but the filter rejects all of them. */
    filterEmptyText?: string;
    /**
     * Let the reader drag a column edge to change its width.
     *
     * The layout is frozen on the first paint when this is on: every column gets
     * the width it happened to have, and from then on the widths are the
     * reader's, not the content's. That is what a resizable table is — a column
     * that kept re-fitting itself to its widest cell would undo the drag as soon
     * as one long value arrived.
     *
     * Action columns are not resizable: they size to their buttons by design.
     */
    resizable?: boolean;
    /** Fires with the column key and its new width once a drag or a key press ends. */
    onColumnResize?: (key: string, width: number) => void;
}

/** Fallback identity: an `id` field when the data has one, else the index. */
function defaultRowKey(row: any, index: number): string {
    const id = row?.id;
    return typeof id === "string" || typeof id === "number" ? String(id) : String(index);
}

/** BEM modifier for a column's alignment, empty for the default left. */
function alignClass(align: TableAlign | undefined): string {
    if (align === "center") return " mac-table__align--center";
    if (align === "right") return " mac-table__align--right";
    return "";
}

/**
 * Chevron drawn inside a sortable header.
 *
 * Points up, which is ascending; CSS rotates it a half turn for descending. One
 * node and one rule instead of two paths, so switching direction never has to
 * rebuild the header.
 */
const SORT_CHEVRON = "M6 15l6-6 6 6";

/**
 * Compare two non-empty sort keys.
 *
 * Numbers and dates compare by magnitude, everything else as text with `numeric`
 * collation — which is what makes "item 2" sort before "item 10" instead of
 * after it. A plain string compare gets that wrong and it is the single most
 * common complaint about a hand-written sorter.
 */
function compareValues(a: unknown, b: unknown): number {
    const aTime = a instanceof Date ? a.getTime() : null;
    const bTime = b instanceof Date ? b.getTime() : null;
    if (aTime !== null || bTime !== null) {
        const left = aTime ?? Number(a);
        const right = bTime ?? Number(b);
        if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    }

    if (typeof a === "number" && typeof b === "number") return a - b;

    return String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: "base",
    });
}

/**
 * A macOS data table.
 *
 * Built on a real `<table>` (`th scope="col"`, a body of `<tr>`s) so screen
 * readers, header associations and text selection behave; the styling and the
 * independent horizontal scroller are what this component adds.
 *
 * Rendering strategy: every row is built into a `DocumentFragment` and the
 * body is swapped in one `replaceChildren()` call. Appending row by row would
 * re-run layout once per row, which on a few hundred rows is the difference
 * between one frame and a visible stall.
 *
 * Events are delegated from the (stable) body element, so re-rendering rows
 * never leaks listeners.
 */
export class Table extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly body: HTMLTableSectionElement;
    /** Header section; sort clicks are delegated from it. */
    private readonly head: HTMLTableSectionElement;
    /** Horizontal scroller; the fixed-width pass measures the available box from it. */
    private readonly scroll: HTMLDivElement;

    private readonly columns: TableColumn[];
    private readonly rowKey: (row: any, index: number) => string;
    private readonly selectable: boolean;
    private readonly emptyText: string;
    private readonly onSelectionChange?: (keys: string[]) => void;
    private readonly onSortChange?: (sort: TableSort | null) => void;
    private readonly filterEmptyText: string;
    private readonly resizable: boolean;
    private readonly onColumnResize?: (key: string, width: number) => void;

    /**
     * Column widths once the reader has taken them over, keyed by column index.
     *
     * Kept by index, not by key: two columns are allowed to share a key (the
     * action column's key is `""`), and the index is what the `<col>` list and
     * the pinned offsets already address columns by.
     */
    private readonly widths = new Map<number, number>();
    /** Live drag, or null. `pointermove` between two frames is one gesture. */
    private gesture: {index: number; startX: number; startWidth: number} | null = null;
    /** Widths from the first paint, so a double click can put a column back. */
    private readonly naturalWidths = new Map<number, number>();

    /** Active sort, or null for the order the data arrived in. */
    private sortState: TableSort | null = null;
    /** Active row test, or null when every row shows. */
    private filterState: ((row: any, index: number) => boolean) | null = null;

    /** Selected row keys, in selection order. */
    private readonly selected = new Set<string>();

    /** Select-all box in the header; null when the table is not selectable. */
    private headerCheck: HTMLInputElement | null = null;
    /** Row checkboxes, index-aligned with `rowKeys`. */
    private rowChecks: HTMLInputElement[] = [];
    /** Keys of the currently rendered rows, in row order. */
    private rowKeys: string[] = [];

    private rows: any[] = [];

    constructor(options: TableOptions) {
        super();

        this.columns = options.columns;
        this.rows = options.rows ?? [];
        this.selectable = options.selectable ?? false;
        this.emptyText = options.emptyText ?? "暂无数据";
        this.rowKey = options.rowKey ?? defaultRowKey;
        this.onSelectionChange = options.onSelectionChange;
        this.onSortChange = options.onSortChange;
        this.filterEmptyText = options.filterEmptyText ?? "无匹配结果";
        this.resizable = options.resizable ?? false;
        this.onColumnResize = options.onColumnResize;
        // Copied, not referenced: the caller's object is theirs to mutate, and a
        // sort that changed under the component without a render would put the
        // header arrow and the row order out of step.
        this.sortState = options.sort ? {...options.sort} : null;
        this.filterState = options.filter ?? null;

        for (const key of options.selectedKeys ?? []) {
            this.selected.add(key);
        }

        const classes = ["mac-table"];
        if (this.selectable) classes.push("mac-table--selectable");
        // A declared `width` is a promise; `table-layout: auto` treats it as a
        // hint and equalises the columns when the content is short. Switching to
        // fixed only when widths are declared keeps content-sized tables as they
        // were, and makes declared widths exact.
        if (this.columns.some((column) => column.width !== undefined) || this.resizable) {
            classes.push("mac-table--fixed");
        }

        this.root = el("div", {class: classes.join(" ")});

        const scroll = el("div", {class: "mac-table__scroll"});
        const table = el("table", {class: "mac-table__table"});
        const head = el("thead", {class: "mac-table__head"});
        this.head = head;

        this.scroll = scroll;
        this.body = el("tbody", {class: "mac-table__body"});

        table.append(this.makeColGroup(), head, this.body);
        scroll.appendChild(table);
        this.root.appendChild(scroll);

        head.appendChild(this.makeHeaderRow());

        // One listener for every row checkbox, on an element that outlives the
        // rows themselves.
        this.listen(this.body, "change", (event) => this.onBodyChange(event));
        this.listen(this.head, "click", (event) => this.onHeadClick(event));

        this.renderRows();

        // After the first layout, not during it: the widths a resizable table has
        // to freeze are the ones the rendered columns ended up with.
        if (this.resizable) {
            requestAnimationFrame(() => {
                if (!this.isDestroyed) this.enableResizing();
            });
        }

        // Pinned offsets depend on the rendered column widths, so they are
        // measured after layout and re-measured whenever the scroller changes
        // size (a window resize reflows the columns).
        if (this.columns.some((column) => column.width !== undefined) || this.resizable) {
            const observer = new ResizeObserver(() => {
                this.applyFixedWidths();
                this.applyPinnedOffsets();
            });
            observer.observe(scroll);
            this.onDestroy(() => observer.disconnect());
            this.applyFixedWidths();

            // A web font loads after first paint and the fallback measures
            // narrower, so a width computed before the swap left the last button
            // clipped — and nothing recomputed it, because the scroller's own box
            // never changed. The fonts settle once; re-measuring then is enough.
            if (typeof document !== "undefined" && document.fonts) {
                document.fonts.ready
                    .then(() => {
                        if (!this.isDestroyed) this.applyFixedWidths();
                    })
                    .catch(() => {});
            }
        }
        if (this.columns.some((column) => column.pinned)) {
            const observer = new ResizeObserver(() => this.applyPinnedOffsets());
            observer.observe(scroll);
            this.onDestroy(() => observer.disconnect());
        }
    }

    /**
     * Give the table an explicit width when columns declare one.
     *
     * `table-layout: fixed` uses declared widths exactly, but the table itself
     * still sizes to its container unless told otherwise — and if the container is
     * narrower than the sum, the columns get scaled down instead of overflowing.
     * So the width is computed here: the declared sum, plus an equal share of what
     * is left for the columns that did not declare one.
     *
     * The share never drops below the cell floor (`min-width` plus padding from
     * the stylesheet), so a table with many flexible columns still scrolls rather
     * than collapsing them onto each other.
     */
    private applyFixedWidths(): void {
        const table = this.root.querySelector<HTMLElement>(".mac-table__table");
        if (!table) return;

        // An actions column sizes to its buttons unless the caller pinned a width:
        // buttons are content, and sharing the leftover space equally would cut
        // the last one off.
        const naturalActions = new Map<number, number>();
        this.columns.forEach((column, index) => {
            if (!column.actions || column.width !== undefined) return;
            const widest = this.measureActions(index);
            if (widest > 0) naturalActions.set(index, widest);
        });

        // Write those widths onto their <col>, which is what fixed layout reads.
        const cols = this.root.querySelectorAll<HTMLTableColElement>(".mac-table__col");
        const offset = this.selectable ? 1 : 0;

        // A width the reader set wins over everything: it is the one value here
        // that no measurement gets to overrule.
        const resolved = (index: number): number | undefined =>
            this.widths.get(index) ?? naturalActions.get(index) ?? this.columns[index].width;

        this.columns.forEach((column, index) => {
            const width = resolved(index);
            if (width === undefined) return;
            const col = cols[index + offset];
            if (col) col.style.width = `${Math.ceil(width)}px`;
        });

        const declared = this.columns.reduce((sum, _column, index) => sum + (resolved(index) ?? 0), 0);
        // A frozen table has no flexible column left: the reader took the widths
        // over, so the extra pixels a drag adds have to widen the table (and make
        // it scroll) instead of being taken out of somebody else's share.
        const frozen = this.widths.size > 0;
        const flexible = frozen ? 0 : this.columns.filter((_column, index) => resolved(index) === undefined).length;

        const selectCell = this.root.querySelector<HTMLElement>(".mac-table__cell--select");
        const selectWidth = selectCell ? selectCell.getBoundingClientRect().width : 0;

        let floor = 0;
        // The floor belongs to the data cell, not the header: `min-width` is
        // declared on `.mac-table__cell` only, so reading it off a `th` yielded
        // `auto` → 0 and the "floor" degraded to the padding. Flexible columns
        // then shrank to 44px and the table fitted its box instead of scrolling.
        // The select column is skipped because it is narrow on purpose.
        const sample =
            this.root.querySelector<HTMLElement>(".mac-table__cell:not(.mac-table__cell--select)") ??
            this.root.querySelector<HTMLElement>(".mac-table__th");
        if (sample) {
            const style = getComputedStyle(sample);
            floor =
                (parseFloat(style.minWidth) || 0) +
                (parseFloat(style.paddingLeft) || 0) +
                (parseFloat(style.paddingRight) || 0);
        }

        const available = Math.max(0, this.scroll.clientWidth - selectWidth);
        const share =
            flexible > 0 ? Math.max(floor, (available - declared) / flexible) : 0;

        table.style.width = `${Math.ceil(declared + share * flexible + selectWidth)}px`;
    }

    // --- column resizing -----------------------------------------------------

    /** The narrowest a column may be dragged: wide enough for a sort chevron. */
    private static readonly MIN_WIDTH = 56;

    /**
     * Freeze the current geometry and hang a drag handle off every header.
     *
     * Runs once, on the first frame after layout: the widths have to be measured
     * from the rendered table, because until then a `table-layout: fixed` table
     * with no widths knows nothing about how wide its columns want to be.
     */
    private enableResizing(): void {
        const cols = [...this.root.querySelectorAll<HTMLTableColElement>(".mac-table__col")];
        const offset = this.selectable ? 1 : 0;

        this.columns.forEach((column, index) => {
            const col = cols[index + offset];
            if (!col) return;
            const width = Math.round(col.getBoundingClientRect().width);
            if (width <= 0) return;
            this.naturalWidths.set(index, width);
            // The action column stays content-sized: its buttons decide it, and a
            // frozen width would clip the second one the moment a row grew one.
            if (column.actions) return;
            this.widths.set(index, width);
        });

        if (this.widths.size === 0) return;

        this.applyFixedWidths();
        this.buildResizers();
    }

    /** A separator between two columns, dragged or stepped with the arrow keys. */
    private buildResizers(): void {
        const cells = [...this.root.querySelectorAll<HTMLTableCellElement>(".mac-table__th")];

        cells.forEach((cell) => {
            const index = Number(cell.dataset.col);
            if (!Number.isFinite(index)) return;
            if (!this.widths.has(index)) return;

            const handle = el("span", {
                class: "mac-table__resizer",
                role: "separator",
                "aria-orientation": "vertical",
                tabindex: "0",
                "aria-label": `调整「${this.columns[index].title}」列宽`,
                "aria-valuemin": String(Table.MIN_WIDTH),
                "aria-valuenow": String(this.widths.get(index)),
            });
            handle.dataset.col = String(index);

            this.listen(handle, "pointerdown", (event) => this.onResizeStart(event, handle, index));
            this.listen(handle, "pointermove", (event) => this.onResizeMove(event));
            this.listen(handle, "pointerup", (event) => this.onResizeEnd(event, handle));
            this.listen(handle, "pointercancel", (event) => this.onResizeEnd(event, handle));
            this.listen(handle, "keydown", (event) => this.onResizeKey(event, handle, index));
            // Double click puts the column back to the width it had before anyone
            // touched it — the same gesture macOS uses on a column divider.
            this.listen(handle, "dblclick", (event) => {
                event.preventDefault();
                const natural = this.naturalWidths.get(index);
                if (natural === undefined) return;
                this.resizeTo(index, natural, handle);
                this.reportResize(index);
            });

            cell.appendChild(handle);
        });
    }

    private onResizeStart(event: PointerEvent, handle: HTMLElement, index: number): void {
        // The header is a sort surface; a pointer that landed on the divider is
        // not a click on the column.
        event.preventDefault();
        event.stopPropagation();
        const current = this.widths.get(index);
        if (current === undefined) return;

        this.gesture = {index, startX: event.clientX, startWidth: current};
        // Capture on the handle, not on the document: a drag that leaves the table
        // still belongs to this gesture, and `pointerup` outside the window ends it
        // through `pointercancel`.
        handle.setPointerCapture(event.pointerId);
        handle.classList.add("is-dragging");
        this.toggleClass("is-resizing", true);
    }

    private onResizeMove(event: PointerEvent): void {
        const gesture = this.gesture;
        if (!gesture) return;
        // `clientX` grows to the right in both directions, so a mirrored document
        // has to subtract instead: the start edge of a column is on the right in
        // RTL, and dragging it further right has to make the column narrower.
        const sign = getComputedStyle(this.root).direction === "rtl" ? -1 : 1;
        const delta = (event.clientX - gesture.startX) * sign;
        this.resizeTo(gesture.index, gesture.startWidth + delta, this.resizerFor(gesture.index));
    }

    private onResizeEnd(event: PointerEvent, handle: HTMLElement): void {
        if (!this.gesture) return;
        const index = this.gesture.index;
        this.gesture = null;
        handle.classList.remove("is-dragging");
        this.toggleClass("is-resizing", false);
        try { handle.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        this.reportResize(index);
    }

    private onResizeKey(event: KeyboardEvent, handle: HTMLElement, index: number): void {
        const current = this.widths.get(index);
        if (current === undefined) return;

        const step = event.shiftKey ? 1 : 8;
        const forward = getComputedStyle(this.root).direction === "rtl" ? -1 : 1;
        let next: number | null = null;

        if (event.key === "ArrowRight") next = current + step * forward;
        else if (event.key === "ArrowLeft") next = current - step * forward;
        else if (event.key === "Home") next = this.naturalWidths.get(index) ?? current;

        if (next === null) return;
        event.preventDefault();
        this.resizeTo(index, next, handle);
        this.reportResize(index);
    }

    /** Write one width through to the `<col>` and the table's total width. */
    private resizeTo(index: number, width: number, handle: HTMLElement | null): void {
        const clamped = Math.max(Table.MIN_WIDTH, Math.round(width));
        if (this.widths.get(index) === clamped) return;

        this.widths.set(index, clamped);
        this.applyFixedWidths();
        this.applyPinnedOffsets();
        if (handle) handle.setAttribute("aria-valuenow", String(clamped));
    }

    private reportResize(index: number): void {
        const width = this.widths.get(index);
        if (width === undefined) return;
        this.onColumnResize?.(this.columns[index].key, width);
    }

    private resizerFor(index: number): HTMLElement | null {
        return this.root.querySelector<HTMLElement>(`.mac-table__resizer[data-col="${index}"]`);
    }

    /**
     * Natural width of one actions column, measured without the cell's say.     *
     * `scrollWidth` on the button group does not answer this: the buttons carry
     * `flex: 0 0 auto`, so they keep their width and overflow the group instead of
     * shrinking, and a flex container with `overflow: visible` still reports its
     * own box as `scrollWidth` — the overflow is invisible to that measurement.
     * Reading it froze the column at whatever width the first render happened to
     * give it, so a later `setRows()` with more buttons could never widen it.
     *
     * Summing the children is exact in both directions: an un-shrinkable child's
     * own width is its content width, whether or not the cell has room for it.
     * The cell's padding is added here rather than taken from a sample cell —
     * a select column is padded differently, and sampling the table's first cell
     * undercounted the column on any selectable table.
     */
    private measureActions(columnIndex: number): number {
        let widest = 0;

        for (const group of this.root.querySelectorAll<HTMLElement>(
            `tbody td[data-col="${columnIndex}"] .mac-table__actions`,
        )) {
            const buttons = group.querySelectorAll<HTMLElement>(".mac-button");
            if (buttons.length === 0) continue;

            const gap = parseFloat(getComputedStyle(group).columnGap) || 0;
            let total = gap * (buttons.length - 1);
            for (const button of buttons) {
                total += button.getBoundingClientRect().width;
            }

            const cell = group.closest<HTMLElement>(".mac-table__cell");
            if (cell) {
                const style = getComputedStyle(cell);
                total += (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
            }

            widest = Math.max(widest, total);
        }

        return widest;
    }

    /**
     * Push the pinned columns to their edge and stack their offsets.
     *
     * Widths come from the header cells: with automatic table layout the header
     * and body share one column geometry, and the header always exists even when
     * the body is empty. Offsets are written as `left`/`right` on every cell of
     * the column, because `position: sticky` needs a distinct inset per column
     * once more than one is pinned to the same edge.
     */
    private applyPinnedOffsets(): void {
        if (!this.columns.some((column) => column.pinned)) return;

        const headerCells = Array.from(
            this.root.querySelectorAll<HTMLElement>(".mac-table__th[data-pin]"),
        );
        if (headerCells.length === 0) return;

        const widths = new Map<number, number>();
        for (const cell of headerCells) {
            widths.set(Number(cell.dataset.col), cell.getBoundingClientRect().width);
        }

        const offsets = new Map<number, number>();

        // Right edge: accumulate from the rightmost pinned column leftwards, so
        // the last column sits flush against the edge.
        let right = 0;
        const rightPinned = this.columns
            .map((column, index) => ({column, index}))
            .filter((entry) => entry.column.pinned === "right")
            .sort((a, b) => b.index - a.index);
        for (const {index} of rightPinned) {
            offsets.set(index, right);
            right += widths.get(index) ?? 0;
        }

        // Left edge: accumulate from the leftmost outwards.
        let left = 0;
        const leftPinned = this.columns
            .map((column, index) => ({column, index}))
            .filter((entry) => entry.column.pinned === "left")
            .sort((a, b) => a.index - b.index);
        for (const {index} of leftPinned) {
            offsets.set(index, left);
            left += widths.get(index) ?? 0;
        }

        for (const cell of this.root.querySelectorAll<HTMLElement>("[data-pin]")) {
            const index = Number(cell.dataset.col);
            const offset = offsets.get(index);
            if (offset === undefined) continue;
            if (cell.dataset.pin === "right") cell.style.right = `${offset}px`;
            else cell.style.left = `${offset}px`;
        }
    }

    /**
     * Replace the row data.
     *
     * Existing selection is kept for keys that still exist and dropped for
     * keys that do not; like every setter in the kit, this does not raise
     * `onSelectionChange`.
     */
    setRows(rows: any[]): void {
        const live = new Set<string>();
        rows.forEach((row, index) => live.add(this.rowKey(row, index)));

        for (const key of Array.from(this.selected)) {
            if (!live.has(key)) this.selected.delete(key);
        }

        this.rows = rows;
        this.renderRows();
    }

    /** Keys of the selected rows, in the order they were selected. */
    get selectedKeys(): string[] {
        return Array.from(this.selected);
    }

    /** Drop the selection without raising `onSelectionChange`. */
    clearSelection(): void {
        if (this.selected.size === 0) return;
        this.selected.clear();
        this.syncRowChecks();
        this.syncHeaderCheck();
    }

    /** Rows after filtering and sorting, in the order the body shows them. */
    get visibleRows(): any[] {
        return this.computeRows().map((entry) => entry.row);
    }

    /** The active sort, or null when the table shows the order the data arrived in. */
    get sort(): TableSort | null {
        return this.sortState ? {...this.sortState} : null;
    }

    /**
     * Sort by a column key. Silent, like every setter in the kit.
     *
     * Pass `null` to restore the source order. The key does not have to belong
     * to a `sortable` column: the button is the affordance, not a restriction.
     */
    setSort(sort: TableSort | null): void {
        const next = sort ? {key: sort.key, direction: sort.direction} : null;
        const same =
            this.sortState === null || next === null
                ? this.sortState === next
                : this.sortState.key === next.key && this.sortState.direction === next.direction;
        if (same) return;

        this.sortState = next;
        this.renderRows();
    }

    /** The active row test, or null when every row shows. */
    get filter(): ((row: any, index: number) => boolean) | null {
        return this.filterState;
    }

    /** Replace the row test. Silent; the argument is the function itself. */
    setFilter(filter: ((row: any, index: number) => boolean) | null): void {
        if (this.filterState === filter) return;
        this.filterState = filter;
        this.renderRows();
    }

    // --- construction --------------------------------------------------------

    /** `<col>` per column, so `width` is only ever a hint on one element. */
    private makeColGroup(): HTMLTableColElement {
        const group = el("colgroup", {class: "mac-table__cols"});

        if (this.selectable) {
            group.appendChild(el("col", {class: "mac-table__col mac-table__col--select"}));
        }

        for (const column of this.columns) {
            const col = el("col", {class: "mac-table__col"});
            if (column.width !== undefined) {
                // Widths come from the caller's data model (column sizing is
                // content, like `render`), not from the design tokens.
                col.style.width = `${column.width}px`;
            }
            group.appendChild(col);
        }

        return group;
    }

    private makeHeaderRow(): HTMLTableRowElement {
        const row = el("tr", {class: "mac-table__row"});

        if (this.selectable) {
            const cell = el("th", {class: "mac-table__th mac-table__th--select", scope: "col"});
            const check = el("input", {
                class: "mac-table__checkbox",
                type: "checkbox",
                "aria-label": "全选",
            });

            // `indeterminate` only exists as a property, so it cannot ride
            // along in the `el` call above.
            this.headerCheck = check;
            this.listen(check, "change", () => this.toggleAll(check.checked));

            cell.appendChild(check);
            row.appendChild(cell);
        }

        this.columns.forEach((column, columnIndex) => {
            row.appendChild(this.makeHeaderCell(column, columnIndex));
        });

        return row;
    }

    /**
     * One header cell — a plain label, or a sort button when the column sorts.
     *
     * The button sits *inside* the `th` rather than replacing it: the cell keeps
     * the column association screen readers rely on, and `aria-sort` is a
     * property of the header, not of the control that changes it.
     */
    private makeHeaderCell(column: TableColumn, columnIndex: number): HTMLTableCellElement {
        const cell = el("th", {
            class: `mac-table__th${alignClass(column.align)}`,
            scope: "col",
        });
        // Always addressable by index: the resizer and the pinned offsets both find
        // their column through it, and a column can be pinned and resized at once.
        cell.dataset.col = String(columnIndex);
        if (column.pinned) {
            cell.dataset.pin = column.pinned;
        }

        if (!column.sortable) {
            cell.textContent = column.title;
            return cell;
        }

        cell.classList.add("mac-table__th--sortable");
        // Keyed by column key rather than by index: the indicator pass has to
        // find its cell again after any rebuild, and columns are allowed to
        // move between renders.
        cell.dataset.sortKey = column.key;

        const button = el("button", {class: "mac-table__sort", type: "button"});
        const label = el("span", {class: "mac-table__sort-label", text: column.title});
        const arrow = svgIcon(SORT_CHEVRON, 10);
        arrow.classList.add("mac-table__sort-arrow");
        button.append(label, arrow);
        cell.appendChild(button);

        return cell;
    }

    // --- rendering -----------------------------------------------------------

    /** Rebuild the whole body in one insertion. */
    private renderRows(): void {
        const fragment = document.createDocumentFragment();

        this.rowChecks = [];
        this.rowKeys = [];

        const visible = this.computeRows();
        if (visible.length === 0) {
            fragment.appendChild(this.makeEmptyRow());
        } else {
            for (const entry of visible) {
                fragment.appendChild(this.makeRow(entry.row, entry.index));
            }
        }

        this.body.replaceChildren(fragment);
        this.syncHeaderCheck();
        this.syncSortIndicators();
        // New cells carry no offsets and the actions group may be a different
        // width than last time, so both passes run again now that they exist.
        requestAnimationFrame(() => {
            this.applyFixedWidths();
            this.applyPinnedOffsets();
        });
    }

    private makeRow(row: any, index: number): HTMLTableRowElement {
        const key = this.rowKey(row, index);
        this.rowKeys.push(key);

        const tr = el("tr", {
            class: `mac-table__row${this.selected.has(key) ? " is-selected" : ""}`,
            dataset: {key},
        });

        if (this.selectable) {
            const cell = el("td", {class: "mac-table__cell mac-table__cell--select"});
            const check = el("input", {
                class: "mac-table__checkbox",
                type: "checkbox",
                "aria-label": "选择此行",
                checked: this.selected.has(key),
            });

            this.rowChecks.push(check);
            cell.appendChild(check);
            tr.appendChild(cell);
        }

        this.columns.forEach((column, columnIndex) => {
            tr.appendChild(this.makeCell(column, columnIndex, row, index));
        });

        return tr;
    }

    private makeCell(
        column: TableColumn,
        columnIndex: number,
        row: any,
        index: number,
    ): HTMLTableCellElement {
        const cell = el("td", {class: `mac-table__cell${alignClass(column.align)}`});
        // The column index is on every cell: pinned offsets need it, and so does
        // the actions column sizing pass.
        cell.dataset.col = String(columnIndex);
        if (column.pinned) cell.dataset.pin = column.pinned;
        const value = row?.[column.key];

        // An action column is a row of buttons; `actions` is `render` for the
        // shape almost every table ends up writing by hand.
        if (column.actions) {
            const group = el("div", {class: "mac-table__actions"});
            for (const action of column.actions(row, index)) {
                const disabled =
                    typeof action.disabled === "function"
                        ? action.disabled(row)
                        : (action.disabled ?? false);
                const button = new Button({
                    label: action.label,
                    variant: action.variant ?? "default",
                    size: "small",
                    disabled,
                    onClick: () => action.onClick(row),
                });
                if (action.ariaLabel) {
                    button.element.setAttribute("aria-label", action.ariaLabel);
                }
                group.appendChild(button.element);
            }
            cell.appendChild(group);
            return cell;
        }

        if (column.render) {
            // `append` takes a Node or a string, so a renderer can return
            // either rich UI or plain text without the table knowing which.
            // Text goes in a wrapper so truncation applies to the text rather
            // than to the cell, which would also clip a popover a cell holds.
            const rendered = column.render(value, row, index);
            if (typeof rendered === "string") {
                cell.appendChild(el("span", {class: "mac-table__text", text: rendered}));
            } else {
                append(cell, [rendered]);
            }
            return cell;
        }

        if (value !== null && value !== undefined) {
            cell.appendChild(el("span", {class: "mac-table__text", text: String(value)}));
        }

        return cell;
    }

    private makeEmptyRow(): HTMLTableRowElement {
        const row = el("tr", {class: "mac-table__row mac-table__row--empty"});
        const span = this.columns.length + (this.selectable ? 1 : 0);
        const cell = el("td", {
            class: "mac-table__cell mac-table__empty",
            colSpan: Math.max(1, span),
        });

        // "Nothing here yet" and "nothing matched" are different messages, and
        // telling them apart is the difference between adding a row and
        // loosening the filter. The filter wording only applies when there was
        // something to hide.
        cell.textContent = this.rows.length > 0 ? this.filterEmptyText : this.emptyText;
        row.appendChild(cell);
        return row;
    }

    /**
     * Rows in display order, each paired with its index in the source array.
     *
     * The source index travels with the row through filtering and sorting
     * because every callback — `rowKey`, `render`, `actions`, `filter` — is
     * documented to receive it. A row keeps its identity across a sort, so it
     * must keep its index too; otherwise a table without `rowKey` would
     * renumber itself, and renumber its selection, on every header click.
     */
    private computeRows(): {row: any; index: number}[] {
        const entries: {row: any; index: number; value?: unknown}[] = [];
        for (let index = 0; index < this.rows.length; index += 1) {
            const row = this.rows[index];
            if (this.filterState && !this.filterState(row, index)) continue;
            entries.push({row, index});
        }

        const sort = this.sortState;
        if (!sort) return entries;

        const column = this.columns.find((candidate) => candidate.key === sort.key);
        // A stale sort key — `setColumns` is not a thing, but `rows` can arrive
        // before the column list makes sense — falls back to the source order
        // instead of throwing away the whole render.
        if (!column) return entries;

        const read = column.sortValue ?? ((row: any) => row?.[column.key]);
        // Read once per row, not once per comparison: `sortValue` is caller code
        // and may format or compute, which does not belong in a comparator that
        // runs O(n log n) times.
        for (const entry of entries) entry.value = read(entry.row);

        const direction = sort.direction === "ascending" ? 1 : -1;

        entries.sort((a, b) => {
            const aEmpty = a.value === null || a.value === undefined;
            const bEmpty = b.value === null || b.value === undefined;

            // Empty cells sink in both directions. "No value" is not a value to
            // be ordered, and flipping it to the top on a descending sort would
            // bury every row the reader just asked to see first.
            if (aEmpty || bEmpty) {
                if (aEmpty && bEmpty) return a.index - b.index;
                return aEmpty ? 1 : -1;
            }

            const order = compareValues(a.value, b.value);
            // An unorderable pair (`NaN`, infinity) counts as a tie, and ties
            // fall back to the source order — that is what keeps this stable.
            if (!Number.isFinite(order) || order === 0) return a.index - b.index;
            return order * direction;
        });

        return entries;
    }

    // --- sorting -------------------------------------------------------------

    /** Delegated from the header, which outlives every body it describes. */
    private onHeadClick(event: Event): void {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const button = target.closest<HTMLElement>(".mac-table__sort");
        if (!button) return;

        const key = button.closest<HTMLElement>(".mac-table__th")?.dataset.sortKey;
        if (key !== undefined) this.cycleSort(key);
    }

    /**
     * Ascending → descending → unsorted.
     *
     * The third state is the point: a two-state toggle reorders every table the
     * first time someone clicks a header out of curiosity, with no way back to
     * the order the data was authored in.
     */
    private cycleSort(key: string): void {
        const current = this.sortState;
        let next: TableSort | null;
        if (!current || current.key !== key) next = {key, direction: "ascending"};
        else if (current.direction === "ascending") next = {key, direction: "descending"};
        else next = null;

        this.sortState = next;
        this.renderRows();
        this.onSortChange?.(next ? {...next} : null);
    }

    /**
     * Mirror `sortState` onto the header: `aria-sort` and the arrow.
     *
     * Runs on every render rather than only after a click, so a `setSort()` from
     * code and a `sort` option read at construction land in the same state as a
     * clicked one.
     */
    private syncSortIndicators(): void {
        const active = this.sortState;

        for (const cell of this.root.querySelectorAll<HTMLElement>(".mac-table__th--sortable")) {
            const sorted = active !== null && cell.dataset.sortKey === active.key;
            cell.setAttribute("aria-sort", active && sorted ? active.direction : "none");
            cell.classList.toggle("is-sorted", sorted);
            cell.classList.toggle(
                "is-descending",
                active !== null && sorted && active.direction === "descending",
            );
        }
    }

    // --- selection -----------------------------------------------------------

    private onBodyChange(event: Event): void {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains("mac-table__checkbox")) return;

        const row = target.closest<HTMLTableRowElement>(".mac-table__row");
        const key = row?.dataset.key;
        if (key === undefined) return;

        if (target.checked) this.selected.add(key);
        else this.selected.delete(key);

        row?.classList.toggle("is-selected", target.checked);
        this.syncHeaderCheck();
        this.emitSelection();
    }

    /** Header box: check selects everything, uncheck clears everything. */
    private toggleAll(checked: boolean): void {
        this.selected.clear();
        if (checked) {
            for (const key of this.rowKeys) this.selected.add(key);
        }

        this.syncRowChecks();
        this.syncHeaderCheck();
        this.emitSelection();
    }

    private syncRowChecks(): void {
        this.rowChecks.forEach((check, index) => {
            const selected = this.selected.has(this.rowKeys[index]);
            if (check.checked !== selected) check.checked = selected;
            const row = check.closest<HTMLTableRowElement>(".mac-table__row");
            row?.classList.toggle("is-selected", selected);
        });
    }

    /** Header box state: unchecked, checked, or the mixed dash. */
    private syncHeaderCheck(): void {
        const check = this.headerCheck;
        if (!check) return;

        const total = this.rowKeys.length;
        let selected = 0;
        for (const key of this.rowKeys) {
            if (this.selected.has(key)) selected += 1;
        }

        check.disabled = total === 0;
        check.checked = total > 0 && selected === total;
        // `indeterminate` has no attribute form; it must be written as a
        // property, and only when it actually changes (a no-op write would
        // still reset the browser's paint state on some engines).
        const mixed = selected > 0 && selected < total;
        if (check.indeterminate !== mixed) check.indeterminate = mixed;
    }

    private emitSelection(): void {
        this.onSelectionChange?.(Array.from(this.selected));
    }
}
