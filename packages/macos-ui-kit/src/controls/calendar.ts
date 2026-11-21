import {Component} from "../component";
import {el, svgIcon, uid} from "../dom";
import "./calendar.css";

export interface CalendarOptions {
    /** Selected day as `YYYY-MM-DD`; omit for no selection. */
    value?: string;
    /** Month to show first as `YYYY-MM`; defaults to the value's month, then today's. */
    month?: string;
    /** Column the week starts on: 1 = Monday (default), 0 = Sunday. */
    firstDayOfWeek?: 0 | 1;
    /** Earliest selectable day, inclusive, as `YYYY-MM-DD`. */
    min?: string;
    /** Latest selectable day, inclusive, as `YYYY-MM-DD`. */
    max?: string;
    /**
     * Show the tails of the neighbouring months, greyed out but selectable.
     * Default true; when false those cells stay blank and inert.
     */
    showAdjacent?: boolean;
    /** Fires with `YYYY-MM-DD` when the user picks a different day. */
    onSelect?: (value: string) => void;
    /** Fires with `YYYY-MM` when the visible month moves. */
    onMonthChange?: (month: string) => void;
}

/** Chevrons shared with pagination's arrows, so the kit moves the same way. */
const CHEVRON_LEFT = "M14 6 L8 12 L14 18";
const CHEVRON_RIGHT = "M10 6 L16 12 L10 18";

/** Weekday initials, indexed like `Date#getDay` (0 = Sunday). */
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** A month without a day: enough to position the grid, nothing to render. */
interface MonthKey {
    year: number;
    /** Zero-based, like `Date#getMonth`. */
    month: number;
}

/**
 * A standalone month grid.
 *
 * This exists because `DatePicker` wraps the *native* date input: the platform
 * popup cannot be styled, cannot be embedded in a page, and shows one month
 * with no way to mark ranges or paint extra state into the cells. A calendar
 * that draws its own grid is the only way to get a macOS-looking month view
 * inside a popover, a sheet or a settings pane.
 *
 * Dates are plain `Date` objects held at local noon, and every string is
 * formatted from local parts — see `midday` and `formatDay` for why both of
 * those matter.
 */
