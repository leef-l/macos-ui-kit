import {Component} from "../component";
import {append, el, uid} from "../dom";
import "./splitview.css";

/** Split direction: `horizontal` places the panes side by side. */
export type SplitViewOrientation = "horizontal" | "vertical";

export interface SplitViewOptions {
    /** `horizontal` puts the panes left/right, `vertical` stacks them. */
    orientation: SplitViewOrientation;
    /** Content of the leading pane (left or top). */
    primary?: Node;
    /** Content of the trailing pane (right or bottom); it takes the remainder. */
    secondary?: Node;
    /** Initial primary size: pixels as a number, or any CSS length e.g. "40%". */
    primarySize?: number | string;
    /** Smallest allowed primary size in pixels. Default 0. */
    minPrimary?: number;
    /** Smallest allowed secondary size in pixels. Default 0. */
    minSecondary?: number;
    /** Fires while dragging and on keyboard resize, with the new size in pixels. */
    onResize?: (size: number) => void;
}

/**
 * Arrow-key step, in CSS pixels.
 *
 * Ten is the increment AppKit's split view uses for a keyboard nudge: small
 * enough to fine-tune, large enough that a reasonable range is a few presses.
 * It is a behaviour constant, not a visual one, so it is not tokenised.
 */
const KEYBOARD_STEP = 10;

/**
 * A draggable two-pane split view.
 *
 * The primary pane carries an explicit `flex-basis` driven by a custom property
 * (`--mac-splitview-primary`), so a drag writes one number instead of touching
 * both panes' styles; the secondary pane simply takes the remainder. That also
 * means a resize never re-enters layout twice per pointer event.
 *
 * The divider is a real focus stop: `role="separator"` with
 * `aria-orientation`, `aria-valuenow/min/max` and arrow-key resizing, which is
 * what assistive tech needs to expose an adjustable split.
 *
 * Dragging uses pointer capture, so a fast drag that outruns the one-pixel
 * divider keeps delivering moves to it instead of losing the gesture.
 */
