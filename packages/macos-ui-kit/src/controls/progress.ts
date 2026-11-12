import {Component} from "../component";
import {el} from "../dom";
import "./progress.css";

export interface ProgressOptions {
    /** Progress from 0 to 100. Ignored while `indeterminate` is set. */
    value?: number;
    /** Show the barber-pole used when the duration is unknown. */
    indeterminate?: boolean;
}

/**
 * A progress bar with a determinate and an indeterminate face.
 *
 * Both states are the same element; only the `is-` class and the ARIA surface
 * change. Indeterminate removes `aria-valuenow` outright — a stale value would
 * tell a screen reader a percentage that does not exist — while
 * `aria-valuemin`/`aria-valuemax` stay, so the widget still describes its scale.
 */
export class Progress extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private readonly fill: HTMLDivElement;
    private indeterminate: boolean;
    private current: number;

    constructor(options: ProgressOptions = {}) {
        super();

        const {value = 0, indeterminate = false} = options;

        this.indeterminate = indeterminate;
        this.current = this.constrain(value);

        this.root = el("div", {
            class: "mac-progress",
            role: "progressbar",
            "aria-valuemin": "0",
            "aria-valuemax": "100",
        });

        this.fill = el("div", {class: "mac-progress__fill"});
        this.fill.style.setProperty("--mac-progress-scale", String(this.current / 100));

        this.root.appendChild(this.fill);
        this.syncState();
    }

    /** The percentage currently shown, 0–100. */
    get value(): number {
        return this.current;
    }

    /** Set the percentage; values outside 0–100 are folded into the range. */
    setValue(value: number): void {
        const next = this.constrain(value);
        if (next === this.current) return;

        this.current = next;
        // The fill is scaled, not resized: motion stays on the compositor and
        // the bar never triggers layout. See progress.css.
        this.fill.style.setProperty("--mac-progress-scale", String(next / 100));

        // While indeterminate there is deliberately no aria-valuenow to update;
        // the pending value is applied when the bar becomes determinate again.
        if (!this.indeterminate) {
            this.root.setAttribute("aria-valuenow", String(next));
        }
    }

    /** Switch between the determinate bar and the barber-pole. */
    setIndeterminate(indeterminate: boolean): void {
        if (this.indeterminate === indeterminate) return;
        this.indeterminate = indeterminate;
        this.syncState();
    }

    /** Apply the ARIA surface and the class that match the current state. */
    private syncState(): void {
        this.root.classList.toggle("is-indeterminate", this.indeterminate);
        if (this.indeterminate) {
            this.root.removeAttribute("aria-valuenow");
        } else {
            this.root.setAttribute("aria-valuenow", String(this.current));
        }
    }

    /** Fold a value into 0–100. */
    private constrain(value: number): number {
        if (!Number.isFinite(value)) return 0;
        return Math.min(100, Math.max(0, value));
    }
}