export class Calendar extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly titleId: string;
    private readonly title: HTMLDivElement;
    private readonly weekdays: HTMLDivElement;
    private readonly grid: HTMLDivElement;
    private readonly prevButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;

    private readonly firstDayOfWeek: 0 | 1;
    private readonly showAdjacent: boolean;
    private readonly onSelect?: (value: string) => void;
    private readonly onMonthChange?: (month: string) => void;

    private current: string;
    private minValue: string;
    private maxValue: string;
    private viewYear: number;
    private viewMonth: number;

    constructor(options: CalendarOptions = {}) {
        super();

        const {
            value,
            month,
            firstDayOfWeek = 1,
            min,
            max,
            showAdjacent = true,
            onSelect,
            onMonthChange,
        } = options;

        this.firstDayOfWeek = firstDayOfWeek;
        this.showAdjacent = showAdjacent;
        this.onSelect = onSelect;
        this.onMonthChange = onMonthChange;

        this.current = normalizeDay(value);
        this.minValue = normalizeDay(min);
        this.maxValue = normalizeDay(max);
        // An inverted pair is corrected rather than dropped: a caller that
        // swapped the two still meant a range.
        if (this.minValue && this.maxValue && this.minValue > this.maxValue) {
            [this.minValue, this.maxValue] = [this.maxValue, this.minValue];
        }

        // The grid opens on the month the caller asked for, else on the selected
        // day's month, else on today's — never on an empty January.
        const now = new Date();
        const view =
            parseMonth(month ?? "") ??
            parseMonth(monthOf(this.current)) ?? {year: now.getFullYear(), month: now.getMonth()};
        this.viewYear = view.year;
        this.viewMonth = view.month;

        this.root = el("div", {class: "mac-calendar"});
        this.titleId = uid("mac-calendar-title");

        const header = el("div", {class: "mac-calendar__header"});
        this.prevButton = this.navButton("上个月", CHEVRON_LEFT);
        this.nextButton = this.navButton("下个月", CHEVRON_RIGHT);
        this.title = el("div", {class: "mac-calendar__title", id: this.titleId});
        header.append(this.prevButton, this.title, this.nextButton);

        // Decorative: the day cells carry the full date in their own labels.
        this.weekdays = el("div", {class: "mac-calendar__weekdays", "aria-hidden": "true"});

        // `gridcell` is only valid inside a `row`, so the cells below are built
        // as rows of buttons rather than as a flat flex wrap.
        this.grid = el("div", {
            class: "mac-calendar__grid",
            role: "grid",
            "aria-labelledby": this.titleId,
        });

        this.root.append(header, this.weekdays, this.grid);

        this.listen(this.prevButton, "click", () => this.stepMonth(-1));
        this.listen(this.nextButton, "click", () => this.stepMonth(1));

        // Delegated on the grid, which survives every re-render of its rows.
        this.listen(this.grid, "click", (event) => {
            const cell = (event.target as HTMLElement).closest<HTMLButtonElement>(
                ".mac-calendar__day",
            );
            if (!cell || cell.disabled) return;
            const day = cell.dataset.day;
            if (day) this.select(day);
        });

        this.listen(this.grid, "keydown", (event) => this.handleKey(event));

        this.buildWeekdays();
        this.render();
    }

    /** The selected day as `YYYY-MM-DD`, or "" when nothing is selected. */
    get value(): string {
        return this.current;
    }

    /** The visible month as `YYYY-MM`. */
    get month(): string {
        return formatMonth(this.viewYear, this.viewMonth);
    }

    /**
     * Set the selection. Silent, like every other setter.
     *
     * The grid follows a selection that lands in another month — a calendar left
     * showing an unselected March while `value` reads April would look broken.
     */
    setValue(value: string): void {
        const next = normalizeDay(value);
        if (next === this.current) return;
        this.current = next;

        const target = parseMonth(monthOf(next));
        if (target) this.moveView(target.year, target.month, false);
        this.render();
    }

    /** Show a month by `YYYY-MM`. Silent; the user's arrows are what report. */
    setMonth(month: string): void {
        const target = parseMonth(month);
        if (!target) return;
        this.moveView(target.year, target.month, false);
        this.render();
    }

    /**
     * Replace the bounds; both are inclusive `YYYY-MM-DD`, and either may be ""
     * for "no limit".
     *
     * The selection is kept even when it now falls outside the bounds: clearing
     * a value the caller set would be a data change hidden inside a paint.
     */
    setBounds(min: string, max: string): void {
        this.minValue = normalizeDay(min);
        this.maxValue = normalizeDay(max);
        if (this.minValue && this.maxValue && this.minValue > this.maxValue) {
            [this.minValue, this.maxValue] = [this.maxValue, this.minValue];
        }
        this.render();
    }

    /** Move keyboard focus onto the grid's tab stop. */
    focus(): void {
        const cell = this.grid.querySelector<HTMLButtonElement>('.mac-calendar__day[tabindex="0"]');
        cell?.focus();
    }

    /** One header arrow. */
    private navButton(label: string, path: string): HTMLButtonElement {
        const button = el("button", {
            class: "mac-calendar__nav",
            type: "button",
            "aria-label": label,
            title: label,
        });
        button.appendChild(svgIcon(path, 14));
        return button;
    }

    /** Build the weekday ruler once: `firstDayOfWeek` never changes. */
    private buildWeekdays(): void {
        for (let index = 0; index < 7; index += 1) {
            const label = WEEKDAY_LABELS[(this.firstDayOfWeek + index) % 7];
            this.weekdays.appendChild(el("span", {class: "mac-calendar__weekday", text: label}));
        }
    }

    /**
     * Draw the visible month.
     *
     * `focus` is applied after the rows are rebuilt: the old cells are gone by
     * then, so a roving focus that is not re-established would drop to <body> and
     * the next Tab would restart from the top of the page.
     */
    private render(focus?: string): void {
        const today = formatDay(new Date());
        const anchor = this.anchorDay();

        this.title.textContent = `${this.viewYear} 年 ${this.viewMonth + 1} 月`;
        this.prevButton.disabled = !this.canStep(-1);
        this.nextButton.disabled = !this.canStep(1);

        this.grid.replaceChildren();

        const first = midday(this.viewYear, this.viewMonth, 1);
        const offset = (first.getDay() - this.firstDayOfWeek + 7) % 7;
        const start = midday(this.viewYear, this.viewMonth, 1 - offset);
        // Built from stable parts rather than by mutating one cursor: adding a
        // day twice to a Date that already moved is how off-by-one months happen.
        const year = start.getFullYear();
        const month = start.getMonth();
        const day = start.getDate();

        const daysInMonth = midday(this.viewYear, this.viewMonth + 1, 0).getDate();
        const weeks = Math.ceil((offset + daysInMonth) / 7);

        for (let week = 0; week < weeks; week += 1) {
            const row = el("div", {class: "mac-calendar__row", role: "row"});
            for (let column = 0; column < 7; column += 1) {
                const date = midday(year, month, day + week * 7 + column);
                row.appendChild(this.dayCell(date, today, anchor, focus ?? anchor));
            }
            this.grid.appendChild(row);
        }

        if (focus) this.moveFocus(focus);
    }

    /**
     * One day cell.
     *
     * Neighbouring-month days stay selectable and are told apart by `is-outside`
     * — that is how the native pickers behave, and hiding them behind a disabled
     * cell would strand the user on the 1st of every month.
     */
    private dayCell(
        date: Date,
        today: string,
        anchor: string,
        tabStop: string,
    ): HTMLButtonElement {
        const day = formatDay(date);
        const outside = date.getFullYear() !== this.viewYear || date.getMonth() !== this.viewMonth;
        const hidden = outside && !this.showAdjacent;
        const selected = day === this.current;

        const classes = ["mac-calendar__day"];
        if (outside) classes.push("is-outside");
        if (hidden) classes.push("is-empty");
        if (day === today) classes.push("is-today");
        if (selected) classes.push("is-selected");

        return el("button", {
            class: classes.join(" "),
            type: "button",
            role: "gridcell",
            // A blank filler still occupies its column, which is what keeps the
            // weeks aligned when adjacent days are hidden.
            text: hidden ? "" : String(date.getDate()),
            dataset: {day: hidden ? "" : day},
            disabled: hidden || this.outOfRange(day),
            // Roving tabindex: one stop for the whole grid, matching how a grid
            // is expected to behave for a keyboard user.
            tabindex: hidden ? -1 : day === tabStop ? 0 : -1,
            "aria-selected": selected ? "true" : "false",
            "aria-label": hidden
                ? ""
                : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`,
        });
    }

    /** Paint a selection and report it. */
    private select(day: string): void {
        if (day === this.current) return;
        this.current = day;

        // Picking a neighbouring month's tail moves the grid with it, exactly as
        // the native pickers do; that is a month change, so it is reported.
        const target = parseMonth(monthOf(day));
        if (target) this.moveView(target.year, target.month, true);

        this.render(day);
        this.onSelect?.(day);
    }

    /** Keyboard map: the grid is a focus roving over days, never over the month. */
    private handleKey(event: KeyboardEvent): void {
        const cell = (event.target as HTMLElement).closest<HTMLButtonElement>(".mac-calendar__day");
        if (!cell) return;

        const current = parseDay(cell.dataset.day ?? "");
        if (!current) return;

        const weekStart = startOfWeek(current, this.firstDayOfWeek);
        let target: Date;

        switch (event.key) {
            case "ArrowLeft":
                target = shiftDays(current, -1);
                break;
            case "ArrowRight":
                target = shiftDays(current, 1);
                break;
            case "ArrowUp":
                target = shiftDays(current, -7);
                break;
            case "ArrowDown":
                target = shiftDays(current, 7);
                break;
            case "Home":
                target = weekStart;
                break;
            case "End":
                target = shiftDays(weekStart, 6);
                break;
            case "PageUp":
                target = shiftMonths(current, -1);
                break;
            case "PageDown":
                target = shiftMonths(current, 1);
                break;
            default:
                // Enter and Space need no case: these are real <button>s, so the
                // engine already turns both into the click that selects a day.
                return;
        }

        // Arrows would otherwise scroll the page out from under the grid.
        event.preventDefault();
        this.moveFocus(formatDay(target));
    }

    /**
     * Move the roving focus to a day, flipping the month when it is off screen.
     *
     * A day outside the bounds is a dead end, so focus simply stops at the edge
     * of the range instead of jumping past it.
     */
    private moveFocus(day: string): void {
        const date = parseDay(day);
        if (!date || this.outOfRange(day)) return;

        if (date.getFullYear() !== this.viewYear || date.getMonth() !== this.viewMonth) {
            this.moveView(date.getFullYear(), date.getMonth(), true);
            this.render(day);
            return;
        }

        // Keep the tab stop on the cell that actually holds focus, so tabbing
        // away and back returns here instead of to the month's first day.
        for (const cell of this.grid.querySelectorAll<HTMLButtonElement>(".mac-calendar__day")) {
            const match = cell.dataset.day === day;
            if (cell.getAttribute("tabindex") !== (match ? "0" : "-1")) {
                cell.setAttribute("tabindex", match ? "0" : "-1");
            }
        }

        const target = this.grid.querySelector<HTMLButtonElement>(
            `.mac-calendar__day[data-day="${day}"]`,
        );
        if (target && !target.disabled) target.focus();
    }

    /** Step the visible month by one, reporting the move. */
    private stepMonth(delta: number): void {
        const target = midday(this.viewYear, this.viewMonth + delta, 1);
        this.moveView(target.getFullYear(), target.getMonth(), true);
        this.render();
    }

    /**
     * Change the visible month.
     *
     * `report` is true only for a user action, which is the same rule every
     * other setter in the kit follows: `setMonth` and `setValue` stay silent.
     */
    private moveView(year: number, month: number, report: boolean): void {
        if (year === this.viewYear && month === this.viewMonth) return;
        this.viewYear = year;
        this.viewMonth = month;
        if (report) this.onMonthChange?.(formatMonth(year, month));
    }

    /**
     * Whether the neighbouring month holds any selectable day.
     *
     * Stepping into a month that sits entirely outside `min`/`max` would show a
     * grid of dead cells, so that arrow is disabled instead.
     */
    private canStep(delta: number): boolean {
        const target = midday(this.viewYear, this.viewMonth + delta, 1);
        const lastDate = midday(target.getFullYear(), target.getMonth() + 1, 0);
        const firstDay = formatDay(midday(target.getFullYear(), target.getMonth(), 1));
        const lastDay = formatDay(lastDate);

        if (this.minValue && lastDay < this.minValue) return false;
        if (this.maxValue && firstDay > this.maxValue) return false;
        return true;
    }

    /**
     * Bounds test on the formatted strings.
     *
     * `YYYY-MM-DD` is zero-padded and fixed width, so lexicographic order *is*
     * calendar order: no `Date` is built just to compare two days, and no
     * timezone can smuggle an hour into the answer.
     */
    private outOfRange(day: string): boolean {
        if (this.minValue && day < this.minValue) return true;
        if (this.maxValue && day > this.maxValue) return true;
        return false;
    }

    /**
     * The grid's single tab stop: the selected day when it is on screen,
     * otherwise the first selectable day of the visible month. An anchor that was
     * itself out of range would leave the whole grid unreachable by keyboard.
     */
    private anchorDay(): string {
        const selected = parseDay(this.current);
        if (
            selected &&
            selected.getFullYear() === this.viewYear &&
            selected.getMonth() === this.viewMonth
        ) {
            return this.current;
        }

        const daysInMonth = midday(this.viewYear, this.viewMonth + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day += 1) {
            const key = formatDay(midday(this.viewYear, this.viewMonth, day));
            if (!this.outOfRange(key)) return key;
        }

        // Every day of the month is out of range: the grid still renders, but
        // nothing in it can take focus.
        return formatDay(midday(this.viewYear, this.viewMonth, 1));
    }
}

/**
 * Build a date at local noon.
 *
 * Every date in this component goes through here. Near a DST transition the
 * clock jumps by an hour, and in zones that shift at 00:00 a midnight-based
 * `Date` can land on 23:00 of the previous day; adding a day then advances by
 * 23 or 25 hours and the whole grid slips by one. Noon is twelve hours clear of
 * any transition, so `±1` and `±7` day arithmetic always lands on the intended
 * calendar day.
 */
function midday(year: number, month: number, day: number): Date {
    return new Date(year, month, day, 12);
}

/**
 * `YYYY-MM-DD` from the *local* parts.
 *
 * `toISOString()` cannot be used for this: it converts to UTC first, so a local
 * evening in Asia/Shanghai (UTC+8) formats as the previous calendar day and a
 * local morning in the Americas as the next one. Reading `getFullYear`,
 * `getMonth` and `getDate` keeps the string and the grid on the same day.
 */
function formatDay(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM` from the local parts, for the same reason `formatDay` does it. */
function formatMonth(year: number, month: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** The `YYYY-MM` a `YYYY-MM-DD` belongs to; "" stays "". */
function monthOf(day: string): string {
    return day.slice(0, 7);
}

/** Parse `YYYY-MM-DD` at local noon; null for anything malformed. */
function parseDay(text: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = midday(year, month, day);

    // A day like 2026-02-31 rolls forward into March; reject it rather than
    // silently handing back a different date than the caller wrote.
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return null;
    }
    return date;
}

/** Parse `YYYY-MM`; null for anything malformed. */
function parseMonth(text: string): MonthKey | null {
    const match = /^(\d{4})-(\d{2})$/.exec(text);
    if (!match) return null;

    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return null;
    return {year: Number(match[1]), month};
}

/** A valid `YYYY-MM-DD`, or "" — which is how "no date" is stored. */
function normalizeDay(text: string | undefined): string {
    const date = parseDay(text ?? "");
    return date ? formatDay(date) : "";
}

/** Move by whole days; month and year roll over through the Date constructor. */
function shiftDays(date: Date, days: number): Date {
    return midday(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Move by whole months, keeping the day where the month allows it.
 *
 * 31 January plus one month is 28 February, not 3 March: the day is clamped to
 * the target month's length instead of overflowing into the next one.
 */
function shiftMonths(date: Date, delta: number): Date {
    const first = midday(date.getFullYear(), date.getMonth() + delta, 1);
    const lastDay = midday(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return midday(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

/** The week column `firstDayOfWeek` starts on, for the week that holds `date`. */
function startOfWeek(date: Date, firstDayOfWeek: 0 | 1): Date {
    const offset = (date.getDay() - firstDayOfWeek + 7) % 7;
    return shiftDays(date, -offset);
}
