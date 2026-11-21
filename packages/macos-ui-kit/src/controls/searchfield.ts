import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./searchfield.css";

/** Magnifier, drawn at 14px: a ring plus a handle at 45°. */
const MAGNIFIER = "M10.5 4 a6.5 6.5 0 1 0 0 13 a6.5 6.5 0 1 0 0 -13 M15.5 15.5 L20.5 20.5";

export interface SearchFieldOptions {
    /** Placeholder; defaults to "搜索". */
    placeholder?: string;
    /** Initial text. */
    value?: string;
    /** `pill` (default) is the rounded Finder/Safari shape, `rounded` matches a text field. */
    shape?: "pill" | "rounded";
    /** `s` matches a toolbar, `m` (default) matches a form row. */
    size?: "s" | "m";
    disabled?: boolean;
    /**
     * Idle time before `onChange` fires, in ms. Default 200.
     * `0` reports on every keystroke instead.
     */
    debounce?: number;
    /** Fires on every keystroke, before the debounce. */
    onInput?: (value: string) => void;
    /** Fires once typing pauses, on Enter, or on clear. */
    onChange?: (value: string) => void;
    /** Fires when Enter is pressed, with the current value. */
    onSearch?: (value: string) => void;
}

/**
 * A macOS search field.
 *
 * The debounce is the part that matters: a search field is wired to a filter,
 * and firing that filter on every keystroke re-renders a list the user is still
 * typing into. `onInput` still reports each keystroke for a live counter;
 * `onChange` is the one to wire to the expensive work.
 *
 * Enter skips the remaining delay, because a user pressing Return has already
 * decided the query is finished.
 *
 * Escape clears the field, which is the behaviour every macOS search field has
 * and no browser gives you.
 */
export class SearchField extends Component<HTMLElement> {
    protected readonly root: HTMLDivElement;

    private readonly input: HTMLInputElement;
    private readonly clearButton: HTMLButtonElement;

    private readonly onInput?: (value: string) => void;
    private readonly onChange?: (value: string) => void;
    private readonly onSearch?: (value: string) => void;

    private readonly debounce: number;
    private timer: number | null = null;
    /** True while the value changed since the last `onChange`. */
    private dirty = false;

    constructor(options: SearchFieldOptions = {}) {
        super();

        const {
            placeholder = "搜索",
            value = "",
            shape = "pill",
            size = "m",
            disabled = false,
            debounce = 200,
            onInput,
            onChange,
            onSearch,
        } = options;

        this.onInput = onInput;
        this.onChange = onChange;
        this.onSearch = onSearch;
        this.debounce = Math.max(0, debounce);

        this.root = el("div", {class: "mac-searchfield", role: "search"});
        if (shape === "rounded") this.root.classList.add("mac-searchfield--rounded");
        if (size === "s") this.root.classList.add("mac-searchfield--s");

        const control = el("div", {class: "mac-searchfield__control"});

        const icon = el("span", {class: "mac-searchfield__icon"});
        icon.appendChild(svgIcon(MAGNIFIER, 14));
        control.appendChild(icon);

        this.input = el("input", {
            class: "mac-searchfield__input",
            type: "search",
            placeholder,
            value,
            disabled,
            autocomplete: "off",
            // A search field is not a form field a spellchecker should touch.
            spellcheck: false,
            "aria-label": placeholder,
        });
        control.appendChild(this.input);

        this.clearButton = el("button", {
            class: "mac-searchfield__clear",
            type: "button",
            tabindex: -1,
            "aria-label": "清除搜索",
            title: "清除搜索",
        });
        this.clearButton.appendChild(svgIcon("M6 6 L12 12 M12 6 L6 12", 9));
        control.appendChild(this.clearButton);

        this.root.appendChild(control);

        this.listen(this.input, "input", () => {
            this.dirty = true;
            this.syncClearState();
            this.onInput?.(this.input.value);
            this.schedule();
        });

        this.listen(this.input, "keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                this.flush();
                this.onSearch?.(this.input.value);
                return;
            }
            if (event.key === "Escape") {
                // A native `<input type="search">` only does this in Safari, and
                // only when the field has focus; doing it here makes it uniform.
                if (this.input.value === "") return;
                event.preventDefault();
                this.reset();
            }
        });

        this.listen(this.clearButton, "click", () => {
            this.reset();
            this.input.focus();
        });

        this.listen(this.input, "change", () => {
            // A native clear (the Safari cancel button, autofill) arrives here
            // without an `input` event in some engines.
            this.syncClearState();
        });

        this.syncClearState();

        // Pending work must not outlive the field.
        this.onDestroy(() => this.cancelTimer());
    }

    /** The current query. */
    get value(): string {
        return this.input.value;
    }

    /** Replace the query without raising callbacks, as a DOM write would not. */
    setValue(value: string): void {
        if (this.input.value === value) return;
        this.input.value = value;
        this.dirty = value !== "";
        this.syncClearState();
        this.cancelTimer();
    }

    /** Enable or disable the field, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    /** Replace the placeholder and the accessible name in one step. */
    setPlaceholder(placeholder: string): void {
        if (this.input.placeholder === placeholder) return;
        this.input.placeholder = placeholder;
        this.input.setAttribute("aria-label", placeholder);
    }

    /** Move keyboard focus into the field. */
    focus(): void {
        this.input.focus();
    }

    /** Select the query, the way ⌘A does inside a search field. */
    select(): void {
        this.input.select();
    }

    /** Fire any pending `onChange` now. */
    flush(): void {
        this.cancelTimer();
        if (!this.dirty) return;
        this.dirty = false;
        this.onChange?.(this.input.value);
    }

    /** Clear the query, report it, and keep focus in the field. */
    private reset(): void {
        this.input.value = "";
        this.syncClearState();
        this.onInput?.("");
        this.dirty = true;
        this.flush();
    }

    /** Start the idle timer; `debounce: 0` reports immediately. */
    private schedule(): void {
        this.cancelTimer();
        if (this.debounce === 0) {
            this.flush();
            return;
        }
        this.timer = window.setTimeout(() => {
            this.timer = null;
            this.flush();
        }, this.debounce);
    }

    private cancelTimer(): void {
        if (this.timer === null) return;
        window.clearTimeout(this.timer);
        this.timer = null;
    }

    /** The clear button only appears when there is something to clear. */
    private syncClearState(): void {
        this.clearButton.hidden = this.input.value === "";
    }
}
