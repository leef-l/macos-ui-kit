import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./rating.css";

/** Star size presets. The star box is the whole geometry — see `rating.css`. */
export type RatingSize = "small" | "default" | "large";

export interface RatingOptions {
    /**
     * Current rating, 0..`max`. Fractions are allowed and are drawn honestly —
     * a stored average of 3.4 renders three stars and two fifths of a fourth.
     */
    value?: number;
    /** Number of stars. Default 5. */
    max?: number;
    /** Let the pointer pick halves. The keyboard still moves in whole stars. */
    allowHalf?: boolean;
    /** Display only: no tab stop, no gestures. */
    readOnly?: boolean;
    disabled?: boolean;
    size?: RatingSize;
    /** Accessible name. Default "评分". */
    label?: string;
    /** Fires only for a change the user made; every setter stays silent. */
    onChange?: (value: number) => void;
}

/**
 * A five-point star on the kit's 24×24 viewBox.
 *
 * Computed rather than hand-drawn: outer radius 9.5 and inner radius 3.9 about
 * (12, 12), which leaves 2.5 units of head-room above the top point and 2.16
 * beside the side points once a 1.5 stroke is added. The tips therefore never
 * reach the viewBox edge and the outline cannot clip into a flat edge (brief
 * rule 20); `rating.css` also sets `overflow: visible` for callers who thicken
 * the stroke.
 */
const STAR_PATH =
    "M12 2.5L14.29 8.85L21.04 9.07L15.71 13.21L17.58 19.69L12 15.9" +
    "L6.42 19.69L8.29 13.21L2.96 9.07L9.71 8.85Z";

/**
 * A star rating, the way macOS shows one in a review row or a detail pane.
 *
 * The stars are not "lit or unlit" flags. Each star is two stacked copies of the
 * same glyph — an outline underneath and a filled copy above, clipped by a
 * window whose width is that star's share — so a fractional value is painted
 * the way a fractional progress bar is. A per-star boolean could only show 3 or
 * 4 stars for a 3.4 average, which is a lie about the data. The clipped width is
 * exactly `(value - index)` of the star box, which doubles as the invariant an
 * audit can measure with `getBoundingClientRect()`.
 *
 * The root is the widget, not a row of five buttons: `role="slider"` with
 * `aria-valuenow`/`aria-valuetext` announces the total once ("3 星，共 5 星"),
 * where five buttons would give five tab stops and no total. Because the root is
 * then a focusable `div` it has no native `disabled` attribute, so the disabled
 * state is `aria-disabled` plus blocked gestures — the one place in the kit
 * where rule 10's "use the native attribute" has nothing to attach to.
 */
