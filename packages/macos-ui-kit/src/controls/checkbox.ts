import {Component} from "../component";
import {append, el, svgIcon, type Child} from "../dom";
import "./checkbox.css";

export interface CheckboxOptions {
    /** Initial ticked state. Default false. */
    checked?: boolean;
    /** Show the dash instead of the tick; it takes precedence over `checked`. */
    indeterminate?: boolean;
    disabled?: boolean;
    /** Text rendered next to the box; it also names the control for assistive tech. */
    label?: Child;
    /** Fires with the new state after a user toggle; setters stay silent. */
    onChange?: (checked: boolean) => void;
}

/**
 * A styled checkbox built around a real `<input type="checkbox">`.
 *
 * The input stays in the document — clipped to a pixel, not `display: none` —
 * so it keeps its place in the tab order, its focus ring and its click target.
 * The drawn box is pure decoration: `:checked` and `:indeterminate` in CSS
 * follow the input, and one native `change` listener mirrors the result to the
 * caller. Space, screen readers and form submission therefore stay native;
 * nothing in this component toggles state behind the browser's back.
 */
export class Checkbox extends Component<HTMLElement> {
    protected readonly root: HTMLLabelElement;

    private readonly input: HTMLInputElement;
    private readonly onChange?: (checked: boolean) => void;

    constructor(options: CheckboxOptions = {}) {
        super();

        const {
            checked = false,
            indeterminate = false,
            disabled = false,
            label,
            onChange,
        } = options;

        this.onChange = onChange;

        this.root = el("label", {class: "mac-checkbox"});

        this.input = el("input", {
            class: "mac-checkbox__input",
            type: "checkbox",
            checked,
            disabled,
        });

        // `indeterminate` exists only as a property, with no attribute form, so
        // the initial state cannot ride along in the `el` call above.
        this.input.indeterminate = indeterminate;

        const box = el("span", {class: "mac-checkbox__box"});

        // The tick is an SVG path rather than a glyph from the font: it keeps
        // its shape at any box size and on any DPI. Both marks share one grid
        // cell and swap through `opacity` (design rule 7).
        const tick = svgIcon("M5 12.5 L9.5 17 L19 7", 12);
        tick.setAttribute("class", "mac-checkbox__tick");

        const dash = svgIcon("M7 12 H17", 12);
        dash.setAttribute("class", "mac-checkbox__dash");

        box.append(tick, dash);
        this.root.append(this.input, box);

        if (label !== undefined) {
            const labelNode = el("span", {class: "mac-checkbox__label"});
            append(labelNode, [label]);
            this.root.appendChild(labelNode);
        }

        this.toggleClass("is-disabled", disabled);

        // Every way of toggling — Space, a click on the label, a screen reader
        // activating the input — converges on this one native event.
        this.listen(this.input, "change", () => {
            this.onChange?.(this.input.checked);
        });
    }

    /** The current ticked state. */
    get checked(): boolean {
        return this.input.checked;
    }

    /** Set the ticked state; a write that changes nothing is skipped, and `onChange` stays silent. */
    setChecked(checked: boolean): void {
        if (this.input.checked === checked) return;
        this.input.checked = checked;
    }

    /** Show the mixed state (a dash instead of the tick). */
    setIndeterminate(indeterminate: boolean): void {
        if (this.input.indeterminate === indeterminate) return;
        this.input.indeterminate = indeterminate;
    }

    /** Enable or disable the checkbox, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    /** Move keyboard focus onto the native input. */
    focus(): void {
        this.input.focus();
    }
}
