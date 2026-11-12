import {Component} from "../component";
import {append, el, uid, type Child} from "../dom";
import "./form.css";

export interface FormRowOptions {
    /** Row label, in the leading column. */
    label: Child;
    /** Second line under the label: a current value, a constraint, a note. */
    hint?: Child;
    /** The control. Any node; it is adopted as-is. */
    control: Child;
    /**
     * Id of the control this label belongs to. When set the label becomes a
     * real `<label for>`, so clicking it focuses the field.
     */
    htmlFor?: string;
    /** Let the control fill its column instead of sizing to its content. */
    wide?: boolean;
}

export interface FormOptions {
    rows?: FormRowOptions[];
    /** Accessible name for the group. */
    ariaLabel?: string;
}

/**
 * One row of a {@link Form}.
 *
 * Exposed so a row can be built on its own, but normally created through
 * `form.addRow()`.
 */
export class FormRow extends Component {
    protected readonly root: HTMLElement;

    constructor(options: FormRowOptions) {
        super();

        const {label, hint, control, htmlFor, wide = false} = options;

        this.root = el("div", {
            class: `mac-form__row${wide ? " mac-form__row--wide" : ""}`,
        });

        const labels = el("div", {class: "mac-form__labels"});

        const labelNode = el(htmlFor ? "label" : "span", {
            class: "mac-form__label",
            htmlFor,
        });
        append(labelNode, [label]);
        labels.appendChild(labelNode);

        if (hint !== undefined) {
            const hintNode = el("span", {class: "mac-form__hint"});
            append(hintNode, [hint]);
            labels.appendChild(hintNode);
        }

        const controlCell = el("div", {class: "mac-form__control"});
        append(controlCell, [control]);

        this.root.append(labels, controlCell);
    }
}

/**
 * A two-column form: labels on the leading edge, controls on the trailing edge,
 * hairline between rows.
 *
 * The kit's field components can label themselves, which is right for a single
 * field and wrong for a settings list: the labels have to line up in a column and
 * the controls have to align with each other. This component owns that alignment
 * so consumers stop hand-rolling a grid on every screen.
 *
 * ```ts
 * const form = new Form({
 *     rows: [
 *         {label: "实现", control: select.element},
 *         {label: "API 地址", control: address.element, wide: true},
 *         {label: "启用", control: toggle.element},
 *     ],
 * });
 * ```
 *
 * Build the controls without their own `label` — the row supplies it. Pass
 * `htmlFor` with the control's input id when you want the row label to focus it.
 */
export class Form extends Component {
    protected readonly root: HTMLElement;
    private readonly rows: FormRow[] = [];

    constructor(options: FormOptions = {}) {
        super();

        const {rows = [], ariaLabel} = options;

        this.root = el("div", {
            class: "mac-form",
            role: "group",
            "aria-label": ariaLabel,
        });

        for (const row of rows) this.addRow(row);
    }

    /** Append a row. Returns it, so a caller can keep the instance. */
    addRow(options: FormRowOptions): FormRow {
        const row = new FormRow(options);
        this.rows.push(row);
        this.root.appendChild(row.element);
        this.onDestroy(() => row.destroy());
        return row;
    }

    /** Remove every row and destroy the instances. */
    clear(): void {
        for (const row of this.rows.splice(0)) row.destroy();
        this.root.replaceChildren();
    }

    /** The rows currently mounted. */
    get rowCount(): number {
        return this.rows.length;
    }

    /** A generated id a caller can pass to a row's `htmlFor`. */
    static inputId(prefix = "mac-form-field"): string {
        return uid(prefix);
    }
}
