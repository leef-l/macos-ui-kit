import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./pagination.css";

/** One entry in the rendered row: a page number, or a gap. */
type PageItem = number | "gap";

export interface PaginationOptions {
    /** Current page, 1-based. */
    page?: number;
    /** Total number of pages. At least 1. */
    pageCount: number;
    /**
     * Total row count. When given, a "共 N 条" readout appears before the
     * buttons; the pagination does not compute it, because it counts pages of
     * whatever the caller listed.
     */
    total?: number;
    /** Pages shown on each side of the current one. Default 1. */
    siblingCount?: number;
    /** Show first/last page buttons flanking the arrows. Default false. */
    showEnds?: boolean;
    /** Disable the whole control. */
    disabled?: boolean;
    /** Fires with the requested page; never fires with the current page. */
    onChange?: (page: number) => void;
}

const CHEVRON_LEFT = "M14 6 L8 12 L14 18";
const CHEVRON_RIGHT = "M10 6 L16 12 L10 18";
const CHEVRON_END_LEFT = "M17 6 L11 12 L17 18 M10 6 L11 6 L11 18 L10 18";
const CHEVRON_END_RIGHT = "M7 6 L13 12 L7 18 M14 6 L15 6 L15 18 L14 18";

/**
 * Build the page list: first, last, the current page with its siblings, and a
 * gap wherever numbers were skipped.
 *
 * A gap is only worth drawing when it hides at least two pages; otherwise the
 * elision costs the same width as the number it replaces and reads worse.
 *
 * The window is also *padded* when the current page sits near either end —
 * without that, page 1 renders as `1 2 … 12`, which reads as a broken pager
 * because there is nothing to click between 2 and the end. Padding borrows room
 * from the side that has it, so the numbers stay contiguous.
 *
 * This is the one piece of real logic in pagination, so it is a pure function
 * that can be reasoned about on its own.
 */
export function pageItems(page: number, pageCount: number, siblingCount = 1): PageItem[] {
    const total = Math.max(1, Math.floor(pageCount));
    const current = Math.min(Math.max(1, Math.floor(page)), total);
    const siblings = Math.max(0, Math.floor(siblingCount));

    // first + last + current + 2×siblings + 2 gaps is the fixed skeleton.
    const budget = siblings * 2 + 5;
    if (total <= budget) {
        return Array.from({length: total}, (_, index) => index + 1);
    }

    let left = current - siblings;
    let right = current + siblings;

    // Near the start: borrow from the right so the run stays contiguous.
    if (left < 2) {
        right += 2 - left;
        left = 2;
    }
    // Near the end: borrow back from the left.
    if (right > total - 1) {
        left -= right - (total - 1);
        right = total - 1;
    }

    left = Math.max(2, left);
    right = Math.min(total - 1, right);

    const items: PageItem[] = [1];
    if (left > 2) items.push("gap");

    for (let index = left; index <= right; index += 1) items.push(index);

    if (right < total - 1) items.push("gap");
    items.push(total);

    return items;
}

/**
 * A macOS-styled pager.
 *
 * Pages are real `<button>`s in a `<nav>`: the arrow keys do not walk a pager in
 * any native app, so this does not invent that, but every button is reachable
 * with Tab and announced with an `aria-current` marker on the active page.
 *
 * `onChange` never reports the page it is already on, so a caller can wire it
 * straight to a reload without guarding against a double fetch.
 */
