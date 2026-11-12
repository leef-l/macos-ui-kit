import {Component} from "../component";
import {el} from "../dom";
import "./statusbar.css";

export type StatusDotState = "ok" | "warning" | "error" | "idle";

export interface StatusBarOptions {
    /** Leading status text. */
    text?: string;
    /** Colour of the leading dot. */
    state?: StatusDotState;
    /** Trailing text, typically a clock. */
    trailing?: string;
}

/**
 * The thin bar along the bottom of the window.
 *
 * Both texts update independently, so a ticking clock never forces a layout of
 * the leading status and vice versa.
 */
export class StatusBar extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly dot: HTMLSpanElement;
    private readonly textNode: HTMLSpanElement;
    private readonly trailingNode: HTMLSpanElement;

    constructor(options: StatusBarOptions = {}) {
        super();

        const {text = "", state = "ok", trailing = ""} = options;

        this.root = el("footer", {class: "mac-statusbar"});

        const leading = el("span", {class: "mac-statusbar__leading"});
        this.dot = el("span", {class: `mac-statusbar__dot mac-statusbar__dot--${state}`});
        this.textNode = el("span", {class: "mac-statusbar__text", text});
        leading.append(this.dot, this.textNode);

        this.trailingNode = el("span", {class: "mac-statusbar__time", text: trailing});

        this.root.append(leading, this.trailingNode);
    }

    /** Update the leading text. */
    setText(text: string): void {
        if (this.textNode.textContent === text) return;
        this.textNode.textContent = text;
    }

    /** Update the dot colour. */
    setState(state: StatusDotState): void {
        const next = `mac-statusbar__dot mac-statusbar__dot--${state}`;
        if (this.dot.className === next) return;
        this.dot.className = next;
    }

    /** Update the trailing text. */
    setTrailing(text: string): void {
        if (this.trailingNode.textContent === text) return;
        this.trailingNode.textContent = text;
    }
}
