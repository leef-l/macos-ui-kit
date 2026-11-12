# @leef-l/macos-ui-kit

macOS-style UI components in dependency-free TypeScript. No React, no Vue, no
virtual DOM — just `document.createElement` wrappers with two-layer design
tokens, so one `import` gives you the whole design system.

Built for [Wails](https://wails.io) v3 desktop apps, but it has no Wails
dependency: it runs in any browser and any bundler.

- **30 components** — 17 controls, 6 layout, 6 overlays, 1 mobile shell
- **Zero runtime dependencies**
- **Light DOM only** — no Shadow DOM, so native window dragging and screen
  readers both work
- **Runtime theming** — four built-in themes plus custom token overrides
- **Density scaling** — one `--mac-scale` factor resizes the whole interface

## Install

```sh
npm install @leef-l/macos-ui-kit
```

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

### Dark and light

Built-in themes are pure CSS: `themeManager.apply()` toggles a `data-appearance`
attribute and the token layer does the rest. Calling it is enough — no stylesheet
swap.

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

## Components

| Group | Components |
|---|---|
| Controls | `Button` `TextField` `TextArea` `NumberField` `Slider` `Progress` `Spinner` `Badge` `Switch` `Checkbox` `SegmentedControl` `Select` `ComboBox` `DatePicker` `Disclosure` `Table` `SplitView` |
| Layout | `TitleBar` `TrafficLights` `Sidebar` `StatusBar` `Toolbar` `TabView` |
| Overlays | `Menu` `Tooltip` `Dialog` `Popover` `Sheet` `Toast` |
| Mobile | `MobileShell` |

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
