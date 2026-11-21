import {Component} from "../component";
import {append, el, svgIcon, uid, type Child} from "../dom";
import {trapFocus} from "../overlay";
import {Button, type ButtonVariant} from "../controls/button";
import {Checkbox} from "../controls/checkbox";
import "./alert.css";

/** The tint and glyph drawn beside the title. */
export type AlertIcon = "info" | "warning" | "error" | "success" | "question";

export interface AlertButton {
    /** Visible text. */
    label: string;
    /** Value the promise resolves with; defaults to `label`. */
    value?: string;
    variant?: ButtonVariant;
    /** Runs when Return is pressed. The first such button wins. */
    isDefault?: boolean;
    /** Runs when Escape is pressed, and dims the scrim click. Defaults to the last button. */
    isCancel?: boolean;
}

export interface AlertOptions {
    title: string;
    /** Body text, or any node for rich content. */
    message?: Child;
    /** Glyph beside the title. `false` hides it. Defaults to `info`. */
    icon?: AlertIcon | false;
    /** Buttons, leading-to-trailing. Default: a single primary "好". */
    buttons?: AlertButton[];
    /**
     * Add a tick row at the bottom of the body ("不再提示"). The promise still
     * resolves with the button value; read `isSuppressed` on the instance, or
     * use the `onClose` callback which receives both.
     */
    suppressLabel?: string;
    /** Fires once with the chosen value and the tick state. */
    onClose?: (value: string, suppressed: boolean) => void;
}

/** One path per glyph, drawn inside a tinted circle. */
const GLYPHS: Record<AlertIcon, string> = {
    info: "M12 11 v6 M12 7.6 v0.6",
    warning: "M12 8 v5 M12 16.2 v0.6",
    error: "M12 8 v5 M12 16.2 v0.6",
    success: "M8 12.4 L11 15.4 L16.4 9.2",
    question: "M9.6 9.4 a2.5 2.5 0 1 1 3.2 2.7 c-0.6 0.2 -0.8 0.7 -0.8 1.3 v0.4 M12 16.4 v0.6",
};

const DEFAULT_BUTTONS: AlertButton[] = [
    {label: "好", value: "ok", variant: "primary", isDefault: true},
];

/**
 * A modal macOS alert with a promise API.
 *
 * ```ts
 * const choice = await showAlert({
 *     title: "删除 3 个环境？",
 *     message: "这一步无法撤销。",
 *     icon: "warning",
 *     buttons: [
 *         {label: "取消", value: "cancel", isCancel: true},
 *         {label: "删除", value: "delete", variant: "destructive", isDefault: true},
 *     ],
 * });
 * ```
 *
 * Why a promise and not a callback: an alert is a question, and the only sane
 * place to handle the answer is right after the question. `open()` returns the
 * same promise, so the instance API and the one-shot `showAlert` agree.
 *
 * Focus is trapped for the dialog's lifetime and Return/Escape are bound to the
 * declared buttons, which is what makes an alert usable without a mouse.
 */
