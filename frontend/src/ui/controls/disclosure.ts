import {Component} from "../component";
import {el, svgIcon, type Child} from "../dom";
import "./disclosure.css";

const CHEVRON = "M9 6 L15 12 L9 18";

export interface DisclosureOptions {
    /** Section title shown in the header. */
    title: string;
    /** Collapsible content. */
    content?: Child;
    /** Start expanded. Defaults to false, the macOS convention. */
    open?: boolean;
    /** Optional trailing summary, visible whether open or closed. */
    meta?: string;
    disabled?: boolean;
    onToggle?: (open: boolean) => void;
}

/**
 * A collapsible section.
 *
 * Uses `aria-expanded` on the header button and `hidden` on the region, which is
 * the pattern screen readers understand for a disclosure widget: the button
 * announces whether the section is open, and the content is genuinely removed
 * from the accessibility tree when closed rather than merely scrolled away.
 */
export class Disclosure extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly header: HTMLButtonElement;
    private readonly content: HTMLDivElement;
    private readonly metaNode: HTMLSpanElement | null;
    private readonly onToggle?: (open: boolean) => void;

    private open: boolean;

    constructor(options: DisclosureOptions) {
        super();

        const {title, content, open = false, meta, disabled = false, onToggle} = options;

        this.open = open;
        this.onToggle = onToggle;

        this.root = el("div", {
            class: `mac-disclosure${open ? " is-open" : ""}`,
        });

        this.header = el("button", {
            class: "mac-disclosure__header",
            type: "button",
            "aria-expanded": String(open),
            disabled,
        });

        const chevron = svgIcon(CHEVRON, 14);
        chevron.classList.add("mac-disclosure__chevron");
        this.header.appendChild(chevron);

        this.header.appendChild(el("span", {class: "mac-disclosure__title", text: title}));

        if (meta !== undefined) {
            this.metaNode = el("span", {class: "mac-disclosure__meta", text: meta});
            this.header.appendChild(this.metaNode);
        } else {
            this.metaNode = null;
        }

        this.content = el("div", {class: "mac-disclosure__content"});
        if (typeof content === "string" || typeof content === "number") {
            this.content.textContent = String(content);
        } else if (content instanceof Node) {
            this.content.appendChild(content);
        }
        this.content.hidden = !open;

        this.root.append(this.header, this.content);

        this.listen(this.header, "click", () => {
            if (this.header.disabled) return;
            this.setOpen(!this.open, true);
        });
    }

    /** Expand or collapse the section. */
    setOpen(open: boolean, notify = false): void {
        if (this.open === open) return;
        this.open = open;

        this.root.classList.toggle("is-open", open);
        this.header.setAttribute("aria-expanded", String(open));
        this.content.hidden = !open;

        if (notify) this.onToggle?.(open);
    }

    /** Whether the section is currently expanded. */
    get isOpen(): boolean {
        return this.open;
    }

    /** Update the trailing summary text. */
    setMeta(meta: string): void {
        if (!this.metaNode) return;
        if (this.metaNode.textContent === meta) return;
        this.metaNode.textContent = meta;
    }

    /** The region content is appended to after construction. */
    get contentElement(): HTMLDivElement {
        return this.content;
    }
}
