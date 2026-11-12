import {Component} from "../component";
import {el} from "../dom";
import "./badge.css";

export type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger";

export interface BadgeOptions {
    /** Badge text. */
    text: string;
    /** Colour treatment. Default `default` (neutral grey). */
    variant?: BadgeVariant;
}

/**
 * A small pill used to tag rows, counts and states.
 *
 * Renders inline, so a badge dropped inside a sidebar row or a paragraph sits
 * on the text baseline rather than breaking that row's layout. The text is
 * written with `textContent` only — a badge is the component most likely to
 * receive a server-supplied string, so it never goes anywhere near HTML.
 */
export class Badge extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private text: string;
    private variant: BadgeVariant;

    constructor(options: BadgeOptions) {
        super();

        const {variant = "default"} = options;

        this.text = options.text;
        this.variant = variant;

        const classes = ["mac-badge"];
        if (variant !== "default") classes.push(`mac-badge--${variant}`);

        this.root = el("span", {class: classes.join(" "), text: this.text});
    }

    /** Replace the badge text. */
    setText(text: string): void {
        if (this.text === text) return;
        this.text = text;
        this.root.textContent = text;
    }

    /** Swap the colour treatment. */
    setVariant(variant: BadgeVariant): void {
        if (this.variant === variant) return;
        this.root.classList.remove(`mac-badge--${this.variant}`);
        this.variant = variant;
        if (variant !== "default") {
            this.root.classList.add(`mac-badge--${variant}`);
        }
    }
}
