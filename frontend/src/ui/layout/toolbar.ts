import {Component} from "../component";
import {append, el, type Child} from "../dom";
import "./toolbar.css";

export interface ToolbarOptions {
    /** Cluster pinned to the left edge. */
    leading?: Child[];
    /** Cluster centred in the bar. */
    center?: Child[];
    /** Cluster pinned to the right edge. */
    trailing?: Child[];
    /** Which window edge the bar sits against; drives the separator side. */
    position?: "top" | "bottom";
    /** Draw the hairline separator. Defaults to true. */
    bordered?: boolean;
    /** Accessible name for the bar, e.g. "编辑器工具栏". */
    ariaLabel?: string;
}

/**
 * A macOS window toolbar.
 *
 * Three slots, not a fixed layout: leading, centre and trailing. The centre slot
 * is positioned against the bar's own midpoint, so a wide leading cluster cannot
 * push it off centre — with `margin: auto` alone that is exactly what happens,
 * and it is the usual failure of a flexbox toolbar.
 *
 * The bar handles no keys itself. Everything placed in it is a real control with
 * its own keyboard behaviour, and a container that swallowed arrow keys would
 * break the text fields that toolbars normally carry. `role="toolbar"` is kept
 * because it names the grouping correctly; the rotation keys the ARIA pattern
 * mentions remain the children's own responsibility by design.
 */
export class Toolbar extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly leadingSlot: HTMLDivElement;
    private readonly centerSlot: HTMLDivElement;
    private readonly trailingSlot: HTMLDivElement;

    constructor(options: ToolbarOptions = {}) {
        super();

        const {
            leading = [],
            center = [],
            trailing = [],
            position = "top",
            bordered = true,
            ariaLabel,
        } = options;

        const classes = ["mac-toolbar", `mac-toolbar--${position}`];
        if (!bordered) classes.push("mac-toolbar--borderless");

        this.root = el("div", {
            class: classes.join(" "),
            role: "toolbar",
            "aria-orientation": "horizontal",
        });
        this.root.dataset.position = position;
        if (ariaLabel) this.root.setAttribute("aria-label", ariaLabel);

        this.leadingSlot = el("div", {class: "mac-toolbar__leading"});
        this.centerSlot = el("div", {class: "mac-toolbar__center"});
        this.trailingSlot = el("div", {class: "mac-toolbar__trailing"});

        append(this.leadingSlot, leading);
        append(this.centerSlot, center);
        append(this.trailingSlot, trailing);

        this.root.append(this.leadingSlot, this.centerSlot, this.trailingSlot);
    }

    /** Append a control to the right-hand cluster. */
    addTrailing(node: Child): void {
        append(this.trailingSlot, [node]);
    }

    /** Append a control to the left-hand cluster. */
    addLeading(node: Child): void {
        append(this.leadingSlot, [node]);
    }

    /** Append a control to the centred cluster. */
    addCenter(node: Child): void {
        append(this.centerSlot, [node]);
    }

    /** Show or hide the separator without rebuilding the bar. */
    setBordered(bordered: boolean): void {
        this.root.classList.toggle("mac-toolbar--borderless", !bordered);
        this.root.dataset.bordered = String(bordered);
    }

    /** True when the separator is drawn. */
    get bordered(): boolean {
        return !this.root.classList.contains("mac-toolbar--borderless");
    }

    /** The three slot elements, for callers that mount their own children. */
    get slots(): {leading: HTMLElement; center: HTMLElement; trailing: HTMLElement} {
        return {
            leading: this.leadingSlot,
            center: this.centerSlot,
            trailing: this.trailingSlot,
        };
    }
}
