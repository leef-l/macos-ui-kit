import {Component} from "../component";
import {el, svgIcon} from "../dom";
import "./breadcrumb.css";

export interface BreadcrumbItem {
    label: string;
    /** Clickable when present; the final item never is. */
    onClick?: () => void;
    /** Leading 24×24 glyph, e.g. a folder for a path root. */
    icon?: string;
}

export interface BreadcrumbOptions {
    items: BreadcrumbItem[];
    /** `/` is the filesystem reading; the chevron matches macOS toolbars. */
    separator?: "chevron" | "slash";
    /**
     * Collapse the middle into an ellipsis once the trail is longer than this.
     * The first and last entries always survive.
     */
    maxItems?: number;
    /** Fires when a collapsed segment is clicked. */
    onExpand?: () => void;
}

const CHEVRON = "M9.5 6 L15.5 12 L9.5 18";

/**
 * A path trail: `项目 › 设计 › 组件`.
 *
 * The last entry is text, not a button — a breadcrumb link to the page you are
 * already on is a dead control. Everything before it is a real `<button>` so it
 * takes focus and Space/Enter without extra key handling.
 */
export class Breadcrumb extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    private items: BreadcrumbItem[];
    private readonly separator: "chevron" | "slash";
    private readonly maxItems?: number;
    private readonly onExpand?: () => void;

    constructor(options: BreadcrumbOptions) {
        super();

        this.items = options.items.slice();
        this.separator = options.separator ?? "chevron";
        this.maxItems = options.maxItems;
        this.onExpand = options.onExpand;

        this.root = el("nav", {class: "mac-breadcrumb", "aria-label": "面包屑"});

        // One listener for the whole trail; the list is re-rendered on every
        // update and per-item binding would leak on each pass.
        this.listen(this.root, "click", (event) => {
            const target = event.target as HTMLElement;
            if (target.closest(".mac-breadcrumb__ellipsis")) {
                this.onExpand?.();
                return;
            }
            const button = target.closest<HTMLButtonElement>(".mac-breadcrumb__link");
            if (!button) return;
            const index = Number(button.dataset.index);
            if (Number.isNaN(index)) return;
            this.items[index]?.onClick?.();
        });

        this.render();
    }

    /** Replace the trail, e.g. after navigating into a folder. */
    setItems(items: BreadcrumbItem[]): void {
        this.items = items.slice();
        this.render();
    }

    private render(): void {
        const list = el("ol", {class: "mac-breadcrumb__list"});
        const entries = collapse(this.items, this.maxItems);

        entries.forEach((entry, position) => {
            // The separator belongs to the *position*, not to the entry, so it is
            // added before either branch: an ellipsis needs a leading chevron just
            // as much as a label does, or the trail reads as `a b › c`.
            const wrapper = el("li", {class: "mac-breadcrumb__item"});
            if (position > 0) wrapper.appendChild(this.separatorNode());

            if (entry === "ellipsis") {
                // A collapsed run is a control, not decoration: it must be
                // activatable, or a long path loses its middle entirely.
                wrapper.appendChild(
                    el("button", {
                        class: "mac-breadcrumb__ellipsis",
                        type: "button",
                        text: "…",
                        "aria-label": "展开隐藏的路径",
                        title: "展开隐藏的路径",
                    }),
                );
                list.appendChild(wrapper);
                return;
            }

            const item = this.items[entry.index];
            const isLast = entry.index === this.items.length - 1;

            if (item.icon) {
                const glyph = el("span", {class: "mac-breadcrumb__icon", "aria-hidden": "true"});
                glyph.appendChild(svgIcon(item.icon, 14));
                wrapper.appendChild(glyph);
            }

            if (isLast || !item.onClick) {
                const text = el("span", {
                    class: "mac-breadcrumb__text",
                    text: item.label,
                });
                if (isLast) {
                    text.setAttribute("aria-current", "page");
                    text.classList.add("is-current");
                }
                wrapper.appendChild(text);
            } else {
                wrapper.appendChild(
                    el("button", {
                        class: "mac-breadcrumb__link",
                        type: "button",
                        text: item.label,
                        dataset: {index: String(entry.index)},
                        title: item.label,
                    }),
                );
            }

            list.appendChild(wrapper);
        });

        this.root.replaceChildren(list);
    }

    /** The chevron or slash drawn between two entries. */
    private separatorNode(): HTMLSpanElement {
        if (this.separator === "slash") {
            return el("span", {
                class: "mac-breadcrumb__separator is-slash",
                text: "/",
                "aria-hidden": "true",
            });
        }
        const sep = el("span", {class: "mac-breadcrumb__separator", "aria-hidden": "true"});
        sep.appendChild(svgIcon(CHEVRON, 11));
        return sep;
    }
}

/** Either a real index into `items`, or the marker for a collapsed run. */
type Entry = {index: number} | "ellipsis";

/**
 * Hide the middle of a long trail.
 *
 * Keeping the first and last entries is the whole point of a breadcrumb — where
 * you are and how to get back to the root — so the collapse only ever eats the
 * segment between them.
 */
function collapse(items: BreadcrumbItem[], maxItems?: number): Entry[] {
    const all: Entry[] = items.map((_, index) => ({index}));
    if (!maxItems || items.length <= maxItems || maxItems < 3) return all;

    const head: Entry[] = all.slice(0, 1);
    const tail: Entry[] = all.slice(all.length - (maxItems - 2));
    return [...head, "ellipsis", ...tail];
}
