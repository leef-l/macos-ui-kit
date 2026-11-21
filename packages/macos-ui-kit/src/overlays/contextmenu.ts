import {Component} from "../component";
import {el} from "../dom";
import {Menu, type MenuItem} from "./menu";
import "./contextmenu.css";

export interface ContextMenuOptions {
    /**
     * Items for the menu. A function is called at every opening with the event
     * that requested it, which is how a per-row menu gets its row.
     */
    items: MenuItem[] | ((event: MouseEvent | null) => MenuItem[]);
    /** Fires with the chosen value. */
    onSelect?: (value: string, event: MouseEvent | null) => void;
    /** Fires once the menu has closed. */
    onClose?: () => void;
}

/**
 * A macOS context menu: right-click, Control-click, or the keyboard menu key.
 *
 * It does not re-implement menus. A `Menu` is placed against a 1×1 anchor parked
 * at the pointer, so the panel inherits everything `Menu` already gets right —
 * viewport flipping, clamping, arrow-key navigation, Escape and a `menu` role —
 * and this class only owns what is specific to a context menu: capturing the
 * gesture, suppressing the engine's own menu, positioning at a coordinate, and
 * closing when the page scrolls underneath.
 *
 * One `ContextMenu` per target is the intended usage: attach once, open as many
 * times as needed. A fresh `Menu` is built per opening so a dynamic `items`
 * function can never hand back a stale list.
 */
export class ContextMenu extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly options: ContextMenuOptions;

    /** Invisible anchor the menu is positioned against. */
    private readonly anchor: HTMLDivElement;

    private menu: Menu | null = null;
    /** The event that asked for the menu, forwarded to a dynamic `items`. */
    private currentEvent: MouseEvent | null = null;

    constructor(options: ContextMenuOptions) {
        super();

        this.options = options;

        // Never in the flow: it exists only to give `positionOverlay` a rect.
        // `pointer-events: none` keeps it out of hit testing.
        this.anchor = el("div", {class: "mac-contextmenu-anchor", "aria-hidden": "true"});
        this.root = this.anchor;

        // A menu pinned to a fixed anchor would hang in place while the content
        // under it scrolls away, so scrolling closes it — the behaviour macOS
        // has, and the only sane one for a row menu.
        this.listen(
            document,
            "scroll",
            () => {
                if (this.menu?.isOpen) this.close();
            },
            {capture: true, passive: true},
        );
    }

    /**
     * Bind the context-menu gesture on an element.
     *
     * Covers the mouse path (`contextmenu`, which also fires for Control-click)
     * and the keyboard path (the menu key and Shift+F10). Returns `this` so the
     * call can be chained.
     */
    attachTo(target: HTMLElement): this {
        this.listen(target, "contextmenu", ((event: MouseEvent) => {
            // The engine menu must not appear over ours.
            event.preventDefault();
            event.stopPropagation();
            this.openAt(event.clientX, event.clientY, event);
        }) as EventListener);

        this.listen(target, "keydown", ((event: KeyboardEvent) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            // No pointer position: drop the menu at the element's lower-left
            // corner so the keyboard path opens somewhere sensible.
            const rect = target.getBoundingClientRect();
            this.openAt(rect.left + 8, rect.bottom - 8, null);
        }) as EventListener);

        return this;
    }

    /** Open at viewport coordinates. `event` is forwarded to a dynamic `items`. */
    openAt(x: number, y: number, event: MouseEvent | null = null): void {
        this.close();
        this.currentEvent = event;

        const items =
            typeof this.options.items === "function"
                ? this.options.items(event)
                : this.options.items;
        if (items.length === 0) return;

        // Park the anchor at the pointer. `position: fixed`, so the coordinates
        // are viewport-relative and no scroll offset has to be subtracted.
        this.anchor.style.left = `${Math.round(x)}px`;
        this.anchor.style.top = `${Math.round(y)}px`;
        if (!this.anchor.isConnected) document.body.appendChild(this.anchor);

        const menu: Menu = new Menu({
            items,
            placement: "bottom-start",
            // A context menu's corner belongs on the cursor, not below it.
            offset: 0,
            onSelect: (value) => this.options.onSelect?.(value, this.currentEvent),
            onClose: () => {
                this.menu = null;
                this.anchor.remove();
                this.options.onClose?.();
                menu.destroy();
            },
        });

        this.menu = menu;
        menu.open(this.anchor);
    }

    /** Close the menu if it is open. */
    close(): void {
        this.menu?.close();
    }

    /** Whether the menu is on screen. */
    get isOpen(): boolean {
        return this.menu?.isOpen ?? false;
    }

    override destroy(): void {
        this.menu?.close();
        this.menu = null;
        this.anchor.remove();
        super.destroy();
    }
}

/**
 * Open a one-shot context menu at the event's coordinates.
 *
 * `items` is resolved here as well as inside `openAt`, so an empty result can
 * release the wrapper instead of leaving a document listener behind.
 */
export function showContextMenu(event: MouseEvent, options: ContextMenuOptions): void {
    event.preventDefault();

    const contextMenu: ContextMenu = new ContextMenu({
        ...options,
        onClose: () => {
            options.onClose?.();
            contextMenu.destroy();
        },
    });

    const items =
        typeof options.items === "function" ? options.items(event) : options.items;
    if (items.length === 0) {
        // Nothing to show: release the wrapper rather than leaving a listener.
        contextMenu.destroy();
        return;
    }

    contextMenu.openAt(event.clientX, event.clientY, event);
}
