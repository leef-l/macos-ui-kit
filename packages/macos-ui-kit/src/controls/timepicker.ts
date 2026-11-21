import {Component} from "../component";
import {append, el, svgIcon, uid} from "../dom";
import "./timepicker.css";

export interface TimePickerOptions {
    /** Initial time as `HH:MM`, or `HH:MM:SS` when `step` is under a minute. */
    value?: string;
    /** Earliest selectable time, inclusive, same format as `value`. */
    min?: string;
    /** Latest selectable time, inclusive, same format as `value`. */
    max?: string;
    /**
     * Granularity in seconds: 60 shows hours and minutes, 1 shows seconds too,
     * and 900 offers quarter-hours. Default 60.
     */
    step?: number;
    disabled?: boolean;
    /** Optional label rendered above the control and linked through `for`/`id`. */
    label?: string;
    /** Fires with the committed time once the user leaves the field or picks one. */
    onChange?: (value: string) => void;
}

/** Clock glyph for the trailing affordance. */
const CLOCK_PATH = "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z M12 7 V12 L15.5 14.5";

/**
 * A macOS time picker wrapping a native `<input type="time">`.
 *
 * Same decision as `DatePicker`, for the same reasons: the native control brings
 * the platform time popup, per-segment keyboard editing, `min`/`max`/`step`
 * enforcement, a locale-correct 12- or 24-hour display that follows the user's
 * system setting, and the iOS wheel picker. A hand-built column picker would have
 * to re-earn all of it and would still disagree with the OS about whether to show
 * "AM".
 *
 * What this component adds is the macOS field chrome and a trailing clock glyph
 * that is `pointer-events: none`, so the click falls through to the native
 * picker indicator underneath.
 */
export class TimePicker extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly input: HTMLInputElement;
    private readonly labelNode: HTMLLabelElement | null = null;
    private readonly onChange?: (value: string) => void;

    constructor(options: TimePickerOptions = {}) {
        super();

        const {value, min, max, step = 60, disabled = false, label, onChange} = options;

        this.onChange = onChange;

        this.root = el("div", {class: "mac-timepicker"});

        const inputId = uid("mac-timepicker");

        if (label !== undefined) {
            this.labelNode = el("label", {class: "mac-timepicker__label", for: inputId});
            append(this.labelNode, [label]);
            this.root.appendChild(this.labelNode);
        }

        const control = el("div", {class: "mac-timepicker__control"});

        this.input = el("input", {
            class: "mac-timepicker__input",
            type: "time",
            id: inputId,
            step: String(step),
            disabled,
        });

        // Assigned as properties after construction: `el` sets attributes, and
        // the value of a time input is a property with a normalised form.
        if (value) this.input.value = value;
        if (min) this.input.min = min;
        if (max) this.input.max = max;

        const icon = el("span", {class: "mac-timepicker__icon", "aria-hidden": "true"});
        icon.appendChild(svgIcon(CLOCK_PATH, 16, "0 0 24 24"));

        control.append(this.input, icon);
        this.root.appendChild(control);

        this.toggleClass("is-disabled", disabled);

        // `change` is the commit point: it fires when the popup commits a time or
        // a segment edit completes, not while the hour digits are half typed.
        this.listen(this.input, "change", () => {
            this.onChange?.(this.input.value);
        });
    }

    /** The current time as `HH:MM` (or `HH:MM:SS`), or "" when empty. */
    get value(): string {
        return this.input.value;
    }

    /** Set the time; an empty string clears it. Silent, like every setter. */
    setValue(value: string): void {
        if (this.input.value === value) return;
        this.input.value = value;
    }

    /** Enable or disable the field, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    /** Move keyboard focus into the field. */
    focus(): void {
        this.input.focus();
    }
}
