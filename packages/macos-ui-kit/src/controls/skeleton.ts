import {Component} from "../component";
import {clear, el} from "../dom";
import "./skeleton.css";

export type SkeletonVariant = "text" | "rect" | "circle";

export interface SkeletonOptions {
    /** Shape of the placeholder. Default "text". */
    variant?: SkeletonVariant;
    /** Number, treated as px, or any CSS length. Default: fills the parent. */
    width?: string | number;
    /** Number, treated as px, or any CSS length. Default: the variant's own. */
    height?: string | number;
    /** Line count for the "text" variant. Default 1. */
    lines?: number;
    /** Sweep the highlight. Default true; the animation also honours reduced motion. */
    animated?: boolean;
}

/**
 * A loading placeholder: the grey bars that hold a region's shape while its real
 * content is on the way.
 *
 * The root is `aria-hidden` and always is: a skeleton is a picture of future
 * content, so announcing it would read out filler words that carry no meaning.
 * The *region* is what assistive technology needs to know about, and that region
 * belongs to the caller — it owns `aria-busy="true"` while it is waiting, which
 * is why this component never writes it. Marking both would announce the busy
 * state twice and leave the skeleton as a second named landmark.
 *
 * The shimmer moves `background-position` only. Animating width or height would
 * reuse the same paint loop but would also re-run layout on every frame, and a
 * placeholder is usually the most numerous thing on a loading screen.
 */
export class Skeleton extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    // Named around the getters: a field and an accessor cannot share a name.
    private shape: SkeletonVariant;
    private lineCount: number;
    private motion: boolean;
    private widthValue?: string | number;
    private heightValue?: string | number;

    /** One bar in a single-shape variant, `lineCount` bars in "text". */
    private readonly bars: HTMLDivElement[] = [];

    constructor(options: SkeletonOptions = {}) {
        super();

        this.shape = options.variant ?? "text";
        this.lineCount = normalizeLines(options.lines ?? 1);
        this.motion = options.animated ?? true;
        this.widthValue = options.width;
        this.heightValue = options.height;

        this.root = el("div", {class: "mac-skeleton", "aria-hidden": "true"});
        this.render();
    }

    get variant(): SkeletonVariant {
        return this.shape;
    }

    get lines(): number {
        return this.lineCount;
    }

    get animated(): boolean {
        return this.motion;
    }

    /**
     * Switch shape. Silent.
     *
     * A shape change also changes the bar count — "text" is a stack, the other
     * two are one block — so the bars are rebuilt rather than restyled.
     */
    setVariant(variant: SkeletonVariant): void {
        if (variant === this.shape) return;
        this.shape = variant;
        this.render();
    }

    /** Set the number of text lines. No effect on the single-shape variants. */
    setLines(count: number): void {
        const next = normalizeLines(count);
        if (next === this.lineCount) return;
        this.lineCount = next;
        this.render();
    }

    /**
     * Set the footprint. Silent.
     *
     * Each dimension is independent: a number is px, a string passes through, and
     * `undefined` clears the inline value so the stylesheet's default applies
     * again. Only a dimension the caller actually passed is written — an
     * unconditional `width`/`height` would make the variant classes dead, and a
     * circle would stop being square.
     */
    setSize(width?: string | number, height?: string | number): void {
        this.widthValue = width;
        this.heightValue = height;
        this.applySize();
    }

    /** Start or stop the shimmer. Reduced motion still wins over `true`. */
    setAnimated(animated: boolean): void {
        if (animated === this.motion) return;
        this.motion = animated;
        this.root.classList.toggle("is-animated", this.motion);
    }

    // --- rendering -----------------------------------------------------------

    private render(): void {
        clear(this.root);
        this.bars.length = 0;

        this.root.classList.toggle("mac-skeleton--text", this.variant === "text");
        this.root.classList.toggle("mac-skeleton--rect", this.variant === "rect");
        this.root.classList.toggle("mac-skeleton--circle", this.variant === "circle");
        this.root.classList.toggle("is-animated", this.animated);

        const count = this.variant === "text" ? this.lineCount : 1;
        for (let index = 0; index < count; index += 1) {
            const bar = el("div", {class: "mac-skeleton__bar"});
            this.bars.push(bar);
            this.root.appendChild(bar);
        }

        this.applySize();
    }

    private applySize(): void {
        // Width belongs to the wrapper, not the bars: a text stack has to keep its
        // last line at 60% *of the width it was given*, which an inline width on
        // every bar would overwrite.
        if (this.widthValue === undefined) this.root.style.removeProperty("width");
        else this.root.style.width = toLength(this.widthValue);

        for (const bar of this.bars) {
            if (this.heightValue === undefined) bar.style.removeProperty("height");
            else bar.style.height = toLength(this.heightValue);
        }
    }
}

/** A line count is always at least one whole line, whatever the caller passed. */
function normalizeLines(count: number): number {
    return Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
}

/** Numbers are px because a bare number means nothing in CSS. */
function toLength(value: string | number): string {
    return typeof value === "number" ? `${value}px` : value;
}
