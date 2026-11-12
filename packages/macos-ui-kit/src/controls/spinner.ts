import {Component} from "../component";
import {el} from "../dom";
import "./spinner.css";

export type SpinnerSize = "small" | "default" | "large";

export interface SpinnerOptions {
    /** Optional caption beside the ring. */
    label?: string;
    size?: SpinnerSize;
    /** Accessible name. Defaults to the label, then to a generic busy message. */
    ariaLabel?: string;
}

/**
 * An indeterminate activity indicator.
 *
 * Semantics matter here: the spinner is announced through `role="progressbar"`
 * with no `aria-valuenow`, which is the standard way to say "busy, duration
 * unknown". Setting a value would tell a screen reader the work is measurable.
 */
export class Spinner extends Component<HTMLSpanElement> {
    protected readonly root: HTMLSpanElement;

    private readonly labelNode: HTMLSpanElement | null = null;

    constructor(options: SpinnerOptions = {}) {
        super();

        const {label, size = "default", ariaLabel} = options;

        const classes = ["mac-spinner"];
        if (size !== "default") classes.push(`mac-spinner--${size}`);

        this.root = el("span", {
            class: classes.join(" "),
            role: "progressbar",
            "aria-busy": "true",
            "aria-label": ariaLabel ?? label ?? "正在加载",
        });

        this.root.appendChild(el("span", {class: "mac-spinner__ring"}));

        if (label) {
            this.labelNode = el("span", {class: "mac-spinner__label", text: label});
            this.root.appendChild(this.labelNode);
        }
    }

    /** Replace the visible caption. */
    setLabel(label: string): void {
        if (!this.labelNode) return;
        if (this.labelNode.textContent === label) return;
        this.labelNode.textContent = label;
    }
}
