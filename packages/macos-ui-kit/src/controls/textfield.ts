import {Component} from "../component";
import {append, el, svgIcon, uid, type Child} from "../dom";
import "./textfield.css";

/**
 * Icons for the password reveal toggle.
 *
 * One path each, several subpaths, because `svgIcon` draws a single `d`. The
 * slash is a subpath rather than a second element so the button holds one node
 * and the swap is a single `d` assignment.
 */
const EYE = "M2 12 C7 5.5 17 5.5 22 12 C17 18.5 7 18.5 2 12 Z M12 9.4 a2.6 2.6 0 1 0 0 5.2 a2.6 2.6 0 1 0 0 -5.2";
const EYE_OFF =
    "M2 12 C7 5.5 17 5.5 22 12 C17 18.5 7 18.5 2 12 Z M12 9.4 a2.6 2.6 0 1 0 0 5.2 a2.6 2.6 0 1 0 0 -5.2 M4 20 L20 4";

export interface TextFieldOptions {
    /** Label rendered above the field; it is wired to the input through `for`/`id`. */
    label?: Child;
    /** Placeholder shown while the field is empty. */
    placeholder?: string;
    /** Leading SVG path data, drawn at the control's icon size. */
    icon?: string;
    /** Show a clear button at the trailing edge once the field holds text. */
    clearable?: boolean;
    /**
     * `password` masks the value and adds a reveal toggle at the trailing edge,
     * the way a macOS secure field does. Defaults to `text`.
     */
    type?: "text" | "password";
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
    private readonly revealButton: HTMLButtonElement | null = null;
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
            type = "text",
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
            type,
            id: inputId,
            placeholder,
            value,
            disabled,
            readOnly,
            autocomplete: type === "password" ? "current-password" : "off",
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

        if (type === "password") {
            this.revealButton = el("button", {
                class: "mac-textfield__reveal",
                type: "button",
                "aria-label": "显示密码",
                "aria-pressed": "false",
                title: "显示密码",
            });
            this.revealButton.appendChild(svgIcon(EYE, 14));
            control.appendChild(this.revealButton);
            this.root.classList.add("mac-textfield--password");
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

        if (this.revealButton) {
            const button = this.revealButton;
            this.listen(button, "click", () => {
                this.setRevealed(!this.isRevealed);
                // Keep the caret where the user left it: swapping the input type
                // resets selection in some engines.
                const at = this.input.value.length;
                this.input.focus();
                this.input.setSelectionRange(at, at);
            });
        }

        this.syncClearState();
    }

    /** Whether a password field is currently showing its value in plain text. */
    get isRevealed(): boolean {
        return this.input.type === "text";
    }

    /**
     * Show or mask a password field.
     *
     * No-op on a text field: there is nothing to reveal, and silently changing
     * a normal input's type would be a surprise.
     */
    setRevealed(revealed: boolean): void {
        if (!this.revealButton) return;
        this.input.type = revealed ? "text" : "password";
        this.revealButton.setAttribute("aria-pressed", String(revealed));
        this.revealButton.setAttribute("aria-label", revealed ? "隐藏密码" : "显示密码");
        this.revealButton.title = revealed ? "隐藏密码" : "显示密码";
        this.revealButton.replaceChildren(svgIcon(revealed ? EYE_OFF : EYE, 14));
        this.root.classList.toggle("is-revealed", revealed);
    }

    /** The current value. */
    get value(): string {
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
