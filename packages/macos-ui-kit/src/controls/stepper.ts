import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./stepper.css";

export interface StepperOptions {
    /** Initial value; folded into `min`/`max`. Default 0 (or `min`, if higher). */
    value?: number;
    /** Smallest value. Default 0. */
    min?: number;
    /** Largest value. Default 100. */
    max?: number;
    /** Increment per click and per arrow key. Default 1. */
    step?: number;
    /** Wrap from a bound to the other one instead of stopping. Default false. */
    wrapping?: boolean;
    disabled?: boolean;
    /** Accessible name. Without one a spinbutton is announced unlabelled. */
    ariaLabel?: string;
    /** Fires only for a user-driven change; every setter stays silent. */
    onChange?: (value: number) => void;
}

/**
 * A macOS stepper: two chevron segments that walk a value up and down.
 *
 * Not a native `<input type="number">`, for two reasons. The macOS stepper is a
 * *control*, not a field: it displays nothing and is placed next to the label or
 * text field that shows the value, so an input would add a second, editable
 * copy of the value that can drift from the caller's own state. And the native
 * spinners cannot be styled into this shape — the two 10px segments sharing one
 * hairline with rounded outer corners are chrome the UA does not expose — while
 * remaining platform-drawn in size, hover behaviour and even position on every
 * engine. `NumberField` keeps its native input because that control *is* a
 * field and the value has to be typed; here there is nothing to type.
 *
 * The root is the `role="spinbutton"` and owns the keyboard map, so the whole
 * control is one tab stop and the arrow keys work without a pointer having
 * picked a half first.
 */
