import {Component} from "../component";
import {el} from "../dom";
import "./progressring.css";

export type ProgressRingSize = "s" | "m" | "l";

export interface ProgressRingOptions {
    /** Progress from 0 to 100. Ignored while `indeterminate` is set. */
    value?: number;
    size?: ProgressRingSize;
    /** Stroke width in CSS pixels. Defaults per size: 2, 3, 4. */
    thickness?: number;
    /** Spin a partial arc instead of showing a percentage. */
    indeterminate?: boolean;
    /** Print the percentage in the middle. Ignored for `s` and indeterminate. */
    showValue?: boolean;
    /** Replacement for the percentage readout, e.g. "3/12". */
    label?: string;
}

/**
 * A circular progress indicator.
 *
 * The arc is a single `<circle>` whose length is normalised with
 * `pathLength="100"`, so the dash pattern is written in percent and the geometry
 * never has to be recomputed in JS: `stroke-dasharray: 42 100` is 42%.
 *
 * The `<svg>` itself carries the -90° rotation that puts the origin at twelve
 * o'clock, and the readout lives in a sibling `<div>`. Rotating the shape
 * instead would need `transform-box`, which not every WebKit version the kit
 * targets supports.
 */
export class ProgressRing extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly svg: SVGSVGElement;
    private readonly arc: SVGCircleElement;
    private readonly readout: HTMLSpanElement | null = null;
    private indeterminate: boolean;
    private current: number;

    constructor(options: ProgressRingOptions = {}) {
        super();

        const {
            value = 0,
            size = "m",
            thickness,
            indeterminate = false,
            showValue = false,
            label,
        } = options;

        this.current = constrain(value);
        this.indeterminate = indeterminate;

        this.root = el("div", {
            class: `mac-progressring mac-progressring--${size}`,
            role: "progressbar",
            "aria-valuemin": "0",
            "aria-valuemax": "100",
        });
        // Only written when asked for: the size classes carry their own defaults,
        // and an inline property here would override all of them.
        if (thickness !== undefined) {
            this.root.style.setProperty("--mac-ring-stroke", `${thickness}px`);
        }

        const ns = "http://www.w3.org/2000/svg";
        this.svg = document.createElementNS(ns, "svg");
        this.svg.setAttribute("class", "mac-progressring__svg");
        this.svg.setAttribute("viewBox", "0 0 100 100");
        this.svg.setAttribute("aria-hidden", "true");

        const track = document.createElementNS(ns, "circle");
        track.setAttribute("class", "mac-progressring__track");
        setCircleGeometry(track);

        this.arc = document.createElementNS(ns, "circle");
        this.arc.setAttribute("class", "mac-progressring__arc");
        setCircleGeometry(this.arc);

        this.svg.append(track, this.arc);
        this.root.appendChild(this.svg);

        if (showValue || label) {
            this.readout = el("span", {class: "mac-progressring__readout"});
            this.root.appendChild(this.readout);
        }

        this.root.setAttribute("aria-label", label ?? "载入中");
        this.syncValue();
        this.syncState();
    }

    /** The percentage currently shown, 0–100. */
    get value(): number {
        return this.current;
    }

    /** True while the ring is spinning instead of reporting a percentage. */
    get spinning(): boolean {
        return this.indeterminate;
    }

    /** Set the percentage; values outside 0–100 are folded into the range. */
    setValue(value: number): void {
        const next = constrain(value);
        if (next === this.current) return;
        this.current = next;
        this.syncValue();
    }

    /** Switch between a determinate arc and the spinner. */
    setIndeterminate(indeterminate: boolean): void {
        if (this.indeterminate === indeterminate) return;
        this.indeterminate = indeterminate;
        this.syncState();
    }

    /** Replace the centre text (only drawn when the ring was built with one). */
    setLabel(label: string): void {
        if (!this.readout) return;
        this.readout.textContent = label;
        this.root.setAttribute("aria-label", label);
    }

    private syncValue(): void {
        // pathLength="100" makes the dash pattern read directly as a percentage.
        this.arc.style.setProperty("--mac-ring-value", String(this.current));
        if (this.readout && !this.indeterminate) {
            this.readout.textContent = `${Math.round(this.current)}%`;
        }
        if (!this.indeterminate) {
            this.root.setAttribute("aria-valuenow", String(this.current));
            this.root.setAttribute("aria-valuetext", `${Math.round(this.current)}%`);
        }
    }

    private syncState(): void {
        this.root.classList.toggle("is-indeterminate", this.indeterminate);
        if (this.indeterminate) {
            // A percentage that does not exist must not be announced.
            this.root.removeAttribute("aria-valuenow");
            this.root.removeAttribute("aria-valuetext");
            if (this.readout) this.readout.textContent = "";
        } else {
            this.syncValue();
        }
    }
}

/**
 * Uniform geometry for track and arc, so the two can never drift apart.
 *
 * `r` is 44 rather than 46 so that half a default stroke still lands inside the
 * 100-unit box at the smallest diameter, where a fixed 2px stroke is proportionally
 * thickest. The CSS also sets `overflow: visible` on the `<svg>`, which covers
 * callers who pass a heavier `thickness`.
 */
function setCircleGeometry(circle: SVGCircleElement): void {
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "44");
    circle.setAttribute("pathLength", "100");
}

/** Fold a value into 0–100. */
function constrain(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
}
