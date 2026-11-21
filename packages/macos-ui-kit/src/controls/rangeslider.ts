import {Component} from "../component";
import {el} from "../dom";
import "./rangeslider.css";

export interface RangeSliderOptions {
    /** Smallest value. Default 0. */
    min?: number;
    /** Largest value. Default 100. */
    max?: number;
    /** Initial pair, lower bound first; defaults to the whole range. */
    value?: [number, number];
    /** Increment between stops. Default 1. */
    step?: number;
    /** Disable both thumbs. */
    disabled?: boolean;
    /** Print both bounds underneath the track. */
    showValue?: boolean;
    /** Render one bound for the read-out and for `aria-valuetext`. */
    format?: (value: number) => string;
    /** Fires on commit — pointer release, or each keyboard step. */
    onChange?: (value: [number, number]) => void;
}

/**
 * A two-thumb range slider.
 *
 * Built from two native `<input type="range">` elements stacked on one track
 * rather than from a pair of hand-dragged divs: the native input already brings
 * pointer capture, the arrow/Home/End keys, step snapping, `min`/`max`
 * clamping and touch behaviour, all of which would have to be re-earned by
 * hand. The thumbs are then drawn by the same rules as `slider.css`, so a
 * `Slider` and a `RangeSlider` sitting next to each other in a form are
 * visually the same widget.
 *
 * The cost of stacking is that each input covers the full track, so the inputs
 * themselves are `pointer-events: none` and only their thumbs are hit targets;
 * `raiseNearest` hands the top layer to whichever thumb the pointer is nearer.
 */
