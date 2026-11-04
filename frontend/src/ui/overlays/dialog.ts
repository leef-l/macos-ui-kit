import {Component} from "../component";
import {el, uid, type Child} from "../dom";
import {trapFocus} from "../overlay";
import {Button} from "../controls/button";
import "./dialog.css";

export interface DialogOptions {
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
 * A modal macOS alert.
 *
 * Three things a dialog must get right, and this one does because it delegates
 * to `trapFocus` from overlay.ts:
 *
 * - Tab cycles inside the dialog instead of escaping to the page behind it.
 * - Escape closes it, which is what a mac user reaches for.
 * - Focus returns to whatever had it before the dialog opened.
 *
 * The scrim absorbs clicks on the "outside", treating them as a cancel.
 */
export class Dialog extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly scrim: HTMLDivElement;
    private readonly onCancel?: () => void;
    private readonly onConfirm?: () => void;

    private releaseFocus: (() => void) | null = null;
    private open = false;

    constructor(options: DialogOptions) {
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

        const titleId = uid("mac-dialog-title");

        this.scrim = el("div", {class: "mac-dialog__scrim"});

        this.root = el("div", {
            class: "mac-dialog",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            tabindex: -1,
        });

        const titleNode = el("h2", {class: "mac-dialog__title", text: title, id: titleId});
        const bodyNode = el("div", {class: "mac-dialog__body"});

        if (typeof body === "string" || typeof body === "number") {
            bodyNode.textContent = String(body);
        } else if (body) {
            bodyNode.appendChild(body);
        }

        const actions = el("div", {class: "mac-dialog__actions"});
        const cancelButton = new Button({label: cancelLabel, onClick: () => this.cancel()});
        const confirmButton = new Button({
            label: confirmLabel,
            variant: "primary",
            onClick: () => this.confirm(),
        });
        actions.append(cancelButton.element, confirmButton.element);

        this.root.append(titleNode, bodyNode, actions);
        this.scrim.appendChild(this.root);

        // A click on the scrim (but not inside the dialog) cancels.
        this.listen(this.scrim, "mousedown", (event) => {
            if (event.target === this.scrim) this.cancel();
        });

        // Escape is captured on the document so it works regardless of focus.
        this.listen(document, "keydown", (event) => {
            if (this.open && event.key === "Escape") {
                event.preventDefault();
                this.cancel();
            }
        });
    }

    /** Show the dialog modally. */
    show(): void {
        if (this.open) return;
        this.open = true;

        document.body.appendChild(this.scrim);
        this.releaseFocus = trapFocus(this.root);

        requestAnimationFrame(() => this.scrim.classList.add("is-open"));
    }

    /** Hide the dialog and restore focus. */
    hide(): void {
        if (!this.open) return;
        this.open = false;

        this.scrim.classList.remove("is-open");
        this.releaseFocus?.();
        this.releaseFocus = null;

        // Remove after the fade; also handle a rapid re-open.
        setTimeout(() => {
            if (!this.open) this.scrim.remove();
        }, 200);
    }

    /** Confirm and close. */
    confirm(): void {
        this.onConfirm?.();
        this.hide();
    }

    /** Cancel and close. */
    cancel(): void {
        this.onCancel?.();
        this.hide();
    }

    /** Whether the dialog is on screen. */
    get isOpen(): boolean {
        return this.open;
    }

    override destroy(): void {
        this.releaseFocus?.();
        this.releaseFocus = null;
        this.scrim.remove();
        super.destroy();
    }
}
