import {Component} from "../component";
import {append, el, type Child} from "../dom";
import {Button, type ButtonVariant} from "../controls/button";
import "./toast.css";

export type ToastVariant = "default" | "success" | "error";

/** One button in a toast, e.g. "Undo". */
export interface ToastAction {
    label: string;
    onClick: () => void;
    variant?: ButtonVariant;
    /**
     * Keep the toast open after the click. Default false: acting on a toast
     * normally dismisses it.
     */
    keepOpen?: boolean;
}

export interface ToastOptions {
    /**
     * Body. A string renders as text; a node is adopted as-is, so a toast can
     * carry a link, a code snippet or a small list.
     */
    message?: Child;
    /** Secondary line under the message. Same rules. */
    detail?: Child;
    /** Auto-dismiss delay in ms; 0 keeps it until dismissed. */
    duration?: number;
    variant?: ToastVariant;
    /** A button rendered with the message, e.g. undo or open. */
    action?: ToastAction;
}

/**
 * The shared container every toast mounts into.
 *
 * Toasts stack, so they cannot each own a fixed-position wrapper: they would
 * overlap. One lazily created stack keeps them in document order and lets the
 * oldest disappear from the top of the column.
 */
let stack: HTMLDivElement | null = null;

function ensureStack(): HTMLDivElement {
    if (stack && stack.isConnected) return stack;

    stack = el("div", {class: "mac-toast-stack"});
    document.body.appendChild(stack);

    // Drop the container once the last toast leaves, so an idle app has no
    // stray fixed-position node intercepting nothing.
    const observer = new MutationObserver(() => {
        if (stack && stack.childElementCount === 0) {
            stack.remove();
            stack = null;
            observer.disconnect();
        }
    });
    observer.observe(stack, {childList: true});

    return stack;
}

/**
 * A macOS-style toast.
 *
 * Announced through `role="status"` with `aria-live="polite"`, so screen
 * readers read it without stealing focus from whatever the user is doing.
 */
export class Toast extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly messageNode: HTMLDivElement;
    private readonly detailNode: HTMLDivElement;
    private readonly actionNode: HTMLDivElement;
    private duration: number;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private visible = false;

    constructor(options: ToastOptions = {}) {
        super();

        this.duration = options.duration ?? 4000;

        const classes = ["mac-toast"];
        if (options.variant && options.variant !== "default") {
            classes.push(`mac-toast--${options.variant}`);
        }

        this.root = el("div", {
            class: classes.join(" "),
            role: "status",
            "aria-live": "polite",
        });

        this.messageNode = el("div", {class: "mac-toast__message"});
        this.detailNode = el("div", {class: "mac-toast__detail"});
        this.actionNode = el("div", {class: "mac-toast__actions"});

        const text = el("div", {class: "mac-toast__text"});
        text.append(this.messageNode, this.detailNode);

        this.root.append(text, this.actionNode);

        if (options.message !== undefined) append(this.messageNode, [options.message]);
        this.setDetail(options.detail);
        if (options.action) this.setAction(options.action);
        else this.actionNode.style.display = "none";
    }

    /** Show the toast, replacing its content. Mounts itself into the shared stack. */
    show(message?: Child, detail?: Child): void {
        if (message !== undefined) {
            this.messageNode.replaceChildren();
            append(this.messageNode, [message]);
        }
        if (detail !== undefined) this.setDetail(detail);

        if (!this.visible) {
            ensureStack().appendChild(this.root);
            this.visible = true;
            // Next frame, so the entrance transition has a start state.
            requestAnimationFrame(() => this.root.classList.add("is-open"));
        }

        this.scheduleDismiss();
    }

    /** Update the auto-dismiss delay for subsequent shows. */
    setDuration(duration: number): void {
        this.duration = duration;
    }

    /** Set or replace the action button. Pass `null` to remove it. */
    setAction(action: ToastAction | null): void {
        this.actionNode.replaceChildren();
        if (!action) {
            this.actionNode.style.display = "none";
            return;
        }

        const button = new Button({
            label: action.label,
            variant: action.variant ?? "default",
            size: "small",
            onClick: () => {
                action.onClick();
                if (!action.keepOpen) this.hide();
            },
        });
        this.actionNode.appendChild(button.element);
        this.actionNode.style.display = "";
        // The button's own listeners go with it when the toast is destroyed.
        this.onDestroy(() => button.destroy());
    }

    private setDetail(detail: Child): void {
        this.detailNode.replaceChildren();
        if (detail === undefined || detail === null || detail === false || detail === "") {
            this.detailNode.style.display = "none";
            return;
        }
        append(this.detailNode, [detail]);
        this.detailNode.style.display = "";
    }

    /** Dismiss immediately. */
    hide(): void {
        this.clearTimer();
        if (!this.visible) return;
        this.visible = false;

        this.root.classList.remove("is-open");
        // Remove after the fade so the stack does not jump mid-animation.
        setTimeout(() => {
            if (!this.visible) this.root.remove();
        }, 200);
    }

    private scheduleDismiss(): void {
        this.clearTimer();
        if (this.duration <= 0) return;
        this.timer = setTimeout(() => this.hide(), this.duration);
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    override destroy(): void {
        this.clearTimer();
        this.root.remove();
        super.destroy();
    }
}

/** Fire-and-forget helper for the common case. */
export function showToast(message: string, options: Omit<ToastOptions, "message"> = {}): Toast {
    const toast = new Toast({...options, message});
    toast.show();
    return toast;
}