export class Alert extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly scrim: HTMLDivElement;
    private readonly buttons: AlertButton[];
    private readonly suppress: Checkbox | null = null;
    private readonly onClose?: (value: string, suppressed: boolean) => void;

    private releaseFocus: (() => void) | null = null;
    private opened = false;
    private settled = false;
    private resolve: ((value: string) => void) | null = null;

    constructor(options: AlertOptions) {
        super();

        const {title, message, icon = "info", suppressLabel, onClose} = options;
        this.onClose = onClose;
        this.buttons = options.buttons?.length ? options.buttons : DEFAULT_BUTTONS;

        const titleId = uid("mac-alert-title");
        const messageId = uid("mac-alert-message");

        this.scrim = el("div", {class: "mac-alert__scrim"});

        this.root = el("div", {
            class: "mac-alert",
            role: "alertdialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "aria-describedby": message !== undefined ? messageId : undefined,
            tabindex: -1,
        });

        const head = el("div", {class: "mac-alert__head"});

        if (icon !== false) {
            const iconWrap = el("span", {class: `mac-alert__icon mac-alert__icon--${icon}`});
            iconWrap.appendChild(svgIcon(GLYPHS[icon], 20));
            head.appendChild(iconWrap);
        }

        const text = el("div", {class: "mac-alert__text"});
        text.appendChild(el("h2", {class: "mac-alert__title", text: title, id: titleId}));

        if (message !== undefined) {
            const body = el("div", {class: "mac-alert__message", id: messageId});
            append(body, [message]);
            text.appendChild(body);
        }

        head.appendChild(text);
        this.root.appendChild(head);

        if (suppressLabel) {
            this.suppress = new Checkbox({label: suppressLabel});
            const row = el("div", {class: "mac-alert__suppress"});
            row.appendChild(this.suppress.element);
            this.root.appendChild(row);
        }

        const actions = el("div", {class: "mac-alert__actions"});
        for (const button of this.buttons) {
            const node = new Button({
                label: button.label,
                variant: button.variant ?? "default",
                onClick: () => this.settle(button),
            });
            actions.appendChild(node.element);
        }
        this.root.appendChild(actions);

        this.scrim.appendChild(this.root);

        // A click on the scrim resolves with the cancel button, matching the
        // Escape path, so the two "I did not mean to do this" gestures agree.
        this.listen(this.scrim, "mousedown", (event) => {
            if (event.target === this.scrim) this.cancel();
        });

        this.listen(document, "keydown", (event) => {
            if (!this.opened) return;
            if (event.key === "Escape") {
                event.preventDefault();
                this.cancel();
            } else if (event.key === "Enter") {
                // Return activates the declared default button. Without this a
                // keyboard user has to Tab to a button that macOS would have
                // made the Return target all along.
                const target = this.defaultButton();
                if (!target) return;
                event.preventDefault();
                this.settle(target);
            }
        });
    }

    /** Whether the alert is on screen. */
    get isOpen(): boolean {
        return this.opened;
    }

    /** Whether the "do not show again" row is ticked. Always `false` when absent. */
    get isSuppressed(): boolean {
        return this.suppress?.checked ?? false;
    }

    /** Show the alert; the promise resolves with the chosen button value. */
    open(): Promise<string> {
        if (this.settled) {
            return Promise.resolve(this.cancelValue()?.value ?? "");
        }

        const promise = new Promise<string>((resolve) => {
            this.resolve = resolve;
        });

        if (this.opened) return promise;
        this.opened = true;

        document.body.appendChild(this.scrim);
        this.releaseFocus = trapFocus(this.root);

        // Two frames: one to get the initial (hidden) state painted, one to
        // transition out of it. A class added in the same frame as the append
        // is collapsed by the style engine and the fade never runs.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (this.opened) this.scrim.classList.add("is-open");
            });
        });

        return promise;
    }

    /** Close without a choice, resolving with the cancel value. */
    close(value?: string): void {
        const resolved = value ?? this.cancelValue()?.value ?? "";
        this.finish(resolved);
    }

    override destroy(): void {
        this.releaseFocus?.();
        this.releaseFocus = null;
        this.suppress?.destroy();
        this.scrim.remove();
        // A pending promise must not hang forever when the owner goes away.
        this.finish("");
        super.destroy();
    }

    /** The button Return triggers. */
    private defaultButton(): AlertButton | undefined {
        return this.buttons.find((button) => button.isDefault) ?? this.buttons[this.buttons.length - 1];
    }

    /** The button Escape triggers. */
    private cancelValue(): AlertButton | undefined {
        return this.buttons.find((button) => button.isCancel) ?? this.buttons[this.buttons.length - 1];
    }

    private cancel(): void {
        this.close(this.cancelValue()?.value);
    }

    private settle(button: AlertButton): void {
        this.finish(button.value ?? button.label);
    }

    /** Resolve once, run the callback once, fade out. */
    private finish(value: string): void {
        if (this.settled) return;
        this.settled = true;

        const suppressed = this.isSuppressed;
        this.resolve?.(value);
        this.resolve = null;
        this.onClose?.(value, suppressed);

        if (!this.opened) {
            this.scrim.remove();
            return;
        }
        this.opened = false;

        this.scrim.classList.remove("is-open");
        this.releaseFocus?.();
        this.releaseFocus = null;

        setTimeout(() => {
            if (!this.opened) this.scrim.remove();
        }, 180);
    }
}

/**
 * Show an alert and resolve with the chosen value.
 *
 * The instance is destroyed once the fade finishes, so a caller that fires many
 * alerts in sequence does not accumulate hidden scrims.
 */
export function showAlert(options: AlertOptions): Promise<string> {
    const alert = new Alert({
        ...options,
        onClose: (value, suppressed) => {
            options.onClose?.(value, suppressed);
            // Let the fade run, then release the listeners and the DOM.
            setTimeout(() => alert.destroy(), 240);
        },
    });
    return alert.open();
}
