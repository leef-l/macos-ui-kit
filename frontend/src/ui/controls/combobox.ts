import {Component} from "../component";
import {el, svgIcon, uid} from "../dom";
import "./combobox.css";

/** One suggestion in the list. */
export interface ComboBoxOption {
    label: string;
    value: string;
}

export interface ComboBoxOptions {
    /** Full suggestion list; typing filters it. */
    options: ComboBoxOption[];
    /** Initially selected value; its label fills the field. */
    value?: string;
    placeholder?: string;
    /**
     * Custom rendering for a suggestion row. Returning a `Node` lets the list
     * hold live UI; returning a string renders as text. The list keeps its own
     * ARIA wiring around whatever is returned.
     */
    renderOption?: (option: ComboBoxOption) => Node | string;
    /** Fires when a suggestion is committed (click, Enter or Tab). */
    onChange?: (value: string) => void;
    /** Fires on every keystroke with the raw text. */
    onInput?: (text: string) => void;
}

/**
 * A macOS combo box: a text field with an editable suggestion list.
 *
 * The list is absolutely positioned inside the component's own box rather than
 * appended to `document.body` like the overlay components. A combo box's
 * suggestions are conceptually part of the field, so staying in the container
 * avoids portal teardown, scroll re-positioning and a `z-index` war with the
 * dialogs above it. The trade-off is that an ancestor with `overflow: hidden`
 * clips the list — acceptable for a control that rarely sits at the edge of a
 * clipped card.
 *
 * Implements the ARIA combobox pattern: the input owns `role="combobox"`,
 * `aria-expanded` and `aria-activedescendant`; the list is a `role="listbox"`
 * of `role="option"` rows. Focus never leaves the input, so typing continues
 * while the arrow keys move the highlight.
 */
