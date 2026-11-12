import {Component} from "../component";
import {el} from "../dom";
import "./traffic-lights.css";

export interface TrafficLightsOptions {
    /** Red light: close the window. */
    onClose?: () => void;
    /** Yellow light: minimise the window. */
    onMinimise?: () => void;
    /** Green light: zoom (or fullscreen while Alt is held). */
    onZoom?: (event: MouseEvent) => void;
}

/**
 * The three macOS window buttons.
 *
 * The component owns presentation only: what "close" means is the host app's
 * business, so behaviour arrives as callbacks. That keeps this file free of any
 * Wails dependency and testable in a plain browser.
 *
 * Glyph paths are drawn inline rather than imported so the exact macOS shapes
 * (the ×, the −, and the two opposing zoom triangles) stay under our control.
 */
export class TrafficLights extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly closeButton: HTMLButtonElement;
    private readonly minimiseButton: HTMLButtonElement;
    private readonly zoomButton: HTMLButtonElement;

    constructor(options: TrafficLightsOptions = {}) {
        super();

        this.root = el("div", {
            class: "mac-traffic-lights",
            role: "group",
            "aria-label": "窗口控制",
        });

        this.closeButton = this.makeLight("close", "关闭");
        this.minimiseButton = this.makeLight("minimise", "最小化");
        this.zoomButton = this.makeLight("zoom", "缩放");

        // Close glyph: a thin cross.
        this.addGlyph(this.closeButton, "mac-traffic-light__glyph--close",
            "M3.5 3.5 L8.5 8.5 M8.5 3.5 L3.5 8.5");

        // Minimise glyph: a single dash.
        this.addGlyph(this.minimiseButton, "mac-traffic-light__glyph--minimise",
            "M2.6 6 L9.4 6");

        // Zoom glyphs: two opposing triangles, swapped when zoomed.
        this.addTriangle(this.zoomButton, "mac-traffic-light__glyph--enter",
            "M3.1 3.1 H5.1 L3.1 5.1 Z", "M8.9 8.9 H6.9 L8.9 6.9 Z");
        this.addTriangle(this.zoomButton, "mac-traffic-light__glyph--exit",
            "M5.1 3.1 H3.1 L5.1 5.1 Z", "M6.9 8.9 H8.9 L6.9 6.9 Z");

        this.root.append(this.closeButton, this.minimiseButton, this.zoomButton);

        if (options.onClose) {
            this.listen(this.closeButton, "click", options.onClose);
        }
        if (options.onMinimise) {
            this.listen(this.minimiseButton, "click", options.onMinimise);
        }
        if (options.onZoom) {
            this.listen(this.zoomButton, "click", options.onZoom);
        }
    }

    /** Create one coloured button. */
    private makeLight(kind: "close" | "minimise" | "zoom", label: string): HTMLButtonElement {
        const button = el("button", {
            class: `mac-traffic-light mac-traffic-light--${kind}`,
            type: "button",
            "aria-label": label,
            title: label,
        });
        return button;
    }

    /** Append a stroked path glyph to a light. */
    private addGlyph(button: HTMLButtonElement, className: string, path: string): void {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 12 12");
        svg.setAttribute("aria-hidden", "true");
        svg.classList.add(className);
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", path);
        svg.appendChild(p);
        button.appendChild(svg);
    }

    /** Append a zoom glyph made of two filled triangles. */
    private addTriangle(button: HTMLButtonElement, className: string, a: string, b: string): void {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 12 12");
        svg.setAttribute("aria-hidden", "true");
        svg.classList.add(className);
        for (const d of [a, b]) {
            const p = document.createElementNS(ns, "path");
            p.setAttribute("d", d);
            svg.appendChild(p);
        }
        button.appendChild(svg);
    }

    /** Reflect whether the window is zoomed (swaps the green glyph and title). */
    setZoomed(zoomed: boolean): void {
        if (this.root.classList.contains("is-zoomed") === zoomed) return;
        this.root.classList.toggle("is-zoomed", zoomed);

        const label = zoomed ? "还原" : "缩放";
        this.zoomButton.title = label;
        this.zoomButton.setAttribute("aria-label", label);
    }

    /** Dim the lights when the window is not the active window. */
    setFocused(focused: boolean): void {
        if (this.root.classList.contains("is-unfocused") === !focused) return;
        this.root.classList.toggle("is-unfocused", !focused);
    }
}
