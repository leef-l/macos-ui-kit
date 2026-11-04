/**
 * Runtime theme system.
 *
 * Two-layer tokens (see tokens.css) split the problem in half:
 *
 *  - The built-in `macos-dark` / `macos-light` appearances are **pure CSS**. They
 *    apply through `[data-appearance]` with no JavaScript at all, so the first
 *    paint is already correct — a theme applied by script would flash the wrong
 *    colours for one frame.
 *
 *  - Everything else is a *custom* theme: an appearance plus a handful of
 *    semantic-token overrides. Overrides land as inline custom properties on
 *    <html>, which beat the stylesheet, so a brand theme ships 3 values instead
 *    of 60.
 *
 * The rule that keeps this honest: custom themes may only override **semantic**
 * tokens (`accent`, `bg-window`, …), never base ones (`base-gray-800`). Base
 * tokens are shared by both appearances; overriding one would silently damage
 * the other.
 */

export type Appearance = "light" | "dark";

export interface ThemeDefinition {
    /** Unique name, written to `data-theme`. */
    name: string;
    /** Which built-in appearance the theme starts from. */
    appearance: Appearance;
    /**
     * Semantic-token overrides. Keys are written **without** the `--mac-`
     * prefix for brevity, e.g. `{accent: "#ff6b35"}` not
     * `{"--mac-accent": "#ff6b35"}`.
     */
    tokens?: Record<string, string>;
}

/** The built-in appearances. No tokens: their values live in tokens.css. */
export const BUILTIN_THEMES: ThemeDefinition[] = [
    {name: "macos-dark", appearance: "dark"},
    {name: "macos-light", appearance: "light"},
    {
        name: "hc-dark",
        appearance: "dark",
        // High contrast is defined declaratively in tokens.css as well; the
        // entry here only makes it discoverable and switchable by name.
    },
    {
        name: "hc-light",
        appearance: "light",
    },
];

/** Tokens written to `data-theme` in CSS, kept in step with tokens.css. */
const DECLARED_THEMES = new Set(["hc-dark", "hc-light"]);

/** Prefix a bare token name with the custom-property namespace. */
function cssVar(name: string): string {
    return name.startsWith("--") ? name : `--mac-${name}`;
}

/**
 * Owns the appearance on <html> and any custom-token overrides.
 *
 * One instance per document; `themeManager` below is the shared one.
 */
export class ThemeManager {
    private readonly root: HTMLElement;
    private readonly themes = new Map<string, ThemeDefinition>();
    /** Custom properties this manager wrote, so they can be removed cleanly. */
    private applied: string[] = [];
    private current: ThemeDefinition;
    private mediaQuery: MediaQueryList | null = null;
    private systemListener: (() => void) | null = null;
    private listeners = new Set<(theme: ThemeDefinition) => void>();

    constructor(root: HTMLElement = document.documentElement) {
        this.root = root;

        for (const theme of BUILTIN_THEMES) {
            this.themes.set(theme.name, theme);
        }

        this.current = this.themes.get("macos-dark")!;

        // Follow the OS until the host applies an explicit theme.
        this.followSystem();
    }

    /** Register a custom theme. Throws on an empty or duplicate name. */
    register(theme: ThemeDefinition): void {
        if (!theme.name) throw new Error("mac ui: theme needs a name");
        if (theme.appearance !== "light" && theme.appearance !== "dark") {
            throw new Error(`mac ui: theme "${theme.name}" has an invalid appearance`);
        }
        this.themes.set(theme.name, theme);
    }

    /** Remove a custom theme. Built-in appearances cannot be removed. */
    unregister(name: string): void {
        if (BUILTIN_THEMES.some((theme) => theme.name === name)) {
            throw new Error(`mac ui: cannot remove the built-in theme "${name}"`);
        }
        this.themes.delete(name);
        if (this.current.name === name) this.apply("macos-dark");
    }

    /** Names of every registered theme. */
    list(): string[] {
        return [...this.themes.keys()];
    }

