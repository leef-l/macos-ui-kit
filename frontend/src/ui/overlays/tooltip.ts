import {Component} from "../component";
import {el, uid} from "../dom";
import {nextZIndex, trackOverlay, type Placement} from "../overlay";
import "./tooltip.css";

export interface TooltipOptions {
    content: string;
    placement?: Placement;
    /** Delay before showing, in ms. macOS uses a noticeable pause. */
    delay?: number;
}

/**
 * A macOS tooltip.
 *
 * Two things make tooltips usable that hand-written ones usually miss:
 *
 * 1. **Focus triggers it too.** Keyboard and screen-reader users never hover,
 *    so the tooltip opens on focus as well and the trigger is linked with
 *    `aria-describedby`.
 * 2. **The delay cancels.** A quick pointer sweep across a toolbar must not
 *    flash a tooltip on every button, so leaving clears the pending timer.
 */
export class Tooltip extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly content: string;
    private readonly placement: Placement;
    private readonly delay: number;

    private trigger: HTMLElement | null = null;
    private disposeTracking: (() => void) | null = null;
    private showTimer: ReturnType<typeof setTimeout> | null = null;
    private visible = false;

    /**
     * Listeners bound to the current trigger. Tracked separately from the
     * component's own list because `attachTo` can rebind many times over one
     * component's life; `listen()` alone would accumulate every binding.
     */
    private triggerListeners: Array<() => void> = [];

    constructor(options: TooltipOptions) {
        super();

        this.content = options.content;
        this.placement = options.placement ?? "top";
        this.delay = options.delay ?? 400;

        this.root = el("div", {
            class: "mac-tooltip",
            role: "tooltip",
            id: uid("mac-tooltip"),
        });
        this.root.textContent = this.content;
        this.root.style.display = "none";
    }

    /** Bind the tooltip to an element. A tooltip serves one trigger at a time. */
    attachTo(trigger: HTMLElement): void {
        this.detach();
        this.trigger = trigger;
        trigger.setAttribute("aria-describedby", this.root.id);

        const bind = <K extends keyof HTMLElementEventMap>(
            type: K,
            handler: (event: HTMLElementEventMap[K]) => void,
        ) => {
            trigger.addEventListener(type, handler);
            this.triggerListeners.push(() => trigger.removeEventListener(type, handler));
        };

        bind("mouseenter", () => this.schedule());
        bind("mouseleave", () => this.hide());
        bind("focus", () => this.schedule());
        bind("blur", () => this.hide());
        // A click means the user committed; the tooltip is in the way.
        bind("mousedown", () => this.hide());
    }

    /** Unbind from the current trigger and remove the tooltip. */
    detach(): void {
        if (this.trigger) {
            this.trigger.removeAttribute("aria-describedby");
            this.trigger = null;
        }
        this.cancelTimer();
        this.hide();
        for (const cleanup of this.triggerListeners.splice(0)) cleanup();
    }

    private schedule(): void {
        this.cancelTimer();
        this.showTimer = setTimeout(() => this.show(), this.delay);
    }

    private cancelTimer(): void {
        if (this.showTimer !== null) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }

    /** Show the bubble next to the trigger. */
    show(): void {
        if (this.visible || !this.trigger) return;

        this.root.style.display = "block";
        this.root.style.visibility = "hidden";
        this.root.style.zIndex = String(nextZIndex());
        document.body.appendChild(this.root);

        this.disposeTracking = trackOverlay({
            anchor: this.trigger,
            panel: this.root,
            placement: this.placement,
            offset: 8,
        });

        this.visible = true;
        requestAnimationFrame(() => this.root.classList.add("is-open"));
    }

    /** Hide the bubble. */
    hide(): void {
        this.cancelTimer();
        if (!this.visible) return;
        this.visible = false;

        this.root.classList.remove("is-open");
        this.disposeTracking?.();
        this.disposeTracking = null;
        this.root.remove();
    }

    override destroy(): void {
        this.triggerListeners.splice(0).forEach((cleanup) => cleanup());
        this.cancelTimer();
        this.disposeTracking?.();
        this.disposeTracking = null;
        this.root.remove();
        super.destroy();
    }
}
