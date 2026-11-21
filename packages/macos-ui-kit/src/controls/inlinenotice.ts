import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./inlinenotice.css";

/** How loud the notice is, and which colour carries it. */
export type NoticeTone = "info" | "success" | "warning" | "danger";

export interface InlineNoticeOptions {
    /** The sentence itself. */
    message: string;
    /** Optional bold line above the message. */
    title?: string;
    /** Tint, edge and glyph. Default `info`. */
    tone?: NoticeTone;
    /** Leading SVG path data in the kit's 24×24 viewBox, replacing the tone's glyph. */
    icon?: string;
    /**
     * Show a close button. Default `false`: a notice reports a condition the page
     * still believes is true, so hiding it has to be a decision the caller makes.
     */
    dismissible?: boolean;
    /** A single trailing button: "撤销", "查看", "重试". */
    action?: {label: string; onAction: () => void};
    /** Fires when the user dismisses the notice. */
    onDismiss?: () => void;
}

/** One circled glyph per tone, drawn in the tone's colour. */
const GLYPHS: Record<NoticeTone, string> = {
    info: "M12 3 a9 9 0 0 1 0 18 a9 9 0 0 1 0 -18 M12 11.2 v5.6 M12 8.2 v0.6",
    success: "M12 3 a9 9 0 0 1 0 18 a9 9 0 0 1 0 -18 M8.4 12.4 L11 15 L15.8 9.4",
    warning: "M12 3.6 L21.4 20 L2.6 20 Z M12 9.6 v4.4 M12 17 v0.6",
    danger: "M12 3 a9 9 0 0 1 0 18 a9 9 0 0 1 0 -18 M9.2 9.2 L14.8 14.8 M14.8 9.2 L9.2 14.8",
};

/** Cross glyph for the close button. */
const CLOSE_GLYPH = "M6 6 L12 12 M12 6 L6 12";

/**
 * An inline notice: a tinted strip that reports a state in the flow of the page.
 *
 * Not a Toast. A toast is transient and floats over the content; this sits in the
 * layout, holds its place while the condition lasts, and may carry the action that
 * resolves it. It is also not an Alert — nothing is being asked.
 *
 * `role="status"` so the text is announced politely when it changes, except for
 * the `danger` tone, which is `role="alert"`: an error that interrupts is the
 * difference between "your draft was saved" and "your draft was lost". The role
 * follows `setTone`, so a notice escalated from info to danger starts
 * interrupting from that moment rather than staying politely queued.
 */
export class InlineNotice extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly iconWrap: HTMLSpanElement;
    private readonly titleNode: HTMLDivElement;
    private readonly messageNode: HTMLDivElement;
    private readonly actions: HTMLDivElement;
    private readonly closeButton: HTMLButtonElement;
    private readonly onDismiss?: () => void;

    private currentTone: NoticeTone;
    /** A caller-supplied glyph wins over the tone's, and keeps winning on `setTone`. */
    private customIcon: boolean;

    private dismissible: boolean;
    private readonly hasAction: boolean;

    constructor(options: InlineNoticeOptions) {
        super();

        this.currentTone = options.tone ?? "info";
        this.customIcon = options.icon !== undefined;
        this.dismissible = options.dismissible ?? false;
        this.hasAction = options.action !== undefined;
        this.onDismiss = options.onDismiss;

        this.root = el("div", {
            class: "mac-inline-notice",
            // The role is set below through `setTone`, which also owns the swap on
            // later calls, so there is exactly one place that decides it.
            dataset: {tone: this.currentTone},
        });

        this.iconWrap = el("span", {class: "mac-inline-notice__icon"});

        // Both text nodes always exist and are `hidden` when empty: the setters
        // then toggle a flag instead of rebuilding the block, and the flex column
        // keeps a stable shape.
        this.titleNode = el("div", {class: "mac-inline-notice__title", hidden: true});
        this.messageNode = el("div", {class: "mac-inline-notice__message"});

        const text = el("div", {class: "mac-inline-notice__text"}, this.titleNode, this.messageNode);

        this.actions = el("div", {class: "mac-inline-notice__actions"});

        // Native buttons rather than `Button` instances: the notice owns these two
        // for its whole life and `dismissible` toggles one of them at runtime, so
        // their listeners belong to this component's teardown, not to a child's.
        this.closeButton = el("button", {
            class: "mac-inline-notice__close",
            type: "button",
            "aria-label": "关闭",
            title: "关闭",
        });
        this.closeButton.appendChild(svgIcon(CLOSE_GLYPH, 12));

        this.actions.appendChild(this.closeButton);

        if (options.action) {
            const {label, onAction} = options.action;
            const button = el("button", {
                class: "mac-inline-notice__action",
                type: "button",
                text: label,
            });
            this.listen(button, "click", () => onAction());
            // Before the close button: the action is the constructive one, and
            // macOS puts it ahead of the dismiss affordance.
            this.actions.insertBefore(button, this.closeButton);
        }

        this.root.appendChild(this.iconWrap);
        this.root.appendChild(text);
        this.root.appendChild(this.actions);

        this.listen(this.closeButton, "click", () => this.dismiss());

        // Tone first (it owns the role and the default glyph), then the caller's
        // glyph if there is one — `customIcon` is already true by now, so the tone
        // pass above deliberately left the icon wrapper empty for it.
        this.setTone(this.currentTone);
        if (options.icon !== undefined) this.setIcon(options.icon);

        this.setTitle(options.title ?? "");
        this.setMessage(options.message);
        this.syncActions();
    }

    /** The current tone. */
    get tone(): NoticeTone {
        return this.currentTone;
    }

    /** True once the user (or the caller) dismissed the notice. */
    get isDismissed(): boolean {
        return this.root.hasAttribute("hidden");
    }

    /**
     * Change the tone: tint, edge, glyph and — for `danger` — the live-region role.
     * Silent.
     */
    setTone(tone: NoticeTone): void {
        this.currentTone = tone;
        this.root.dataset.tone = tone;

        // Announced politely for a report, assertively for a failure. Written on
        // every call because the role is state, not a construction argument.
        this.root.setAttribute("role", tone === "danger" ? "alert" : "status");

        if (!this.customIcon) this.drawGlyph(GLYPHS[tone]);
    }

    /** Replace the leading glyph. Passing a path makes the glyph tone-independent. */
    setIcon(path: string): void {
        this.customIcon = true;
        this.drawGlyph(path);
    }

    /** Draw a glyph without claiming it: the tone still owns its own marks. */
    private drawGlyph(path: string): void {
        this.iconWrap.replaceChildren(svgIcon(path, 16));
    }

    /** Replace the bold line; an empty string removes it. Silent. */
    setTitle(title: string): void {
        this.titleNode.textContent = title;
        this.titleNode.hidden = title === "";
    }

    /** Replace the sentence. Silent. */
    setMessage(message: string): void {
        this.messageNode.textContent = message;
    }

    /** Show or hide the close button. Silent. */
    setDismissible(dismissible: boolean): void {
        this.dismissible = dismissible;
        this.syncActions();
    }

    /**
     * Hide the notice and report it.
     *
     * The node stays where it is: a caller that removes it in the handler would
     * leave the layout to jump in the same frame, and an undismissed notice has
     * to keep its place. The condition is the caller's to clear.
     */
    dismiss(): void {
        if (this.root.hidden) return;
        this.root.hidden = true;
        this.onDismiss?.();
    }

    /** Keep the action row, and its padding, out of the layout when it is empty. */
    private syncActions(): void {
        this.closeButton.hidden = !this.dismissible;
        this.actions.hidden = !this.hasAction && !this.dismissible;
    }
}
