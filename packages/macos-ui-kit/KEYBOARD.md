# Keyboard

Generated from `src/` by `npm run keyboard` — every component that handles a
key, and which keys it handles. Do not edit by hand.

Conventions the whole kit follows:

| | |
| --- | --- |
| Tab | leaves a component in one stop; collections use a roving tabindex |
| Arrow keys | move focus inside a collection, and never scroll the page |
| Home / End | jump to the first and last item of any collection |
| Escape | dismisses an overlay and returns focus to its trigger |
| Enter / Space | activates the focused element |

## Coverage

| Component | ↑ | ↓ | ← | → | Home | End | Enter | Space | Esc | Tab | ⌫ | Del | PgUp | PgDn |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **ActionSheet** |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| **Calendar** | ● | ● | ● | ● | ● | ● |  |  |  |  |  |  | ● | ● |
| **ComboBox** | ● | ● |  |  |  |  | ● |  | ● | ● |  |  |  |  |
| **CommandPalette** | ● | ● |  |  | ● | ● | ● |  | ● |  |  |  |  |  |
| **List** | ● | ● |  |  | ● | ● | ● | ● |  |  |  |  |  |  |
| **NumberField** | ● | ● |  |  |  |  |  |  |  |  |  |  |  |  |
| **Rating** | ● | ● | ● | ● | ● | ● |  |  |  |  |  |  |  |  |
| **SearchField** |  |  |  |  |  |  | ● |  | ● |  |  |  |  |  |
| **SegmentedControl** | ● | ● | ● | ● | ● | ● |  |  |  |  |  |  |  |  |
| **SplitButton** |  | ● |  |  |  |  |  |  | ● |  |  |  |  |  |
| **SplitView** |  |  |  |  | ● | ● |  |  |  |  |  |  |  |  |
| **Stepper** | ● | ● |  |  | ● | ● |  |  |  |  |  |  | ● | ● |
| **Switch** |  |  |  |  |  |  | ● | ● |  |  |  |  |  |  |
| **TabBar** | ● | ● | ● | ● | ● | ● |  |  |  |  |  |  |  |  |
| **Table** | ● | ● | ● | ● | ● | ● | ● | ● |  |  |  |  |  |  |
| **TagInput** |  |  | ● | ● |  |  | ● |  |  |  | ● | ● |  |  |
| **TextField** |  |  |  |  |  |  | ● |  |  |  |  |  |  |  |
| **TreeView** | ● | ● | ● | ● | ● | ● | ● | ● |  |  |  |  |  |  |
| **TabView** | ● | ● | ● | ● | ● | ● |  |  |  |  | ● | ● |  |  |
| **Alert** |  |  |  |  |  |  | ● |  | ● |  |  |  |  |  |
| **ContextMenu** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| **Dialog** |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| **Menu** | ● | ● |  |  | ● | ● | ● | ● | ● |  |  |  |  |  |
| **Popover** |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |
| **Sheet** |  |  |  |  |  |  |  |  | ● |  |  |  |  |  |

## Bindings

### ActionSheet

`actionsheet.ts`

| Key | Does |
| --- | --- |
| `Esc` | — |

### Calendar

`calendar.ts`

| Key | Does |
| --- | --- |
| `←` | — |
| `→` | — |
| `↑` | — |
| `↓` | — |
| `Home` | — |
| `End` | — |
| `PgUp` | — |
| `PgDn` | — |

### ComboBox

`combobox.ts`

| Key | Does |
| --- | --- |
| `↓` | — |
| `↑` | — |
| `Enter` | — |
| `Esc` | — |
| `Tab` | — |

### CommandPalette

`commandpalette.ts`

| Key | Does |
| --- | --- |
| `↓` | — |
| `↑` | — |
| `Home` | — |
| `End` | — |
| `Enter` | — |
| `Esc` | — |

### List

`list.ts`

