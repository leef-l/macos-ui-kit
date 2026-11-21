import {Component} from "../component";
import {el} from "../dom";
import "./levelindicator.css";

/** How a segment is coloured by its position in the bar. */
export type LevelTone = "ok" | "warn" | "hot";

export interface LevelIndicatorOptions {
    /**
     * Fill level, 0..1. Not a percentage: every level in the kit is normalised,
     * and the `aria-valuenow` percentage is derived rather than stored.
     */
    value?: number;
    /** Number of discrete segments. Default 20. */
    segments?: number;
    /**
     * `level` colours the bar green → yellow → red by position, the way an audio
     * meter does. `accent` paints every lit segment in the accent colour, for a
     * meter that is a gauge rather than a warning.
     */
    tone?: "level" | "accent";
    orientation?: "horizontal" | "vertical";
    /** Accessible name. Default "电平". */
    label?: string;
}

/** Where the level meter changes colour, as a share of the bar. */
const WARN_AT = 0.7;
const HOT_AT = 0.9;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * A segmented level meter — the `NSLevelIndicator` a mixer or an activity panel
 * uses. It is a meter, not a slider: it reports a value and takes no input, so
 * the root is `role="meter"` with no tab stop and no pointer gestures.
 *
 * The segments are real elements rather than a painted gradient because the
 * count is what the control is *for*: a discrete meter has to show that it
 * reached the eleventh of twenty blocks, and a gradient can only approximate
 * that. Their colour comes from the index, so the warning bands live at fixed
 * positions on the bar instead of following the fill.
 */
export class LevelIndicator extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly segments: HTMLSpanElement[] = [];
    private readonly count: number;
    private current: number;

    constructor(options: LevelIndicatorOptions = {}) {
        super();

        const {value = 0, segments = 20, tone = "level", orientation = "horizontal", label = "电平"} = options;

        this.count = Math.max(1, Math.round(segments));
        this.current = clamp01(value);

        this.root = el("div", {
            class: `mac-levelindicator mac-levelindicator--${orientation} mac-levelindicator--${tone}`,
            role: "meter",
            "aria-label": label,
            "aria-valuemin": "0",
            "aria-valuemax": "100",
        });

        for (let index = 0; index < this.count; index++) {
            const share = (index + 1) / this.count;
            const band: LevelTone = share <= WARN_AT ? "ok" : share <= HOT_AT ? "warn" : "hot";
            const segment = el("span", {class: "mac-levelindicator__segment", "data-band": band});
            this.segments.push(segment);
            this.root.appendChild(segment);
        }

        this.paint();
    }

    /** The current level, 0..1. */
    get value(): number {
        return this.current;
    }

    /** The number of segments the bar was built with. */
    get segmentCount(): number {
        return this.count;
    }

    /** Set the level, 0..1. Silent. */
    setValue(value: number): void {
        const next = clamp01(value);
        // A meter is read many times per second from an audio or metrics loop;
        // repainting unchanged geometry on every frame would be pure cost.
        if (next === this.current) return;
        this.current = next;
        this.paint();
    }

    private paint(): void {
        // Rounded up: a level that is inside a segment has reached it. Rounding
        // down would leave the bar empty at 0.04 on a twenty-segment meter, which
        // reads as "no signal" when there is one.
        const lit = Math.min(this.count, Math.ceil(this.current * this.count));
        for (let index = 0; index < this.count; index++) {
            this.segments[index].classList.toggle("is-on", index < lit);
        }

        const percent = Math.round(this.current * 100);
        this.setAttr("aria-valuenow", String(percent));
        this.setAttr("aria-valuetext", `${percent}%`);
    }
}
