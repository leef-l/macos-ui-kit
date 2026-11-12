# macOS UI Kit for Wails

A **macOS-styled desktop application** built with Go and [Wails v3](https://v3.wails.io/),
containing a self-contained **vanilla TypeScript component library** — no React, no Vue,
no framework runtime.

The window is frameless: the app paints its own title bar, traffic lights and sidebar,
so the interface looks the same on Windows, macOS and Linux, and adapts to touch devices.

<!-- Replace with a screenshot of your build -->
![Component showcase](./docs/screenshot.png)

---

## What this is

Two things in one repository:

1. **A component library** — `packages/macos-ui-kit/`, published as
   [`@leef-l/macos-ui-kit`](packages/macos-ui-kit). 30 components on two-layer
   design tokens with a runtime theme system.
2. **An application** — a working Wails v3 desktop app with a frameless window,
   custom macOS chrome, a native menu bar, and a live component showcase. It
   exists to *host* the library and prove it in a real window.

The split matters: **the library is frontend only.** It has no backend, no Go,
no Wails runtime and no network calls — `package.json` declares zero
dependencies and the built bundle has no imports at all. Nothing in it reads a
`_wails` global, an IPC bridge or a native API.

The Go code in this repository (`main.go`, `menu.go`, `windowservice.go`,
`greetservice.go`) belongs to the demo host, not to the package. You do not need
it to use the components.

| | Ships to consumers | Needs Go | Needs Wails |
|---|---|---|---|
| `packages/macos-ui-kit` | yes (npm / release tarball) | no | no |
| The demo app in this repo | no | yes | yes |

The app consumes the library as a package (`import … from "@leef-l/macos-ui-kit"`)
rather than by relative path, so the library has to stand on its own: if it only
worked inside this repository, the packaging would be wrong.

---

## The component library

**30 components**, all themeable and usable on desktop and touch:

| Group | Components |
| --- | --- |
| **Controls (17)** | Button, TextField, TextArea, NumberField, Slider, Progress, Spinner, Badge, Switch, Checkbox, SegmentedControl, Select, ComboBox, DatePicker, Disclosure, Table, SplitView |
| **Layout (6)** | TitleBar, TrafficLights, Sidebar, StatusBar, Toolbar, TabView |
| **Overlays (6)** | Menu, Tooltip, Dialog, Popover, Sheet, Toast |
| **Mobile (1)** | MobileShell |

Open the app and pick **组件** in the sidebar to see all 30 rendered live and
interactive, with theme and density switches at the top.

### Why no framework

The kit targets a window shell with light interaction — settings panels, lists,
forms. That is exactly the workload where a framework's runtime cost is pure
overhead and its benefits (virtual DOM diffing for large, frequently-updated
lists) go unused. The trade-off is that state synchronisation and event
delegation are manual, which is why the library enforces rules like delegated
listeners, `DocumentFragment` insertion and idempotent setters.

Read [DESIGN-v2.md](packages/macos-ui-kit/src/DESIGN-v2.md) for the full architecture and
the reasoning behind each decision, including what was rejected and why.

### The API convention

Three rules, applied to all 30 components, so that a control you have never used
behaves the way you would guess:

| Concern | Rule | Examples |
|---|---|---|
| **Read state** | property getter, no `get` prefix in the name | `field.value`, `toggle.checked`, `sidebar.selected`, `sheet.isOpen` |
| **Write state** | `setX()` method, always silent | `setValue()`, `setChecked()`, `setSelected()`, `setOpen()` |
| **Dismissible overlays** | `open(anchor?)` / `close()` / `isOpen` | `dialog.open()`, `menu.open(btn)`, `popover.open(btn)` |

```ts
const field = new TextField();
field.setValue("hello");   // silent: does not fire onChange
field.value;               // "hello"

const sheet = new Sheet({title: "Licence"});
sheet.open();              // not show()
sheet.isOpen;              // true
```

Two deliberate details:

- **`setX()` never fires the change callback.** Only a user interaction does.
  That is what makes `setX()` safe to call from a render path: it cannot loop
  back into your handler. Where a component needs to distinguish the two
  internally it uses a private `applySelection(value, notify)`.
- **`Toast` keeps `show()` / `hide()`.** It is a notification, not an overlay:
  it has no anchor, no dismissal state and no `isOpen`. Everything you can open
  and close is `open()` / `close()`.

Every component also exposes `element`, `destroy()` (releases listeners and any
observer), and `focus()` where focusing makes sense.

### Two-layer tokens

```
base layer       raw values       --mac-base-gray-950  --mac-base-blue-D
     ↓
semantic layer   purpose names    --mac-bg-window  --mac-accent
     ↓
components       read only these  background: var(--mac-bg-window)
```

Components never reference a base token. That indirection is what lets a theme
override three values instead of sixty.

### Theming

```ts
import {themeManager} from "./ui";

themeManager.register({
  name: "brand",
  appearance: "dark",              // inherit the dark palette
  tokens: {
    accent: "#ff6b35",
    "bg-window": "#141018",
  },
});
themeManager.apply("brand");
```

Built-in appearances: `macos-dark`, `macos-light`, `hc-dark`, `hc-light`.
The default follows the OS setting with **pure CSS**, so the first paint is
already correct — no flash of the wrong theme.

**Density** presets (`compact` / `comfortable` / `touch`) move a single
`--mac-scale` factor that every scalable dimension multiplies. Touch devices get
the roomier density automatically, and 44 px tap targets are enforced where the
pointer is coarse.

---

## Getting started

**Requirements:** Go 1.26+, Node 18+, the `wails3` CLI, and the platform webview
(WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux).

```sh
# Run in development, with hot reload
wails3 dev

# Build a production binary into bin/
wails3 build
```

### Type checking

```sh
cd frontend && npm run typecheck
```

TypeScript must be 5.0 or newer: `tsconfig.json` uses `moduleResolution: "bundler"`
and `verbatimModuleSyntax`, which older compilers reject.

### Regenerating bindings

The files in `frontend/bindings/` are generated from the Go services. Regenerate
them after changing an exported service method:

```sh
wails3 generate bindings -f "-tags production" -clean=true -ts -i
```

`wails3 build` runs this automatically.

---

## How the window works

The window is frameless (`Frameless: true`) with the native title bar hidden. The
app draws the whole frame, which is what makes the interface identical across
platforms.

| macOS element | Where it lives |
| --- | --- |
| Traffic lights | `packages/macos-ui-kit/src/layout/traffic-lights.*` |
| Draggable title bar | `.mac-titlebar` via the `--wails-draggable: drag` property |
| Source-list sidebar | `packages/macos-ui-kit/src/layout/sidebar.*` |
| Toolbar search | `TextField` in the title bar's trailing cluster |
| Status bar | `packages/macos-ui-kit/src/layout/statusbar.*` |

`windowservice.go` exposes window control to the frontend; its exported methods
become promise-returning TypeScript functions. Because there is no native frame
to fall back on, the rendered traffic lights are the window's only close,
minimise and zoom controls.

The service also listens for native window events and pushes state through
`window:state`, so the lights stay correct when the window is changed from
outside the app — double-clicking the title bar, for instance.

### Platform differences, stated honestly

| Concern | Reality |
| --- | --- |
| **Fonts** | macOS/iOS use the real SF Pro via `-apple-system`. Windows/Linux fall back to **Inter** (SIL OFL), which is drawn to be SF-like. Exact glyph parity is impossible: SF Pro is Apple-licensed and cannot be redistributed. |
| **Rendered chrome** | Layout, spacing, radii and colour are identical. Scrollbar rendering and native form-control defaults differ per engine; the kit replaces the ones that matter. |
| **Menu bar** | macOS has a system-wide menu bar that cannot be drawn in the webview, so `menu.go` defines a native one (⌘Q, ⌘W, ⌘M, ⌘,). Windows/Linux disable it and use the sidebar. **No platform shows two navigation surfaces.** |
| **Window corners** | On macOS AppKit already rounds a frameless window, so the CSS corner steps aside there to avoid a double edge. Windows/Linux draw their own. |
| **Mobile** | The mobile shell targets *usability* — safe areas, 44 px targets, no hover dependence — not pixel parity with iOS HIG. The two design systems differ by intent. |

---

## Project layout

```
main.go                  application and window setup
menu.go                  native application menu bar
windowservice.go         window control service + window:state event
greetservice.go          demo Go service the frontend calls

packages/macos-ui-kit/   THE COMPONENT LIBRARY (published package)
├─ package.json          name, exports map, build scripts, files list
├─ vite.config.ts        library build: one ESM bundle + one stylesheet
├─ tsconfig.build.json   declaration emit only
├─ assets/               Inter font + its OFL licence
├─ scripts/
│  └─ finalize-dist.mjs  post-build: externalise the font, write style.css.d.ts
└─ src/
   ├─ tokens.css         two-layer design tokens
   ├─ base.css           global element rules ([hidden], .visually-hidden)
   ├─ theme.ts           runtime theme manager
   ├─ fonts.css          cross-platform font normalisation
   ├─ scrollbars.css     cross-platform scrollbar normalisation
   ├─ touch.css          no-hover normalisation
   ├─ component.ts       base class (listener lifetime)
   ├─ dom.ts             element builders
   ├─ overlay.ts         positioning, focus trap, z-index
   ├─ controls/          17 controls
   ├─ layout/            6 layout components
   ├─ overlays/          6 overlays
   └─ mobile/            mobile shell

frontend/
├─ index.html            document shell (an empty #app mount point)
├─ public/style.css      app-level layout (the kit supplies the rest)
└─ src/
   ├─ main.ts            shell wiring: traffic lights, sidebar, events
   ├─ showcase/          live component showcase
   └─ bindings/          GENERATED — do not edit
```

### Using the library in another project

Three ways in, depending on your setup:

```sh
# 1. From a GitHub release — works today, no npm account needed
npm install https://github.com/leef-l/macos-ui-kit/releases/download/v0.1.0/leef-l-macos-ui-kit-0.1.0.tgz

# 2. From npm, once the package is published
npm install @leef-l/macos-ui-kit

# 3. From a local clone, after building it
git -C macos-ui-kit/packages/macos-ui-kit npm install && \
  npm --prefix macos-ui-kit/packages/macos-ui-kit run build
npm install /absolute/path/to/macos-ui-kit/packages/macos-ui-kit
```

Then, with a bundler:

```ts
// Whole kit
import * as ui from "@leef-l/macos-ui-kit";

// Or a single component — same import, take only what you use
import {Button, themeManager} from "@leef-l/macos-ui-kit";
import "@leef-l/macos-ui-kit/style.css";

document.body.appendChild(
    new Button({label: "Hello", variant: "primary", onClick: () => {}}).element,
);
```

And with no build tooling at all — copy `dist/macos-ui-kit.iife.js`,
`dist/macos-ui-kit.css` and `dist/assets/` next to your HTML:

```html
<link rel="stylesheet" href="./macos-ui-kit.css" />
<script src="./macos-ui-kit.iife.js"></script>
<script>
    document.body.appendChild(
        new MacUI.Button({label: "Hello", variant: "primary"}).element,
    );
</script>
```

There are no runtime dependencies and no framework. `dist/` ships one ESM bundle,
one IIFE bundle, one stylesheet, the type declarations, and the Inter font the
stylesheet points at.

**Tree-shaking, honestly:** a bundler drops unused components from the
JavaScript, but the stylesheet is one 63 KB file containing every component's
rules. There is no per-component CSS split.

### Why the app imports source, not `dist`

`frontend/vite.config.ts` aliases `@leef-l/macos-ui-kit` to
`packages/macos-ui-kit/src/index.ts`, and `frontend/tsconfig.json` maps the same
path under `paths`. Editing a component therefore takes effect on reload with no
library build step in between, and there is never a second copy of the code to
drift out of sync. Consumers outside this repository use the built package.

### Where each component is used

The demo application exercises the whole library rather than only showing it off
in one gallery pane, because a component that is only ever rendered in a
catalogue tends to be wrong in ways a catalogue cannot reveal:

| Pane | Components it puts to work |
|---|---|
| Overview | `TextField`, `Button`, `ComboBox`, `TextArea`, `Menu`, `Tooltip`, `Badge` |
| Greeting | the message history list, fed by the same controls as Overview |
| Activity | `SegmentedControl`, `Table`, `Badge`, `Spinner`, `Progress`, `Button` |
| Settings | `TabView`, `SegmentedControl`, `Slider`, `Checkbox`, `Switch`, `Select`, `NumberField`, `DatePicker`, `Disclosure`, `Dialog` |
| Components | all 30 in the showcase, plus `Toolbar`, `SplitView`, `Popover`, `Sheet` in a composed inspector |

`TrafficLights` is created by `TitleBar` rather than by application code, and
`Toast` is raised through `showToast()`, so neither appears as a `new` call in
`main.ts`.

---

## Verification

Every change to this repository is checked with:

```sh
go vet ./...
gofmt -l *.go
cd packages/macos-ui-kit && npm run build     # library: dist + types + CSS
cd frontend && npx tsc --noEmit && npm run build
wails3 build
```

The library build is not optional: it is what proves the package stands alone.
It has caught two defects that the app build could not:

- **The whole design system was tree-shaken away.** `sideEffects` in the
  package manifest did not list the entry file, so the bundler dropped the
  stylesheet imports in `src/index.ts` and shipped 53 KB of component CSS with
  no tokens, no font and no global rules. The app rendered — unstyled. Listing
  `src/index.ts` fixed it.
- **The font was inlined as base64.** Vite's library mode inlines CSS assets
  regardless of `assetsInlineLimit`, turning a 63 KB stylesheet into 473 KB.
  `scripts/finalize-dist.mjs` now writes the font back out as a file.

The component library is additionally verified by instantiating **all 30
components in a real headless browser** and asserting each mounts with the
correct root class — a component can type check and still render nothing.

Because the library is frontend only, it is also verified **with no host at
all**: a plain HTML file, opened by a static server, with no bundler, no Go
process and no Wails runtime. It loads `macos-ui-kit.iife.js` with a `<script>`
tag and mounts all 30 components through `window.MacUI`. The check asserts
30/30 mount, zero console errors, `window._wails === undefined`, and that the
tokens still resolve (`--mac-control-height` → `calc(28px * 1)`). That is the
proof behind "no backend required"; stating it in prose would not be.

The harness also asserts behaviour, not just presence: that `Table.setRows()`
re-renders, that `Progress.setValue()` moves the fill, that `TabView.setSelected()`
changes the selected tab, that `Disclosure` toggles its open state, that all four
themes produce different background colours, and that the density presets change
`--mac-scale`.

Two of those checks are regression tests for defects the harness caught and the
catalogue alone could not:

- **`[hidden]` was being ignored.** A component root that sets `display` beats
  the user-agent `[hidden] { display: none }` rule, so `element.hidden = true` on
  a `Spinner` left it visible. Four components had each worked around this
  locally for an inner part; `base.css` now fixes the category.
- **The `Disclosure` chevron pointed the wrong way.** The icon path draws a
  right-pointing chevron at `0deg`, but the stylesheet rotated it `-90deg` when
  collapsed (pointing *up*) and `0deg` when open (pointing *right*). Collapsed is
  now `0deg` and open is `90deg`, matching the macOS convention.

Finally, the packaged output is verified from the outside: a throwaway project
installs the tarball with `npm pack`, type checks against the published
`.d.ts`, bundles with its own Vite, and is loaded in a headless browser to
confirm the components mount **and** the tokens resolve — a package that only
works inside its own repository is not a package.

---

## Licence

Application code in this repository is provided as-is for reference and reuse.
Bundled third-party assets keep their own licences:

- **Inter** typeface — SIL Open Font License 1.1 (see `frontend/Inter Font License.txt`)
- **Wails** — MIT
