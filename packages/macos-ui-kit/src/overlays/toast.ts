import {Component} from "../component";
import {el} from "../dom";
import "./toast.css";

export type ToastVariant = "default" | "success" | "error";

export interface ToastOptions {
    message?: string;
    /** Secondary line under the message. */
    detail?: string;
    /** Auto-dismiss delay in ms; 0 keeps it until dismissed. */
    duration?: number;
    variant?: ToastVariant;
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

        this.messageNode = el("div", {
            class: "mac-toast__message",
            text: options.message ?? "",
        });
        this.detailNode = el("div", {
            class: "mac-toast__detail",
            text: options.detail ?? "",
        });
        if (!options.detail) this.detailNode.style.display = "none";

        this.root.append(this.messageNode, this.detailNode);
    }

    /** Show the toast, replacing its text. Mounts itself into the shared stack. */
    show(message?: string, detail?: string): void {
        if (message !== undefined) this.messageNode.textContent = message;
        if (detail !== undefined) {
            this.detailNode.textContent = detail;
            this.detailNode.style.display = detail ? "" : "none";
        }

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
