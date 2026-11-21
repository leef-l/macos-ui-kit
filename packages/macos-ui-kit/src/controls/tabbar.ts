import {Component} from "../component";
import {append, el, svgIcon} from "../dom";
import "./tabbar.css";

export interface TabBarItem {
    /** Stable key reported by `onChange`. */
    value: string;
    /** Visible caption under the glyph. */
    label: string;
    /** SVG path on the 24×24 grid. */
    icon: string;
    /** Count or short text pinned to the glyph; omit for none. */
    badge?: string;
}

export interface TabBarOptions {
    items: TabBarItem[];
    /** Initially selected item. Defaults to the first one. */
    value?: string;
    /** Accessible name for the list. Default "标签栏". */
    ariaLabel?: string;
    /** Fires with the value of the tab the user picked. Silent on `setValue`. */
    onChange?: (value: string) => void;
}

interface Entry {
    item: TabBarItem;
    button: HTMLButtonElement;
    badge: HTMLSpanElement | null;
}

/**
 * The iOS tab bar: one row of glyph-over-caption buttons pinned to the bottom of
 * the screen.
 *
 * It is a `tablist`, not a set of links: the items switch panes inside one
 * screen, which is exactly what `role="tab"` describes, and a screen reader then
 * announces "1 of 4" and the selected state without any extra markup.
 *
 * Roving tabindex, the same as every other collection in the kit: one tab stop for
 * the whole bar, arrow keys to walk it, and `aria-selected` carrying the choice.
 * The bar itself only draws; the caller owns which pane is on screen.
 */
export class TabBar extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly entries: Entry[] = [];
    private readonly onChange?: (value: string) => void;
    private current: string;

    constructor(options: TabBarOptions) {
        super();

        const {items, ariaLabel = "标签栏", onChange} = options;

        this.onChange = onChange;
        this.current = options.value ?? items[0]?.value ?? "";

        this.root = el("nav", {class: "mac-tabbar", role: "tablist", "aria-label": ariaLabel});

        for (const item of items) {
            const button = el("button", {
                class: "mac-tabbar__item",
                type: "button",
                role: "tab",
                "aria-selected": String(item.value === this.current),
                "data-value": item.value,
            });

            const glyph = el("span", {class: "mac-tabbar__icon", "aria-hidden": "true"});
            glyph.appendChild(svgIcon(item.icon, 24, "0 0 24 24"));

            const caption = el("span", {class: "mac-tabbar__label"});

            let badge: HTMLSpanElement | null = null;
            if (item.badge !== undefined && item.badge !== "") {
                badge = el("span", {class: "mac-tabbar__badge", text: item.badge});
                glyph.appendChild(badge);
            }

            append(caption, [item.label]);
            button.append(glyph, caption);
            this.entries.push({item, button, badge});
            this.root.appendChild(button);
        }

        this.syncTabStops();

        this.listen(this.root, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".mac-tabbar__item");
            if (button) this.select(button.dataset.value ?? "", true);
        });

        this.listen(this.root, "keydown", (event) => this.onKeyDown(event));
    }

    /** The selected item's value. */
    get value(): string {
        return this.current;
    }

    /** Select an item by value without reporting it. Unknown values are ignored. */
    setValue(value: string): void {
        this.select(value, false);
    }

    /** Set or clear an item's badge; an empty string removes it. */
    setBadge(value: string, badge: string): void {
        const entry = this.entries.find((e) => e.item.value === value);
        if (!entry) return;
        entry.badge?.remove();
        entry.badge = null;
        if (badge === "") return;
        const node = el("span", {class: "mac-tabbar__badge", text: badge});
        entry.button.querySelector(".mac-tabbar__icon")?.appendChild(node);
        entry.badge = node;
    }

    private select(value: string, notify: boolean): void {
        const entry = this.entries.find((e) => e.item.value === value);
        if (!entry) return;
        // Re-selecting the current tab is a no-op rather than a second callback:
        // `onChange` reports a change, and a jump to the pane already on screen is
        // not one.
        if (value !== this.current) {
            this.current = value;
            for (const other of this.entries) {
                other.button.setAttribute("aria-selected", String(other.item.value === value));
            }
        }
        this.syncTabStops();
        if (notify) this.onChange?.(value);
    }

    /** Exactly one item holds the tab stop, and it is the selected one. */
    private syncTabStops(): void {
        for (const entry of this.entries) {
            entry.button.tabIndex = entry.item.value === this.current ? 0 : -1;
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"];
        if (!keys.includes(event.key)) return;

        const index = this.entries.findIndex((e) => e.item.value === this.current);
        if (index === -1) return;

        const last = this.entries.length - 1;
        let next = index;
        switch (event.key) {
            case "ArrowLeft":
            case "ArrowUp":
                next = index === 0 ? last : index - 1;
                break;
            case "ArrowRight":
            case "ArrowDown":
                next = index === last ? 0 : index + 1;
                break;
            case "Home":
                next = 0;
                break;
            default:
                next = last;
        }

        event.preventDefault();
        const target = this.entries[next];
        target.button.focus();
        this.select(target.item.value, true);
    }
}