export class Pagination extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private page: number;
    private pageCount: number;
    private total: number | undefined;
    private readonly siblingCount: number;
    private readonly showEnds: boolean;
    private readonly onChange?: (page: number) => void;

    private readonly summary: HTMLSpanElement | null = null;
    private readonly list: HTMLDivElement;

    constructor(options: PaginationOptions) {
        super();

        // `pageCount` is required in the type but not at runtime (plain JS, a JSON
        // config, a computed value that came out undefined): Math.floor(undefined)
        // is NaN, and Math.max(1, NaN) is NaN — which rendered a "NaN" page button.
        this.pageCount = Number.isFinite(options.pageCount)
            ? Math.max(1, Math.floor(options.pageCount))
            : 1;
        this.page = Number.isFinite(options.page)
            ? Math.min(Math.max(1, Math.floor(options.page as number)), this.pageCount)
            : 1;
        this.total = options.total;
        this.siblingCount = options.siblingCount ?? 1;
        this.showEnds = options.showEnds ?? false;
        this.onChange = options.onChange;

        this.root = el("nav", {class: "mac-pagination", "aria-label": "分页"});
        this.toggleClass("is-disabled", options.disabled ?? false);

        if (options.total !== undefined) {
            this.summary = el("span", {class: "mac-pagination__summary"});
            this.root.appendChild(this.summary);
        }

        this.list = el("div", {class: "mac-pagination__list"});
        this.root.appendChild(this.list);

        // One delegated listener: the list is rebuilt on every change, and
        // re-binding per render is how these controls end up with duplicate
        // handlers after the second page.
        this.listen(this.list, "click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
            if (!button || button.disabled) return;
            const target = button.dataset.page;
            if (target === undefined) return;
            this.setPage(Number(target), true);
        });

        if (options.disabled) this.setDisabled(true);

        this.render();
    }

    /** The current page, 1-based. */
    get currentPage(): number {
        return this.page;
    }

    /** Total pages. */
    get pages(): number {
        return this.pageCount;
    }

    /**
     * Move to a page.
     *
     * A silent write: `report` is only true for a user activation, which is the
     * same rule every other control in the kit follows.
     */
    setPage(page: number, report = false): void {
        const next = Math.min(Math.max(1, Math.floor(page)), this.pageCount);
        if (next === this.page) return;
        this.page = next;
        this.render();
        if (report) this.onChange?.(next);
    }

    /** Replace the page count; the current page is clamped into the new range. */
    setPageCount(pageCount: number): void {
        const next = Math.max(1, Math.floor(pageCount));
        if (next === this.pageCount) return;
        this.pageCount = next;
        this.page = Math.min(this.page, next);
        this.render();
    }

    /** Update the "共 N 条" readout, or pass `undefined` to hide it. */
    setTotal(total: number | undefined): void {
        this.total = total;
        this.render();
    }

    /** Disable every button at once. */
    setDisabled(disabled: boolean): void {
        this.toggleClass("is-disabled", disabled);
        for (const button of this.list.querySelectorAll("button")) {
            button.disabled = disabled;
        }
    }

    private render(): void {
        if (this.summary) {
            this.summary.textContent =
                this.total === undefined ? "" : `共 ${this.total} 条`;
            this.summary.hidden = this.total === undefined;
        }

        this.list.replaceChildren();

        const disabled = this.root.classList.contains("is-disabled");
        const atStart = this.page <= 1;
        const atEnd = this.page >= this.pageCount;

        if (this.showEnds) {
            this.list.appendChild(
                this.arrow("first", CHEVRON_END_LEFT, 1, disabled || atStart, "第一页"),
            );
        }
        this.list.appendChild(
            this.arrow("prev", CHEVRON_LEFT, this.page - 1, disabled || atStart, "上一页"),
        );

        for (const item of pageItems(this.page, this.pageCount, this.siblingCount)) {
            if (item === "gap") {
                // Not a button: a gap is not clickable and must not be a tab stop
                // that goes nowhere.
                this.list.appendChild(
                    el("span", {class: "mac-pagination__gap", text: "…", "aria-hidden": "true"}),
                );
                continue;
            }

            const isCurrent = item === this.page;
            const button = el("button", {
                class: `mac-pagination__page${isCurrent ? " is-current" : ""}`,
                type: "button",
                text: String(item),
                dataset: {page: String(item)},
                disabled,
                "aria-label": `第 ${item} 页`,
            });
            if (isCurrent) button.setAttribute("aria-current", "page");
            this.list.appendChild(button);
        }

        this.list.appendChild(
            this.arrow("next", CHEVRON_RIGHT, this.page + 1, disabled || atEnd, "下一页"),
        );
        if (this.showEnds) {
            this.list.appendChild(
                this.arrow("last", CHEVRON_END_RIGHT, this.pageCount, disabled || atEnd, "最后一页"),
            );
        }
    }

    private arrow(
        slot: string,
        path: string,
        target: number,
        disabled: boolean,
        label: string,
    ): HTMLButtonElement {
        const button = el("button", {
            class: `mac-pagination__arrow mac-pagination__arrow--${slot}`,
            type: "button",
            disabled,
            dataset: {page: String(target)},
            "aria-label": label,
            title: label,
        });
        button.appendChild(svgIcon(path, 14));
        return button;
    }
}
