import {Component} from "../component";
import {append, el, svgIcon, type Child} from "../dom";
import "./button.css";

export type ButtonVariant = "default" | "primary" | "destructive" | "plain";
export type ButtonSize = "small" | "default" | "large";

export interface ButtonOptions {
    /** Visible label. Omit for an icon-only button (then set `ariaLabel`). */
    label?: Child;
    /** Leading SVG path data, drawn at the control's icon size. */
    icon?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Accessible name; required when there is no visible label. */
    ariaLabel?: string;
    /** Stretch to the container's width. */
    block?: boolean;
    disabled?: boolean;
    /** Native `type`, so a button inside a form does not submit by accident. */
    type?: "button" | "submit" | "reset";
    /** Fires on activation (click, Enter, Space — the browser handles the rest). */
    onClick?: (event: MouseEvent) => void;
}

/**
 * A native `<button>` with macOS styling.
 *
 * Built on the real element rather than a `div[role=button]` so keyboard
 * activation, disabled handling and focus order come from the browser.
 */
export class Button extends Component<HTMLButtonElement> {
    protected readonly root: HTMLButtonElement;

    private readonly labelNode: HTMLSpanElement | null = null;

    constructor(options: ButtonOptions = {}) {
        super();

        const {
            label,
            icon,
            variant = "default",
            size = "default",
            ariaLabel,
            block = false,
            disabled = false,
            type = "button",
            onClick,
        } = options;

        const classes = ["mac-button"];
        if (variant !== "default") classes.push(`mac-button--${variant}`);
        if (size !== "default") classes.push(`mac-button--${size}`);
        if (block) classes.push("mac-button--block");

        this.root = el("button", {
            class: classes.join(" "),
            type,
            disabled,
        });

        if (icon) {
            const iconWrap = el("span", {class: "mac-button__icon"});
            iconWrap.appendChild(svgIcon(icon, 14));
            this.root.appendChild(iconWrap);
        }

        if (label !== undefined) {
            this.labelNode = el("span", {class: "mac-button__label"});
            append(this.labelNode, [label]);
            this.root.appendChild(this.labelNode);
        }

        // Accessibility: a button without a visible label still needs a name.
        const accessibleName =
            ariaLabel ?? (typeof label === "string" ? label : undefined);
        if (accessibleName) {
            this.root.setAttribute("aria-label", accessibleName);
        }

        if (onClick) {
            this.listen(this.root, "click", onClick);
        }
    }

    /** Replace the visible label text. */
    setLabel(text: string): void {
        if (this.labelNode) {
            this.labelNode.textContent = text;
        }
    }

    /** Enable or disable the button. */
    setDisabled(disabled: boolean): void {
        if (this.root.disabled === disabled) return;
        this.root.disabled = disabled;
    }

    /** Toggle the primary (blue) treatment at runtime. */
    setPrimary(primary: boolean): void {
        this.root.classList.toggle("mac-button--primary", primary);
    }

    /** Give the caller a way to move focus programmatically. */
    focus(): void {
        this.root.focus();
    }
}
