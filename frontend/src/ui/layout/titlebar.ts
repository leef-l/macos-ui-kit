import {Component} from "../component";
import {el, type Child} from "../dom";
import {TrafficLights, type TrafficLightsOptions} from "./traffic-lights";
import "./titlebar.css";

export interface TitleBarOptions {
    /** Centred window title. */
    title?: string;
    /** Show the macOS traffic lights at the leading edge. Default true. */
    trafficLights?: boolean;
    /** Callbacks forwarded to the traffic lights. */
    onClose?: TrafficLightsOptions["onClose"];
    onMinimise?: TrafficLightsOptions["onMinimise"];
    onZoom?: TrafficLightsOptions["onZoom"];
    /** Nodes placed at the trailing edge (search field, toolbar buttons). */
    trailing?: Child[];
    /** Nodes placed between the lights and the title (rarely needed). */
    leading?: Child[];
    /**
     * Double-clicking the empty part of the title bar zooms the window.
     *
     * Wails only wires this up on macOS: its runtime checks `IsMac()` before
     * sending `wails:drag:doubleclick` (see internal/runtime/.../drag.ts), so on
     * Windows and Linux the gesture reaches the page as an ordinary dblclick and
     * does nothing. The kit handles it itself so the behaviour is the same
     * everywhere.
     */
    onDoubleClick?: () => void;
}

/**
 * The window's title bar.
 *
 * It carries the `--wails-draggable: drag` custom property, which is what lets
 * the user move a frameless window: Wails' runtime reads that property off the
 * event target and starts a native drag. Interactive children declare
 * `--wails-draggable: no-drag` in their own stylesheets so they stay clickable.
 */
export class TitleBar extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly titleNode: HTMLDivElement;
    private readonly lights: TrafficLights | null;

    constructor(options: TitleBarOptions = {}) {
        super();

        const {title = "", trafficLights = true, leading = [], trailing = []} = options;

        this.root = el("header", {class: "mac-titlebar"});

        const leadingCluster = el("div", {class: "mac-titlebar__leading"});

        if (trafficLights) {
            this.lights = new TrafficLights({
                onClose: options.onClose,
                onMinimise: options.onMinimise,
                onZoom: options.onZoom,
            });
            leadingCluster.appendChild(this.lights.element);
        } else {
            this.lights = null;
        }

        for (const node of leading) {
            if (node === null || node === undefined || node === false) continue;
            leadingCluster.appendChild(
                typeof node === "string" || typeof node === "number"
                    ? document.createTextNode(String(node))
                    : node,
            );
        }

        this.titleNode = el("div", {class: "mac-titlebar__title", text: title});

        const trailingCluster = el("div", {class: "mac-titlebar__trailing"});
        for (const node of trailing) {
            if (node === null || node === undefined || node === false) continue;
            trailingCluster.appendChild(
                typeof node === "string" || typeof node === "number"
                    ? document.createTextNode(String(node))
                    : node,
            );
        }

        this.root.append(leadingCluster, this.titleNode, trailingCluster);

        // Double-click on the empty title-bar area zooms, matching every desktop
        // environment.
        //
        // Two detection paths, because the drag surface makes a single one
        // unreliable:
        //  - `dblclick` is what a normal page gets; on macOS Wails also consumes
        //    it to run its own zoom, so this covers Windows/Linux.
        //  - a press-pair counter on `mousedown` catches the case where Wails
        //    started a native window-move on the first press and the browser
        //    never saw a complete click sequence.
        // Whichever fires first wins; the shared guard stops a double zoom.
        if (options.onDoubleClick) {
            const onDoubleClick = options.onDoubleClick;
            let lastPress = 0;
            let lastX = 0;
            let lastY = 0;
            let lastFire = 0;

            const fire = () => {
                const now = performance.now();
                // Collapse the dblclick and the press-pair into one action.
                if (now - lastFire < 350) return;
                lastFire = now;
                onDoubleClick();
            };

            // Path 1: the browser's own double-click.
            this.listen(this.root, "dblclick", (event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, input, a, [role='button'], [role='switch']")) {
                    return;
                }
                event.preventDefault();
                fire();
            });

            // Path 2: two presses in the same spot, in time.
            this.listen(
                this.root,
                "mousedown",
                (event) => {
                    if (event.button !== 0) return;

                    const target = event.target as HTMLElement;
                    if (target.closest("button, input, a, [role='button'], [role='switch']")) {
                        return;
                    }

                    const now = event.timeStamp;
                    const near =
                        Math.abs(event.clientX - lastX) < 8 &&
                        Math.abs(event.clientY - lastY) < 8;
                    const isDouble = now - lastPress < 500 && near;

                    if (isDouble) {
                        lastPress = 0;
                        fire();
                        return;
                    }

                    lastPress = now;
                    lastX = event.clientX;
                    lastY = event.clientY;
                },
                // Capture, so a child that stops propagation cannot hide the press.
                {capture: true},
            );
        }
    }

    /** The traffic lights, or null when they were disabled. */
    get trafficLights(): TrafficLights | null {
        return this.lights;
    }

    /** Update the centred title. */
    setTitle(title: string): void {
        if (this.titleNode.textContent === title) return;
        this.titleNode.textContent = title;
    }

    /** Add a node to the trailing toolbar cluster. */
    addTrailing(node: HTMLElement): void {
        const cluster = this.root.querySelector(".mac-titlebar__trailing");
        cluster?.appendChild(node);
    }

    override destroy(): void {
        this.lights?.destroy();
        super.destroy();
    }
}
