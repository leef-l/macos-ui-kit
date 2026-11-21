import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./list.css";

export interface ListItem {
    /** Reported to `onSelect`; also the identity used to match `value`. */
    value: string;
    /** The visible text. */
    label: string;
    /** Trailing secondary text in tertiary ink — a date, a size, a path. */
    detail?: string;
    /** Leading SVG path data in the kit's 24×24 viewBox; drawn at 16px. */
    icon?: string;
    /** Short trailing marker: a count, or a state such as "新建". */
    badge?: string;
    disabled?: boolean;
    /** Heading this row sits under. Ignored when `showSections` is false. */
    section?: string;
}

/** How many rows may be selected at once. */
export type ListSelection = "single" | "multiple" | "none";

export interface ListOptions {
    items: ListItem[];
    /** Initially selected value, or the initial values for `multiple`. */
    value?: string | string[];
    /** Selection model. Default `single`. */
    selection?: ListSelection;
    /**
     * Draw a heading above each run of rows that shares a `section`. Default
     * true; when false `section` is ignored and the rows render flat.
     */
    showSections?: boolean;
    /** Accessible name for the listbox, since a list has no visible label. */
    ariaLabel?: string;
    /** Fires after a user-driven change; every setter stays silent. */
    onSelect?: (value: string | string[]) => void;
}

/**
 * A macOS list box: rows, optional section headings, one or many selected.
 *
 * Not a `<select multiple>`: that control cannot render an icon, a trailing
 * detail or a heading, and its own model (Ctrl+Click only, no roving focus) is
 * the Windows one rather than the macOS one. The ARIA listbox pattern is used
 * instead — `role="listbox"` with `role="option"` children carrying
 * `aria-selected`, and a roving `tabindex` so Tab enters the list once instead
 * of once per row.
 *
 * Rows are `<div role="option">`, not `<button>`: a button inside a listbox is
 * announced as a button, and its native Space activation would fire on keydown
 * *and* keyup and fight the listbox key map. For the same reason they carry
 * `aria-disabled` — an option has no native `disabled` attribute to set, and a
 * disabled row stays focusable so arrows can pass over it without the tab stop
 * disappearing.
 */
