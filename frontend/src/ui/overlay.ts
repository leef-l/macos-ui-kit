/**
 * Overlay plumbing shared by Menu, Tooltip and Dialog.
 *
 * Positioning is the part every hand-written popover gets wrong: it clamps in
 * one direction, forgets the scroll offset, or escapes the viewport when the
 * anchor sits near an edge. This module resolves a placement against the
 * viewport, flips when there is no room, and re-resolves on scroll and resize
 * (via rAF so a burst of events costs one layout pass).
 */

import {rafThrottle} from "./dom";

export type Placement =
    | "top"
    | "top-start"
    | "top-end"
    | "bottom"
    | "bottom-start"
    | "bottom-end"
    | "left"
    | "right";

export interface PositionOptions {
    /** Element the overlay points at. */
    anchor: HTMLElement;
    /** Overlay to place. Must already be in the document. */
    panel: HTMLElement;
    /** Preferred side; flips automatically when there is no room. */
    placement?: Placement;
    /** Gap between the anchor and the panel, in px. */
    offset?: number;
    /** Keep this much space from the viewport edges. */
    padding?: number;
    /** Align the panel to the anchor's width (menus attached to fields). */
    matchWidth?: boolean;
}

const OPPOSITE: Record<string, Placement> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
};

/** Resolve coordinates for a placement and write them to the panel. */
export function positionOverlay(options: PositionOptions): void {
    const {
        anchor,
        panel,
        placement = "bottom-start",
        offset = 6,
        padding = 8,
        matchWidth = false,
    } = options;

    const anchorRect = anchor.getBoundingClientRect();

    // The panel must be measurable: make it visible and laid out before
    // reading its size, or a `display:none` panel measures as 0x0.
    panel.style.position = "fixed";
    panel.style.visibility = "hidden";
    panel.style.display = "block";

    if (matchWidth) {
        panel.style.minWidth = `${Math.round(anchorRect.width)}px`;
    }

    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    const [side, align] = placement.split("-") as [string, string?];

    // Flip to the opposite side when the preferred one does not fit.
    let resolvedSide = side;
    const roomBelow = viewportHeight - anchorRect.bottom - offset;
    const roomAbove = anchorRect.top - offset;
    const roomRight = viewportWidth - anchorRect.right - offset;
    const roomLeft = anchorRect.left - offset;

    if (side === "bottom" && panelRect.height > roomBelow && roomAbove > roomBelow) {
        resolvedSide = "top";
    } else if (side === "top" && panelRect.height > roomAbove && roomBelow > roomAbove) {
        resolvedSide = "bottom";
    } else if (side === "right" && panelRect.width > roomRight && roomLeft > roomRight) {
        resolvedSide = "left";
    } else if (side === "left" && panelRect.width > roomLeft && roomRight > roomLeft) {
        resolvedSide = "right";
    } else if (side in OPPOSITE && panelRect.height > roomBelow && side === "bottom") {
        // Kept explicit for readability: bottom with no room picks top.
        resolvedSide = "top";
    }

    let x: number;
    let y: number;

    if (resolvedSide === "top" || resolvedSide === "bottom") {
        y =
            resolvedSide === "bottom"
                ? anchorRect.bottom + offset
                : anchorRect.top - panelRect.height - offset;

        if (align === "start") {
            x = anchorRect.left;
        } else if (align === "end") {
            x = anchorRect.right - panelRect.width;
        } else {
            x = anchorRect.left + (anchorRect.width - panelRect.width) / 2;
        }
    } else {
        x =
            resolvedSide === "right"
                ? anchorRect.right + offset
                : anchorRect.left - panelRect.width - offset;

        if (align === "start") {
            y = anchorRect.top;
        } else if (align === "end") {
            y = anchorRect.bottom - panelRect.height;
        } else {
            y = anchorRect.top + (anchorRect.height - panelRect.height) / 2;
        }
    }

    // Clamp into the viewport so a panel near an edge stays fully visible.
    x = Math.max(padding, Math.min(x, viewportWidth - panelRect.width - padding));
    y = Math.max(padding, Math.min(y, viewportHeight - panelRect.height - padding));

    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.visibility = "";
    panel.dataset.side = resolvedSide;
}

/**
 * Keep an overlay placed while the page changes.
 *
 * Returns a disposer. Callers must invoke it when the overlay closes;
 * otherwise the scroll listener outlives the panel.
 */
export function trackOverlay(options: PositionOptions): () => void {
    const update = rafThrottle(() => positionOverlay(options));
    update();

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
    };
}

/**
 * Stacking order for open overlays.
 *
 * Nested popovers (a menu opened from a dialog) must sit above their parent, so
 * every open overlay takes the next z-index instead of all sharing one.
 */
let zIndexCounter = 1000;

export function nextZIndex(): number {
    zIndexCounter += 1;
    return zIndexCounter;
}

/** Elements that can receive keyboard focus. */
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** All focusable descendants of a container, in DOM order. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
    );
}

/**
 * Trap Tab focus inside a container (dialogs).
 * Returns a disposer that also restores the previously focused element.
 */
export function trapFocus(container: HTMLElement): () => void {
    const previous = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Tab") return;
        const focusable = focusableWithin(container);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey && (active === first || !container.contains(active))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    container.addEventListener("keydown", onKeyDown);

    // Move focus in on the next frame so the element is already laid out.
    requestAnimationFrame(() => {
        const focusable = focusableWithin(container);
        (focusable[0] ?? container).focus();
    });

    return () => {
        container.removeEventListener("keydown", onKeyDown);
        previous?.focus?.();
    };
}
