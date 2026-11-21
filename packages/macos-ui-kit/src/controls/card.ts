import {Component} from "../component";
import {append, clear, el, uid, type Child} from "../dom";
import "./card.css";

/** How much chrome the card draws around its content. */
export type CardVariant = "plain" | "grouped";

/** Body padding. `none` is for content that runs edge to edge. */
export type CardPadding = "none" | "default";

export interface CardOptions {
    /** Title in the header. Its presence is what creates the header. */
    title?: string;
    /** Secondary line under the title. */
    subtitle?: string;
    /**
     * Content for the header's trailing edge — an "编辑" button, a count, a
     * switch. Additive to the shape in the brief: the header exists when it has
     * content, and this is content.
     */
    trailing?: Child;
    body?: Child[];
    footer?: Child[];
    /** Default `plain`: structure only, no box. */
    variant?: CardVariant;
    /** Default `default`. */
    padding?: CardPadding;
}

/**
 * A titled container with an optional body and footer.
 *
 * Two variants, and the difference is only chrome: `plain` is grouping without a
 * box (a title over a body inside an existing pane), `grouped` is the macOS
 * inset box a settings pane is built from — `--mac-bg-content` on a rounded
 * hairline rectangle, with hairline separators between the direct children of
 * the body so a column of rows reads as one table-like stack.
 *
 * Those separators are drawn on the child as a pseudo-element rather than as a
 * `border-top`: a border cannot be inset, and a full-width rule would run into
 * the rounded corners of the box. The rule therefore spans the child's box,
 * which the body's inline padding already holds away from both rounded edges —
 * that is the geometry invariant stated in the report.
 *
 * The header and footer are built and torn down with their content. An empty
 * header is not merely invisible: it would contribute its padding and a hairline
 * above the body, which is the "empty box with a stray border" that card
 * implementations ship by default.
 */
export class Card extends Component<HTMLElement> {
    protected readonly root: HTMLElement;

    /**
     * The body element is created once and never replaced: callers may append
     * into `get body()` directly, and a later `setTitle` must not detach what
     * they put there.
     */
    private readonly bodyEl: HTMLDivElement;
    private readonly footerEl: HTMLElement;

    private header: HTMLElement | null = null;
    private heading: HTMLDivElement | null = null;
    private titleEl: HTMLDivElement | null = null;
    private subtitleEl: HTMLDivElement | null = null;
    private trailingEl: HTMLDivElement | null = null;

    private titleText: string | null;
    private subtitleText: string | null;
    private trailingChild: Child;
    /** The trailing child already in the slot, so a repaint is a no-op. */
    private trailingUsed: Child = undefined;
    private variant: CardVariant;
    private padding: CardPadding;

    constructor(options: CardOptions = {}) {
        super();

        this.titleText = textOf(options.title);
        this.subtitleText = textOf(options.subtitle);
        this.trailingChild = options.trailing ?? null;
        this.variant = options.variant ?? "plain";
        this.padding = options.padding ?? "default";

        this.root = el("section", {class: this.className()});

        this.bodyEl = el("div", {class: "mac-card__body"});
        append(this.bodyEl, options.body ?? []);
        this.root.appendChild(this.bodyEl);

        this.footerEl = el("footer", {class: "mac-card__footer"});
        this.root.appendChild(this.footerEl);

        // Header last: it is prepended, so the body and the footer keep their
        // order and the body stays the same node across every later call.
        this.syncHeader();
        this.setFooter(options.footer ?? []);
    }

    /** The body, so a caller can append into it without rebuilding the card. */
    get body(): HTMLElement {
        return this.bodyEl;
    }

    /** Set or clear the title. A blank string removes it, and the header with it. */
    setTitle(title: string): void {
        const next = textOf(title);
        if (next === this.titleText) return;
        this.titleText = next;
        this.syncHeader();
    }

    /** Set or clear the subtitle. */
    setSubtitle(subtitle: string): void {
        const next = textOf(subtitle);
        if (next === this.subtitleText) return;
        this.subtitleText = next;
        this.syncHeader();
    }

    /** Replace the header's trailing slot. */
    setTrailing(trailing: Child): void {
        if (trailing === this.trailingChild) return;
        this.trailingChild = trailing;
        this.syncHeader();
    }

    /** Replace the body's children. Silent, and independent of `get body()`. */
    setBody(children: Child[]): void {
        clear(this.bodyEl);
        append(this.bodyEl, children);
    }

