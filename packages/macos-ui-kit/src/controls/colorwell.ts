import {Component} from "../component";
import {el} from "../dom";
import "./colorwell.css";

/** Swatch size presets. The whole control is the swatch — see `colorwell.css`. */
export type ColorWellSize = "small" | "default" | "large";

export interface ColorWellOptions {
    /**
     * The colour, as any CSS colour string. The swatch paints it verbatim; the
     * native picker below reads a `#rrggbb` approximation, because that is the
     * only form `input[type=color]` accepts.
     */
    value?: string;
    size?: ColorWellSize;
    /** Accessible name. Without one a colour swatch is announced as a button. */
    label?: string;
    disabled?: boolean;
    /** Fires with the picked colour once the native panel commits one. */
    onChange?: (value: string) => void;
}

/** The empty state macOS shows: white with the ring, not a missing swatch. */
const DEFAULT_VALUE = "#ffffff";

/**
 * Normalise any CSS colour to `#rrggbb` for the native input.
 *
 * A canvas does the parsing instead of a hand-written table: `fillStyle` accepts
 * every form the platform does — `hsl()`, `oklch()`, named colours, `#rgb` — and
 * normalises it in one step. Alpha is dropped because `input[type=color]` has no
 * alpha channel; the swatch above keeps the caller's original string, so a
 * translucent value still looks right.
 */
const toHex = (value: string): string => {
    const raw = value.trim();
    if (raw === "") return DEFAULT_VALUE;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) return raw.startsWith("#") ? raw : DEFAULT_VALUE;
    context.fillStyle = "#000000";
    context.fillStyle = raw;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
};

/**
 * A macOS colour well: a swatch that opens the platform colour picker.
 *
 * The click is handled by a native `<input type="color">` stretched invisibly
 * over the swatch, not by a hand-built popover. That buys the OS colour panel on
 * every desktop (and the OS wheel on mobile), keyboard activation for free, and a
 * `change` event only when the user commits — a canvas of sliders would have to
 * re-earn all three.
 *
 * The input is the tab stop and carries the accessible name; the swatch is
 * decoration, so it stays out of the accessibility tree.
 */
export class ColorWell extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly input: HTMLInputElement;
    private readonly swatch: HTMLSpanElement;
    private readonly onChange?: (value: string) => void;

    private current: string;

    constructor(options: ColorWellOptions = {}) {
        super();

        const {value = DEFAULT_VALUE, size = "default", label, disabled = false, onChange} = options;

        this.current = value;
        this.onChange = onChange;

        this.root = el("div", {class: `mac-colorwell mac-colorwell--${size}`});
        this.root.style.setProperty("--mac-colorwell-value", value);

        this.input = el("input", {
            class: "mac-colorwell__input",
            type: "color",
            disabled,
            "aria-label": label ?? "颜色",
        });
        this.input.value = toHex(value);

        this.swatch = el("span", {class: "mac-colorwell__swatch", "aria-hidden": "true"});

        // The input comes first so the focus ring can be drawn on the swatch with
        // a sibling selector, and it is painted above it so the whole swatch is
        // clickable without a second hit target.
        this.root.appendChild(this.input);
        this.root.appendChild(this.swatch);

        this.listen(this.input, "input", () => {
            // `input` follows the panel live; `change` follows the commit. Both
            // paint, only `change` reports, so dragging inside the panel does not
            // fire a callback per frame.
            this.paint(this.input.value);
        });

        this.listen(this.input, "change", () => {
            this.current = this.input.value;
            this.paint(this.current);
            this.onChange?.(this.current);
        });
    }

    /** The current colour, as it was last given or picked. */
    get value(): string {
        return this.current;
    }

    /** Swap the colour. Silent. */
    setValue(value: string): void {
        this.current = value;
        this.input.value = toHex(value);
        this.paint(value);
    }

    /** Enable or disable the well. Silent. */
    setDisabled(disabled: boolean): void {
        this.input.disabled = disabled;
        this.toggleClass("is-disabled", disabled);
    }

    private paint(value: string): void {
        this.root.style.setProperty("--mac-colorwell-value", value);
    }
}
