import {Component} from "../component";
import {el, uid, type Child} from "../dom";
import "./textarea.css";

export interface TextAreaOptions {
    /** Label rendered above the field. */
    label?: Child;
    placeholder?: string;
    /** Initial text. */
    value?: string;
    /** Visible rows; drives the initial height. */
    rows?: number;
    /** Hard limit; shows a counter when set. */
    maxLength?: number;
    disabled?: boolean;
    readOnly?: boolean;
    onInput?: (value: string) => void;
    onChange?: (value: string) => void;
}

/**
 * A multi-line text field.
 *
 * Built on a real `<textarea>` for the same reason TextField uses a real input:
 * caret navigation, IME composition, undo and selection are the browser's, and a
 * `div[contenteditable]` would mean reimplementing them badly.
 *
 * Like TextField, `onInput` fires per keystroke and `onChange` only on commit
 * (blur), which is what the DOM's own event means.
 */
export class TextArea extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly control: HTMLTextAreaElement;
    private readonly counter: HTMLSpanElement | null = null;
    private readonly maxLength?: number;
    private readonly onChange?: (value: string) => void;

    constructor(options: TextAreaOptions = {}) {
        super();

        const {
            label,
            placeholder = "",
            value = "",
            rows = 4,
            maxLength,
            disabled = false,
            readOnly = false,
            onInput,
            onChange,
        } = options;

        this.maxLength = maxLength;
        this.onChange = onChange;

        this.root = el("div", {class: "mac-textarea"});

        const id = uid("mac-textarea");

        if (label !== undefined) {
            const labelNode = el("label", {class: "mac-textarea__label", htmlFor: id});
            if (typeof label === "string" || typeof label === "number") {
                labelNode.textContent = String(label);
            } else if (label instanceof Node) {
                labelNode.appendChild(label);
            }
            this.root.appendChild(labelNode);
        }

        const controlWrap = el("div", {class: "mac-textarea__control"});
        this.control = el("textarea", {
            class: "mac-textarea__input",
            id,
            rows,
            placeholder,
            disabled,
            readOnly,
        });
        if (maxLength !== undefined) {
            this.control.maxLength = maxLength;
        }
        this.control.value = value;
        controlWrap.appendChild(this.control);
        this.root.appendChild(controlWrap);

        if (maxLength !== undefined) {
            const meta = el("div", {class: "mac-textarea__meta"});
            this.counter = el("span", {text: `${value.length}/${maxLength}`});
            meta.appendChild(this.counter);
            this.root.appendChild(meta);
            this.updateCounter();
        }

        if (onInput) {
            this.listen(this.control, "input", () => {
                onInput(this.control.value);
                this.updateCounter();
            });
        } else {
            this.listen(this.control, "input", () => this.updateCounter());
        }

        // `change` on a textarea fires when the value is committed (blur).
        this.listen(this.control, "change", () => this.onChange?.(this.control.value));

        if (disabled) {
            this.root.classList.add("is-disabled");
        }
    }

    /** The current text. */
    getValue(): string {
        return this.control.value;
    }

    /** Replace the text. */
    setValue(value: string): void {
        if (this.control.value === value) return;
        this.control.value = value;
        this.updateCounter();
    }

    /** Enable or disable the editor. */
    setDisabled(disabled: boolean): void {
        if (this.control.disabled === disabled) return;
        this.control.disabled = disabled;
        this.root.classList.toggle("is-disabled", disabled);
    }

    /** Move keyboard focus into the editor. */
    focus(): void {
        this.control.focus();
    }

    /**
     * Keep the character counter in step, and flag the field when it is at or
     * over the limit.
     */
    private updateCounter(): void {
        if (!this.counter || this.maxLength === undefined) return;
        const length = this.control.value.length;
        this.counter.textContent = `${length}/${this.maxLength}`;
        this.counter.parentElement?.classList.toggle("is-over", length >= this.maxLength);
    }
}