export class ComboBox extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly input: HTMLInputElement;
    private readonly list: HTMLDivElement;
    private readonly onChange?: (value: string) => void;
    private readonly onInput?: (text: string) => void;
    private readonly renderOption?: (option: ComboBoxOption) => Node | string;
    private readonly listId: string;

    private options: ComboBoxOption[];
    /** Options currently drawn, i.e. after filtering. */
    private filtered: ComboBoxOption[] = [];
    /** Option rows, index-aligned with `filtered`. */
    private rows: HTMLDivElement[] = [];
    /** Highlighted row index; -1 means nothing is highlighted. */
    private active = -1;
    /**
     * Value of the committed option, or null once the text is free-form.
     * Kept separately from `input.value`, because the field shows a label while
     * the caller may have handed us a machine value (an id, a slug).
     */
    private selectedValue: string | null;

    constructor(options: ComboBoxOptions) {
        super();

        this.options = options.options;
        this.renderOption = options.renderOption;
        this.onChange = options.onChange;
        this.onInput = options.onInput;
        this.selectedValue = options.value ?? null;
        this.listId = uid("mac-combobox-list");

        this.root = el("div", {class: "mac-combobox"});

        this.input = el("input", {
            class: "mac-combobox__input",
            type: "text",
            role: "combobox",
            autocomplete: "off",
            placeholder: options.placeholder ?? "",
            "aria-expanded": "false",
            "aria-autocomplete": "list",
            "aria-controls": this.listId,
        });

        // `el` skips falsy values, so `spellcheck` is set as a property here.
        this.input.spellcheck = false;

        const initial = this.optionFor(this.selectedValue ?? "");
        this.input.value = initial ? initial.label : (this.selectedValue ?? "");

        this.list = el("div", {
            class: "mac-combobox__list",
            id: this.listId,
            role: "listbox",
            hidden: true,
        });

        // The chevron is decoration: it must not swallow clicks on the field.
        const chevron = el("span", {class: "mac-combobox__chevron", "aria-hidden": "true"});
        chevron.appendChild(svgIcon("M2.5 4.5 L6 8 L9.5 4.5", 12, "0 0 12 12"));

        this.root.append(this.input, chevron, this.list);

        this.listen(this.input, "input", () => {
            // Typing invalidates the committed value: the text is now the truth.
            this.selectedValue = null;
            // Filter before opening: `open` decides visibility from the *new*
            // result set, so typing a character that finally matches a
            // previously empty filter reopens the list.
            this.filter(this.input.value);
            this.open();
            this.onInput?.(this.input.value);
        });

        this.listen(this.input, "keydown", (event) => this.onKeyDown(event));

        // Clicking the field opens the list. Without this the only way in was to
        // type, which meant a user who wanted to *pick* from a pre-filled list
        // first had to delete the text to make the panel appear.
        //
        // Opened on pointerdown rather than click so the panel is already up by
        // the time the click resolves; the input's focus handler below then sees
        // an open list and leaves it alone.
        this.listen(this.input, "pointerdown", () => this.openWithFullList());

        // Keyboard focus must also reveal the suggestions: tabbing into the field
        // is the same intent as clicking it.
        //
        // `focusin` rather than `focus`: focusin bubbles and, unlike focus, is
        // dispatched even when the document does not hold OS focus — which is the
        // state a window is in while another app is in front.
        this.listen(this.input, "focusin", () => this.openWithFullList());

        // Keeping focus on the input for the whole click is what stops the
        // input's blur from tearing the list down before the click lands.
        this.listen(this.list, "pointerdown", (event) => event.preventDefault());
        this.listen(this.list, "click", (event) => this.onListClick(event));

        this.listen(this.input, "blur", () => this.close());

        this.filter("");
    }

    /**
     * Show every option.
     *
     * Opening from a click or a focus must not filter by whatever text is
     * already in the field: a field showing "张三" would otherwise open to a
     * single row, which reads as a broken control. Typing is the only thing that
     * narrows the list, and that path filters explicitly.
     */
    private openWithFullList(): void {
        this.filter("");
        this.open();
    }

    /**
     * The committed value.
     *
     * The highlight wins (an arrowed-onto row is what the user means), then the
     * value behind the current label, and only then the raw text. Going through
     * `selectedValue` is what keeps a field showing "Apricot" answering with its
     * machine value "b".
     */
    getValue(): string {
        const option = this.filtered[this.active];
        if (option) return option.value;
        return this.selectedValue ?? this.input.value;
    }

    /**
     * Set the text and value programmatically.
     *
     * A value that matches an option shows that option's label, so the field
     * never displays a bare id where a name belongs. Silent, like every setter.
     */
    setValue(value: string): void {
        this.selectedValue = value;
        const match = this.optionFor(value);
        this.input.value = match ? match.label : value;
        this.active = -1;
        this.close();
        this.filter(this.input.value);
    }

    /** Replace the suggestion list; the current text is kept and re-filtered. */
    setOptions(options: ComboBoxOption[]): void {
        this.options = options;
        this.filter(this.input.value);
    }

    /** Move keyboard focus into the field and show the full list. */
    focus(): void {
        // The `focus` listener opens with the full list; doing it here as well
        // would filter twice on every call.
        this.input.focus();
    }

    // --- list ----------------------------------------------------------------

    private optionFor(value: string): ComboBoxOption | undefined {
        return this.options.find((option) => option.value === value);
    }

    /** Rebuild the visible rows for the given text. */
    private filter(text: string): void {
        const needle = text.trim().toLowerCase();
        this.filtered = needle
            ? this.options.filter((option) =>
                  option.label.toLowerCase().includes(needle),
              )
            : this.options.slice();

        // A filter invalidates the highlight; it is re-established on the next
        // arrow key so a committed value is not silently replaced by row 0.
        this.active = -1;

        const fragment = document.createDocumentFragment();
        this.rows = [];

        this.filtered.forEach((option, index) => {
            const row = el("div", {
                class: "mac-combobox__option",
                id: `${this.listId}-${index}`,
                role: "option",
                // `aria-selected` marks the *committed* choice; the transient
                // keyboard highlight rides on aria-activedescendant instead.
                "aria-selected": String(option.value === this.selectedValue),
                dataset: {index: String(index)},
            });

            if (this.renderOption) {
                const custom = this.renderOption(option);
                if (typeof custom === "string") row.textContent = custom;
                else row.appendChild(custom);
            } else {
                row.textContent = option.label;
            }

            this.rows.push(row);
            fragment.appendChild(row);
        });

        // One insertion for the whole list, like the table body.
        this.list.replaceChildren(fragment);

        // Filtering never *opens* the list — only `open()` does. It can close
        // it, though: an empty result set has nothing to show, and leaving the
        // panel up with no rows would look like a rendering bug.
        if (this.filtered.length === 0) {
            this.close();
        } else if (this.input.getAttribute("aria-expanded") === "true") {
            this.syncActive();
        }
    }

    private open(): void {
        if (this.filtered.length === 0) {
            this.close();
            return;
        }
        this.list.hidden = false;
        this.input.setAttribute("aria-expanded", "true");
    }

    private close(): void {
        this.active = -1;
        this.input.setAttribute("aria-expanded", "false");
        this.input.removeAttribute("aria-activedescendant");
        if (this.list.hidden) return;
        this.list.hidden = true;
        for (const row of this.rows) row.classList.remove("is-active");
    }

    /** Move the highlight by `step` rows, wrapping at both ends. */
    private move(step: number): void {
        if (this.filtered.length === 0) return;

        const count = this.filtered.length;
        const from = this.active < 0 ? (step > 0 ? -1 : 0) : this.active;
        let next = from + step;

        if (next < 0) next = count - 1;
        if (next >= count) next = 0;

        this.active = next;
        this.open();
        this.syncActive();
        // `block: nearest` scrolls the list only when the row is out of view.
        this.rows[next]?.scrollIntoView({block: "nearest"});
    }

    /** Mirror `active` into the DOM and the input's ARIA wiring. */
    private syncActive(): void {
        this.rows.forEach((row, index) => {
            row.classList.toggle("is-active", index === this.active);
        });

        const row = this.rows[this.active];
        if (row) {
            this.input.setAttribute("aria-activedescendant", row.id);
        } else {
            this.input.removeAttribute("aria-activedescendant");
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                event.preventDefault();
                this.move(event.key === "ArrowDown" ? 1 : -1);
                return;
            }
            case "Enter": {
                // Enter accepts the highlight; with no highlight it commits
                // whatever has been typed, the editable-combobox rule.
                if (this.active >= 0) {
                    event.preventDefault();
                    this.commit(this.filtered[this.active]);
                }
                return;
            }
            case "Escape": {
                if (this.list.hidden) return;
                event.preventDefault();
                this.close();
                return;
            }
            case "Tab": {
                // Leaving the field commits the highlight, so a keyboard user
                // who arrowed onto an option does not lose it.
                if (this.active >= 0) this.commit(this.filtered[this.active]);
                return;
            }
            default:
                return;
        }
    }

    private onListClick(event: MouseEvent): void {
        const row = (event.target as HTMLElement).closest<HTMLElement>(
            ".mac-combobox__option",
        );
        if (!row) return;

        const option = this.filtered[Number(row.dataset.index)];
        if (option) this.commit(option);
    }

    /** Accept an option: fill the field, close the list, report the value. */
    private commit(option: ComboBoxOption): void {
        this.selectedValue = option.value;
        this.input.value = option.label;
        this.close();

        for (const [index, row] of this.rows.entries()) {
            row.setAttribute(
                "aria-selected",
                String(this.filtered[index]?.value === option.value),
            );
        }

        this.onChange?.(option.value);
    }
}
