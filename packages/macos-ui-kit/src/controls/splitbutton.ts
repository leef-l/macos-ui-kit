import {Component} from "../component";
import {el, svgIcon} from "../dom";
import {showMenu, type Menu, type MenuItem} from "../overlays/menu";
import "./splitbutton.css";

export type SplitButtonVariant = "default" | "primary";
export type SplitButtonSize = "small" | "default" | "large";

export interface SplitButtonOptions {
    /** Visible label on the action half. */
    label: string;
    /** Menu rows offered by the chevron half. */
    items: MenuItem[];
    variant?: SplitButtonVariant;
    size?: SplitButtonSize;
    /** Leading SVG path data, drawn before the label. */
    icon?: string;
    disabled?: boolean;
    /** Fires when the action half is clicked (or activated by Enter/Space). */
    onAction?: () => void;
    /** Fires with the value of the chosen menu row. */
    onSelect?: (value: string) => void;
}

/** The same chevron the pop-up button and the combo box draw, at 12px. */
const CHEVRON = "M2.5 4.5 L6 8 L9.5 4.5";

/**
 * A macOS split button: a primary action fused to a menu of alternatives.
 *
 * Two real `<button>`s inside one pill, not one button with a gesture: each half
 * needs its own accessible name, its own focus stop and the browser's native
 * Enter/Space activation. The separator is a border on the chevron half, so the
 * pill keeps a single outline without a third node to keep in sync.
 *
 * The menu is built per opening through `showMenu`, which releases the instance
 * (and the document listeners a Menu registers) from its own `onClose`. A single
 * long-lived Menu would hold two document listeners for the lifetime of the
 * control whether or not it is ever opened.
 */
export class SplitButton extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly action: HTMLButtonElement;
    private readonly toggle: HTMLButtonElement;
    private readonly labelNode: HTMLSpanElement;
    private readonly onAction?: () => void;
    private readonly onSelect?: (value: string) => void;

    private items: MenuItem[];
    private currentLabel: string;
    private disabled = false;
    private menu: Menu | null = null;

    constructor(options: SplitButtonOptions) {
        super();

        const {
            label,
            items,
            variant = "default",
            size = "default",
            icon,
            disabled = false,
            onAction,
            onSelect,
        } = options;

        this.items = items;
        this.currentLabel = label;
        this.onAction = onAction;
        this.onSelect = onSelect;

        const classes = ["mac-splitbutton"];
        if (variant !== "default") classes.push(`mac-splitbutton--${variant}`);
        if (size !== "default") classes.push(`mac-splitbutton--${size}`);

        this.root = el("div", {class: classes.join(" ")});

        this.action = el("button", {
            class: "mac-splitbutton__action",
            type: "button",
            disabled,
        });

        if (icon) {
            const iconWrap = el("span", {class: "mac-splitbutton__icon"});
            iconWrap.appendChild(svgIcon(icon, 14));
            this.action.appendChild(iconWrap);
        }

        this.labelNode = el("span", {class: "mac-splitbutton__label", text: label});
        this.action.appendChild(this.labelNode);

        this.toggle = el("button", {
            class: "mac-splitbutton__toggle",
            type: "button",
            disabled,
            "aria-haspopup": "menu",
            "aria-expanded": "false",
            // The chevron is decoration, not a name.
            "aria-label": "更多操作",
            title: "更多操作",
        });
        this.toggle.appendChild(svgIcon(CHEVRON, 12, "0 0 12 12"));

        this.root.append(this.action, this.toggle);

        this.listen(this.action, "click", () => this.onAction?.());

        // The press is handled on mousedown, and it is stopped here.
        //
        // A Menu closes itself from a document-level `mousedown` whenever the
        // press lands outside its panel — and this toggle is outside it. Working
        // from `click` instead would run *after* that close, so pressing the open
        // toggle would close and immediately reopen the menu; and a Menu built
        // during this very dispatch would still see the event on its way up to
        // `document`. Stopping propagation gives one press exactly one toggle.
        this.listen(this.toggle, "mousedown", (event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            this.toggleMenu();
        });

        // A click with no click count has no pointer behind it: that is Enter,
        // Space, or an assistive-technology activation. Pointer clicks carry a
        // count and are already handled by the press above.
        this.listen(this.toggle, "click", (event) => {
            if (event.detail !== 0) return;
            this.toggleMenu();
        });

        this.listen(this.toggle, "keydown", (event) => {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                this.openMenu();
                return;
            }
            if (event.key === "Escape" && this.isOpen) {
                event.preventDefault();
                this.closeMenu();
            }
        });

        // Enter and Space on the action half are the browser's job, so the action
        // half needs no key handling of its own.
        if (disabled) this.setDisabled(true);
    }

    /** Whether the menu is currently open. */
    get isOpen(): boolean {
        return this.menu?.isOpen === true;
    }

    /** The label shown on the action half. */
    get label(): string {
        return this.currentLabel;
    }

    /** Replace the action half's label. */
    setLabel(label: string): void {
        if (this.currentLabel === label) return;
        this.currentLabel = label;
        this.labelNode.textContent = label;
    }

    /** Replace the menu rows. */
    setItems(items: MenuItem[]): void {
        this.items = items;
        // A built Menu copies its rows at construction, so an open panel would
        // keep offering the previous actions; closing reopens onto the new list.
        this.closeMenu();
    }

    /** Enable or disable the control. Disabling closes an open menu. */
    setDisabled(disabled: boolean): void {
        if (this.disabled === disabled) return;
        this.disabled = disabled;
        this.action.disabled = disabled;
        this.toggle.disabled = disabled;
        this.toggleClass("is-disabled", disabled);

        // A menu left hanging over a control the user can no longer press has no
        // toggle left to dismiss it with.
        if (disabled) this.closeMenu();
    }

    /** Move keyboard focus to the action half. */
    focus(): void {
        this.action.focus();
    }

    private toggleMenu(): void {
        if (this.isOpen) this.closeMenu();
        else this.openMenu();
    }

    private openMenu(): void {
        if (this.isOpen || this.items.length === 0) return;

        this.menu = showMenu(this.toggle, {
            items: this.items,
            // Right edge under the chevron half, the way a macOS split button's
            // menu hangs from the toggle it came out of.
            placement: "bottom-end",
            onSelect: (value) => this.onSelect?.(value),
            onClose: () => {
                this.menu = null;
                this.syncOpenState(false);
            },
        });

        this.syncOpenState(true);
    }

    private closeMenu(): void {
        const menu = this.menu;
        if (!menu) return;

        // Drop the reference first: `close()` runs `onClose`, which releases the
        // instance through `showMenu` and would otherwise look like a second
        // close of the same menu.
        this.menu = null;
        if (menu.isOpen) menu.close();
        else menu.destroy();
        this.syncOpenState(false);
    }

    private syncOpenState(open: boolean): void {
        this.toggle.setAttribute("aria-expanded", String(open));
        this.toggleClass("is-open", open);
    }

    override destroy(): void {
        // Closing first is what keeps the panel out of `document.body`: a
        // destroyed control must never leave an overlay behind it.
        this.closeMenu();
        super.destroy();
    }
}
