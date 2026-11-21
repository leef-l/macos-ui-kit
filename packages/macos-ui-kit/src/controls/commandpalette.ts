import {Component} from "../component";
import {el, svgIcon, uid} from "../dom";
import {trapFocus} from "../overlay";
import "./commandpalette.css";

/** One command offered by the palette. */
export interface CommandItem {
    /** Reported to `onSelect`; also the identity used to match `value`. */
    value: string;
    /** The visible text, and the text the query is ranked against. */
    label: string;
    /** Heading this row sits under. Runs of rows sharing a group render together. */
    group?: string;
    /** Trailing secondary text: the pane a command lives in, a parameter hint. */
    hint?: string;
    /** Trailing keystroke badge, already formatted — "⌘K", "⇧⌘P". */
    shortcut?: string;
    /** Leading SVG path data in the kit's 24×24 viewBox; drawn at 14px. */
    icon?: string;
    /** Kept in the list but not runnable: still information, and still announced. */
    disabled?: boolean;
}

export interface CommandPaletteOptions {
    items: CommandItem[];
    /** Ghost text in the search field. Also its accessible name. Default `搜索命令…`. */
    placeholder?: string;
    /** Shown in place of the list when nothing matches. Default `没有匹配的命令`. */
    emptyText?: string;
    /**
     * Single key that opens the palette with Cmd (macOS) or Ctrl. Default `"k"`.
     * `null` turns the shortcut off, for a host that binds its own.
     */
    hotkey?: string | null;
    /** Accessible name for the dialog and the listbox. Default `命令面板`. */
    ariaLabel?: string;
    /** Fires with the chosen `value`, after the palette has closed. */
    onSelect?: (value: string) => void;
}

/** Query-to-label score, low wins. Ties keep the caller's order. */
const RANK_PREFIX = 0;
const RANK_WORD_START = 1;
const RANK_SUBSEQUENCE = 2;
/** No query typed yet: every command matches and nothing is highlighted. */
const RANK_EVERYTHING = 3;

/** Characters that begin a new word inside a command label. */
const WORD_BREAK = /[\s\-_/.:>·|]/;

/** Magnifier glyph, one path, matching the kit's 24×24 stroked icons. */
const SEARCH_GLYPH = "M10.5 4 a6.5 6.5 0 1 0 0 13 a6.5 6.5 0 1 0 0 -13 M15.4 15.4 L20 20";

interface Ranked {
    item: CommandItem;
    /** Position in the caller's `items`, which is the final tie-break. */
    order: number;
    rank: number;
    /** Indices into the label's code points that the query hit. */
    matches: number[];
}

/**
 * A macOS command palette: type to filter, arrows to move, Return to run.
 *
 * Three things decide whether this feels like the system palette or like a
 * search box with a list under it:
 *
 * 1. **It is a dialog, not a popover.** It dims the window, takes the keyboard
 *    and gives it back — so it reuses the dialog scrim layer and the dialog
 *    focus trap rather than inventing an overlay of its own.
 * 2. **Ranking is deterministic.** Prefix, then word-start, then subsequence,
 *    then the order the caller passed. A palette that reorders on every
 *    keystroke for reasons the user cannot see is unusable.
 * 3. **The query never leaves the field.** Focus stays in the input and the
 *    active row is reported through `aria-activedescendant`, which is the
 *    combobox pattern — the rows themselves are not tab stops.
 */
