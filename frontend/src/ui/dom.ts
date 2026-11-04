/**
 * Small DOM helpers shared by every macOS UI Kit component.
 *
 * The kit builds elements imperatively instead of shipping a framework: a
 * desktop window creates its UI once and then updates small pieces of it, which
 * is exactly the workload where direct DOM work is fastest and a framework
 * runtime is pure overhead.
 */

/** Anything that can be placed inside an element. */
export type Child = Node | string | number | null | undefined | false;

/**
 * Create an element with attributes and children in one call.
 *
 * Attributes are assigned as properties when the name is a known property on
 * the element (so `value`, `checked`, `disabled` behave correctly) and as
 * attributes otherwise. `class`, `dataset`, `style`, `on*` handlers and
 * `textContent` get special treatment.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Attrs = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;

        if (key === "class" || key === "className") {
            node.className = String(value);
        } else if (key === "dataset") {
            Object.assign(node.dataset, value as Record<string, string>);
        } else if (key === "style") {
            Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
        } else if (key === "text") {
            node.textContent = String(value);
        } else if (key === "html") {
            node.innerHTML = String(value);
        } else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        } else if (key in node) {
            (node as unknown as Record<string, unknown>)[key] = value;
        } else {
            node.setAttribute(key, String(value));
        }
    }

    append(node, children);
    return node;
}

export type Attrs = Record<string, unknown>;

/** Append children, skipping null/undefined/false and stringifying numbers. */
export function append(parent: Element, children: Child[]): void {
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        parent.appendChild(
            typeof child === "string" || typeof child === "number"
                ? document.createTextNode(String(child))
                : child,
        );
    }
}

/** Remove every child of a node. */
export function clear(node: Element): void {
    while (node.firstChild) node.removeChild(node.firstChild);
}

/** Create an SVG element from a path definition, sized for a control icon. */
export function svgIcon(path: string, size = 16, viewBox = "0 0 24 24"): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const el = document.createElementNS(ns, "path");
    el.setAttribute("d", path);
    svg.appendChild(el);
    return svg;
}

/**
 * Run `fn` on the next animation frame, coalescing repeated calls.
 *
 * Scroll and resize handlers use this so a burst of events produces one layout
 * read instead of dozens.
 */
export function rafThrottle(fn: () => void): () => void {
    let queued = false;
    return () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            fn();
        });
    };
}

let idCounter = 0;

/** Generate a unique id, used to link labels to controls. */
export function uid(prefix = "mac"): string {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}
