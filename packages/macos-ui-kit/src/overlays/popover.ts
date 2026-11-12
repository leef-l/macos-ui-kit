import {Component} from "../component";
import {el} from "../dom";
import {
    focusableWithin,
    nextZIndex,
    positionOverlay,
    trackOverlay,
    type Placement,
    type PositionOptions,
} from "../overlay";
import "./popover.css";

export interface PopoverOptions {
    /** Arbitrary content: a string becomes text, a node is adopted as-is. */
    content: Node | string;
    /** Preferred side; flips automatically when there is no room. */
    placement?: Placement;
    /** Gap between the anchor and the panel, in px. */
    offset?: number;
    /** Draw a pointer aimed at the anchor. */
    arrow?: boolean;
    /** Accessible name for the dialog; a popover has no title of its own. */
    ariaLabel?: string;
    /** Fires whenever the popover closes, whatever closed it. */
    onClose?: () => void;
}

/**
 * How long the fade-out runs before the panel is detached. Slightly longer than
 * `--mac-duration-fast` (120ms) so the transition finishes first; under
 * `prefers-reduced-motion` the durations are 0ms and this is just a short delay.
 */
const EXIT_MS = 160;

/**
 * A macOS popover: arbitrary content attached to an anchor element.
 *
 * This is the generalisation of `Menu` — the same anchoring plumbing, but the
 * content is the caller's and the panel is non-modal, so the page behind stays
 * interactive. Three consequences shape the implementation:
 *
 * - The panel is appended to `document.body`, never inside the trigger: a
 *   popover opened from a scrolling pane or an `overflow: hidden` card would
 *   otherwise be clipped.
 * - It carries `role="dialog"` with `aria-modal="false"`, so assistive tech
 *   announces a dialog without promising that the rest of the page is inert.
 * - Focus returns to the anchor on close, but only while the popover still owns
 *   it — clicking another field must not yank focus back.
 *
 * The markup is root → surface → body. The split exists because
 * `positionOverlay` measures with `getBoundingClientRect`, which *includes*
 * transforms: any entrance transform on the element being positioned would make
 * the overlay place itself against a shrunken box. The root therefore stays
 * untransformed and is what overlay.ts positions; only `__surface` animates.
 */
