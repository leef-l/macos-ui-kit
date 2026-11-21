import {Component} from "../component";
import {el} from "../dom";
import "./avatar.css";

export type AvatarSize = "s" | "m" | "l" | "xl";
export type AvatarStatus = "online" | "busy" | "away" | "offline";

export interface AvatarOptions {
    /** Name used for the initials and the accessible label. */
    name: string;
    /** Image URL. Falls back to initials if it fails to load. */
    src?: string;
    size?: AvatarSize;
    /** Presence dot in the lower-right corner. Omit for no dot. */
    status?: AvatarStatus;
    /** Rounded square instead of a circle — the macOS app-icon silhouette. */
    shape?: "circle" | "square";
}

/**
 * Derive 1–2 initials from a name.
 *
 * Latin names use the first letter of the first two words ("Ada Lovelace" →
 * "AL"). CJK names have no word boundary to key on, and the convention there is
 * the given name, so the *last* character is used ("李小明" → "明"). A single
 * latin word gives one letter.
 */
export function initials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "?";

    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return (firstGrapheme(words[0]) + firstGrapheme(words[1])).toUpperCase();
    }

    const single = words[0];
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(single)) {
        return single.slice(-1);
    }
    return firstGrapheme(single).toUpperCase();
}

/** First code point, so an emoji or an astral letter is not split in half. */
function firstGrapheme(value: string): string {
    return Array.from(value)[0] ?? "";
}

/**
 * Stable tone index for a name, so the same person keeps the same colour across
 * sessions and across every list they appear in.
 */
export function toneFor(name: string): number {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = (hash * 31 + name.charCodeAt(index)) % 100000;
    }
    return hash % 6;
}

/**
 * A person or entity chip: image, or coloured initials.
 *
 * The fallback is not a broken-image icon — if `src` fails, the initials behind
 * the image simply become visible again, which keeps layout stable with no
 * second code path.
 */
export class Avatar extends Component<HTMLSpanElement> {
    protected readonly root: HTMLSpanElement;

    private readonly image: HTMLImageElement | null = null;
    private readonly initialsNode: HTMLSpanElement;
    private readonly dot: HTMLSpanElement | null = null;
    private currentName: string;

    constructor(options: AvatarOptions) {
        super();

        this.currentName = options.name;
        const size = options.size ?? "m";
        const classes = ["mac-avatar", `mac-avatar--${size}`];
        if (options.shape === "square") classes.push("mac-avatar--square");
        if (options.status) classes.push(`mac-avatar--${options.status}`);

        this.root = el("span", {
            class: classes.join(" "),
            role: "img",
            title: options.name,
        });
        this.root.dataset.tone = String(toneFor(options.name));

        this.initialsNode = el("span", {
            class: "mac-avatar__initials",
            text: initials(options.name),
            "aria-hidden": "true",
        });
        this.root.appendChild(this.initialsNode);

        if (options.src) {
            this.image = el("img", {
                class: "mac-avatar__image",
                src: options.src,
                alt: "",
                draggable: false,
            });
            // Keep the <img> in the tree on failure and just hide it: removing it
            // would make the element impossible to observe if the URL later works.
            this.listen(this.image, "load", () => this.toggleClass("has-image", true));
            this.listen(this.image, "error", () => this.toggleClass("has-image", false));
            this.root.appendChild(this.image);
        }

        if (options.status) {
            this.dot = el("span", {
                class: "mac-avatar__status",
                "aria-hidden": "true",
            });
            this.root.appendChild(this.dot);
            // The dot is decorative; the presence state belongs in the label so a
            // screen reader hears "李小明，在线" instead of an unexplained shape.
            this.root.setAttribute("aria-label", `${options.name}，${statusLabel(options.status)}`);
        } else {
            this.root.setAttribute("aria-label", options.name);
        }
    }

    /** Re-point the avatar at a different person. */
    setName(name: string): void {
        if (name === this.currentName) return;
        this.currentName = name;
        this.initialsNode.textContent = initials(name);
        this.root.title = name;
        this.root.dataset.tone = String(toneFor(name));
        const status = this.root.dataset.status as AvatarStatus | undefined;
        this.root.setAttribute(
            "aria-label",
            status ? `${name}，${statusLabel(status)}` : name,
        );
    }

    /** Swap the image, or pass `undefined` to fall back to initials. */
    setSrc(src: string | undefined): void {
        if (!this.image) return;
        if (!src) {
            this.image.removeAttribute("src");
            this.toggleClass("has-image", false);
            return;
        }
        this.image.src = src;
    }

    /** Change or clear the presence dot. */
    setStatus(status: AvatarStatus | undefined): void {
        const previous = this.root.dataset.status as AvatarStatus | undefined;
        if (previous) this.root.classList.remove(`mac-avatar--${previous}`);
        if (!status) {
            delete this.root.dataset.status;
            this.dot?.remove();
            this.root.setAttribute("aria-label", this.currentName);
            return;
        }
        this.root.dataset.status = status;
        this.root.classList.add(`mac-avatar--${status}`);
        this.root.setAttribute("aria-label", `${this.currentName}，${statusLabel(status)}`);
    }
}

function statusLabel(status: AvatarStatus): string {
    switch (status) {
        case "online":
            return "在线";
        case "busy":
            return "忙碌";
        case "away":
            return "离开";
        default:
            return "离线";
    }
}