export class List extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly box: HTMLDivElement;
    private readonly onSelect?: (value: string | string[]) => void;

    private entries: ListItem[];
    private mode: ListSelection;
    private showSections: boolean;

    /**
     * Selected values. Ordering is decided when the value is reported, not
     * here: a set makes toggling cheap and document order comes from the rows.
     */
    private readonly selected = new Set<string>();

    /** Row elements in document order. Headings are deliberately not included. */
    private rows: HTMLDivElement[] = [];

    /** The one row that owns the list's single tab stop. */
    private anchor: HTMLDivElement | null = null;

    constructor(options: ListOptions) {
        super();

        this.entries = options.items;
        this.mode = options.selection ?? "single";
        this.showSections = options.showSections ?? true;
        this.onSelect = options.onSelect;

        this.root = el("div", {class: "mac-list"});

        this.box = el("div", {
            class: "mac-list__box",
            role: "listbox",
            "aria-multiselectable": String(this.mode === "multiple"),
        });
        if (options.ariaLabel) this.box.setAttribute("aria-label", options.ariaLabel);

        this.root.appendChild(this.box);

        // Delegated from the box, which outlives every row: re-rendering the
        // list never re-binds anything.
        this.listen(this.box, "click", (event) => this.onClick(event));
        this.listen(this.box, "keydown", (event) => this.onKeyDown(event));
        // A row becomes the tab stop as soon as focus lands on it, including
        // when the pointer put it there.
        this.listen(this.box, "focusin", (event) => {
            const row = this.rowFrom(event.target);
            if (!row) return;
            this.anchor = row;
            this.syncAnchor();
        });

        this.render();
        // Through `applySelection` rather than straight into the set: the
        // initial value has to obey the selection model like every later one.
        this.applySelection(toArray(options.value));
    }

    /** The selection: an array in `multiple`, a string otherwise (`""` for `none`). */
    get value(): string | string[] {
        return this.reportValue();
    }

    /** A copy of the rows, so a caller cannot mutate the rendered model. */
    get items(): ListItem[] {
        return this.entries.slice();
    }

    /** How many rows may be selected at once. */
    get selection(): ListSelection {
        return this.mode;
    }

    /**
     * Replace the rows.
     *
     * The selection survives for values that still exist and is dropped for
     * values that do not, the way `Table.setRows` treats its keys. Silent.
     */
    setItems(items: ListItem[]): void {
        this.entries = items;
        this.render();
    }

    /**
     * Set the selection programmatically. Silent, and values that are not in
     * the list are ignored rather than painted as a selection with no row.
     */
    setValue(value: string | string[]): void {
        this.applySelection(toArray(value));
    }

    /**
     * Switch the selection model. Silent.
     *
     * Narrowing to `single` keeps the first selected row in document order and
     * drops the rest — leaving three rows marked in a control that now promises
     * one would contradict every later report — and `none` clears the selection.
     */
    setSelection(mode: ListSelection): void {
        if (this.mode === mode) return;
        this.mode = mode;
        this.box.setAttribute("aria-multiselectable", String(mode === "multiple"));

        const kept = this.selectedValues();
        this.applySelection(mode === "multiple" ? kept : kept.slice(0, 1));
    }

    /** Move focus to the selected row, or to the first selectable one. */
    focus(): void {
        this.anchor?.focus();
    }

    // --- rendering -----------------------------------------------------------

    /** Rebuild the list in one insertion, then re-establish the tab stop. */
    private render(): void {
        const fragment = document.createDocumentFragment();
        this.rows = [];

        // A value whose row is gone must not survive as a ghost selection, or it
        // would reappear the moment a later `setItems` brings the value back.
        const live = new Set(this.entries.map((item) => item.value));
        for (const value of Array.from(this.selected)) {
            if (!live.has(value)) this.selected.delete(value);
        }

        let lastSection: string | undefined;

        for (const item of this.entries) {
            const heading = this.showSections ? item.section : undefined;
            if (heading !== undefined && heading !== lastSection) {
                fragment.appendChild(
                    el("div", {
                        class: "mac-list__section",
                        role: "presentation",
                        text: heading,
                    }),
                );
            }
            lastSection = heading;

            const row = this.makeRow(item);
            this.rows.push(row);
            fragment.appendChild(row);
        }

        this.box.replaceChildren(fragment);

        // The rows are new elements, so the previous anchor is detached.
        this.anchor = null;
        this.syncRows();
        this.syncAnchor();
    }

    private makeRow(item: ListItem): HTMLDivElement {
        const row = el("div", {
            class: "mac-list__row",
            role: "option",
            "aria-selected": String(this.selected.has(item.value)),
            "aria-disabled": item.disabled ? "true" : undefined,
            tabindex: -1,
            dataset: {value: item.value},
        });

        if (item.icon) row.appendChild(svgIcon(item.icon, 16));
        row.appendChild(el("span", {class: "mac-list__label", text: item.label}));
        // Truthy, not `!== undefined`: an empty string would still add a gap.
        if (item.detail) {
            row.appendChild(el("span", {class: "mac-list__detail", text: item.detail}));
        }
        if (item.badge) {
            row.appendChild(el("span", {class: "mac-list__badge", text: item.badge}));
        }

        return row;
    }

    /** Mirror the selected set into the rows. */
    private syncRows(): void {
        for (const row of this.rows) {
            const value = row.dataset.value;
            const on = value !== undefined && this.selected.has(value);
            row.classList.toggle("is-selected", on);
            row.setAttribute("aria-selected", String(on));
        }
    }

    /**
     * Give exactly one row `tabindex="0"`.
     *
     * Preference order is the selected row, then the first selectable row, then
     * whatever is left: a list whose rows are all disabled still needs one tab
     * stop, or the control would vanish from the keyboard order entirely.
     */
    private syncAnchor(): void {
        if (!this.anchor || !this.rows.includes(this.anchor)) {
            this.anchor =
                this.rows.find((row) => this.isEnabled(row) && row.classList.contains("is-selected")) ??
                this.rows.find((row) => this.isEnabled(row)) ??
                this.rows[0] ??
                null;
        }

        for (const row of this.rows) {
            row.tabIndex = row === this.anchor ? 0 : -1;
        }
    }

    // --- selection -----------------------------------------------------------

    /**
     * Replace the selection.
     *
     * `notify` is true only for a user-driven change, so `setItems`, `setValue`
     * and `setSelection` stay silent — the contract every setter in the kit
     * follows. A change that would leave the selection as it is never reports.
     */
    private applySelection(values: string[], notify = false): void {
        const allowed = new Set(this.mode === "none" ? [] : values);
        const next = new Set<string>();

        // Built in document order, which also fixes the reported order in
        // `multiple` to the list's order rather than the click order. In
        // `single` the first match wins, so a caller passing two values gets a
        // stable, predictable one instead of whichever came last.
        for (const row of this.rows) {
            const value = row.dataset.value;
            if (value === undefined || !allowed.has(value)) continue;
            next.add(value);
            if (this.mode === "single") break;
        }

        const changed =
            next.size !== this.selected.size ||
            Array.from(next).some((value) => !this.selected.has(value));

        this.selected.clear();
        for (const value of next) this.selected.add(value);
        this.syncRows();

        if (changed && notify) this.onSelect?.(this.reportValue());
    }

    /** Selected values in document order, independent of the selection model. */
    private selectedValues(): string[] {
        const values: string[] = [];
        for (const row of this.rows) {
            const value = row.dataset.value;
            if (value !== undefined && this.selected.has(value)) values.push(value);
        }
        return values;
    }

    /** The selection in the shape the model promises. */
    private reportValue(): string | string[] {
        const values = this.selectedValues();
        return this.mode === "multiple" ? values : (values[0] ?? "");
    }

    // --- input ---------------------------------------------------------------

    private onClick(event: MouseEvent): void {
        const row = this.rowFrom(event.target);
        if (!row || !this.isEnabled(row)) return;

        const value = row.dataset.value;
        if (value === undefined) return;

        // Cmd on macOS, Ctrl everywhere else: the platform modifier that extends
        // a selection instead of replacing it.
        const additive = event.metaKey || event.ctrlKey;
        if (this.mode === "multiple" && additive) this.toggle(value);
        else this.applySelection([value], true);

        this.anchor = row;
        this.syncAnchor();
    }

    private onKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.moveFocus(1);
                return;
            case "ArrowUp":
                event.preventDefault();
                this.moveFocus(-1);
                return;
            case "Home":
                event.preventDefault();
                this.jumpToEdge(1);
                return;
            case "End":
                event.preventDefault();
                this.jumpToEdge(-1);
                return;
            case " ":
            case "Enter": {
                const row = this.focusedRow();
                if (!row) return;
                event.preventDefault();
                this.activate(row);
                return;
            }
            default:
                return;
        }
    }

    /** Move the focus one enabled row up or down; stops at both ends. */
    private moveFocus(direction: 1 | -1): void {
        const from = this.focusedRow() ?? this.anchor;
        const index = from ? this.rows.indexOf(from) : -1;
        const next = this.walk(index, direction);
        if (!next) return;
        this.focusRow(next);
    }

    /** Jump to the first (direction 1) or last (-1) enabled row. */
    private jumpToEdge(direction: 1 | -1): void {
        const next = this.walk(direction === 1 ? -1 : this.rows.length, direction);
        if (next) this.focusRow(next);
    }

    /**
     * First enabled row going `direction` from `from`.
     *
     * Section headings are skipped by construction: they are not in `rows`, so
     * they can never become a focus target or a landing spot for an arrow key.
     */
    private walk(from: number, direction: 1 | -1): HTMLDivElement | null {
        for (let index = from + direction; index >= 0 && index < this.rows.length; index += direction) {
            const row = this.rows[index];
            if (this.isEnabled(row)) return row;
        }
        return null;
    }

    private focusRow(row: HTMLDivElement): void {
        this.anchor = row;
        this.syncAnchor();
        row.focus();
    }

    /** Select the focused row: toggles in `multiple`, replaces otherwise. */
    private activate(row: HTMLDivElement): void {
        if (this.mode === "none" || !this.isEnabled(row)) return;
        const value = row.dataset.value;
        if (value === undefined) return;
        if (this.mode === "multiple") this.toggle(value);
        else this.applySelection([value], true);
    }

    private toggle(value: string): void {
        if (this.mode === "none") return;

        const next: string[] = [];
        for (const row of this.rows) {
            const each = row.dataset.value;
            if (each === undefined) continue;
            const on = each === value ? !this.selected.has(value) : this.selected.has(each);
            if (on) next.push(each);
        }

        this.applySelection(next, true);
    }

    // --- helpers -------------------------------------------------------------

    /** The row an event target sits in, or null when it is not one of ours. */
    private rowFrom(target: EventTarget | null): HTMLDivElement | null {
        if (!(target instanceof Element)) return null;
        const row = target.closest<HTMLDivElement>(".mac-list__row");
        return row && this.rows.includes(row) ? row : null;
    }

    private focusedRow(): HTMLDivElement | null {
        return this.rowFrom(document.activeElement);
    }

    private isEnabled(row: HTMLElement): boolean {
        return row.getAttribute("aria-disabled") !== "true";
    }
}

/** Normalise the two shapes `value` accepts into one list. */
function toArray(value: string | string[] | undefined): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}
