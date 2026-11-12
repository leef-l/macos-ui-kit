import {Component} from "../component";
import {el, svgIcon} from "../dom";
import {
    nextZIndex,
    trackOverlay,
    type Placement,
} from "../overlay";
import "./menu.css";

export interface MenuItem {
    label: string;
    value: string;
    /** Leading SVG path data. */
    icon?: string;
    disabled?: boolean;
    /** Show a checkmark (set `role=menuitemcheckbox` semantics). */
    checked?: boolean;
    /** Draw a separator instead of an item. */
    separator?: boolean;
    /** Grey trailing text, e.g. "⌘S". */
    shortcut?: string;
}

export interface MenuOptions {
    items: MenuItem[];
    placement?: Placement;
    /** Fires with the chosen value. */
    onSelect?: (value: string) => void;
}

const CHECK_PATH = "M3 7 L5.5 9.5 L11 4";

/**
 * A macOS pop-up menu.
 *
 * Appended to `document.body` rather than the trigger's parent: a menu inside a
 * scrolling pane or an `overflow: hidden` card would otherwise be clipped.
 *
 * Keyboard support follows the native menu: arrows move the highlight, Home/End
 * jump, Enter selects, Escape closes and returns focus to the trigger.
 */
export class Menu extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly items: MenuItem[];
    private readonly onSelect?: (value: string) => void;
    private readonly menuItems: HTMLButtonElement[] = [];

    private opened = false;
    private disposeTracking: (() => void) | null = null;
    private restoreFocusTo: HTMLElement | null = null;
    private highlighted = -1;

    constructor(options: MenuOptions) {
        super();

        this.items = options.items;
        this.onSelect = options.onSelect;

        this.root = el("div", {
            class: "mac-menu",
            role: "menu",
            tabindex: -1,
        });
        this.root.style.display = "none";
        this.root.style.visibility = "hidden";
        this.root.dataset.placement = options.placement ?? "bottom-start";

        for (const item of this.items) {
            if (item.separator) {
                this.root.appendChild(
                    el("div", {class: "mac-menu__separator", role: "separator"}),
                );
                continue;
            }

            const button = el("button", {
                class: "mac-menu__item",
                type: "button",
                role: item.checked === undefined ? "menuitem" : "menuitemcheckbox",
                disabled: item.disabled ?? false,
                dataset: {value: item.value},
            });
            if (item.checked !== undefined) {
                button.setAttribute("aria-checked", String(item.checked));
            }

            // Leading slot: a checkmark for toggleable items, otherwise an icon.
            if (item.checked !== undefined) {
                const check = el("span", {class: "mac-menu__check"});
                if (item.checked) check.appendChild(svgIcon(CHECK_PATH, 14, "0 0 14 14"));
                button.appendChild(check);
            } else if (item.icon) {
                button.appendChild(svgIcon(item.icon, 14));
            }

            button.appendChild(el("span", {class: "mac-menu__label", text: item.label}));

            if (item.shortcut) {
                button.appendChild(
                    el("span", {class: "mac-menu__shortcut", text: item.shortcut}),
                );
            }

            this.menuItems.push(button);
            this.root.appendChild(button);
        }

        // Delegated activation.
        this.listen(this.root, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
                ".mac-menu__item",
            );
            if (!button || button.disabled) return;
            this.choose(button.dataset.value ?? "");
        });

        this.listen(this.root, "keydown", (event) => this.onKeyDown(event));

        // Pointer hover moves the highlight so click and keyboard agree.
        this.listen(this.root, "mousemove", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
                ".mac-menu__item",
            );
            if (!button || button.disabled) return;
            const index = this.menuItems.indexOf(button);
            if (index >= 0) this.highlight(index);
        });

        // Close on any click that lands outside the menu.
        this.listen(document, "mousedown", (event) => {
            if (!this.opened) return;
            const target = event.target as Node;
            if (!this.root.contains(target)) this.close();
        });

        // Escape closes no matter which element holds focus.
        this.listen(document, "keydown", (event) => {
            if (this.opened && event.key === "Escape") {
                event.preventDefault();
                this.close();
            }
        });
    }

    /** Open the menu anchored to an element. */
    open(anchor: HTMLElement): void {
        if (this.opened) return;

        this.restoreFocusTo = document.activeElement as HTMLElement | null;
        this.root.style.display = "block";
        this.root.style.visibility = "hidden";
        this.root.style.zIndex = String(nextZIndex());
        document.body.appendChild(this.root);

        this.disposeTracking = trackOverlay({
            anchor,
            panel: this.root,
            placement: (this.root.dataset.placement as Placement) ?? "bottom-start",
        });

        this.opened = true;
        // Force a frame so the scale/opacity transition runs from its start.
        requestAnimationFrame(() => {
            this.root.classList.add("is-open");
            this.highlight(0);
            this.root.focus();
        });
    }

    /** Close the menu and restore focus to whatever opened it. */
    close(): void {
        if (!this.opened) return;
        this.opened = false;
        this.root.classList.remove("is-open");

        this.disposeTracking?.();
        this.disposeTracking = null;

        const cleanup = () => {
            // A nested menu may have been opened from inside the transition.
            if (!this.opened) this.root.remove();
        };
        // Wait for the fade-out, but never rely on it firing.
        window.setTimeout(cleanup, 140);
        this.root.remove();
        this.highlight(-1);

        this.restoreFocusTo?.focus?.();
        this.restoreFocusTo = null;
    }

    /** Whether the menu is currently open. */
    get isOpen(): boolean {
        return this.opened;
    }

    private choose(value: string): void {
        this.onSelect?.(value);
        this.close();
    }

    /** Move the keyboard highlight to an index, skipping disabled and separator
        rows. */
    private highlight(index: number): void {
        if (index === this.highlighted) return;

        this.menuItems[this.highlighted]?.classList.remove("is-highlighted");
        this.highlighted = index;
        this.menuItems[index]?.classList.add("is-highlighted");
    }

    /** Step the highlight by ±1, wrapping and skipping disabled entries. */
    private step(direction: 1 | -1): void {
        const selectable = this.menuItems
            .map((button, index) => ({button, index}))
            .filter((entry) => !entry.button.disabled);
        if (selectable.length === 0) return;

        const currentPos = selectable.findIndex((entry) => entry.index === this.highlighted);
        const nextPos =
            currentPos === -1
                ? direction === 1
                    ? 0
                    : selectable.length - 1
                : (currentPos + direction + selectable.length) % selectable.length;

        this.highlight(selectable[nextPos].index);
    }

    private onKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.step(1);
                break;
            case "ArrowUp":
                event.preventDefault();
                this.step(-1);
                break;
            case "Home": {
                event.preventDefault();
                const first = this.menuItems.find((b) => !b.disabled);
                const index = first ? this.menuItems.indexOf(first) : -1;
                if (index >= 0) this.highlight(index);
                break;
            }
            case "End": {
                event.preventDefault();
                for (let i = this.menuItems.length - 1; i >= 0; i -= 1) {
                    if (!this.menuItems[i].disabled) {
                        this.highlight(i);
                        break;
                    }
                }
                break;
            }
            case "Enter":
            case " ": {
                event.preventDefault();
                const active = this.menuItems[this.highlighted];
                if (active && !active.disabled) {
                    this.choose(active.dataset.value ?? "");
                }
                break;
            }
            default:
                break;
        }
    }

    override destroy(): void {
        this.disposeTracking?.();
        this.disposeTracking = null;
        this.root.remove();
        super.destroy();
    }
}

/** Convenience: build a menu, open it at an anchor, and release it on close. */
export function showMenu(anchor: HTMLElement, options: MenuOptions): Menu {
    const menu = new Menu(options);
    menu.open(anchor);
    return menu;
}
