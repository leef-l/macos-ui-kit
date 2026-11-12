import {Component} from "../component";
import {append, el} from "../dom";
import {Button, type ButtonVariant} from "./button";
import "./table.css";

/** Horizontal alignment of a column's header and cells. */
export type TableAlign = "left" | "center" | "right";

/** One column definition. */
export interface TableColumn {
    /** Property name read from each row object. */
    key: string;
    /** Header label. */
    title: string;
    /** Fixed width in CSS pixels; columns without one share the rest. */
    width?: number;
    /** Alignment for the header and every cell in the column. Default `left`. */
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
     * Buttons for this cell — one set per row.
     *
     * `render` can already return a button, but every table that has an actions
     * column writes the same wrapper, so this states the shape once. Use one or
     * the other, not both: `actions` wins when present.
     */
    actions?: (row: any, index: number) => TableAction[];
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
    /** Text shown in place of rows when `rows` is empty. */
    emptyText?: string;
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

    private readonly columns: TableColumn[];
    private readonly rowKey: (row: any, index: number) => string;
    private readonly selectable: boolean;
    private readonly emptyText: string;
    private readonly onSelectionChange?: (keys: string[]) => void;

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

        for (const key of options.selectedKeys ?? []) {
            this.selected.add(key);
        }

        const classes = ["mac-table"];
        if (this.selectable) classes.push("mac-table--selectable");

        this.root = el("div", {class: classes.join(" ")});

        const scroll = el("div", {class: "mac-table__scroll"});
        const table = el("table", {class: "mac-table__table"});
        const head = el("thead", {class: "mac-table__head"});

        this.body = el("tbody", {class: "mac-table__body"});

        table.append(this.makeColGroup(), head, this.body);
        scroll.appendChild(table);
        this.root.appendChild(scroll);

        head.appendChild(this.makeHeaderRow());

        // One listener for every row checkbox, on an element that outlives the
        // rows themselves.
        this.listen(this.body, "change", (event) => this.onBodyChange(event));

        this.renderRows();
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

        for (const column of this.columns) {
            const cell = el("th", {
                class: `mac-table__th${alignClass(column.align)}`,
                scope: "col",
            });
            cell.textContent = column.title;
            row.appendChild(cell);
        }

        return row;
    }

    // --- rendering -----------------------------------------------------------

    /** Rebuild the whole body in one insertion. */
    private renderRows(): void {
        const fragment = document.createDocumentFragment();

        this.rowChecks = [];
        this.rowKeys = [];

        if (this.rows.length === 0) {
            fragment.appendChild(this.makeEmptyRow());
        } else {
            this.rows.forEach((row, index) => {
                fragment.appendChild(this.makeRow(row, index));
            });
        }

        this.body.replaceChildren(fragment);
        this.syncHeaderCheck();
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

        for (const column of this.columns) {
            tr.appendChild(this.makeCell(column, row, index));
        }

        return tr;
    }

    private makeCell(
        column: TableColumn,
        row: any,
        index: number,
    ): HTMLTableCellElement {
        const cell = el("td", {class: `mac-table__cell${alignClass(column.align)}`});
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
            append(cell, [column.render(value, row, index)]);
            return cell;
        }

        if (value !== null && value !== undefined) {
            cell.textContent = String(value);
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

        cell.textContent = this.emptyText;
        row.appendChild(cell);
        return row;
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
