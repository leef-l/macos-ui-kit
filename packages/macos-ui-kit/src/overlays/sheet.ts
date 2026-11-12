import {Component} from "../component";
import {el, uid, type Child} from "../dom";
import {trapFocus} from "../overlay";
import {Button} from "../controls/button";
import "./sheet.css";

export interface SheetOptions {
    /** Sheet heading, also the accessible name of the dialog. */
    title: string;
    /** Body content: a string, or any node for rich content. */
    body?: Child;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Fires when the user confirms. */
    onConfirm?: () => void;
    /** Fires when the user cancels, presses Escape or clicks the scrim. */
    onCancel?: () => void;
}

/**
 * How long the slide-out runs before the sheet leaves the document. Slightly
 * longer than `--mac-duration-slow` (260ms) so the transition always finishes
 * first; under `prefers-reduced-motion` that token is 0ms and only this short
 * delay remains.
 */
const EXIT_MS = 300;

/**
 * A macOS sheet: a modal attached to the window's top edge that slides down.
 *
 * Sheets differ from `Dialog` in two ways that shape the implementation:
 *
 * - **Geometry.** A dialog is centred in the viewport; a sheet is pinned to the
 *   top and grows downward, so the window's title bar stays visible behind it.
 *   That is the point of the pattern: it reads as belonging to *this* window
 *   rather than to the application.
 * - **Motion.** The entrance is `transform: translateY()` on the panel, never
 *   `top` or `height`. A compositor-animated transform leaves the sheet's own
 *   layout untouched, so a form inside it does not reflow while it slides in.
 *
 * Modal behaviour is delegated to `trapFocus` from overlay.ts: Tab cycles inside
 * the sheet, and the disposer restores focus to whatever had it before.
 */
export class Sheet extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly scrim: HTMLDivElement;
    private readonly panel: HTMLDivElement;
    private readonly bodyNode: HTMLDivElement;
    private readonly onConfirm?: () => void;
    private readonly onCancel?: () => void;

    private releaseFocus: (() => void) | null = null;
    private opened = false;
    private closeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: SheetOptions) {
        super();

        const {
            title,
            body,
            confirmLabel = "确定",
            cancelLabel = "取消",
            onConfirm,
            onCancel,
        } = options;

        this.onConfirm = onConfirm;
        this.onCancel = onCancel;

        const titleId = uid("mac-sheet-title");

        // The root *is* the dialog: it carries the role, the modality and the
        // accessible name. The scrim inside it is decorative and hidden from
        // assistive tech, so it cannot be mistaken for dialog content.
        this.root = el("div", {
            class: "mac-sheet",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            tabindex: -1,
        });

        this.scrim = el("div", {"class": "mac-sheet__scrim", "aria-hidden": "true"});

        // The panel is the element that actually slides; the root only pins the
        // group to the window top.
        this.panel = el("div", {class: "mac-sheet__panel"});

        const titleNode = el("h2", {class: "mac-sheet__title", id: titleId, text: title});

        this.bodyNode = el("div", {class: "mac-sheet__body"});
        if (typeof body === "string" || typeof body === "number") {
            this.bodyNode.textContent = String(body);
        } else if (body) {
            this.bodyNode.appendChild(body);
        }

        // A button with no label renders as a blank rectangle, which reads as a
        // broken control. Treat an empty label as "this button was not asked
        // for": Escape and a scrim click still cancel, so nothing is lost.
        const actions = el("div", {class: "mac-sheet__actions"});
        if (cancelLabel.trim() !== "") {
            const cancelButton = new Button({label: cancelLabel, onClick: () => this.cancel()});
            actions.appendChild(cancelButton.element);
        }
        if (confirmLabel.trim() !== "") {
            const confirmButton = new Button({
                label: confirmLabel,
                variant: "primary",
                onClick: () => this.confirm(),
            });
            actions.appendChild(confirmButton.element);
        }

        this.panel.append(titleNode, this.bodyNode, actions);
        this.root.append(this.scrim, this.panel);

        // A press on the scrim cancels; the panel stops its own presses, so
        // `event.target` can only be the scrim here.
        this.listen(this.scrim, "mousedown", () => this.cancel());

        // Escape is caught on the document so it works wherever focus sits,
        // including on a control the host injected into the body.
        this.listen(document, "keydown", (event) => {
            if (!this.opened || event.key !== "Escape") return;
            event.preventDefault();
            this.cancel();
        });

        // The focus trap's disposer is owned here rather than only in `close`,
        // so destroying an open sheet still releases the trap and the node.
        this.onDestroy(() => {
            this.releaseFocus?.();
            this.releaseFocus = null;
            this.root.remove();
        });
    }

    /** Slide the sheet in. Idempotent. */
    open(): void {
        if (this.closeTimer !== null) {
            window.clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
        if (this.opened) return;
        this.opened = true;

        document.body.appendChild(this.root);
        this.releaseFocus = trapFocus(this.root);

        // Force the closed state to be laid out before the open class lands,
        // otherwise the browser coalesces both styles and nothing animates.
        void this.panel.offsetHeight;

        // The body only gets a separator above the buttons once it actually
        // scrolls; a short sheet does not need a rule cutting it in half.
        this.syncScrollable();

        requestAnimationFrame(() => {
            if (this.opened) this.root.classList.add("is-open");
        });
    }

    /**
     * Mark the sheet scrollable when the body overflows.
     *
     * Measured on open, because the body has no height until the panel is laid
     * out. Consumers that change the content afterwards can call `open()` again
     * to re-measure, or toggle the class themselves.
     */
    private syncScrollable(): void {
        const overflowing = this.bodyNode.scrollHeight > this.bodyNode.clientHeight + 1;
        this.root.classList.toggle("is-scrollable", overflowing);
    }

    /** Slide the sheet out and restore focus. Idempotent. */
    close(): void {
        if (!this.opened) return;
        this.opened = false;

        this.root.classList.remove("is-open");

        this.releaseFocus?.();
        this.releaseFocus = null;

        // Stay mounted for the slide-out, then drop out of the body entirely.
        this.closeTimer = window.setTimeout(() => {
            this.closeTimer = null;
            if (!this.opened) this.root.remove();
        }, EXIT_MS);
    }

    /** Confirm and close. */
    confirm(): void {
        this.onConfirm?.();
        this.close();
    }

    /** Cancel and close. */
    cancel(): void {
        this.onCancel?.();
        this.close();
    }

    /** Whether the sheet is on screen. */
    get isOpen(): boolean {
        return this.opened;
    }

    /** The body element, for callers that fill it after construction. */
    get content(): HTMLElement {
        return this.bodyNode;
    }

    override destroy(): void {
        if (this.closeTimer !== null) {
            window.clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
        // Releases the listeners and the focus trap registered above.
        super.destroy();
    }
}
