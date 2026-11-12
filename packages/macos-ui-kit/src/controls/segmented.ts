import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./segmented.css";

export interface SegmentedOption {
    label: string;
    value: string;
    /** Optional leading SVG path data. */
    icon?: string;
    disabled?: boolean;
}

export interface SegmentedControlOptions {
    options: SegmentedOption[];
    /** Initially selected value. Defaults to the first enabled option. */
    value?: string;
    /** Stretch to the container's width. */
    block?: boolean;
    onChange?: (value: string) => void;
}

/**
 * A macOS segmented control.
 *
 * Semantics follow the native control: it is a radio group, so it exposes
 * `role="radiogroup"` with one `role="radio"` per segment, arrow keys move the
 * selection, and only the selected segment is in the tab order (roving
 * tabindex). That is what a screen-reader user expects from this widget.
 *
 * The selection pill is a single element moved with `transform`, so switching
 * segments never re-lays-out the buttons themselves.
 */
export class SegmentedControl extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly thumb: HTMLDivElement;
    private readonly buttons: HTMLButtonElement[] = [];
    private readonly options: SegmentedOption[];
    private readonly onChange?: (value: string) => void;

    private current: string;

    constructor(options: SegmentedControlOptions) {
        super();

        this.options = options.options;
        this.onChange = options.onChange;

        // Fall back to the first enabled option so the control always has a
        // selection, like AppKit's NSSegmentedControl.
        this.current =
            options.value ??
            this.options.find((option) => !option.disabled)?.value ??
            "";

        const classes = ["mac-segmented"];
        if (options.block) classes.push("mac-segmented--block");

        this.root = el("div", {class: classes.join(" "), role: "radiogroup"});
        this.thumb = el("div", {class: "mac-segmented__thumb", "aria-hidden": "true"});
        this.root.appendChild(this.thumb);

        for (const option of this.options) {
            const selected = option.value === this.current;
            const button = el("button", {
                class: `mac-segmented__item${selected ? " is-selected" : ""}`,
                type: "button",
                role: "radio",
                "aria-checked": String(selected),
                tabindex: selected ? 0 : -1,
                disabled: option.disabled ?? false,
                dataset: {value: option.value},
            });

            if (option.icon) {
                button.appendChild(svgIcon(option.icon, 13));
            }
            button.appendChild(el("span", {text: option.label}));

            this.buttons.push(button);
            this.root.appendChild(button);
        }

        // Delegated click: one listener for every segment.
        this.listen(this.root, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
                ".mac-segmented__item",
            );
            if (!button || button.disabled) return;
            const value = button.dataset.value;
            if (value) this.applySelection(value, true);
        });

        // Arrow keys move the selection, matching the native control.
        this.listen(this.root, "keydown", (event) => {
            const enabled = this.buttons.filter((b) => !b.disabled);
            if (enabled.length === 0) return;

            const index = enabled.findIndex((b) => b.dataset.value === this.current);
            let next = index;

            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                next = (index + 1) % enabled.length;
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                next = (index - 1 + enabled.length) % enabled.length;
            } else if (event.key === "Home") {
                next = 0;
            } else if (event.key === "End") {
                next = enabled.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            const target = enabled[next];
            const value = target.dataset.value;
            if (!value) return;
            this.applySelection(value, true);
            target.focus();
        });

        // Place the pill once the element is measurable, and keep it correct
        // whenever the box changes: a window resize, a font swap, or the control
        // becoming visible after being built inside a hidden panel all move the
        // segments under the pill.
        requestAnimationFrame(() => this.moveThumb(false));
        this.listen(window, "resize", () => this.moveThumb(false));

        // ResizeObserver is the reliable signal for "the control just got a
        // size": it covers the hidden-panel case, which a resize listener cannot
        // see. Disconnecting is handled through onDestroy.
        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => this.moveThumb(false));
            observer.observe(this.root);
            this.onDestroy(() => observer.disconnect());
        }
    }

    /**
     * Apply a selection.
     *
     * `notify` is true only for a user-initiated change (click or arrow key), so
     * the programmatic `setValue` below stays silent — the same contract every
     * other setter in the kit has.
     */
    private applySelection(value: string, notify: boolean): void {
        if (this.current === value) return;
        this.current = value;

        for (const button of this.buttons) {
            const match = button.dataset.value === value;
            button.classList.toggle("is-selected", match);
            button.setAttribute("aria-checked", String(match));
            // Roving tabindex: only the selected segment is tabbable.
            button.tabIndex = match ? 0 : -1;
        }

        this.moveThumb(true);

        if (notify) this.onChange?.(value);
    }

    /**
     * Position the selection pill.
     *
     * Uses `offsetLeft`/`offsetWidth` (layout reads) once per change, then
     * writes only transform and a width variable, so the animation stays on the
     * compositor.
     *
     * The measurement is skipped when the control has no layout box: a segmented
     * control built inside a hidden tab panel reports 0 for every offset, which
     * would collapse the pill to zero width and leave it at the far left. A
     * ResizeObserver re-measures when the control finally gets a size.
     */
    private moveThumb(animate: boolean): void {
        const button = this.buttons.find((b) => b.dataset.value === this.current);
        if (!button) return;

        // No layout box yet (hidden ancestor): keep the previous geometry and
        // wait for the observer to fire. Writing zeros here is what produced a
        // pill stuck at the left edge.
        if (this.root.offsetWidth === 0) return;

        if (!animate) {
            this.thumb.style.transition = "none";
        }

        // offsetLeft is relative to the padded border box; the thumb is inset by
        // the container's padding, so subtract it rather than a literal 2px.
        const inset = parseFloat(getComputedStyle(this.root).paddingLeft) || 0;

        this.thumb.style.setProperty("--mac-segmented-thumb-x", `${button.offsetLeft - inset}px`);
        this.thumb.style.setProperty("--mac-segmented-thumb-width", `${button.offsetWidth}px`);

        if (!animate) {
            // Force the style to settle, then restore the transition.
            void this.thumb.offsetWidth;
            this.thumb.style.transition = "";
        }
    }

    /** The selected value. */
    get value(): string {
        return this.current;
    }

    /** Change the selection programmatically. */
    setValue(value: string): void {
        this.applySelection(value, false);
    }

    /** Disable every segment. */
    setDisabled(disabled: boolean): void {
        for (const button of this.buttons) {
            button.disabled = disabled;
        }
    }
}
