import {Component} from "../component";
import {append, el, uid, type Child} from "../dom";
import "./radiogroup.css";

export interface RadioOption {
    /** Value reported to `onChange`; also the identity used to match `value`. */
    value: string;
    /** The visible text; also the accessible name of the radio. */
    label: Child;
    /** A second line under the label, dimmed. */
    hint?: Child;
    disabled?: boolean;
}

export interface RadioGroupOptions {
    options: RadioOption[];
    /** Initially selected value. Default: nothing selected. */
    value?: string;
    /**
     * Group name. Generated when omitted — one is required, because the native
     * arrow-key navigation only works between radios that share a name.
     */
    name?: string;
    /** `vertical` (default) stacks rows; `horizontal` lays them out in a row. */
    orientation?: "vertical" | "horizontal";
    /** Disable the whole group. */
    disabled?: boolean;
    /** Fires with the newly selected value; setters stay silent. */
    onChange?: (value: string) => void;
}

/**
 * A radio group with macOS-shaped buttons.
 *
 * Each option is a real `<input type="radio">` in the same `name` group, so the
 * browser provides the parts that are tedious to reimplement and easy to get
 * wrong: arrow-key navigation with wrap-around, "only one checked", and the
 * group being announced as a radiogroup rather than as a pile of circles.
 *
 * The drawn circle is decoration driven by `:checked`, so no JS ever toggles a
 * visual state the DOM does not already have.
 */
export class RadioGroup extends Component<HTMLElement> {
    protected readonly root: HTMLFieldSetElement;

    private readonly name: string;
    private readonly onChange?: (value: string) => void;

    /** Root label per option, kept so `setDisabled` can dim them individually. */
    private readonly rows: Array<{wrapper: HTMLLabelElement; input: HTMLInputElement; disabled: boolean}> = [];

    constructor(options: RadioGroupOptions) {
        super();

        const {options: list, value, orientation = "vertical", disabled = false, onChange} = options;
        this.onChange = onChange;
        this.name = options.name ?? uid("mac-radio");

        // A fieldset with a radio role: the fieldset supplies the grouping
        // semantics, the role supplies the announcement screen readers expect.
        this.root = el("fieldset", {class: "mac-radios", role: "radiogroup"});
        if (orientation === "horizontal") this.root.classList.add("mac-radios--horizontal");
        if (options.name) this.root.setAttribute("aria-label", options.name);

        // `el("fieldset")` renders a default border and margin; both are cleared
        // in CSS, and the legend is omitted on purpose — an empty legend would
        // still reserve space.
        this.root.style.cssText = "";

        this.build(list, value, disabled);

        // One delegated listener instead of one per radio: `change` bubbles from
        // the input, and `setOptions` can rebuild the list without re-binding.
        this.listen(this.root, "change", (event) => {
            const target = event.target as HTMLInputElement | null;
            if (!target || target.type !== "radio") return;
            this.onChange?.(target.value);
        });
    }

    /** The selected value, or `""` when nothing is selected. */
    get value(): string {
        const checked = this.root.querySelector<HTMLInputElement>("input:checked");
        return checked?.value ?? "";
    }

    /** Select an option; silent, and a no-op when the value is not in the list. */
    setValue(value: string): void {
        const target = Array.from(
            this.root.querySelectorAll<HTMLInputElement>(".mac-radio__input"),
        ).find((input) => input.value === value);
        if (!target || target.checked) return;
        target.checked = true;
    }

    /** Replace the option list, keeping the current selection when it survives. */
    setOptions(list: RadioOption[], value = this.value): void {
        const disabled = this.root.classList.contains("is-disabled");
        this.build(list, value, disabled);
    }

    /** Enable or disable every radio in the group. */
    setDisabled(disabled: boolean): void {
        for (const row of this.rows) {
            row.input.disabled = disabled || row.disabled;
        }
        this.toggleClass("is-disabled", disabled);
    }

    /** Move focus to the selected radio, or the first one when nothing is selected. */
    focus(): void {
        const target =
            this.root.querySelector<HTMLInputElement>("input:checked") ??
            this.root.querySelector<HTMLInputElement>(".mac-radio__input");
        target?.focus();
    }

    private build(list: RadioOption[], value: string | undefined, disabled: boolean): void {
        this.root.replaceChildren();
        this.rows.length = 0;

        for (const option of list) {
            const wrapper = el("label", {class: "mac-radio"});

            const isChecked = value !== undefined && option.value === value;
            const isDisabled = disabled || option.disabled === true;

            const input = el("input", {
                class: "mac-radio__input",
                type: "radio",
                name: this.name,
                value: option.value,
                checked: isChecked,
                disabled: isDisabled,
            });

            const dot = el("span", {class: "mac-radio__dot"});
            dot.appendChild(el("span", {class: "mac-radio__pip"}));

            const text = el("span", {class: "mac-radio__text"});
            const labelNode = el("span", {class: "mac-radio__label"});
            append(labelNode, [option.label]);
            text.appendChild(labelNode);

            if (option.hint !== undefined) {
                const hintNode = el("span", {class: "mac-radio__hint"});
                append(hintNode, [option.hint]);
                text.appendChild(hintNode);
            }

            wrapper.append(input, dot, text);
            this.root.appendChild(wrapper);

            this.rows.push({wrapper, input, disabled: option.disabled === true});
        }

        this.toggleClass("is-disabled", disabled);
        // Trailing whitespace between inline-block fieldsets shows up as a gap
        // in horizontal layouts; `font-size: 0` on the root in CSS handles it.
    }
}