export class Rating extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly onChange?: (value: number) => void;

    /** One star box per star, in order. The box is what percentages resolve to. */
    private readonly stars: HTMLSpanElement[] = [];

    /** The clipping window inside each star — the only part that gets a width. */
    private readonly clips: HTMLSpanElement[] = [];

    private current: number;
    private max: number;
    private allowHalf: boolean;
    private readOnly: boolean;
    private disabled: boolean;

    /**
     * The value under the pointer, or null when nothing is being previewed.
     * Deliberately separate from `current`: hovering must never be mistaken for
     * a choice, so a preview cannot be read back or reported.
     */
    private preview: number | null = null;

    constructor(options: RatingOptions = {}) {
        super();

        this.onChange = options.onChange;
        this.max = Math.max(1, Math.round(options.max ?? 5));
        this.allowHalf = options.allowHalf ?? false;
        this.readOnly = options.readOnly ?? false;
        this.disabled = options.disabled ?? false;
        this.current = clamp(options.value ?? 0, 0, this.max);

        this.root = el("div", {
            class: `mac-rating mac-rating--${options.size ?? "default"}`,
            role: "slider",
            "aria-valuemin": "0",
            "aria-label": options.label ?? "评分",
        });

        // Delegated from the root, which outlives every star: `setMax` rebuilds
        // the stars and no handler is ever re-bound.
        this.listen(this.root, "pointermove", (event) => this.onPointerMove(event));
        this.listen(this.root, "pointerdown", (event) => this.onPointerDown(event));
        this.listen(this.root, "pointerleave", () => this.clearPreview());
        this.listen(this.root, "click", (event) => this.onClick(event));
        this.listen(this.root, "keydown", (event) => this.onKeyDown(event));

        this.build();
    }

    /** The committed rating. A pointer resting on the stars does not change it. */
    get value(): number {
        return this.current;
    }

    /** Set the rating programmatically. Silent, and folded into `0..max`. */
    setValue(value: number): void {
        const next = clamp(value, 0, this.max);
        if (next === this.current) return;
        this.current = next;
        // A preview that outlived the write would paint a value nobody asked for.
        this.preview = null;
        this.syncAria();
        this.paint();
    }

    /** Change the number of stars. Silent; the value is clamped to the new top. */
    setMax(max: number): void {
        const next = Math.max(1, Math.round(max));
        if (next === this.max) return;
        this.max = next;
        this.preview = null;
        this.current = clamp(this.current, 0, next);
        this.build();
    }

    /** Switch between display-only and interactive. Silent. */
    setReadOnly(readOnly: boolean): void {
        if (this.readOnly === readOnly) return;
        this.readOnly = readOnly;
        this.resetInteraction();
    }

    /** Block or restore every gesture. Silent. */
    setDisabled(disabled: boolean): void {
        if (this.disabled === disabled) return;
        this.disabled = disabled;
        this.resetInteraction();
    }

    // --- rendering -----------------------------------------------------------

    /**
     * Build the star row from `max`.
     *
     * The constructor and `setMax` share this one builder, so the two can never
     * drift apart.
     */
    private build(): void {
        this.stars.length = 0;
        this.clips.length = 0;

        const fragment = document.createDocumentFragment();

        for (let index = 0; index < this.max; index += 1) {
            const star = el("span", {class: "mac-rating__star", "aria-hidden": "true"});
            const clip = el("span", {class: "mac-rating__clip"});
            // The filled copy keeps the star's own width: the clip is a window
            // that opens rightwards, it must never squash the glyph inside it.
            clip.appendChild(starLayer("mac-rating__fill"));
            star.append(starLayer("mac-rating__outline"), clip);

            this.stars.push(star);
            this.clips.push(clip);
            fragment.appendChild(star);
        }

        this.root.replaceChildren(fragment);

        this.syncState();
        this.syncAria();
        this.paint();
    }

    /**
     * Push `preview ?? current` into the clip widths.
     *
     * The clip is absolutely positioned inside its star, so a percentage width
     * resolves against the star box: a share of a star is that share of its
     * width, which is what makes the fill meet the outline at any fraction.
     */
    private paint(): void {
        const previewing = this.preview !== null;
        const shown = this.preview ?? this.current;

        for (let index = 0; index < this.clips.length; index += 1) {
            const share = clamp(shown - index, 0, 1);
            this.clips[index].style.setProperty("--mac-rating-fill", `${(share * 100).toFixed(4)}%`);
            this.stars[index].classList.toggle("is-preview", previewing && share > 0);
        }
    }

    private syncAria(): void {
        this.setAttr("aria-valuemax", String(this.max));
        this.setAttr("aria-valuenow", formatNumber(this.current));
        this.setAttr("aria-valuetext", `${formatNumber(this.current)} 星，共 ${this.max} 星`);
    }

    private syncState(): void {
        this.toggleClass("is-readonly", this.readOnly);
        this.toggleClass("is-disabled", this.disabled);
        // Written as an explicit "false" rather than omitted: both states are
        // meaningful on a role=slider, and a stale one must never survive.
        this.setAttr("aria-readonly", String(this.readOnly));
        this.setAttr("aria-disabled", String(this.disabled));

        // A rating that cannot be changed must not be in the tab order at all —
        // tabbing into a control that swallows every keystroke is worse than not
        // reaching it.
        if (this.readOnly || this.disabled) this.root.removeAttribute("tabindex");
        else this.root.setAttribute("tabindex", "0");
    }

    /** A state change that also has to drop a preview which is now illegal. */
    private resetInteraction(): void {
        this.preview = null;
        this.syncState();
        this.paint();
    }

    // --- input ---------------------------------------------------------------

    private onPointerMove(event: PointerEvent): void {
        if (!this.interactive) return;
        const next = this.valueAt(event.clientX);
        if (next === this.preview) return;
        this.preview = next;
        this.paint();
    }

    /** Preview on press too: a touch has no hover to preview with. */
    private onPointerDown(event: PointerEvent): void {
        if (!this.interactive) return;
        this.preview = this.valueAt(event.clientX);
        this.paint();
    }

    private clearPreview(): void {
        if (this.preview === null) return;
        this.preview = null;
        this.paint();
    }

    private onClick(event: MouseEvent): void {
        if (!this.interactive) return;

        const value = this.valueAt(event.clientX);
        // Dropped before the commit paints: a touch never fires `pointerleave`,
        // and a preview left behind would keep the stars in the hover tint.
        this.preview = null;
        this.commit(value);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.interactive) return;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowUp":
                event.preventDefault();
                this.step(1);
                return;
            case "ArrowLeft":
            case "ArrowDown":
                event.preventDefault();
                this.step(-1);
                return;
            case "Home":
                event.preventDefault();
                this.commit(0);
                return;
            case "End":
                event.preventDefault();
                this.commit(this.max);
                return;
            default:
                return;
        }
    }

    /**
     * One star up or down, snapped to a whole star.
     *
     * From a fractional value the step lands on the next integer in that
     * direction rather than on another half: a keyboard has no halves, and
     * `2.5 + 1` would leave the value permanently off the whole-star grid.
     */
    private step(direction: 1 | -1): void {
        const from = direction === 1 ? Math.floor(this.current) : Math.ceil(this.current);
        this.commit(from + direction);
    }

    /**
     * Write `value` as the new rating and report it when it differs.
     *
     * Rule 7: a value that is already set never re-fires `onChange`, so clicking
     * the star that is already lit stays quiet.
     */
    private commit(value: number): void {
        const next = clamp(value, 0, this.max);
        const changed = next !== this.current;

        this.current = next;
        this.syncAria();
        this.paint();

        if (changed) this.onChange?.(next);
    }

    /**
     * The value under a pointer x.
     *
     * Measured from the star boxes, not from the root's width: the gaps belong
     * to no star, and a click inside one should return the number of stars it
     * sits after rather than a value interpolated across the whole control.
     */
    private valueAt(clientX: number): number {
        for (let index = 0; index < this.stars.length; index += 1) {
            const box = this.stars[index].getBoundingClientRect();
            if (clientX < box.left) return index;
            if (clientX <= box.right) {
                if (!this.allowHalf) return index + 1;
                // Left half is the half star, right half the whole one.
                return clientX < box.left + box.width / 2 ? index + 0.5 : index + 1;
            }
        }
        return this.stars.length;
    }

    /** True only while a gesture may change the value. */
    private get interactive(): boolean {
        return !this.readOnly && !this.disabled;
    }
}

/** One star glyph: the filled copy for a clip, the plain outline underneath. */
function starLayer(className: string): SVGSVGElement {
    const svg = svgIcon(STAR_PATH, 24);
    svg.setAttribute("class", className);
    svg.setAttribute("focusable", "false");
    return svg;
}

/** Fold a value into `[min, max]`, mapping NaN to the bottom of the range. */
function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

/** `3`, `2.5` — never `3.00`, never `2.5000000000000004`. */
function formatNumber(value: number): string {
    return String(Number(value.toFixed(2)));
}
