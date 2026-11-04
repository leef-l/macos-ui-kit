import {Component} from "../component";
import {el} from "../dom";
import "./select.css";

export interface SelectOption {
    label: string;
    value: string;
    disabled?: boolean;
}

export interface SelectOptions {
    options: SelectOption[];
    /** Initially selected value. Defaults to the first enabled option. */
    value?: string;
    disabled?: boolean;
    /** Stretch to the container's width. */
    block?: boolean;
    /** Accessible name, since the control has no visible label. */
    ariaLabel?: string;
    onChange?: (value: string) => void;
}

/**
 * A macOS pop-up button.
 *
 * Built on a real `<select>`. Replacing it with a custom listbox would mean
 * reimplementing type-ahead, mobile wheel pickers, screen-reader announcement
 * and the OS popup — a lot of behaviour to lose for a styling win. Only the
 * appearance is replaced (`appearance: none` plus our own chevron).
 */
export class Select extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly control: HTMLSelectElement;
    private readonly onChange?: (value: string) => void;

    constructor(options: SelectOptions) {
        super();

        this.onChange = options.onChange;

        const classes = ["mac-select"];
        if (options.block) classes.push("mac-select--block");

        this.root = el("div", {class: classes.join(" ")});

        this.control = el("select", {
            class: "mac-select__control",
            disabled: options.disabled ?? false,
        });

        if (options.ariaLabel) {
            this.control.setAttribute("aria-label", options.ariaLabel);
        }

        this.setOptions(options.options, options.value);
        this.root.appendChild(this.control);
        this.root.appendChild(this.makeChevron());

        this.listen(this.control, "change", () => {
            this.onChange?.(this.control.value);
        });
    }

    /** The small dropdown chevron drawn over the select. */
    private makeChevron(): SVGElement {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 12 12");
        svg.setAttribute("aria-hidden", "true");
        svg.classList.add("mac-select__arrow");
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", "M2.5 4.5 L6 8 L9.5 4.5");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.6");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
        return svg;
    }

    /** Replace the option list. */
    setOptions(options: SelectOption[], value?: string): void {
        const fragment = document.createDocumentFragment();

        for (const option of options) {
            const node = el("option", {
                value: option.value,
                text: option.label,
                disabled: option.disabled ?? false,
            });
            fragment.appendChild(node);
        }

        this.control.replaceChildren(fragment);

        const fallback =
            value ?? options.find((option) => !option.disabled)?.value ?? "";
        if (fallback) {
            this.control.value = fallback;
        }
    }

    /** The selected value. */
    get value(): string {
        return this.control.value;
    }

    /** Change the selection programmatically. */
    setValue(value: string): void {
        if (this.control.value === value) return;
        this.control.value = value;
    }

    /** Enable or disable the control. */
    setDisabled(disabled: boolean): void {
        if (this.control.disabled === disabled) return;
        this.control.disabled = disabled;
    }
}