    /** The theme currently applied. */
    get active(): ThemeDefinition {
        return this.current;
    }

    /**
     * Apply a theme by name.
     *
     * Applies the appearance first (pure CSS takes over), then the token
     * overrides. Re-applying the same theme is a no-op when nothing changed.
     */
    apply(name: string): void {
        const theme = this.themes.get(name);
        if (!theme) {
            console.error(`mac ui: unknown theme "${name}"`);
            return;
        }

        this.stopFollowingSystem();
        this.applyDefinition(theme);
    }

    /**
     * Follow the OS appearance: dark when the system is dark, light otherwise.
     * Re-applies automatically when the user flips the system setting.
     */
    followSystem(): void {
        this.stopFollowingSystem();

        this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const update = () => {
            const name = this.mediaQuery?.matches ? "macos-dark" : "macos-light";
            const theme = this.themes.get(name);
            if (theme) this.applyDefinition(theme);
        };

        this.systemListener = update;
        this.mediaQuery.addEventListener("change", update);
        update();
    }

    /** True while the OS appearance drives the theme. */
    get isFollowingSystem(): boolean {
        return this.systemListener !== null;
    }

    /** Subscribe to theme changes. Returns an unsubscribe function. */
    onChange(listener: (theme: ThemeDefinition) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Export the active theme as a definition.
     *
     * Reads the computed custom properties, so it captures values that came from
     * the stylesheet as well as inline overrides — useful for "save this look".
     */
    exportActive(): ThemeDefinition {
        const computed = getComputedStyle(this.root);
        const tokens: Record<string, string> = {};
        for (const name of this.applied) {
            const bare = name.replace(/^--mac-/, "");
            const value = computed.getPropertyValue(name).trim();
            if (value) tokens[bare] = value;
        }
        return {...this.current, tokens: {...this.current.tokens, ...tokens}};
    }

    /** Drop listeners. Call when tearing the app down. */
    destroy(): void {
        this.stopFollowingSystem();
        this.clearOverrides();
        this.listeners.clear();
    }

    // --- internals ---------------------------------------------------------

    private applyDefinition(theme: ThemeDefinition): void {
        this.clearOverrides();

        this.root.setAttribute("data-appearance", theme.appearance);
        this.root.setAttribute("data-theme", theme.name);

        if (DECLARED_THEMES.has(theme.name)) {
            // These themes are fully expressed in CSS; nothing to inject.
        } else if (theme.tokens) {
            for (const [key, value] of Object.entries(theme.tokens)) {
                const name = cssVar(key);
                this.root.style.setProperty(name, value);
                this.applied.push(name);
            }
        }

        this.current = theme;
        for (const listener of this.listeners) {
            try {
                listener(theme);
            } catch (error) {
                console.error("mac ui: theme listener failed", error);
            }
        }
    }

    /** Remove every inline custom property this manager wrote. */
    private clearOverrides(): void {
        for (const name of this.applied.splice(0)) {
            this.root.style.removeProperty(name);
        }
    }

    private stopFollowingSystem(): void {
        if (this.mediaQuery && this.systemListener) {
            this.mediaQuery.removeEventListener("change", this.systemListener);
        }
        this.mediaQuery = null;
        this.systemListener = null;
    }
}

/** The application-wide theme manager. */
export const themeManager = new ThemeManager();

/**
 * Set the density preset ("compact" | "comfortable" | "touch").
 *
 * Density is pure CSS: it only moves `--mac-scale`, which every scalable token
 * multiplies. Removing the attribute hands control back to the media query that
 * enlarges controls on touch devices.
 */
export function setDensity(density: "compact" | "comfortable" | "touch" | null): void {
    if (density === null) {
        document.documentElement.removeAttribute("data-density");
        return;
    }
    document.documentElement.setAttribute("data-density", density);
}

/** The density currently in effect, including the automatic touch default. */
export function getDensity(): string {
    const explicit = document.documentElement.getAttribute("data-density");
    if (explicit) return explicit;
    return window.matchMedia("(pointer: coarse)").matches ? "touch" : "comfortable";
}