export class RangeSlider extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly control: HTMLDivElement;
    private readonly lower: HTMLInputElement;
    private readonly upper: HTMLInputElement;
    private readonly readout: HTMLDivElement | null = null;
    private readonly format: (value: number) => string;
    private readonly onChange?: (value: [number, number]) => void;

    private minValue: number;
    private maxValue: number;
    /** The last pair the caller was told about, so a no-op commit stays quiet. */
    private reported: [number, number];

    constructor(options: RangeSliderOptions = {}) {
        super();

        const {
            min = 0,
            max = 100,
            step = 1,
            value,
            disabled = false,
            showValue = false,
            format,
            onChange,
        } = options;

        // An inverted pair is corrected rather than rejected: a caller that
        // swapped the two numbers still meant a range.
        this.minValue = Math.min(min, max);
        this.maxValue = Math.max(min, max);
        this.format = format ?? ((number) => String(number));
        this.onChange = onChange;

        const [lo, hi] = this.order(value ?? [this.minValue, this.maxValue]);
        this.reported = [lo, hi];

        this.root = el("div", {class: `mac-rangeslider${disabled ? " is-disabled" : ""}`});

        this.control = el("div", {class: "mac-rangeslider__control"});

        const track = el("div", {class: "mac-rangeslider__track", "aria-hidden": "true"});
        // Positioned from the custom properties on the root, so a move costs two
        // custom-property writes instead of a measured style recalculation.
        const fill = el("div", {class: "mac-rangeslider__fill", "aria-hidden": "true"});
        track.appendChild(fill);

        this.lower = this.thumb("lower", "最小值", lo, step, disabled);
        this.upper = this.thumb("upper", "最大值", hi, step, disabled);

        this.control.append(track, this.lower, this.upper);
        this.root.appendChild(this.control);

        if (showValue) {
            // Its own row rather than the slider's trailing read-out: two bounds
            // need the width the track is using.
            this.readout = el("div", {class: "mac-rangeslider__value"});
            this.root.appendChild(this.readout);
        }

        // `input` only repaints: a drag fires it on every pixel, and reporting
        // all of those would be a stream of half-finished pairs.
        this.listen(this.lower, "input", () => this.drag("lower"));
        this.listen(this.upper, "input", () => this.drag("upper"));

        // `change` is the commit point — pointer release, or one keyboard step.
        this.listen(this.lower, "change", () => this.commit("lower"));
        this.listen(this.upper, "change", () => this.commit("upper"));

        this.listen(this.control, "pointerdown", (event) => this.raiseNearest(event.clientX));
        this.listen(this.control, "pointermove", (event) => {
            // Skip while a button is held: the engine has already captured the
            // dragged thumb, and re-stacking mid-drag can lose that capture.
            if (event.buttons !== 0) return;
            this.raiseNearest(event.clientX);
        });

        this.sync();
    }

    /** The current pair, lower bound first, whatever the two inputs hold. */
    get value(): [number, number] {
        return this.order([Number(this.lower.value), Number(this.upper.value)]);
    }

    /** Smallest selectable value. */
    get min(): number {
        return this.minValue;
    }

    /** Largest selectable value. */
    get max(): number {
        return this.maxValue;
    }

    /** Replace the pair; it is ordered and clamped before it lands. Silent. */
    setValue(value: [number, number]): void {
        const [lo, hi] = this.order(value);
        this.lower.value = String(lo);
        this.upper.value = String(hi);
        this.reported = this.value;
        this.sync();
    }

    /** Replace the bounds; the current pair is folded into the new range. Silent. */
    setBounds(min: number, max: number): void {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;

        this.minValue = Math.min(min, max);
        this.maxValue = Math.max(min, max);

        for (const input of [this.lower, this.upper]) {
            input.min = String(this.minValue);
            input.max = String(this.maxValue);
        }

        // Raising `min` above a thumb does not move that thumb by itself: the
        // value has to be written back before the paint can agree with it.
        const [lo, hi] = this.order(this.value);
        this.lower.value = String(lo);
        this.upper.value = String(hi);

        this.reported = this.value;
        this.sync();
    }

    /** Enable or disable both thumbs, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.lower.disabled === disabled && this.upper.disabled === disabled) return;
        this.lower.disabled = disabled;
        this.upper.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    /**
     * Follow a native drag.
     *
     * The thumbs may touch but never pass, so each move is clamped against the
     * other bound before it reaches the screen. Writing the value back into the
     * input is what actually stops the thumb — the native input follows its own
     * value, so a clamp that only touched the paint would be overruled by the
     * next pointer sample.
     */
    private drag(moved: "lower" | "upper"): void {
        const lo = Number(this.lower.value);
        const hi = Number(this.upper.value);

        if (moved === "lower") this.lower.value = String(Math.min(lo, hi));
        else this.upper.value = String(Math.max(lo, hi));

        this.sync();
    }

    /**
     * Report a committed pair once; committing the same pair again is silent.
     *
     * The moved thumb is clamped against its partner before anything is
     * reported. A drag already passes through `drag`, but `change` can arrive
     * without a preceding `input` — a script setting `.value`, a browser
     * restoring form state — and letting a crossed pair through would break the
     * one invariant a range slider has.
     *
     * Clamped, not sorted: sorting would quietly move the *other* thumb to the
     * number the user just dragged, which is a change they never made.
     */
    private commit(moved: "lower" | "upper"): void {
        const lo = Number(this.lower.value);
        const hi = Number(this.upper.value);

        if (moved === "lower") this.lower.value = String(Math.min(lo, hi));
        else this.upper.value = String(Math.max(lo, hi));

        this.sync();

        const [start, end] = this.value;
        if (start === this.reported[0] && end === this.reported[1]) return;
        this.reported = [start, end];
        this.onChange?.([start, end]);
    }

    /** Repaint the selected span, the read-out and both `aria-valuetext`s. */
    private sync(): void {
        const [lo, hi] = this.value;
        const start = this.ratio(lo);
        const end = this.ratio(hi);

        this.root.style.setProperty("--mac-rangeslider-start", `${start * 100}%`);
        this.root.style.setProperty("--mac-rangeslider-end", `${end * 100}%`);

        const loText = this.format(lo);
        const hiText = this.format(hi);
        this.setValueText(this.lower, loText);
        this.setValueText(this.upper, hiText);

        if (!this.readout) return;
        const label = `${loText} – ${hiText}`;
        if (this.readout.textContent === label) return;
        this.readout.textContent = label;
    }

    /**
     * Put the thumb nearest the pointer on top.
     *
     * Both inputs cover the whole track, so whichever sits higher swallows every
     * pointer event aimed at that part of the control; without this the lower
     * thumb becomes undraggable as soon as the pair is close together. A tie
     * goes to the upper thumb, because a collapsed pair can only be widened
     * again by pulling the upper one to the right.
     */
    private raiseNearest(clientX: number): void {
        const rect = this.control.getBoundingClientRect();
        if (rect.width === 0) return;

        // Mapped over the whole control rather than over the thumb travel band,
        // so the estimate is up to half a thumb wide — a fraction of one step.
        // It only decides which thumb is nearer, and a collapsed pair is a tie
        // that the rule below already settles, so the error never reaches a value.
        const at = this.minValue + ((clientX - rect.left) / rect.width) * (this.maxValue - this.minValue);
        const [lo, hi] = this.value;
        const lowerFirst = Math.abs(at - lo) < Math.abs(at - hi);

        this.stack(this.lower, lowerFirst ? 3 : 2);
        this.stack(this.upper, lowerFirst ? 2 : 3);
    }

    /** Write a stacking order only when it actually changes. */
    private stack(input: HTMLInputElement, order: number): void {
        if (input.style.zIndex === String(order)) return;
        input.style.zIndex = String(order);
    }

    /** Set `aria-valuetext` only when it differs, so a drag is not a write storm. */
    private setValueText(input: HTMLInputElement, text: string): void {
        if (input.getAttribute("aria-valuetext") === text) return;
        input.setAttribute("aria-valuetext", text);
    }

    /** One thumb input, sharing the track with its sibling. */
    private thumb(
        slot: "lower" | "upper",
        label: string,
        value: number,
        step: number,
        disabled: boolean,
    ): HTMLInputElement {
        const input = el("input", {
            class: `mac-rangeslider__input mac-rangeslider__input--${slot}`,
            type: "range",
            min: this.minValue,
            max: this.maxValue,
            step,
            disabled,
            "aria-label": label,
        });
        // A range input defaults to its midpoint, so the start value is explicit.
        input.value = String(value);
        return input;
    }

    /** Fold a pair into the bounds and put the smaller number first. */
    private order(value: [number, number]): [number, number] {
        const first = Number.isFinite(value[0]) ? this.clamp(value[0]) : this.minValue;
        const second = Number.isFinite(value[1]) ? this.clamp(value[1]) : this.maxValue;
        return first <= second ? [first, second] : [second, first];
    }

    /** Fold a value back into the bounds. */
    private clamp(value: number): number {
        if (value < this.minValue) return this.minValue;
        if (value > this.maxValue) return this.maxValue;
        return value;
    }

    /** Where a value sits along the track, as 0–1. */
    private ratio(value: number): number {
        const span = this.maxValue - this.minValue;
        // A zero-width range would divide by zero; every value in it is the max.
        if (span === 0) return 1;
        return Math.min(1, Math.max(0, (value - this.minValue) / span));
    }
}