export class Popover extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly placement: Placement;
    private readonly offset: number;
    private readonly onClose?: () => void;
    private readonly surface: HTMLDivElement;
    private readonly arrowNode: HTMLSpanElement | null = null;

    private anchor: HTMLElement | null = null;
    private opened = false;
    private disposeTracking: (() => void) | null = null;
    private closeTimer: ReturnType<typeof setTimeout> | null = null;
    private arrowFrame = 0;

    constructor(options: PopoverOptions) {
        super();

        const {
            content,
            placement = "bottom",
            offset = 8,
            arrow = false,
            ariaLabel,
            onClose,
        } = options;

        this.placement = placement;
        this.offset = offset;
        this.onClose = onClose;

        this.root = el("div", {
            class: "mac-popover",
            role: "dialog",
            "aria-modal": "false",
            tabindex: -1,
        });
        // Hidden until `open` places it; positionOverlay then makes it a block.
        this.root.style.display = "none";
        if (ariaLabel) this.root.setAttribute("aria-label", ariaLabel);

        this.surface = el("div", {class: "mac-popover__surface"});

        const body = el("div", {class: "mac-popover__body"});
        if (typeof content === "string") {
            body.textContent = content;
        } else {
            body.appendChild(content);
        }
        this.surface.appendChild(body);

        if (arrow) {
            // Inside the surface so the pointer animates with the panel it
            // belongs to, instead of hanging in place while the panel slides.
            this.arrowNode = el("span", {
                class: "mac-popover__arrow",
                "aria-hidden": "true",
            });
            this.surface.appendChild(this.arrowNode);
        }

        this.root.appendChild(this.surface);

        // A press outside dismisses. The anchor is excluded: its own handler
        // usually toggles, and closing here would race it into a double toggle.
        this.listen(document, "mousedown", (event) => {
            if (!this.opened) return;
            const target = event.target as Node | null;
            if (!target || this.root.contains(target) || this.anchor?.contains(target)) return;
            this.close();
        });

        // Escape works no matter which element inside currently has focus.
        this.listen(document, "keydown", (event) => {
            if (!this.opened || event.key !== "Escape") return;
            event.preventDefault();
            this.close();
        });

        // The panel follows the anchor while the page scrolls or the window
        // resizes; the pointer has to be re-aimed after that re-placement.
        this.listen(window, "scroll", () => this.scheduleArrowUpdate(), {capture: true});
        this.listen(window, "resize", () => this.scheduleArrowUpdate());

        // The tracker disposer from overlay.ts is owned here rather than in
        // open/close alone: this single entry always releases the current
        // tracker, so open/close cycles cannot pile up cleanup closures.
        this.onDestroy(() => {
            this.disposeTracking?.();
            this.disposeTracking = null;
        });
    }

    /** Show the popover next to an anchor. Re-opening with a new anchor moves it. */
    open(anchor: HTMLElement): void {
        if (this.closeTimer !== null) {
            window.clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }

        if (this.opened) {
            if (this.anchor !== anchor) {
                // The tracker closed over the previous anchor, so it has to be
                // replaced; reusing it would keep placing against the old one.
                this.anchor = anchor;
                this.place();
                this.positionArrow();
                this.disposeTracking?.();
                this.disposeTracking = trackOverlay(this.positionOptions(anchor));
            }
            return;
        }

        this.opened = true;
        this.anchor = anchor;

        this.root.style.display = "block";
        this.root.style.zIndex = String(nextZIndex());
        document.body.appendChild(this.root);

        // Place synchronously so the first painted frame is already correct and
        // the entrance only fades and slides in place.
        this.place();
        this.positionArrow();
        this.disposeTracking = trackOverlay(this.positionOptions(anchor));

        requestAnimationFrame(() => {
            if (!this.opened) return;
            this.root.classList.add("is-open");
            this.focusInto();
        });
    }

    /** Hide the popover and hand focus back to the anchor. */
    close(): void {
        if (!this.opened) return;
        this.opened = false;

        this.root.classList.remove("is-open");
        this.disposeTracking?.();
        this.disposeTracking = null;
        this.cancelArrowUpdate();

        const anchor = this.anchor;
        this.anchor = null;

        // Restore the trigger only if the popover still owns focus. If the user
        // clicked another control, that control keeps it.
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body || this.root.contains(active)) {
            anchor?.focus?.();
        }

        // Stay in the DOM for the fade-out, then drop out of the body entirely.
        this.closeTimer = window.setTimeout(() => {
            this.closeTimer = null;
            if (!this.opened) this.root.remove();
        }, EXIT_MS);

        this.onClose?.();
    }

    /** Whether the popover is currently on screen. */
    get isOpen(): boolean {
        return this.opened;
    }

    /** Position options shared by the one-shot placement and the tracker. */
    private positionOptions(anchor: HTMLElement): PositionOptions {
        return {anchor, panel: this.root, placement: this.placement, offset: this.offset};
    }

    /** Resolve the panel against the current anchor. */
    private place(): void {
        if (!this.anchor) return;
        positionOverlay(this.positionOptions(this.anchor));
    }

    /**
     * Re-aim the pointer one frame after a scroll or resize.
     *
     * Placement is itself rAF-throttled inside `trackOverlay`, and this callback
     * may run before that pass, so it re-places first: measuring the panel where
     * it is about to be drawn is the only reading that matters.
     */
    private scheduleArrowUpdate(): void {
        if (!this.opened || !this.arrowNode || this.arrowFrame !== 0) return;
        this.arrowFrame = requestAnimationFrame(() => {
            this.arrowFrame = 0;
            if (!this.opened || !this.arrowNode) return;
            this.place();
            this.positionArrow();
        });
    }

    private cancelArrowUpdate(): void {
        if (this.arrowFrame === 0) return;
        cancelAnimationFrame(this.arrowFrame);
        this.arrowFrame = 0;
    }

    /**
     * Aim the pointer at the anchor's centre.
     *
     * Only the position *along* the panel's edge is measured here; CSS owns the
     * side, taken from `data-side`, which positionOverlay sets. Both ends are
     * clamped by half the arrow's own width, so a rotated square never pokes
     * past a rounded corner — and no pixel constant has to be invented for it.
     *
     * `offsetLeft`/`offsetTop` are used instead of a rect because they report
     * layout position and ignore transforms: the surface is mid-transition when
     * this first runs, and a rect would describe the sliding box rather than the
     * box the pointer is attached to. `clientLeft`/`clientWidth` then move the
     * origin to the padding edge, which is what an absolutely positioned child
     * is offset from — so the surface's own hairline border cannot skew it.
     */
    private positionArrow(): void {
        const arrow = this.arrowNode;
        if (!arrow || !this.anchor) return;

        const boxLeft = this.surface.offsetLeft + this.surface.clientLeft;
        const boxTop = this.surface.offsetTop + this.surface.clientTop;
        const boxWidth = this.surface.clientWidth;
        const boxHeight = this.surface.clientHeight;
        if (boxWidth === 0 || boxHeight === 0) return;

        const anchorRect = this.anchor.getBoundingClientRect();
        const half = arrow.offsetWidth / 2;
        const side = this.root.dataset.side ?? "bottom";

        if (side === "top" || side === "bottom") {
            const centre = anchorRect.left + anchorRect.width / 2 - boxLeft;
            const x = Math.max(half, Math.min(centre, boxWidth - half));
            this.surface.style.setProperty("--mac-popover-arrow-x", `${Math.round(x)}px`);
        } else {
            const centre = anchorRect.top + anchorRect.height / 2 - boxTop;
            const y = Math.max(half, Math.min(centre, boxHeight - half));
            this.surface.style.setProperty("--mac-popover-arrow-y", `${Math.round(y)}px`);
        }
    }

    /** Put focus on the first control inside, or on the panel itself. */
    private focusInto(): void {
        const focusable = focusableWithin(this.root);
        (focusable[0] ?? this.root).focus();
    }

    override destroy(): void {
        if (this.closeTimer !== null) {
            window.clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
        this.cancelArrowUpdate();
        this.root.remove();
        // Releases the listeners and the tracking disposer registered above.
        super.destroy();
    }
}