export class Stepper extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly up: HTMLButtonElement;
    private readonly down: HTMLButtonElement;
    private readonly onChange?: (value: number) => void;

    private current: number;
    private min: number;
    private max: number;
    private step: number;
    private wrapping: boolean;
    private disabled: boolean;

    constructor(options: StepperOptions = {}) {
        super();

        const {
            value = 0,
            min = 0,
            max = 100,
            step = 1,
            wrapping = false,
            disabled = false,
            onChange,
        } = options;

        this.onChange = onChange;
        this.wrapping = wrapping;
        this.disabled = disabled;
        // A reversed range is a typo rather than a request for an empty control,
        // so it is normalised once here and clamp() has one ordering to reason
        // about. A step of zero or less cannot move anything; 1 is the only
        // fallback that keeps the keys alive.
        this.min = Math.min(min, max);
        this.max = Math.max(min, max);
        this.step = step > 0 ? step : 1;
        this.current = this.clamp(value);

        this.root = el("div", {
            class: "mac-stepper",
            role: "spinbutton",
            tabindex: 0,
            // A spinbutton with no name is announced as an anonymous number; the
            // value is not a name. Callers name it after the field it edits.
            "aria-label": options.ariaLabel ?? "数值",
        });

        this.up = el("button", {
            class: "mac-stepper__button mac-stepper__button--up",
            type: "button",
            // Out of the tab order on purpose: the root is the control, so Tab
            // lands once on the pair instead of twice on its halves.
            tabindex: -1,
            "aria-label": "增加",
            title: "增加",
        });
        this.up.appendChild(svgIcon("M6 15 L12 8 L18 15", 10));

        this.down = el("button", {
            class: "mac-stepper__button mac-stepper__button--down",
            type: "button",
            tabindex: -1,
            "aria-label": "减少",
            title: "减少",
        });
        this.down.appendChild(svgIcon("M6 9 L12 16 L18 9", 10));

        this.root.append(this.up, this.down);

        this.listen(this.up, "click", () => this.stepBy(1));
        this.listen(this.down, "click", () => this.stepBy(-1));
        // Keydown reaches the root from the buttons too, since they are inside
        // it: a step click keeps the arrow keys working.
        this.listen(this.root, "keydown", (event) => this.onKeyDown(event));

        this.syncState();
    }

    /** The current value. */
    get value(): number {
        return this.current;
    }

    /** True while the control is disabled. */
    get isDisabled(): boolean {
        return this.disabled;
    }

    /** Replace the value; out-of-range input is folded into the bounds. Silent. */
    setValue(value: number): void {
        if (!Number.isFinite(value)) return;
        this.commit(value, false);
    }

    /** Enable or disable both segments, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.disabled === disabled) return;
        this.disabled = disabled;
        this.syncState();
    }

    /**
     * Replace the bounds; a reversed pair is normalised and the current value is
     * re-folded into the new range. Silent.
     */
    setRange(min: number, max: number): void {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;
        this.min = Math.min(min, max);
        this.max = Math.max(min, max);
        this.commit(this.current, false);
    }

    // --- stepping ------------------------------------------------------------

    /**
     * Move `amount` steps.
     *
     * With `wrapping` off, a step that would leave the range is refused instead
     * of clamped: the bounds are visible (the segment greys out at its end), and
     * quietly landing on `max` when the user asked for `max + 1` would report a
     * change that did not happen.
     */
    private stepBy(amount: number): void {
        if (this.disabled) return;

        const next = this.current + amount * this.step;
        if (this.wrapping) {
            this.commit(this.wrap(next), true);
            return;
        }

        if (next < this.min || next > this.max) return;
        this.commit(next, true);
    }

    /**
     * Fold an out-of-range step onto the opposite bound.
     *
     * Deliberately not `value % span`: AppKit's `valueWraps` jumps *to* the
     * minimum when the maximum is passed, so a stepper sitting on `max` and
     * clicked once lands on `min`. A modulo would land on `min + step`, leaving
     * both ends of the range reachable only by accident.
     */
    private wrap(value: number): number {
        if (value > this.max) return this.min;
        if (value < this.min) return this.max;
        return value;
    }

    /**
     * Adopt a value and mirror it into the DOM.
     *
     * `notify` is true only for a user-driven change, so `setValue` and
     * `setRange` stay silent, and a value equal to the current one never fires.
     */
    private commit(value: number, notify: boolean): void {
        const next = this.snap(this.clamp(value));
        const changed = next !== this.current;
        this.current = next;
        this.syncState();
        if (changed && notify) this.onChange?.(next);
    }

    // --- state ---------------------------------------------------------------

    /** Push value, bounds and enabled state into the attributes and the buttons. */
    private syncState(): void {
        this.setAttr("aria-valuenow", String(this.current));
        this.setAttr("aria-valuemin", String(this.min));
        this.setAttr("aria-valuemax", String(this.max));
        this.setAttr("aria-disabled", String(this.disabled));

        // Each segment greys out at its own bound. With wrapping on there is
        // always somewhere to go, so neither does.
        const off = this.disabled;
        this.up.disabled = off || (!this.wrapping && this.current >= this.max);
        this.down.disabled = off || (!this.wrapping && this.current <= this.min);

        // A div has no native `disabled`, so the root leaves the tab order by
        // hand while `aria-disabled` states why; the native attribute on the two
        // buttons is what actually blocks the pointer.
        this.root.tabIndex = this.disabled ? -1 : 0;
        this.toggleClass("is-disabled", this.disabled);

        this.restoreFocus();
    }

    /**
     * Hand focus back to the root when a segment disables itself.
     *
     * A button that becomes `disabled` while focused loses focus to the body,
     * which would leave the control looking selected but dead to the keyboard.
     */
    private restoreFocus(): void {
        const active = document.activeElement;
        if (active !== this.up && active !== this.down) return;
        if (!(active as HTMLButtonElement).disabled) return;
        this.root.focus();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (this.disabled) return;

        switch (event.key) {
            case "ArrowUp":
                event.preventDefault();
                this.stepBy(1);
                return;
            case "ArrowDown":
                event.preventDefault();
                this.stepBy(-1);
                return;
            // A page is ten steps, which is what AppKit does for a stepper's
            // coarse movement.
            case "PageUp":
                event.preventDefault();
                this.stepBy(10);
                return;
            case "PageDown":
                event.preventDefault();
                this.stepBy(-10);
                return;
            case "Home":
                event.preventDefault();
                this.commit(this.min, true);
                return;
            case "End":
                event.preventDefault();
                this.commit(this.max, true);
                return;
            default:
                return;
        }
    }

    // --- helpers -------------------------------------------------------------

    /** Fold a value back into the bounds. */
    private clamp(value: number): number {
        if (!Number.isFinite(value)) return this.min;
        if (value < this.min) return this.min;
        if (value > this.max) return this.max;
        return value;
    }

    /**
     * Round to the step's precision.
     *
     * Repeated addition of a fractional step drifts (`0.1` three times is
     * `0.30000000000000004`), and the caller paints this value into the field
     * beside the stepper, where the tail would be visible.
     */
    private snap(value: number): number {
        const places = decimalsOf(this.step);
        if (places === 0) return value;
        return Number(value.toFixed(places));
    }
}

/** Decimal places in `value`, capped at `toFixed`'s limit of 100. */
function decimalsOf(value: number): number {
    const text = String(value);
    const dot = text.indexOf(".");
    // Exponential notation (`1e-7`) has no dot to count; leaving it unrounded is
    // correct there, since toFixed would flatten it to zero.
    if (dot === -1) return 0;
    return Math.min(20, text.length - dot - 1);
}