export class CommandPalette extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly dialog: HTMLDivElement;
    private readonly input: HTMLInputElement;
    private readonly list: HTMLDivElement;
    private readonly empty: HTMLDivElement;
    private readonly listId = uid("mac-commandpalette-list");

    private entries: CommandItem[];
    private hotkeyKey: string | null;
    private readonly onSelect?: (value: string) => void;

    private ranked: Ranked[] = [];
    private rows: HTMLDivElement[] = [];
    /** Index into `rows`, or -1 when nothing is highlighted. */
    private active = -1;

    private opened = false;
    private releaseFocus: (() => void) | null = null;
    /** Focus target to restore on close, captured before the scrim is appended. */
    private restoreTo: HTMLElement | null = null;

    constructor(options: CommandPaletteOptions) {
        super();

        this.entries = options.items;
        this.onSelect = options.onSelect;
        this.hotkeyKey = options.hotkey === null ? null : (options.hotkey ?? "k").toLowerCase();

        const ariaLabel = options.ariaLabel ?? "命令面板";

        // The root is the backdrop, because a palette is modal: it dims the
        // window and swallows the page underneath exactly like a dialog. The
        // scrim itself is *not* re-implemented here — `.mac-dialog__scrim`
        // already is that fixed inset-0 layer, its `--mac-scrim` wash, its 1100
        // stacking tier and its fade, so the palette wears that class and
        // commandpalette.css only overrides the alignment (a palette hangs from
        // the top, a dialog is centred).
        this.root = el("div", {class: "mac-dialog__scrim mac-commandpalette__backdrop"});

        this.dialog = el("div", {
            class: "mac-commandpalette",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": ariaLabel,
            tabindex: -1,
        });

        const placeholder = options.placeholder ?? "搜索命令…";

        // `role="combobox"` on the field with `aria-activedescendant` pointing at
        // the highlighted row: the query stays where the user is typing and the
        // row under the cursor is announced without focus ever leaving the field.
        this.input = el("input", {
            class: "mac-commandpalette__input",
            type: "text",
            role: "combobox",
            placeholder,
            "aria-label": placeholder,
            "aria-controls": this.listId,
            "aria-expanded": "false",
            "aria-autocomplete": "list",
            autocomplete: "off",
            spellcheck: false,
        });

        const searchIcon = svgIcon(SEARCH_GLYPH, 16);
        searchIcon.classList.add("mac-commandpalette__search-icon");

        this.list = el("div", {
            class: "mac-commandpalette__list",
            id: this.listId,
            role: "listbox",
            "aria-label": ariaLabel,
        });

        this.empty = el("div", {
            class: "mac-commandpalette__empty",
            text: options.emptyText ?? "没有匹配的命令",
            hidden: true,
        });

        this.dialog.appendChild(
            el("div", {class: "mac-commandpalette__search"}, searchIcon, this.input),
        );
        this.dialog.appendChild(this.list);
        this.dialog.appendChild(this.empty);
        this.root.appendChild(this.dialog);

        this.listen(this.input, "input", () => this.filter(this.input.value));

        // Delegated from the list, which outlives every row: re-filtering never
        // re-binds anything.
        this.listen(this.list, "mousemove", (event) => this.onHover(event));
        // Pressing on a row must not pull focus out of the field, or the next
        // keystroke would land on the button that was just clicked.
        this.listen(this.list, "mousedown", (event) => {
            if (this.rowFrom(event.target)) event.preventDefault();
        });
        this.listen(this.list, "click", (event) => this.onClick(event));

        // Outside press cancels, like every other modal in the kit.
        this.listen(this.root, "mousedown", (event) => {
            if (event.target === this.root) this.close();
        });

        // Document-level, because the palette is modal: while it is open nothing
        // else in the page may own a keystroke, and Escape has to work even if
        // focus slipped off the field.
        this.listen(document, "keydown", (event) => this.onKeyDown(event));

        // The global shortcut. One window listener for the palette's whole life —
        // `setHotkey` changes the key it compares against, not the binding.
        this.listen(window, "keydown", (event) => this.onHotkey(event));

        this.filter("");
    }

    /** Whether the palette is on screen. */
    get isOpen(): boolean {
        return this.opened;
    }

    /** Show the palette, focused and with an empty query. */
    open(): void {
        if (this.opened) return;
        this.opened = true;

        // Captured before the scrim enters the document, so it is still whatever
        // the user was working in.
        this.restoreTo = document.activeElement as HTMLElement | null;

        document.body.appendChild(this.root);

        // The same trap the dialogs use: it moves focus to the first focusable
        // (the search field), cycles Tab inside the dialog, and restores the
        // previously focused element when its disposer runs.
        this.releaseFocus = trapFocus(this.dialog);

        this.input.value = "";
        this.filter("");
        // Immediate, not on the next frame: the palette is opened by a keystroke,
        // and the character that follows must land in this field.
        this.input.focus();

        // One frame, so the initial (hidden) state is painted before the class
        // that transitions out of it — otherwise the fade is collapsed by the
        // style engine. Same approach as Dialog and Alert.
        requestAnimationFrame(() => {
            if (this.opened) this.root.classList.add("is-open");
        });
    }

    /** Dismiss the palette and hand focus back. */
    close(): void {
        if (!this.opened) return;
        this.opened = false;

        this.root.classList.remove("is-open");

        // Releases the trap's keydown listener and restores the element that had
        // focus before `open()`.
        this.releaseFocus?.();
        this.releaseFocus = null;

        // Removed synchronously rather than after the fade: a closed palette must
        // already be gone from the document, so a caller's `querySelector` — or a
        // later `destroy()` — never meets a half-dead backdrop.
        this.root.remove();

        // Belt and braces: if `trapFocus` was never established (a close during
        // the same frame as an open) the trap had nothing to restore.
        this.restoreTo?.focus();
        this.restoreTo = null;
    }

    /** Open when closed, close when open. */
    toggle(): void {
        if (this.opened) this.close();
        else this.open();
    }

    /** Replace the command list. Keeps the current query and re-ranks. */
    setItems(items: CommandItem[]): void {
        this.entries = items;
        this.filter(this.input.value);
    }

    /** Change the shortcut key, or `null` to disable it. Silent. */
    setHotkey(key: string | null): void {
        this.hotkeyKey = key === null ? null : key.toLowerCase();
    }

    override destroy(): void {
        if (this.isDestroyed) return;
        // An open palette owns a node in `document.body` and a live focus trap;
        // both have to go before the base class drops the listeners that close it.
        this.close();
        super.destroy();
    }

    // --- keyboard ------------------------------------------------------------

    /**
     * Cmd/Ctrl + the shortcut key.
     *
     * Ignored while the user is typing in a field outside the palette: a
     * shortcut typed into an editor is text, not a command, and stealing it
     * would cost the user the characters they were in the middle of writing.
     */
    private onHotkey(event: KeyboardEvent): void {
        if (this.hotkeyKey === null) return;
        if (event.repeat) return;
        if (!event.metaKey && !event.ctrlKey) return;
        if (event.key.toLowerCase() !== this.hotkeyKey) return;
        if (!this.opened && this.isTypingOutside(event.target)) return;

        event.preventDefault();
        this.toggle();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.opened) return;

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.step(1);
                return;
            case "ArrowUp":
                event.preventDefault();
                this.step(-1);
                return;
            case "Home":
                event.preventDefault();
                this.jump(1);
                return;
            case "End":
                event.preventDefault();
                this.jump(-1);
                return;
            case "Enter": {
                // The active row runs. While the query is being edited the field
                // is empty of a form, so Return has nothing else to mean.
                event.preventDefault();
                this.run(this.active);
                return;
            }
            case "Escape":
                event.preventDefault();
                this.close();
                return;
            default:
                // Tab is deliberately absent: the focus trap owns it.
                return;
        }
    }

    /** Move the highlight one enabled row, wrapping at both ends. */
    private step(direction: 1 | -1): void {
        const count = this.rows.length;
        if (count === 0) return;

        // From "nothing active", Down starts at the top and Up at the bottom, so
        // the first press always lands on a row.
        const base = this.active < 0 ? (direction === 1 ? count - 1 : 0) : this.active;

        for (let offset = 1; offset <= count; offset += 1) {
            const index = (base + direction * offset + count) % count;
            if (this.isEnabled(this.rows[index])) {
                this.setActive(index);
                return;
            }
        }
    }

    /** Highlight the first (1) or last (-1) enabled row. */
    private jump(direction: 1 | -1): void {
        const count = this.rows.length;
        for (let index = 0; index < count; index += 1) {
            const at = direction === 1 ? index : count - 1 - index;
            if (this.isEnabled(this.rows[at])) {
                this.setActive(at);
                return;
            }
        }
    }

    // --- pointer -------------------------------------------------------------

    private onHover(event: MouseEvent): void {
        const row = this.rowFrom(event.target);
        if (!row || !this.isEnabled(row)) return;
        const index = this.rows.indexOf(row);
        if (index !== this.active) this.setActive(index);
    }

    private onClick(event: MouseEvent): void {
        const row = this.rowFrom(event.target);
        if (!row) return;
        this.run(this.rows.indexOf(row));
    }

    // --- ranking -------------------------------------------------------------

    /**
     * Score and re-render the list for a query.
     *
     * An empty query keeps every command in the caller's order and highlights
     * nothing: a palette that reorders itself before a single character is typed
     * is showing the user a list they cannot predict.
     */
    private filter(query: string): void {
        const needle = Array.from(query.trim().toLowerCase());

        const ranked: Ranked[] = [];
        for (const [order, item] of this.entries.entries()) {
            if (needle.length === 0) {
                ranked.push({item, order, rank: RANK_EVERYTHING, matches: []});
                continue;
            }
            const hit = this.score(item, needle);
            if (hit) ranked.push({item, order, rank: hit.rank, matches: hit.matches});
        }

        // Explicit tie-break on `order` instead of leaning on sort stability:
        // equal scores must keep the caller's order on every engine.
        ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);

        this.ranked = ranked;
        this.render();
    }

    /** Prefix, then word-start prefix, then subsequence; `null` means no match. */
    private score(item: CommandItem, needle: string[]): {rank: number; matches: number[]} | null {
        const label = Array.from(item.label.toLowerCase());

        if (hasPrefix(label, needle, 0)) {
            return {rank: RANK_PREFIX, matches: needle.map((_, index) => index)};
        }

        const wordStart = findWordStart(label, needle);
        if (wordStart !== -1) {
            return {
                rank: RANK_WORD_START,
                matches: needle.map((_, index) => wordStart + index),
            };
        }

        const subsequence = findSubsequence(label, needle);
        return subsequence ? {rank: RANK_SUBSEQUENCE, matches: subsequence} : null;
    }

    // --- rendering -----------------------------------------------------------

    private render(): void {
        const fragment = document.createDocumentFragment();
        this.rows = [];

        let group: string | undefined;

        this.ranked.forEach((entry, index) => {
            if (entry.item.group !== group) {
                group = entry.item.group;
                if (group) {
                    fragment.appendChild(
                        el("div", {
                            class: "mac-commandpalette__group",
                            role: "presentation",
                            text: group,
                        }),
                    );
                }
            }

            const row = this.makeRow(entry, index);
            this.rows.push(row);
            fragment.appendChild(row);
        });

        this.list.replaceChildren(fragment);

        const hasRows = this.ranked.length > 0;
        this.empty.hidden = hasRows;
        this.list.hidden = !hasRows;
        this.input.setAttribute("aria-expanded", String(hasRows));

        // The first row is active from the start, so Return is meaningful before
        // the user has touched an arrow key. If it is disabled the first *runnable*
        // row takes the highlight, because Return on a disabled row does nothing.
        this.setActive(this.rows.findIndex((row) => this.isEnabled(row)));
    }

    private makeRow(entry: Ranked, index: number): HTMLDivElement {
        const {item} = entry;

        const row = el("div", {
            class: "mac-commandpalette__option",
            id: `${this.listId}-${index}`,
            role: "option",
            "aria-selected": "false",
            dataset: {value: item.value},
        });

        // A `div[role="option"]` has no native `disabled` attribute to reach for,
        // so the state is ARIA — and the row stays in the list, because a command
        // that exists but cannot run right now is information, not an absence.
        if (item.disabled) {
            row.classList.add("is-disabled");
            row.setAttribute("aria-disabled", "true");
        }

        if (item.icon) {
            const icon = svgIcon(item.icon, 14);
            icon.classList.add("mac-commandpalette__icon");
            row.appendChild(icon);
        }

        row.appendChild(this.buildLabel(item.label, entry.matches));

        // Truthy, not `!== undefined`: an empty string would still add a gap.
        if (item.hint) {
            row.appendChild(el("span", {class: "mac-commandpalette__hint", text: item.hint}));
        }
        if (item.shortcut) {
            row.appendChild(el("span", {class: "mac-commandpalette__shortcut", text: item.shortcut}));
        }

        return row;
    }

    /**
     * Build the label with its matched characters wrapped.
     *
     * Text nodes and `el()` only, never `innerHTML`: a label is caller-supplied —
     * and in a palette that searches files or pages, frequently *data* —
     * so concatenating it into markup would turn a command title into an
     * injection point. Contiguous hits are merged into one span so a prefix query
     * produces one element, not one per character.
     */
    private buildLabel(label: string, matches: number[]): HTMLSpanElement {
        const wrap = el("span", {class: "mac-commandpalette__label"});
        const chars = Array.from(label);

        // `toLowerCase` can change the code-point count for a few scripts; when it
        // does, the match indices no longer map onto the original glyphs, so the
        // label is drawn unhighlighted instead of mis-sliced.
        if (matches.length === 0 || Array.from(label.toLowerCase()).length !== chars.length) {
            wrap.appendChild(document.createTextNode(label));
            return wrap;
        }

        const hits = new Set(matches);
        let plain = "";
        let matched = "";

        const flushPlain = () => {
            if (plain === "") return;
            wrap.appendChild(document.createTextNode(plain));
            plain = "";
        };
        const flushMatched = () => {
            if (matched === "") return;
            wrap.appendChild(el("span", {class: "mac-commandpalette__match", text: matched}));
            matched = "";
        };

        chars.forEach((char, index) => {
            if (hits.has(index)) {
                flushPlain();
                matched += char;
                return;
            }
            flushMatched();
            plain += char;
        });
        flushPlain();
        flushMatched();

        return wrap;
    }

    /** Mirror the active index into the rows and the field's `aria-activedescendant`. */
    private setActive(index: number): void {
        this.active = index;

        this.rows.forEach((row, at) => {
            const on = at === index;
            row.classList.toggle("is-active", on);
            row.setAttribute("aria-selected", String(on));
        });

        const row = this.rows[index];
        if (!row) {
            this.input.removeAttribute("aria-activedescendant");
            return;
        }

        this.input.setAttribute("aria-activedescendant", row.id);

        // Keep the highlight inside the scroller without dragging the page with
        // it. Guarded: not every DOM implementation provides it (jsdom does not).
        if (typeof row.scrollIntoView === "function") {
            row.scrollIntoView({block: "nearest"});
        }
    }

    /** Close, then report: the callback may open a dialog of its own. */
    private run(index: number): void {
        const entry = this.ranked[index];
        if (!entry || entry.item.disabled) return;
        this.close();
        this.onSelect?.(entry.item.value);
    }

    // --- helpers -------------------------------------------------------------

    private rowFrom(target: EventTarget | null): HTMLDivElement | null {
        if (!(target instanceof Element)) return null;
        const row = target.closest<HTMLDivElement>(".mac-commandpalette__option");
        return row && this.rows.includes(row) ? row : null;
    }

    private isEnabled(row: HTMLElement | undefined): boolean {
        return row !== undefined && row.getAttribute("aria-disabled") !== "true";
    }

    /**
     * Whether the keystroke landed in a field that is not ours.
     *
     * The check is on the event target rather than on `document.activeElement` so
     * it stays correct when the shortcut is dispatched at a specific element.
     */
    private isTypingOutside(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        if (this.dialog.contains(target)) return false;
        if (target.isContentEditable) return true;
        return target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    }
}

