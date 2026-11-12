/**
 * Static preview entry point.
 *
 * This is the GitHub Pages build: the same showcase the desktop app mounts, but
 * with no Wails runtime, no Go backend and no bindings. It imports the kit by
 * package name, which is also the proof that the library works on its own.
 */
import {Badge, themeManager} from "@leef-l/macos-ui-kit";
import {buildShowcase} from "./showcase/showcase";
import "./preview.css";

const REPO = "https://github.com/leef-l/macos-ui-kit";

function masthead(): HTMLElement {
    const head = document.createElement("header");
    head.className = "preview__masthead";

    const title = document.createElement("h1");
    title.className = "preview__title";
    title.textContent = "macOS UI Kit";

    const lede = document.createElement("p");
    lede.className = "preview__lede";
    lede.textContent =
        "30 个 macOS 风格组件，零运行时依赖，纯 TypeScript。切换主题或密度，整个界面会跟着变。";

    const meta = document.createElement("div");
    meta.className = "preview__meta";

    const install = document.createElement("code");
    install.className = "preview__install";
    install.textContent = "npm install @leef-l/macos-ui-kit";

    const version = new Badge({text: "v0.1.2", variant: "accent"});
    const plain = new Badge({text: "无框架", variant: "default"});
    const zero = new Badge({text: "0 依赖", variant: "success"});

    const links = document.createElement("nav");
    links.className = "preview__links";
    for (const [label, href] of [
        ["GitHub", REPO],
        ["npm", "https://www.npmjs.com/package/@leef-l/macos-ui-kit"],
    ] as const) {
        const a = document.createElement("a");
        a.className = "preview__link";
        a.href = href;
        a.rel = "noopener";
        a.target = "_blank";
        a.textContent = label;
        links.appendChild(a);
    }

    meta.append(install, version.element, plain.element, zero.element, links);
    head.append(title, lede, meta);
    return head;
}

function footer(): HTMLElement {
    const foot = document.createElement("footer");
    foot.className = "preview__footer";

    const text = document.createElement("span");
    text.textContent = "MIT · 字体 Inter（SIL OFL）· 本页由同一份组件代码构建，没有任何后端。";

    const repo = document.createElement("a");
    repo.href = REPO;
    repo.rel = "noopener";
    repo.target = "_blank";
    repo.textContent = "leef-l/macos-ui-kit";

    foot.append(text, repo);
    return foot;
}

function mount(): void {
    const root = document.getElementById("preview");
    if (!root) return;

    // Follow the OS appearance on first load; the showcase's own controls can
    // override it afterwards.
    themeManager.followSystem();

    const page = document.createElement("div");
    page.className = "preview";
    page.append(masthead(), buildShowcase(), footer());
    root.appendChild(page);
}

// The kit's stylesheets are imported by src/index.ts as a side effect, so the
// tokens exist by the time this runs; still, wait for the document so the mount
// point is guaranteed to be parsed.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, {once: true});
} else {
    mount();
}

// Exposed for the headless check that verifies this page actually rendered.
(globalThis as unknown as {__ready?: boolean}).__ready = true;
