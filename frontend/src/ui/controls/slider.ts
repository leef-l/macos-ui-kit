import {Component} from "../component";
import {append, el, uid, type Child} from "../dom";
import "./slider.css";

export interface SliderOptions {
    /** Label rendered above the track; it is wired to the input through `for`/`id`. */
    label?: Child;
    /** Smallest value. Default 0. */
    min?: number;
    /** Largest value. Default 100. */
    max?: number;
    /** Increment between stops. Default 1. */
    step?: number;
    /** Initial value; defaults to `min`. */
    value?: number;
    /** Show the current value at the trailing edge. */
    showValue?: boolean;
    /** Fires on every move with the new number. */
    onChange?: (value: number) => void;
}

/**
 * A horizontal slider on a native `<input type="range">`.
 *
 * The range input already handles pointer capture, dragging, Home/End and the
 * arrow keys, so the component only adds the macOS look and an optional
 * read-out. The filled part of the track is a gradient stop driven by
 * `--mac-slider-value`, so a move costs one custom-property write instead of a
 * second element to resize.
 */
export class Slider extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly input: HTMLInputElement;
    private readonly valueNode: HTMLSpanElement | null = null;
    private readonly onChange?: (value: number) => void;
    private readonly min: number;
    private readonly max: number;

    constructor(options: SliderOptions = {}) {
        super();

        const {
            label,
            min = 0,
            max = 100,
            step = 1,
            value,
            showValue = false,
            onChange,
        } = options;

        this.min = min;
        this.max = max;
        this.onChange = onChange;

        this.root = el("div", {class: "mac-slider"});

        const inputId = uid("mac-slider");

        if (label !== undefined) {
            const labelNode = el("label", {
                class: "mac-slider__label",
                for: inputId,
            });
            append(labelNode, [label]);
            this.root.appendChild(labelNode);
        }

        const control = el("div", {class: "mac-slider__control"});

        this.input = el("input", {
            class: "mac-slider__input",
            type: "range",
            id: inputId,
            min,
            max,
            step,
        });
        // A range input defaults to its midpoint, so the start value is explicit.
        this.input.value = String(this.clamp(value ?? min));

        control.appendChild(this.input);

        if (showValue) {
            this.valueNode = el("span", {class: "mac-slider__value"});
            this.valueNode.textContent = this.input.value;
            control.appendChild(this.valueNode);
        }

        this.root.appendChild(control);

        this.listen(this.input, "input", () => {
            const next = Number(this.input.value);
            this.syncFill();
            this.renderValue(next);
            this.onChange?.(next);
        });

        this.syncFill();
    }

    /** Replace the value; out-of-range input is clamped rather than committed as-is. */
    setValue(value: number): void {
        if (!Number.isFinite(value)) return;
        const next = this.clamp(value);
        if (this.input.value === String(next)) return;
        this.input.value = String(next);
        this.syncFill();
        this.renderValue(next);
    }

    /** Enable or disable the slider, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    /** Paint the filled part of the track up to the current value. */
    private syncFill(): void {
        const value = Number(this.input.value);
        const span = this.max - this.min;
        // A zero-width range would divide by zero; treat it as fully filled.
        const ratio = span === 0 ? 1 : (value - this.min) / span;
        const percent = Math.min(1, Math.max(0, ratio)) * 100;
        this.root.style.setProperty("--mac-slider-value", `${percent}%`);
    }

    /** Keep the read-out in step with the value. */
    private renderValue(value: number): void {
        if (!this.valueNode) return;
        const text = String(value);
        if (this.valueNode.textContent === text) return;
        this.valueNode.textContent = text;
    }

    /** Fold a value back into the bounds. */
    private clamp(value: number): number {
        if (value < this.min) return this.min;
        if (value > this.max) return this.max;
        return value;
    }
}