// --- matchers ----------------------------------------------------------------
//
// All three work on arrays of code points, so an index is a glyph the label can
// be sliced at. `String.prototype.indexOf` would hand back UTF-16 offsets, which
// disagree with `Array.from` for anything outside the BMP.

/** Does `needle` sit at `start` in `label`? */
function hasPrefix(label: string[], needle: string[], start: number): boolean {
    if (needle.length === 0 || start + needle.length > label.length) return false;
    for (let index = 0; index < needle.length; index += 1) {
        if (label[start + index] !== needle[index]) return false;
    }
    return true;
}

/**
 * Index where a *word* in the label begins with the query, or -1.
 *
 * Index 0 is excluded: that case is the exact prefix, which outranks this one.
 */
function findWordStart(label: string[], needle: string[]): number {
    for (let start = 1; start + needle.length <= label.length; start += 1) {
        if (!WORD_BREAK.test(label[start - 1])) continue;
        if (hasPrefix(label, needle, start)) return start;
    }
    return -1;
}

/**
 * Indices of the query's characters in order, or `null`.
 *
 * Greedy from the left: the earliest position for each character leaves the most
 * label behind for the rest, which is also what makes "gr" hit "grep results" at
 * the word starts rather than somewhere in the middle.
 */
function findSubsequence(label: string[], needle: string[]): number[] | null {
    const hits: number[] = [];
    let cursor = 0;

    for (const char of needle) {
        const found = label.indexOf(char, cursor);
        if (found === -1) return null;
        hits.push(found);
        cursor = found + 1;
    }

    return hits;
}
