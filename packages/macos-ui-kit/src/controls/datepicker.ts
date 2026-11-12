import {Component} from "../component";
import {append, el, svgIcon, uid} from "../dom";
import "./datepicker.css";

export interface DatePickerOptions {
    /** Initial date as `YYYY-MM-DD`. */
    value?: string;
    /** Earliest selectable date, inclusive, as `YYYY-MM-DD`. */
    min?: string;
    /** Latest selectable date, inclusive, as `YYYY-MM-DD`. */
    max?: string;
    disabled?: boolean;
    /** Optional label rendered above the control and linked through `for`/`id`. */
    label?: string;
    /** Fires with `YYYY-MM-DD` (or "" when cleared) once the value is committed. */
    onChange?: (value: string) => void;
}

/** Calendar glyph for the trailing affordance. */
const CALENDAR_PATH =
    "M7 3 V6 M17 3 V6 M4 9 H20 M5 5 H19 A1 1 0 0 1 20 6 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 V6 A1 1 0 0 1 5 5 Z";

/**
 * A macOS date picker wrapping a native `<input type="date">`.
 *
 * The native control is kept, not reimplemented: it brings the platform
 * calendar popup, keyboard editing of each date segment, locale-correct
 * formatting, `min`/`max` enforcement and the iOS wheel picker. A hand-built
 * calendar would have to re-earn all of that and would still not match the OS.
 *
 * What this component adds is purely visual — the macOS field chrome and a
 * trailing calendar icon that is `pointer-events: none`, so the click falls
 * through to the native picker indicator underneath.
 */
export class DatePicker extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly input: HTMLInputElement;
    private readonly labelNode: HTMLLabelElement | null = null;
    private readonly onChange?: (value: string) => void;

    constructor(options: DatePickerOptions = {}) {
        super();

        const {value, min, max, disabled = false, label, onChange} = options;

        this.onChange = onChange;

        this.root = el("div", {class: "mac-datepicker"});

        const inputId = uid("mac-datepicker");

        if (label !== undefined) {
            this.labelNode = el("label", {
                class: "mac-datepicker__label",
                for: inputId,
            });
            append(this.labelNode, [label]);
            this.root.appendChild(this.labelNode);
        }

        const control = el("div", {class: "mac-datepicker__control"});

        this.input = el("input", {
            class: "mac-datepicker__input",
            type: "date",
            id: inputId,
            disabled,
        });

        // The date inputs take their bounds as attributes; `el` would assign
        // them as properties, which the date element does not reflect.
        if (value) this.input.value = value;
        if (min) this.input.min = min;
        if (max) this.input.max = max;

        const icon = el("span", {class: "mac-datepicker__icon", "aria-hidden": "true"});
        icon.appendChild(svgIcon(CALENDAR_PATH, 16, "0 0 24 24"));

        control.append(this.input, icon);
        this.root.appendChild(control);

        this.toggleClass("is-disabled", disabled);

        // `change` is the commit point for a date input: it fires when a day is
        // picked from the popup or when a segment edit completes, not on every
        // partial keystroke (`input` would fire mid-edit with no valid date).
        this.listen(this.input, "change", () => {
            this.onChange?.(this.input.value);
        });
    }

    /** The current date as `YYYY-MM-DD`, or "" when empty. */
    get value(): string {
        return this.input.value;
    }

    /** Set the date; an empty string clears it. Silent, like every setter. */
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