    /** Replace the footer's children; an empty list removes the footer. */
    setFooter(children: Child[]): void {
        clear(this.footerEl);
        append(this.footerEl, children);

        // Counted after `append`, which skips nullish children: `[null]` is an
        // empty footer, not a footer with a gap in it.
        if (this.footerEl.firstChild) {
            if (!this.footerEl.parentNode) this.root.appendChild(this.footerEl);
        } else {
            this.footerEl.remove();
        }
    }

    /** Switch between the unboxed and the grouped treatment. Silent. */
    setVariant(variant: CardVariant): void {
        if (this.variant === variant) return;
        this.variant = variant;
        // Toggled, not rebuilt from `className()`: a caller that added a class of
        // its own to the card would lose it to a wholesale rewrite.
        this.root.classList.toggle("mac-card--plain", variant === "plain");
        this.root.classList.toggle("mac-card--grouped", variant === "grouped");
    }

    // --- header --------------------------------------------------------------

    /**
     * Create, fill or remove the header.
     *
     * The header exists exactly when it has content. Everything below is keyed
     * on that one decision, so clearing only the title of a card that also has a
     * trailing slot leaves the slot in place, and clearing both leaves no header
     * element at all.
     */
    private syncHeader(): void {
        if (!this.hasHeader()) {
            this.header?.remove();
            this.header = null;
            this.heading = null;
            this.titleEl = null;
            this.subtitleEl = null;
            this.trailingEl = null;
            // Whatever the slot held is detached with it, so the next header
            // must refill from `trailingChild` instead of trusting this cache.
            this.trailingUsed = undefined;
            this.root.removeAttribute("aria-labelledby");
            return;
        }

        if (!this.header) {
            const header = el("header", {class: "mac-card__header"});
            this.heading = el("div", {class: "mac-card__heading"});
            this.trailingEl = el("div", {class: "mac-card__trailing"});
            header.append(this.heading, this.trailingEl);
            this.root.prepend(header);
            this.header = header;
        }

        this.syncTitle();
        this.syncSubtitle();
        this.syncTrailing();
    }

    private syncTitle(): void {
        const heading = this.heading;
        if (!heading) return;

        const text = this.titleText;
        if (text === null) {
            this.titleEl?.remove();
            this.titleEl = null;
            this.root.removeAttribute("aria-labelledby");
            return;
        }

        let titleEl = this.titleEl;
        if (!titleEl) {
            titleEl = el("div", {class: "mac-card__title", id: uid("mac-card-title")});
            // Prepended so a title added after a subtitle still reads first.
            heading.prepend(titleEl);
            this.titleEl = titleEl;
        }

        titleEl.textContent = text;
        // The section is labelled by its own title, so the card is announced
        // once instead of reading as a heading inside an unlabelled landmark.
        this.root.setAttribute("aria-labelledby", titleEl.id);
    }

    private syncSubtitle(): void {
        const heading = this.heading;
        if (!heading) return;

        const text = this.subtitleText;
        if (text === null) {
            this.subtitleEl?.remove();
            this.subtitleEl = null;
            return;
        }

        let subtitleEl = this.subtitleEl;
        if (!subtitleEl) {
            subtitleEl = el("div", {class: "mac-card__subtitle"});
            heading.appendChild(subtitleEl);
            this.subtitleEl = subtitleEl;
        }

        subtitleEl.textContent = text;
    }

    private syncTrailing(): void {
        const slot = this.trailingEl;
        if (!slot) return;
        // Identity, not equality: a caller that hands back the same node must not
        // have it moved out of a subtree it was just placed in.
        if (this.trailingUsed === this.trailingChild) return;

        clear(slot);
        append(slot, [this.trailingChild]);
        this.trailingUsed = this.trailingChild;
    }

    private hasHeader(): boolean {
        return (
            this.titleText !== null ||
            this.subtitleText !== null ||
            hasContent(this.trailingChild)
        );
    }

    private className(): string {
        const flush = this.padding === "none" ? " mac-card--flush" : "";
        return `mac-card mac-card--${this.variant}${flush}`;
    }
}

/** `undefined` and a blank string both mean "no text", so the test stays simple. */
function textOf(text: string | undefined): string | null {
    if (text === undefined) return null;
    return text.trim().length > 0 ? text : null;
}

/** Anything that would actually paint: a node, a non-empty string, a number. */
function hasContent(child: Child): boolean {
    if (child === null || child === undefined || child === false) return false;
    if (typeof child === "string") return child.trim().length > 0;
    return true;
}
