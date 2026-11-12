# @leef-l/macos-ui-kit

macOS-style UI components in dependency-free TypeScript. No React, no Vue, no
virtual DOM — just `document.createElement` wrappers over two-layer design
tokens, so one import gives you the whole design system.

**Live preview: <https://leef-l.github.io/macos-ui-kit/>**

- **30 components** — 17 controls, 6 layout, 6 overlays, 1 mobile shell
- **Zero runtime dependencies**
- **Light DOM only** — no Shadow DOM, so native window dragging and screen
  readers both work
- **Runtime theming** — four built-in themes plus custom token overrides
- **Density scaling** — one `--mac-scale` factor resizes the whole interface

## Scope: frontend only

This package is **UI components and nothing else**. It contains no backend, no
server, no data layer and no build-time code generation.

- **No Go, no Wails runtime.** `package.json` declares no `dependencies` and no
  `peerDependencies`; the built bundle has no imports at all. Nothing in `src/`
  reads a `_wails` global, an IPC bridge, or a native API.
- **No framework.** Just DOM APIs. It runs in any browser, in an Electron or
  Tauri webview, in a Wails window, or in a plain HTML page opened from disk.
- **No network calls.** Components never fetch anything. What you render is what
  you pass in.

Wails v3 is a *target*, not a requirement: the drag regions and the mobile shell
were tuned for a frameless desktop window, and that is where the kit looks best.
In a normal browser those behaviours simply do nothing instead of failing.

Where the kit does touch host behaviour, it is through standard web APIs only:

| Behaviour | How it works | Outside a desktop shell |
|---|---|---|
| Window dragging | `--wails-draggable` is a CSS custom property on the title bar | Ignored; nothing to drag |
| Double-click to zoom | Listens for `dblclick` | Does nothing |
| Mobile detection | `matchMedia("(pointer: coarse)")` + a width query | Works everywhere |
| Sidebar / overlays | Plain DOM + CSS | Works everywhere |

The Go application in this repository is a separate thing: a demo host that
happens to use these components. You do not need it, and nothing in this package
imports from it.

---

## Install

### From npm — recommended

```sh
npm install @leef-l/macos-ui-kit
```

No configuration, no token. This is the channel to use.

### Straight from a GitHub release — no registry at all

```sh
npm install https://github.com/leef-l/macos-ui-kit/releases/download/v0.1.1/leef-l-macos-ui-kit-0.1.1.tgz
```

Same files, same types, same exports. Use it to pin an exact build, or when no
registry is reachable.

### From GitHub Packages

Published there too, but **GitHub Packages requires a token even for public
packages**, so this is not a drop-in replacement for npm. Point the scope at the
GitHub registry and supply a personal access token with `read:packages`:

```ini
# .npmrc
@leef-l:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
npm install @leef-l/macos-ui-kit
```

### From a clone

```sh
git clone https://github.com/leef-l/macos-ui-kit
cd macos-ui-kit/packages/macos-ui-kit
npm install
npm run build

# in your project
npm install /absolute/path/to/packages/macos-ui-kit
```

### No build tooling at all

Download `dist/macos-ui-kit.iife.js` and `dist/macos-ui-kit.css` from a release
(or open the files in `packages/macos-ui-kit/dist/` after building) and use the
global `MacUI`:

```html
<link rel="stylesheet" href="./macos-ui-kit.css" />
<script src="./macos-ui-kit.iife.js"></script>
<script>
    const button = new MacUI.Button({label: "Hello", variant: "primary"});
    document.body.appendChild(button.element);
</script>
```

The IIFE build needs the `assets/` folder next to the stylesheet, because the
stylesheet references the Inter font by relative path.

---

## Use

```ts
import {Button, TextField, showToast} from "@leef-l/macos-ui-kit";
// The stylesheet is separate: the JS bundle contains no CSS.
import "@leef-l/macos-ui-kit/style.css";

const field = new TextField({placeholder: "Your name"});
document.body.appendChild(field.element);

const button = new Button({
    label: "Greet",
    variant: "primary",
    onClick: () => showToast(`Hello ${field.value}`),
});
document.body.appendChild(button.element);
```

Every component exposes `element`, which is the node you mount. Construct it,
append `element`, and keep the instance for the methods.

### Whole kit or a single component

Both are the same import — take only what you use:

```ts
// Whole kit, when you want everything
import * as ui from "@leef-l/macos-ui-kit";

// One component, when you want one
import {Button} from "@leef-l/macos-ui-kit";
```

There is one entry point, and the ESM build is tree-shakeable: a bundler drops
every component you do not reference, provided the package's `sideEffects` field
is respected (Vite, Rollup, webpack and esbuild all do).

**Honest caveat:** the JavaScript is tree-shaken, the **stylesheet is not**. CSS
ships as a single 63 KB file and every component's rules are in it. Splitting it
per component is not worth the extra requests for a desktop window, but if you
are shipping to a slow network and use three components, know that you still
download the rules for thirty.

### Theming

```ts
import {themeManager, setDensity} from "@leef-l/macos-ui-kit";

themeManager.apply("macos-dark");   // macos-dark | macos-light | hc-dark | hc-light
setDensity("compact");              // compact | comfortable | touch
```

Or override tokens in your own stylesheet — components read semantic tokens
only, so one declaration restyles every component:

```css
:root {
    --mac-accent: #7c5cff;
    --mac-radius-m: 10px;
}
```

---

## API convention

Three rules, applied to all 30 components, so a control you have never used
behaves the way you would guess:

| Concern | Rule | Examples |
|---|---|---|
| **Read state** | property getter | `field.value`, `toggle.checked`, `sheet.isOpen` |
| **Write state** | `setX()`, always silent | `setValue()`, `setChecked()`, `setSelected()` |
| **Dismissible overlays** | `open(anchor?)` / `close()` / `isOpen` | `dialog.open()`, `popover.open(btn)` |

`setX()` never fires the change callback — only a user interaction does. That
makes programmatic writes safe to call from a render path.

`Toast` is the one exception: it is a notification, not an overlay, so it uses
`show()` / `hide()`.

---

## Components

| Group | Components |
|---|---|
| Controls | `Button` `TextField` `TextArea` `NumberField` `Slider` `Progress` `Spinner` `Badge` `Switch` `Checkbox` `SegmentedControl` `Select` `ComboBox` `DatePicker` `Disclosure` `Table` `SplitView` |
| Layout | `TitleBar` `TrafficLights` `Sidebar` `StatusBar` `Toolbar` `TabView` |
| Overlays | `Menu` `Tooltip` `Dialog` `Popover` `Sheet` `Toast` |
| Mobile | `MobileShell` |

Every component also exposes `element`, `destroy()` (releases listeners and any
observer), and `focus()` where focusing makes sense.

---

## Files

```
dist/index.js               ESM bundle            (import in a bundler)
dist/macos-ui-kit.iife.js   IIFE, global MacUI    (<script> tag)
dist/macos-ui-kit.css       one stylesheet
dist/index.d.ts             type declarations
dist/assets/                Inter font + its OFL licence
```

## Fonts

Apple's SF Pro cannot be redistributed, so the kit ships **Inter** (SIL Open
Font License 1.1, included in `dist/assets`) as an SF-alike fallback. The font
stack puts the real system font first on macOS, so Apple users see SF Pro and
everyone else sees near-identical glyphs.

The stylesheet references the font as `./assets/Inter-Medium.ttf`. If your
bundler relocates CSS assets, copy `dist/assets/` alongside the stylesheet — or
drop the `@font-face` block and provide your own.

## Licence

MIT. Bundled Inter typeface: SIL Open Font License 1.1.
