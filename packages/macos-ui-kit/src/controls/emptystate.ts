import {Component} from "../component";
import {el, type Child} from "../dom";
import {Button} from "./button";
import "./emptystate.css";

export interface EmptyStateAction {
    label: string;
    /** `primary` draws the accent-filled button; the rest are bordered. */
    variant?: "primary" | "secondary";
    onClick?: () => void;
}

export interface EmptyStateOptions {
    /** Headline. Short: "没有结果", "还没有项目". */
    title: string;
    /** One or two sentences of guidance. Optional: a title alone is often enough. */
    message?: Child;
    /**
     * Icon path in the 24×24 viewBox used across the kit. Defaults to a
     * document glyph, which suits list and detail views equally.
     */
    icon?: string;
    /** Primary recovery action, usually "新建" or "清除筛选". */
    action?: EmptyStateAction;
    /** Tighter padding for a small pane (a sidebar, a popover). */
    compact?: boolean;
}

const DEFAULT_ICON =
    "M7 3.5h6.5L19 9v11.5H7z M13.5 3.5V9H19 M9.5 13h5 M9.5 16.5h3";

/**
 * The placeholder shown where content would be.
 *
 * Sizing is deliberately restrained: an empty state that fills the pane with a
 * large illustration reads as an error screen. Here the glyph is a quiet
 * outline in tertiary ink and only the action carries accent colour.
 */
export class EmptyState extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    constructor(options: EmptyStateOptions) {
        super();

        this.root = el("div", {
            class: `mac-emptystate${options.compact ? " is-compact" : ""}`,
            role: "status",
        });

        const glyph = el("div", {class: "mac-emptystate__glyph", "aria-hidden": "true"});
        glyph.innerHTML = svgMarkup(options.icon ?? DEFAULT_ICON);
        this.root.appendChild(glyph);

        this.root.appendChild(el("p", {class: "mac-emptystate__title", text: options.title}));

        if (options.message !== undefined) {
            const message = el("p", {class: "mac-emptystate__message"});
            if (typeof options.message === "string" || typeof options.message === "number") {
                message.textContent = String(options.message);
            } else if (options.message) {
                message.appendChild(options.message);
            }
            this.root.appendChild(message);
        }

        if (options.action) {
            const action = options.action;
            const button = new Button({
                label: action.label,
                variant: action.variant === "primary" ? "primary" : "default",
                onClick: () => action.onClick?.(),
            });
            const row = el("div", {class: "mac-emptystate__actions"});
            row.appendChild(button.element);
            this.root.appendChild(row);
            // The Button owns no timers, but it does own listeners on its own
            // element, which are collected with the subtree.
            this.onDestroy(() => button.destroy());
        }
    }
}

/** Inline the glyph so the icon inherits `currentColor` from the wrapper. */
function svgMarkup(path: string): string {
    return (
        '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" ' +
        'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
        `stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`
    );
}
