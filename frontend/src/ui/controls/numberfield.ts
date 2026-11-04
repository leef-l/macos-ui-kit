import {Component} from "../component";
import {append, el, svgIcon, uid, type Child} from "../dom";
import "./numberfield.css";

export interface NumberFieldOptions {
    /** Label rendered above the field; it is wired to the input through `for`/`id`. */
    label?: Child;
    /** Smallest accepted value; also bounds the native spinner. */
    min?: number;
    /** Largest accepted value; also bounds the native spinner. */
    max?: number;
    /** Increment used by the stepper buttons and the arrow keys. Default 1. */
    step?: number;
    /** Initial value; defaults to `min`, then 0. */
    value?: number;
    /**
     * Fires only for a legal value — a finite number inside `min`/`max`.
     * A blank or out-of-range entry stays in the field but is not committed.
     */
    onChange?: (value: number) => void;
}

/**
 * A numeric field on a native `<input type="number">`.
 *
 * Validation runs on every `input` event: a blank, non-numeric or out-of-range
 * entry is left exactly as typed but never committed, because handing the
 * caller a number the field itself rejects would put its state at odds with
 * what is on screen. `getValue()` therefore reports the last committed value,
 * never a half-typed one.
 *
 * The native spinner cannot be themed, so it is hidden and replaced by two
 * chevron buttons that step by `step` and disable themselves at the bounds.
 */
export class NumberField extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly input: HTMLInputElement;
    private readonly stepUp: HTMLButtonElement;
    private readonly stepDown: HTMLButtonElement;
    private readonly min?: number;
    private readonly max?: number;
    private readonly step?: number;
    private readonly onChange?: (value: number) => void;

    private committed: number;

    constructor(options: NumberFieldOptions = {}) {
        super();

        const {label, min, max, step, value, onChange} = options;

        this.min = min;
        this.max = max;
        this.step = step;
        this.onChange = onChange;
        this.committed = this.clamp(value ?? min ?? 0);

        this.root = el("div", {class: "mac-numberfield"});

        const inputId = uid("mac-numberfield");

        if (label !== undefined) {
            const labelNode = el("label", {
                class: "mac-numberfield__label",
                for: inputId,
            });
            append(labelNode, [label]);
            this.root.appendChild(labelNode);
        }

        const control = el("div", {class: "mac-numberfield__control"});

        this.input = el("input", {
            class: "mac-numberfield__input",
            type: "number",
            id: inputId,
            min,
            max,
            step,
            autocomplete: "off",
            inputmode: "decimal",
        });
        this.input.value = String(this.committed);

        const stepper = el("div", {class: "mac-numberfield__stepper"});

        this.stepUp = el("button", {
            class: "mac-numberfield__step mac-numberfield__step--up",
            type: "button",
            tabindex: -1,
            "aria-label": "增加",
            title: "增加",
        });
        this.stepUp.appendChild(svgIcon("M6 15 L12 8 L18 15", 10));

        this.stepDown = el("button", {
            class: "mac-numberfield__step mac-numberfield__step--down",
            type: "button",
            tabindex: -1,
            "aria-label": "减少",
            title: "减少",
        });
        this.stepDown.appendChild(svgIcon("M6 9 L12 16 L18 9", 10));

        stepper.append(this.stepUp, this.stepDown);
        control.append(this.input, stepper);
        this.root.appendChild(control);

        this.listen(this.input, "input", () => this.handleInput());

        this.listen(this.stepUp, "click", () => this.nudge(1));
        this.listen(this.stepDown, "click", () => this.nudge(-1));

        // Arrow keys step the field, as a macOS stepper does.
        this.listen(this.input, "keydown", (event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            this.nudge(event.key === "ArrowUp" ? 1 : -1);
        });

        this.syncStepperState();
    }

    /** The last committed value. A blank or illegal entry is not reported. */
    getValue(): number {
        return this.committed;
    }

    /** Replace the value; out-of-range input is clamped rather than committed as-is. */
    setValue(value: number): void {
        if (!Number.isFinite(value)) return;
        const next = this.clamp(value);
        if (next === this.committed && this.input.value === String(next)) return;
        this.committed = next;
        this.input.value = String(next);
        this.syncStepperState();
    }

    /** Enable or disable the field and its stepper buttons. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;
        this.syncStepperState();
        this.toggleClass("is-disabled", disabled);
    }

    /** Validate on every keystroke; only legal values are committed. */
    private handleInput(): void {
        const raw = this.input.value.trim();
        if (raw === "") return;

        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || !this.isInRange(parsed)) return;

        this.committed = parsed;
        this.syncStepperState();
        this.onChange?.(parsed);
    }

    /** Step from the committed value and commit the result. */
    private nudge(direction: 1 | -1): void {
        const base = this.committed;
        this.setValue(base + (this.step ?? 1) * direction);
        this.onChange?.(this.committed);
    }

    /** True when a value sits inside the field's bounds. */
    private isInRange(value: number): boolean {
        if (this.min !== undefined && value < this.min) return false;
        if (this.max !== undefined && value > this.max) return false;
        return true;
    }

    /** Fold a value back into the bounds. */
    private clamp(value: number): number {
        let next = value;
        if (this.min !== undefined && next < this.min) next = this.min;
        if (this.max !== undefined && next > this.max) next = this.max;
        return next;
    }

    /** Disable a stepper button at the edge of the range, or with the field. */
    private syncStepperState(): void {
        const off = this.input.disabled;
        const atMin = this.min !== undefined && this.committed <= this.min;
        const atMax = this.max !== undefined && this.committed >= this.max;
        this.stepDown.disabled = off || atMin;
        this.stepUp.disabled = off || atMax;
    }
}