export class SplitView extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly orientation: SplitViewOrientation;
    private readonly primaryPane: HTMLDivElement;
    private readonly secondaryPane: HTMLDivElement;
    private readonly divider: HTMLDivElement;
    private readonly minPrimary: number;
    private readonly minSecondary: number;
    private readonly onResize?: (size: number) => void;

    private dragging = false;
    private dragPointer = -1;
    /** Pointer coordinate when the drag started. */
    private dragStart = 0;
    /** Primary pane extent when the drag started. */
    private dragOrigin = 0;

    constructor(options: SplitViewOptions) {
        super();

        this.orientation = options.orientation;
        this.minPrimary = options.minPrimary ?? 0;
        this.minSecondary = options.minSecondary ?? 0;
        this.onResize = options.onResize;

        const horizontal = this.orientation === "horizontal";

        this.root = el("div", {
            class: `mac-splitview mac-splitview--${this.orientation}`,
        });

        this.primaryPane = el("div", {
            class: "mac-splitview__pane mac-splitview__pane--primary",
        });
        this.secondaryPane = el("div", {
            class: "mac-splitview__pane mac-splitview__pane--secondary",
        });

        append(this.primaryPane, [options.primary]);
        append(this.secondaryPane, [options.secondary]);

        this.primaryPane.id = uid("mac-splitview-pane");
        this.secondaryPane.id = uid("mac-splitview-pane");

        this.divider = el("div", {
            class: "mac-splitview__divider",
            role: "separator",
            tabindex: 0,
            // A side-by-side split is separated by a vertical line: the ARIA
            // orientation follows the divider, not the layout.
            "aria-orientation": horizontal ? "vertical" : "horizontal",
            "aria-label": "调整面板大小",
        });

        // `aria-controls` names both panes: a separator between two regions
        // adjusts the boundary, so pointing at only one would misdescribe it.
        this.divider.setAttribute(
            "aria-controls",
            `${this.primaryPane.id} ${this.secondaryPane.id}`,
        );

        this.root.append(this.primaryPane, this.divider, this.secondaryPane);

        const initial = options.primarySize ?? "50%";
        this.writeSize(typeof initial === "number" ? `${initial}px` : initial);

        this.listen(this.divider, "pointerdown", (event) => this.onPointerDown(event));
        this.listen(this.divider, "pointermove", (event) => this.onPointerMove(event));
        this.listen(this.divider, "pointerup", (event) => this.onPointerUp(event));
        this.listen(this.divider, "pointercancel", (event) => this.onPointerUp(event));
        // Capture can be pulled away by the browser (a modal, a context menu);
        // without this the next move would keep resizing a stale gesture.
        this.listen(this.divider, "lostpointercapture", () => this.endDrag());
        this.listen(this.divider, "keydown", (event) => this.onKeyDown(event));

        // Keep the ARIA values truthful when the container changes size, e.g. a
        // window resize that moves the available extent under the panes.
        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => this.syncAria());
            observer.observe(this.root);
            this.onDestroy(() => observer.disconnect());
        }

        this.syncAria();
    }

    /**
     * Set the primary pane's size: a pixel number or any CSS length ("40%").
     *
     * A number is clamped like a drag would be, so the panes never violate the
     * declared minimums. Silent — the caller already knows, and a programmatic
     * resize is not a user gesture.
     */
    setPrimarySize(size: number | string): void {
        const next =
            typeof size === "number" ? `${this.clampSize(size)}px` : size;
        this.writeSize(next);
        this.syncAria();
    }

    // --- drag ----------------------------------------------------------------

    private onPointerDown(event: PointerEvent): void {
        // Left button (or a touch/pen contact, which reports button 0).
        if (event.button !== 0) return;
        event.preventDefault();

        this.dragging = true;
        this.dragPointer = event.pointerId;
        this.dragStart = this.pointerAxis(event);
        this.dragOrigin = this.paneExtent(this.primaryPane);

        this.root.classList.add("is-dragging");
        this.divider.setPointerCapture(event.pointerId);
        // Focus follows the grab, so the arrow keys work straight after a drag
        // without a second click.
        this.divider.focus();
    }

    private onPointerMove(event: PointerEvent): void {
        if (!this.dragging || event.pointerId !== this.dragPointer) return;
        const delta = this.pointerAxis(event) - this.dragStart;
        this.applySize(this.dragOrigin + delta, true);
    }

    private onPointerUp(event: PointerEvent): void {
        if (event.pointerId !== this.dragPointer) return;
        this.endDrag();
        if (this.divider.hasPointerCapture(event.pointerId)) {
            this.divider.releasePointerCapture(event.pointerId);
        }
    }

    private endDrag(): void {
        if (!this.dragging) return;
        this.dragging = false;
        this.dragPointer = -1;
        this.root.classList.remove("is-dragging");
    }

    // --- keyboard ------------------------------------------------------------

    private onKeyDown(event: KeyboardEvent): void {
        const horizontal = this.orientation === "horizontal";
        // The arrow keys that move the divider along its own axis.
        const decrease = horizontal ? "ArrowLeft" : "ArrowUp";
        const increase = horizontal ? "ArrowRight" : "ArrowDown";

        let target: number;

        if (event.key === decrease) {
            target = this.paneExtent(this.primaryPane) - KEYBOARD_STEP;
        } else if (event.key === increase) {
            target = this.paneExtent(this.primaryPane) + KEYBOARD_STEP;
        } else if (event.key === "Home") {
            target = this.minPrimary;
        } else if (event.key === "End") {
            target = Number.MAX_SAFE_INTEGER;
        } else {
            return;
        }

        event.preventDefault();
        this.applySize(target, true);
    }

    // --- sizing --------------------------------------------------------------

    /** Clamp, write and (optionally) report a new primary size in pixels. */
    private applySize(size: number, notify: boolean): void {
        const next = this.clampSize(size);
        this.writeSize(`${next}px`);
        this.syncAria();
        if (notify) this.onResize?.(next);
    }

    /** One write to the custom property; the flex basis picks it up. */
    private writeSize(value: string): void {
        this.root.style.setProperty("--mac-splitview-primary", value);
    }

    /** Fold a pixel size into the min/max the options declare. */
    private clampSize(size: number): number {
        const available = this.availableExtent();
        // Before the first layout there is nothing to clamp against; keep the
        // requested value so it is already right on the first paint.
        if (available <= 0) return Math.max(0, size);

        const max = Math.max(0, available - this.minSecondary);
        const min = Math.min(this.minPrimary, max);
        return Math.min(max, Math.max(min, size));
    }

    private availableExtent(): number {
        return (
            this.paneExtent(this.primaryPane) + this.paneExtent(this.secondaryPane)
        );
    }

    private paneExtent(node: HTMLElement): number {
        const rect = node.getBoundingClientRect();
        return this.orientation === "horizontal" ? rect.width : rect.height;
    }

    private pointerAxis(event: PointerEvent): number {
        return this.orientation === "horizontal" ? event.clientX : event.clientY;
    }

    /** Keep `aria-valuenow/min/max` in step with the pixels actually on screen. */
    private syncAria(): void {
        const now = Math.round(this.paneExtent(this.primaryPane));
        const available = this.availableExtent();
        const max =
            available > 0
                ? Math.max(0, Math.round(available - this.minSecondary))
                : Math.max(0, now);
        const min = Math.min(this.minPrimary, max);

        this.divider.setAttribute("aria-valuemin", String(min));
        this.divider.setAttribute("aria-valuemax", String(max));
        this.divider.setAttribute(
            "aria-valuenow",
            String(Math.min(max, Math.max(min, now))),
        );
    }
}
