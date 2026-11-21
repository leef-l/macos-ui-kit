import {Component} from "../component";
import {append, el} from "../dom";
import {trapFocus} from "../overlay";
import "./actionsheet.css";

/** How an action is drawn. `cancel` is the separate button at the bottom. */
export type ActionSheetTone = "default" | "destructive" | "cancel";

export interface ActionSheetAction {
    /** Stable key reported by `onSelect`. */
    value: string;
    label: string;
    tone?: ActionSheetTone;
    /** Leave the sheet open after this action instead of dismissing it. */
    keepOpen?: boolean;
}

export interface ActionSheetOptions {
    title?: string;
    message?: string;
    actions: ActionSheetAction[];
    /** Fires with the picked action's value, before the sheet dismisses. */
    onSelect?: (value: string) => void;
    /** Accessible name when there is neither a title nor a message. */
    ariaLabel?: string;
}

/**
 * The iOS action sheet: a list of choices that slides up from the bottom, with
 * the destructive one marked in red and Cancel set apart below the group.
 *
 * Two structural decisions follow the platform. Cancel is not part of the action
 * list — it is its own button, with its own gap, because a thumb reaching for
 * "Delete" must not land on "Cancel" and vice versa. And every dismissal path
 * (Escape, the backdrop, Cancel, or a plain action) ends in `close()`, so focus
 * always returns to whatever opened the sheet; there is no path that leaves the
 * user with focus on a node that has been removed.
 */
export class ActionSheet extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly panel: HTMLDivElement;
    private readonly list: HTMLDivElement;
    private readonly onSelect?: (value: string) => void;

    private actions: ActionSheetAction[];
    private opened = false;
    private restoreTo: HTMLElement | null = null;
    private releaseFocus: (() => void) | null = null;

    constructor(options: ActionSheetOptions) {
        super();

        const {title, message, actions, onSelect, ariaLabel} = options;

        this.actions = actions;
        this.onSelect = onSelect;

        this.root = el("div", {class: "mac-dialog__scrim mac-actionsheet__backdrop"});

        this.panel = el("div", {
            class: "mac-actionsheet",
            role: "dialog",
            "aria-modal": "true",
            ...(title || message ? {} : {"aria-label": ariaLabel ?? "操作"}),
        });

        if (title || message) {
            const header = el("div", {class: "mac-actionsheet__header"});
            if (title) append(header, [el("div", {class: "mac-actionsheet__title", text: title})]);
            if (message) append(header, [el("div", {class: "mac-actionsheet__message", text: message})]);
            this.panel.appendChild(header);
        }

        this.list = el("div", {class: "mac-actionsheet__list"});
        this.panel.appendChild(this.list);

        this.root.appendChild(this.panel);

        this.renderActions();

        // A click on the backdrop itself — not on anything inside the panel, which
        // would have been caught by the action buttons — is a dismissal.
        this.listen(this.root, "click", (event) => {
            if (event.target === this.root) this.close();
        });

        // Registered once, on the document, rather than per open: a listener added
        // in `open()` would be recorded again on every open and only released by
        // `destroy()`. The handler is inert while the sheet is closed because
        // `close()` returns immediately when it has nothing to close.
        this.listen(document, "keydown", this.onKeyDown);
    }

    /** Whether the sheet is on screen. */
    get isOpen(): boolean {
        return this.opened;
    }

    /** Show the sheet, focused, with the last action as the escape hatch. */
    open(): void {
        if (this.opened) return;
        this.opened = true;

        // Captured before the backdrop enters the document, so it is still
        // whatever the user was working in.
        this.restoreTo = document.activeElement as HTMLElement | null;

        document.body.appendChild(this.root);

        // The same trap the dialogs use: Tab cycles inside the sheet and the
        // previously focused element comes back when the disposer runs.
        this.releaseFocus = trapFocus(this.panel);

        requestAnimationFrame(() => {
            if (this.opened) this.root.classList.add("is-open");
        });
    }

    /** Dismiss the sheet and hand focus back. */
    close(): void {
        if (!this.opened) return;
        this.opened = false;

        this.root.classList.remove("is-open");

        this.releaseFocus?.();
        this.releaseFocus = null;

        // Removed synchronously rather than after the slide-out: a dismissed sheet
        // must already be gone from the document, so a caller's `querySelector` —
        // or a later `destroy()` — never meets a half-dead backdrop.
        this.root.remove();

        this.restoreTo?.focus();
        this.restoreTo = null;
    }

    /** Replace the action list. The sheet stays as open or closed as it was. */
    setActions(actions: ActionSheetAction[]): void {
        this.actions = actions;
        this.renderActions();
    }

    override destroy(): void {
        if (this.isDestroyed) return;
        // An open sheet owns a node in `document.body` and a live focus trap;
        // neither is a child of `element`, so neither is cleaned up by removal.
        this.close();
        super.destroy();
    }

    private renderActions(): void {
        this.list.replaceChildren();

        const cancel = this.actions.filter((a) => a.tone === "cancel");
        const regular = this.actions.filter((a) => a.tone !== "cancel");

        for (const action of regular) {
            this.list.appendChild(this.makeButton(action, "mac-actionsheet__action"));
        }

        // Cancel is torn out of the list on purpose: it is a different affordance
        // with a different consequence, so it gets a separate group and the gap
        // that goes with it.
        for (const action of cancel) {
            this.panel.appendChild(this.makeButton(action, "mac-actionsheet__cancel"));
        }

        // A sheet with no cancel action still needs an escape hatch that is not a
        // gesture: the platform always offers one, so it is added rather than
        // assumed. Marked `data-implicit` so a caller can find it.
        if (cancel.length === 0) {
            const button = el("button", {
                class: "mac-actionsheet__cancel",
                type: "button",
                text: "取消",
            });
            button.dataset.implicit = "true";
            this.listen(button, "click", () => this.close());
            this.panel.appendChild(button);
        }
    }

    private makeButton(action: ActionSheetAction, className: string): HTMLButtonElement {
        const button = el("button", {
            class: className,
            type: "button",
            "data-value": action.value,
        });
        if (action.tone === "destructive") button.dataset.tone = "destructive";
        append(button, [action.label]);

        // Cancel dismisses; it does not report. `onSelect` answers "which choice did
        // the user make", and cancelling is the absence of a choice — a caller that
        // receives "cancel" has to special-case a value that means nothing.
        if (action.tone === "cancel") {
            this.listen(button, "click", () => this.close());
            return button;
        }

        this.listen(button, "click", () => {
            // Reported before the dismissal, so a handler that reopens another
            // sheet sees a document with no backdrop in it.
            this.onSelect?.(action.value);
            if (!action.keepOpen) this.close();
        });

        return button;
    }

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        this.close();
    };
}
