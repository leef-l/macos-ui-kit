import {Component} from "../component";
import {append, el, svgIcon, uid, type Child} from "../dom";
import "./textfield.css";

export interface TextFieldOptions {
    /** Label rendered above the field; it is wired to the input through `for`/`id`. */
    label?: Child;
    /** Placeholder shown while the field is empty. */
    placeholder?: string;
    /** Leading SVG path data, drawn at the control's icon size. */
    icon?: string;
    /** Show a clear button at the trailing edge once the field holds text. */
    clearable?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    /** Initial value. */
    value?: string;
    /** Fires on every keystroke with the current value. */
    onInput?: (value: string) => void;
    /**
     * Fires when the value is committed: blur, Enter, or the clear button.
     * Typing alone only raises `onInput`.
     */
    onChange?: (value: string) => void;
}

/**
 * A single-line text field on a native `<input type="text">`.
 *
 * The input is the real element rather than a styled `div`, so the caret,
 * selection, IME composition and `readOnly` come from the browser. The label
 * gets a generated id and is linked with `for`/`id`, so clicking it focuses the
 * field without a line of JS.
 *
 * `onInput` reports every keystroke; `onChange` reports committed values only,
 * which is what the DOM's own `change` event means.
 */
export class TextField extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly input: HTMLInputElement;
    private readonly clearButton: HTMLButtonElement | null = null;
    private readonly onInput?: (value: string) => void;
    private readonly onChange?: (value: string) => void;
    /** True while the value has changed since the last commit. */
    private dirty = false;

    constructor(options: TextFieldOptions = {}) {
        super();

        const {
            label,
            placeholder = "",
            icon,
            clearable = false,
            disabled = false,
            readOnly = false,
            value = "",
            onInput,
            onChange,
        } = options;

        this.onInput = onInput;
        this.onChange = onChange;

        this.root = el("div", {class: "mac-textfield"});

        const inputId = uid("mac-textfield");

        if (label !== undefined) {
            const labelNode = el("label", {
                class: "mac-textfield__label",
                for: inputId,
            });
            append(labelNode, [label]);
            this.root.appendChild(labelNode);
        }

        const control = el("div", {class: "mac-textfield__control"});

        if (icon) {
            const iconWrap = el("span", {class: "mac-textfield__icon"});
            iconWrap.appendChild(svgIcon(icon, 14));
            control.appendChild(iconWrap);
        }

        this.input = el("input", {
            class: "mac-textfield__input",
            type: "text",
            id: inputId,
            placeholder,
            value,
            disabled,
            readOnly,
            autocomplete: "off",
        });

        // `el` skips falsy values, so the spellchecker is switched off here.
        this.input.spellcheck = false;

        control.appendChild(this.input);

        if (clearable) {
            this.clearButton = el("button", {
                class: "mac-textfield__clear",
                type: "button",
                tabindex: -1,
                "aria-label": "清除",
                title: "清除",
            });
            this.clearButton.appendChild(svgIcon("M6 6 L12 12 M12 6 L6 12", 10));
            control.appendChild(this.clearButton);
        }

        this.root.appendChild(control);

        this.listen(this.input, "input", () => {
            this.dirty = true;
            this.syncClearState();
            this.onInput?.(this.input.value);
        });

        this.listen(this.input, "change", () => {
            this.commit();
        });

        // Enter commits, the way submitting a form would.
        this.listen(this.input, "keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            this.commit();
        });

        if (this.clearButton) {
            const button = this.clearButton;
            this.listen(button, "click", () => {
                this.input.value = "";
                this.syncClearState();
                this.onInput?.("");
                this.commit(true);
                this.input.focus();
            });
        }

        this.syncClearState();
    }

    /** The current value. */
    getValue(): string {
        return this.input.value;
    }

    /** Replace the value; does not raise the callbacks, as a DOM write would not. */
    setValue(value: string): void {
        if (this.input.value === value) return;
        this.input.value = value;
        this.dirty = false;
        this.syncClearState();
    }

    /** Enable or disable the input, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    /** Move keyboard focus into the input. */
    focus(): void {
        this.input.focus();
    }

    /**
     * Report the value once per edit.
     *
     * Enter can be followed by a native `change` on blur, so a commit only fires
     * while the field is dirty; `force` is for the clear button, which must raise
     * `onChange` even when nothing was typed.
     */
    private commit(force = false): void {
        if (!force && !this.dirty) return;
        this.dirty = false;
        this.onChange?.(this.input.value);
    }

    /** The clear button only appears when there is something to clear. */
    private syncClearState(): void {
        if (!this.clearButton) return;
        this.clearButton.hidden = this.input.value === "";
    }
}