| Key | Does |
| --- | --- |
| `↓` | — |
| `↑` | — |
| `Home` | — |
| `End` | — |
| `Space` | — |
| `Enter` | — |

### NumberField

`numberfield.ts`

| Key | Does |
| --- | --- |
| `↑` | — |
| `↓` | — |

### Rating

`rating.ts`

| Key | Does |
| --- | --- |
| `→` | — |
| `↑` | — |
| `←` | — |
| `↓` | — |
| `Home` | — |
| `End` | — |

### SearchField

`searchfield.ts`

| Key | Does |
| --- | --- |
| `Enter` | — |
| `Esc` | — |

### SegmentedControl

`segmented.ts`

| Key | Does |
| --- | --- |
| `→` | — |
| `↓` | — |
| `←` | — |
| `↑` | — |
| `Home` | — |
| `End` | — |

### SplitButton

`splitbutton.ts`

| Key | Does |
| --- | --- |
| `↓` | Whether the menu is currently open. |
| `Esc` | Whether the menu is currently open. |

### SplitView

`splitview.ts`

| Key | Does |
| --- | --- |
| `Home` | Clamp, write and (optionally) report a new primary size in pixels. |
| `End` | Clamp, write and (optionally) report a new primary size in pixels. |

### Stepper

`stepper.ts`

| Key | Does |
| --- | --- |
| `↑` | — |
| `↓` | — |
| `PgUp` | — |
| `PgDn` | — |
| `Home` | — |
| `End` | — |

### Switch

`switch.ts`

| Key | Does |
| --- | --- |
| `Space` | The current state. |
| `Enter` | The current state. |

### TabBar

`tabbar.ts`

| Key | Does |
| --- | --- |
| `←` | — |
| `↑` | — |
| `→` | — |
| `↓` | — |
| `Home` | — |
| `End` | — |

### Table

`table.ts`

| Key | Does |
| --- | --- |
| `↓` | — |
| `↑` | — |
| `Home` | — |
| `End` | — |
| `Space` | — |
| `Enter` | — |
| `→` | Write one width through to the `<col>` and the table's total width. |
| `←` | Write one width through to the `<col>` and the table's total width. |

### TagInput

`taginput.ts`

| Key | Does |
| --- | --- |
| `Enter` | — |
| `,` | — |
| `，` | — |
| `⌫` | — |
| `←` | — |
| `Del` | — |
| `→` | — |

### TextField

`textfield.ts`

| Key | Does |
| --- | --- |
| `Enter` | — |

### TreeView

`treeview.ts`

| Key | Does |
| --- | --- |
| `↓` | — |
| `↑` | — |
| `→` | — |
| `←` | — |
| `Home` | — |
| `End` | — |
| `Enter` | — |
| `Space` | — |

### TabView

`tabview.ts`

| Key | Does |
| --- | --- |
| `→` | — |
| `↓` | — |
| `←` | — |
| `↑` | — |
| `Home` | — |
| `End` | — |
| `Del` | — |
| `⌫` | — |

### Alert

`alert.ts`

| Key | Does |
| --- | --- |
| `Esc` | Whether the alert is on screen. |
| `Enter` | Whether the alert is on screen. |

### ContextMenu

`contextmenu.ts`

| Key | Does |
| --- | --- |
| `ContextMenu` | — |
| `F10` | — |

### Dialog

`dialog.ts`

| Key | Does |
| --- | --- |
| `Esc` | Show the dialog modally. |

### Menu

`menu.ts`

| Key | Does |
| --- | --- |
| `↓` | — |
| `↑` | — |
| `Home` | — |
| `End` | — |
| `Enter` | — |
| `Space` | — |
| `Esc` | Open the menu anchored to an element. |

### Popover

`popover.ts`

| Key | Does |
| --- | --- |
| `Esc` | — |

### Sheet

`sheet.ts`

| Key | Does |
| --- | --- |
| `Esc` | Slide the sheet in. Idempotent. |

_25 components, 106 bindings._
