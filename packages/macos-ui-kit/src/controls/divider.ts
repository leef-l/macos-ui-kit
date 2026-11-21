import {Component} from "../component";
import {append, el, type Child} from "../dom";
import "./divider.css";

export interface DividerOptions {
    /**
     * `horizontal` draws a rule across the container (the default);
     * `vertical` draws a short rule between inline items, the way a toolbar
     * separates button groups.
     */
    orientation?: "horizontal" | "vertical";
    /**
     * Centre a label on the rule ("或", "高级"). A labelled divider always
     * renders horizontally, because a rotated label reads badly.
     */
    label?: Child;
    /**
     * Start the rule at the inset margin instead of the container edge, the way
     * a macOS sidebar separator lines up with the row text rather than the icon.
     */
    inset?: boolean;
}

/**
 * A one-pixel separator.
 *
 * Drawn with `border` rather than a background so it stays a hairline at any
 * device pixel ratio: the token `--mac-hairline` is already computed for the
 * current DPR, and a border participates in the box model exactly once.
 *
 * `role="separator"` plus `aria-orientation` makes the rule announced as a
 * boundary instead of as an empty region.
 */
export class Divider extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly labelNode: HTMLSpanElement | null = null;
    private readonly textNode: HTMLSpanElement | null = null;
    private orientation: "horizontal" | "vertical";

    constructor(options: DividerOptions = {}) {
        super();

        const {label, inset = false} = options;

        // A label forces the horizontal axis; a vertical rule has no width to
        // put text in without rotating it, and rotated labels are worse.
        this.orientation = label === undefined ? (options.orientation ?? "horizontal") : "horizontal";

        this.root = el("div", {
            class: "mac-divider",
            role: "separator",
            "aria-orientation": this.orientation,
        });

        if (this.orientation === "vertical") {
            this.root.classList.add("mac-divider--vertical");
        }

        if (inset) this.root.classList.add("mac-divider--inset");

        if (label !== undefined) {
            this.root.classList.add("mac-divider--labelled");

            // Two rules and the text between them. The rules are elements, not
            // pseudo-elements, because a pseudo-element cannot be given a flex
            // basis that overrides `::before` on the same node as the rule.
            this.labelNode = el("span", {class: "mac-divider__label"});
            this.textNode = el("span", {class: "mac-divider__text"});
            append(this.textNode, [label]);

            this.root.append(
                el("span", {class: "mac-divider__rule"}),
                this.labelNode,
                el("span", {class: "mac-divider__rule"}),
            );
            this.labelNode.appendChild(this.textNode);
        }

        this.syncAria();
    }

    /** Whether the rule is currently horizontal or vertical. */
    get orientationValue(): "horizontal" | "vertical" {
        return this.orientation;
    }

    /**
     * Switch the axis.
     *
     * A labelled divider cannot become vertical: its text would have nowhere to
     * sit, so the call is ignored rather than producing a broken layout.
     */
    setOrientation(orientation: "horizontal" | "vertical"): void {
        if (this.labelNode && orientation === "vertical") return;
        if (this.orientation === orientation) return;

        this.orientation = orientation;
        this.toggleClass("mac-divider--vertical", orientation === "vertical");
        this.syncAria();
    }

    /** Show or hide the inset leading margin. */
    setInset(inset: boolean): void {
        this.toggleClass("mac-divider--inset", inset);
    }

    /** Replace the centred text; an empty value drops the label back to a plain rule. */
    setLabel(label: Child): void {
        if (!this.textNode) return;
        this.textNode.replaceChildren();
        append(this.textNode, [label]);
    }

    /** Keep `aria-orientation` in step with the class that actually turns the rule. */
    private syncAria(): void {
        this.setAttr("aria-orientation", this.orientation);
    }
}
