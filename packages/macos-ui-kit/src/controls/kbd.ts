import {Component} from "../component";
import {el} from "../dom";
import "./kbd.css";

/**
 * Modifier order macOS uses everywhere: control, option, shift, command.
 * A shortcut written "cmd+shift+p" must render as ⇧⌘P, not ⌘⇧P.
 */
const MODIFIER_ORDER: Record<string, number> = {
    "⌃": 0,
    "⌥": 1,
    "⇧": 2,
    "⌘": 3,
};

/** Lookup table for the long-form names a caller is likely to type. */
const KEY_NAMES: Record<string, string> = {
    cmd: "⌘",
    command: "⌘",
    meta: "⌘",
    super: "⌘",
    win: "⌘",
    shift: "⇧",
    alt: "⌥",
    opt: "⌥",
    option: "⌥",
    ctrl: "⌃",
    control: "⌃",
    fn: "fn",
    enter: "↩",
    return: "↩",
    esc: "⎋",
    escape: "⎋",
    tab: "⇥",
    space: "␣",
    del: "⌫",
    delete: "⌫",
    backspace: "⌫",
    forwarddelete: "⌦",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    pageup: "⇞",
    pagedown: "⇟",
    home: "↖",
    end: "↘",
    capslock: "⇪",
};

/** Split a shortcut string into individual key names. */
function splitKeys(source: string): string[] {
    return source
        .split(/[+\s]+/)
        .map((part) => part.trim())
        .filter((part) => part !== "");
}

/**
 * Turn one key name into the glyph macOS prints.
 *
 * Unrecognised names pass through untouched, so a caller can write a literal
 * "F5" or "A" and get it back unchanged.
 */
export function normalizeKey(key: string): string {
    const lower = key.toLowerCase();
    if (lower in KEY_NAMES) return KEY_NAMES[lower];
    // A single letter stays uppercase: ⌘S reads as a shortcut, ⌘s does not.
    if (lower.length === 1 && lower !== lower.toUpperCase()) return lower.toUpperCase();
    return key;
}

/**
 * Order a key list the way macOS prints a shortcut.
 *
 * Modifiers sort first in the fixed ⌃⌥⇧⌘ order and the last non-modifier key
 * ends up rightmost, which is why ⌘⇧P typed in any order comes out as ⇧⌘P.
 */
function arrangeKeys(keys: string[]): string[] {
    const modifiers = keys.filter((key) => key in MODIFIER_ORDER);
    const rest = keys.filter((key) => !(key in MODIFIER_ORDER));

    const unique = modifiers.filter((key, index) => modifiers.indexOf(key) === index);
    unique.sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b]);

    return [...unique, ...rest];
}

export interface KbdOptions {
    /**
     * One or more keys. A string is split on `+` and spaces, so `"⌘+S"`,
     * `"cmd shift p"` and a single `"K"` all work; an array is taken as-is.
     * Long names (`cmd`, `shift`, `esc`, `enter`, `up`) are mapped to glyphs.
     */
    keys: string | string[];
    /** `caps` (default) draws keycaps; `plain` renders bare glyphs, for menus. */
    variant?: "caps" | "plain";
    /** Keycap height. `s` matches menu rows, `m` (default) matches body text. */
    size?: "s" | "m";
    /** Accessible description, e.g. "Command S". Defaults to the visible text. */
    label?: string;
}

/**
 * A keyboard shortcut, drawn as macOS keycaps.
 *
 * `<kbd>` is the semantic element for this, so a screen reader announces the
 * text as user input instead of as body copy. Each key is its own `<kbd>` and
 * the group carries an `aria-label` with the spelled-out shortcut, because
 * "⇧⌘P" is not something a synthesiser reads usefully.
 */
export class Kbd extends Component<HTMLElement> {
    protected readonly root: HTMLSpanElement;

    private keys: string[];

    constructor(options: KbdOptions) {
        super();

        const {variant = "caps", size = "m", label} = options;

        const raw = typeof options.keys === "string" ? splitKeys(options.keys) : options.keys;
        this.keys = arrangeKeys(raw.map(normalizeKey));

        this.root = el("span", {class: "mac-kbd"});
        if (variant === "plain") this.root.classList.add("mac-kbd--plain");
        if (size === "s") this.root.classList.add("mac-kbd--s");

        if (label !== undefined) {
            this.root.setAttribute("aria-label", label);
        } else {
            // Glyph names are meaningless out loud; the long form is not.
            this.root.setAttribute("aria-label", this.spokenForm());
        }
        this.root.setAttribute("role", "img");

        this.render();
    }

    /** The individual keys, already normalised and ordered. */
    get keyList(): string[] {
        return [...this.keys];
    }

    /** Replace the shortcut; re-renders and re-orders the same way as the constructor. */
    setKeys(keys: string | string[]): void {
        const raw = typeof keys === "string" ? splitKeys(keys) : keys;
        this.keys = arrangeKeys(raw.map(normalizeKey));
        this.root.setAttribute("aria-label", this.spokenForm());
        this.render();
    }

    /** Draw one keycap per key. */
    private render(): void {
        this.root.replaceChildren();
        for (const key of this.keys) {
            this.root.appendChild(el("kbd", {class: "mac-kbd__key", text: key}));
        }
    }

    /** Spell the shortcut out for assistive tech. */
    private spokenForm(): string {
        const spoken: Record<string, string> = {
            "⌘": "Command",
            "⇧": "Shift",
            "⌥": "Option",
            "⌃": "Control",
            "↩": "Return",
            "⎋": "Escape",
            "⇥": "Tab",
            "⌫": "Delete",
            "␣": "Space",
            "↑": "Up",
            "↓": "Down",
            "←": "Left",
            "→": "Right",
        };
        return this.keys.map((key) => spoken[key] ?? key).join(" ");
    }
}
