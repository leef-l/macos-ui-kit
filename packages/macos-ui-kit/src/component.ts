/**
 * Base class for every macOS UI Kit component.
 *
 * It owns two things that raw DOM code gets wrong most often:
 *
 * 1. **Listener lifetime.** Vanilla UI leaks because listeners outlive the
 *    elements they touch. `listen` records every binding so `destroy()` can
 *    remove all of them in one pass.
 * 2. **A stable root element.** Subclasses build their markup in the
 *    constructor; callers only ever see `element`, which keeps the internal DOM
 *    structure free to change.
 *
 * Deliberately light DOM: shadow roots would retarget `event.target`, and
 * Wails' window-drag detection reads exactly that property
 * (`internal/runtime/.../drag.ts` uses `event.target`, never `composedPath`).
 */
export abstract class Component<T extends HTMLElement = HTMLElement> {
    /** The root element. Subclasses fill this in before the constructor returns. */
    protected abstract readonly root: T;

    private readonly cleanups: Array<() => void> = [];
    private destroyed = false;

    /** The component's root element, for mounting into the page. */
    get element(): T {
        return this.root;
    }

    /** True once `destroy()` has run. */
    get isDestroyed(): boolean {
        return this.destroyed;
    }

    /**
     * Add an event listener whose removal `destroy()` handles.
     *
     * Prefer this over `addEventListener` everywhere: a component that is torn
     * down mid-session (a closed dialog, a re-rendered list) must not leave
     * handlers pointing at detached nodes.
     */
    protected listen<K extends keyof HTMLElementEventMap>(
        target: T | HTMLElement | Document | Window,
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
        options?: AddEventListenerOptions,
    ): void;
    protected listen(
        target: T | HTMLElement | Document | Window,
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions,
    ): void;
    protected listen(
        target: T | HTMLElement | Document | Window,
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions,
    ): void {
        target.addEventListener(type, handler, options);
        this.cleanups.push(() => target.removeEventListener(type, handler, options));
    }

    /** Register an arbitrary teardown step (timers, observers, subscriptions). */
    protected onDestroy(cleanup: () => void): void {
        this.cleanups.push(cleanup);
    }

    /** Reflect a boolean state as a class on the root, skipping no-op writes. */
    protected toggleClass(name: string, on: boolean): void {
        if (this.root.classList.contains(name) === on) return;
        this.root.classList.toggle(name, on);
    }

    /** Set an attribute only when its value actually changes. */
    protected setAttr(name: string, value: string): void {
        if (this.root.getAttribute(name) === value) return;
        this.root.setAttribute(name, value);
    }

    /** Mount the component into a parent, replacing that parent's content. */
    mount(parent: Element = document.body): this {
        parent.replaceChildren(this.root);
        return this;
    }

    /** Remove the component from the document and release everything it holds. */
    remove(): void {
        this.root.remove();
        this.destroy();
    }

    /** Tear down listeners and timers. Safe to call more than once. */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const cleanup of this.cleanups.splice(0)) {
            try {
                cleanup();
            } catch (error) {
                console.error("mac ui: cleanup failed", error);
            }
        }
    }
}
