# API reference

Generated from `src/` by `npm run docs` — every option, getter and method
the kit exposes, in the order the source declares them. Do not edit this
file by hand; run the script.

Conventions, identical in every component:

| | |
| --- | --- |
| Read state | a property getter (`field.value`) |
| Write state | `setX(...)`, always silent (no `onChange`) |
| Dismissible overlays | `open(anchor?)` / `close()` / `isOpen` |
| Mount | `element` is the node; `mount(parent)` replaces the parent's content |
| Teardown | `destroy()` removes every listener; safe to call twice |

An option whose description reads `—` is one whose name and type already say
what it does; the docstrings that exist are the ones the source carries.

## Controls (44)

### ActionSheet

The iOS action sheet: a list of choices that slides up from the bottom, with the destructive one marked in red and Cancel set apart below the group.

`actionsheet.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | optional | — |
| `message` | `string` | optional | — |
| `actions` | `ActionSheetAction[]` | **required** | — |
| `onSelect` | `(value: string) => void` | optional | Fires with the picked action's value, before the sheet dismisses. |
| `ariaLabel` | `string` | optional | Accessible name when there is neither a title nor a message. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the sheet is on screen. |
| `open()` | `void` | Show the sheet, focused, with the last action as the escape hatch. |
| `close()` | `void` | Dismiss the sheet and hand focus back. |
| `setActions(actions: ActionSheetAction[])` | `void` | Replace the action list. The sheet stays as open or closed as it was. |
| `destroy()` | `void` |  |

Related types: `ActionSheetTone`

### Avatar

A person or entity chip: image, or coloured initials.

`avatar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `name` | `string` | **required** | Name used for the initials and the accessible label. |
| `src` | `string` | optional | Image URL. Falls back to initials if it fails to load. |
| `size` | `AvatarSize` | optional | — |
| `status` | `AvatarStatus` | optional | Presence dot in the lower-right corner. Omit for no dot. |
| `shape` | `"circle" \| "square"` | optional | Rounded square instead of a circle — the macOS app-icon silhouette. |

| Member | Returns | Description |
| --- | --- | --- |
| `setName(name: string)` | `void` | Re-point the avatar at a different person. |
| `setSrc(src: string \| undefined)` | `void` | Swap the image, or pass `undefined` to fall back to initials. |
| `setStatus(status: AvatarStatus \| undefined)` | `void` | Change or clear the presence dot. |

Related types: `AvatarSize`, `AvatarStatus`

### Badge

A small pill used to tag rows, counts and states.

`badge.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `text` | `string` | **required** | Badge text. |
| `variant` | `BadgeVariant` | optional | Colour treatment. Default `default` (neutral grey). |

| Member | Returns | Description |
| --- | --- | --- |
| `setText(text: string)` | `void` | Replace the badge text. |
| `setVariant(variant: BadgeVariant)` | `void` | Swap the colour treatment. |

Related types: `BadgeVariant`

### Breadcrumb

A path trail: `项目 › 设计 › 组件`.

`breadcrumb.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `items` | `BreadcrumbItem[]` | **required** | — |
| `separator` | `"chevron" \| "slash"` | optional | `/` is the filesystem reading; the chevron matches macOS toolbars. |
| `maxItems` | `number` | optional | Collapse the middle into an ellipsis once the trail is longer than this. The first and last entries always survive. |
| `onExpand` | `() => void` | optional | Fires when a collapsed segment is clicked. |

| Member | Returns | Description |
| --- | --- | --- |
| `setItems(items: BreadcrumbItem[])` | `void` | Replace the trail, e.g. after navigating into a folder. |

### Button

A native `<button>` with macOS styling.

`button.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `Child` | optional | Visible label. Omit for an icon-only button (then set `ariaLabel`). |
| `icon` | `string` | optional | Leading SVG path data, drawn at the control's icon size. |
| `variant` | `ButtonVariant` | optional | — |
| `size` | `ButtonSize` | optional | — |
| `ariaLabel` | `string` | optional | Accessible name; required when there is no visible label. |
| `block` | `boolean` | optional | Stretch to the container's width. |
| `disabled` | `boolean` | optional | — |
| `type` | `"button" \| "submit" \| "reset"` | optional | Native `type`, so a button inside a form does not submit by accident. |
| `onClick` | `(event: MouseEvent) => void` | optional | Fires on activation (click, Enter, Space — the browser handles the rest). |

| Member | Returns | Description |
| --- | --- | --- |
| `setLabel(text: string)` | `void` | Replace the visible label text. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the button. |
| `setPrimary(primary: boolean)` | `void` | Toggle the primary (blue) treatment at runtime. |
| `focus()` | `void` | Give the caller a way to move focus programmatically. |

Related types: `ButtonVariant`, `ButtonSize`

### Calendar

A standalone month grid.

`calendar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `string` | optional | Selected day as `YYYY-MM-DD`; omit for no selection. |
| `month` | `string` | optional | Month to show first as `YYYY-MM`; defaults to the value's month, then today's. |
| `firstDayOfWeek` | `0 \| 1` | optional | Column the week starts on: 1 = Monday (default), 0 = Sunday. |
| `min` | `string` | optional | Earliest selectable day, inclusive, as `YYYY-MM-DD`. |
| `max` | `string` | optional | Latest selectable day, inclusive, as `YYYY-MM-DD`. |
| `showAdjacent` | `boolean` | optional | Show the tails of the neighbouring months, greyed out but selectable. Default true; when false those cells stay blank and inert. |
| `onSelect` | `(value: string) => void` | optional | Fires with `YYYY-MM-DD` when the user picks a different day. |
| `onMonthChange` | `(month: string) => void` | optional | Fires with `YYYY-MM` when the visible month moves. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The selected day as `YYYY-MM-DD`, or "" when nothing is selected. |
| `month` | `string` | The visible month as `YYYY-MM`. |
| `setValue(value: string)` | `void` | Set the selection. Silent, like every other setter. The grid follows a selection that lands in another month — a calendar left showing an unselected March while `value` reads April would look broken. |
| `setMonth(month: string)` | `void` | Show a month by `YYYY-MM`. Silent; the user's arrows are what report. |
| `setBounds(min: string, max: string)` | `void` | Replace the bounds; both are inclusive `YYYY-MM-DD`, and either may be "" for "no limit". The selection is kept even when it now falls outside the bounds: clearing a value the caller set would be a data change hidden inside a paint. |
| `focus()` | `void` | Move keyboard focus onto the grid's tab stop. |

### Card

A titled container with an optional body and footer.

`card.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | optional | Title in the header. Its presence is what creates the header. |
| `subtitle` | `string` | optional | Secondary line under the title. |
| `trailing` | `Child` | optional | Content for the header's trailing edge — an "编辑" button, a count, a switch. Additive to the shape in the brief: the header exists when it has content, and this is content. |
| `body` | `Child[]` | optional | — |
| `footer` | `Child[]` | optional | — |
| `variant` | `CardVariant` | optional | Default `plain`: structure only, no box. |
| `padding` | `CardPadding` | optional | Default `default`. |

| Member | Returns | Description |
| --- | --- | --- |
| `body` | `HTMLElement` | The body, so a caller can append into it without rebuilding the card. |
| `setTitle(title: string)` | `void` | Set or clear the title. A blank string removes it, and the header with it. |
| `setSubtitle(subtitle: string)` | `void` | Set or clear the subtitle. |
| `setTrailing(trailing: Child)` | `void` | Replace the header's trailing slot. |
| `setBody(children: Child[])` | `void` | Replace the body's children. Silent, and independent of `get body()`. |
| `setFooter(children: Child[])` | `void` | Replace the footer's children; an empty list removes the footer. |
| `setVariant(variant: CardVariant)` | `void` | Switch between the unboxed and the grouped treatment. Silent. |

Related types: `CardVariant`, `CardPadding`

### Checkbox

A styled checkbox built around a real `<input type="checkbox">`.

`checkbox.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `checked` | `boolean` | optional | Initial ticked state. Default false. |
| `indeterminate` | `boolean` | optional | Show the dash instead of the tick; it takes precedence over `checked`. |
| `disabled` | `boolean` | optional | — |
| `label` | `Child` | optional | Text rendered next to the box; it also names the control for assistive tech. |
| `onChange` | `(checked: boolean) => void` | optional | Fires with the new state after a user toggle; setters stay silent. |

| Member | Returns | Description |
| --- | --- | --- |
| `checked` | `boolean` | The current ticked state. |
| `setChecked(checked: boolean)` | `void` | Set the ticked state; a write that changes nothing is skipped, and `onChange` stays silent. |
| `setIndeterminate(indeterminate: boolean)` | `void` | Show the mixed state (a dash instead of the tick). |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the checkbox, using the native attribute. |
| `focus()` | `void` | Move keyboard focus onto the native input. |

### ColorWell

A macOS colour well: a swatch that opens the platform colour picker.

`colorwell.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `string` | optional | The colour, as any CSS colour string. The swatch paints it verbatim; the native picker below reads a `#rrggbb` approximation, because that is the only form `input[type=color]` accepts. |
| `size` | `ColorWellSize` | optional | Swatch size presets. |
| `label` | `string` | optional | Accessible name. Without one a colour swatch is announced as a button. |
| `disabled` | `boolean` | optional | — |
| `onChange` | `(value: string) => void` | optional | Fires with the picked colour once the native panel commits one. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The current colour, as it was last given or picked. |
| `setValue(value: string)` | `void` | Swap the colour. Silent. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the well. Silent. |

Related types: `ColorWellSize`

### ComboBox

A macOS combo box: a text field with an editable suggestion list.

`combobox.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `options` | `ComboBoxOption[]` | **required** | Full suggestion list; typing filters it. |
| `value` | `string` | optional | Initially selected value; its label fills the field. |
| `placeholder` | `string` | optional | — |
| `renderOption` | `(option: ComboBoxOption) => Node \| string` | optional | Custom rendering for a suggestion row. Returning a `Node` lets the list hold live UI; returning a string renders as text. The list keeps its own ARIA wiring around whatever is returned. |
| `onChange` | `(value: string) => void` | optional | Fires when a suggestion is committed (click, Enter or Tab). |
| `onInput` | `(text: string) => void` | optional | Fires on every keystroke with the raw text. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The committed value. The highlight wins (an arrowed-onto row is what the user means), then the value behind the current label, and only then the raw text. Going through `selectedValue` is what keeps a field showing "Apricot" answering with its machine value "b". |
| `setValue(value: string)` | `void` | Set the text and value programmatically. A value that matches an option shows that option's label, so the field never displays a bare id where a name belongs. Silent, like every setter. |
| `setOptions(options: ComboBoxOption[])` | `void` | Replace the suggestion list; the current text is kept and re-filtered. |
| `focus()` | `void` | Move keyboard focus into the field and show the full list. |

### CommandPalette

A macOS command palette: type to filter, arrows to move, Return to run.

`commandpalette.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `items` | `CommandItem[]` | **required** | — |
| `placeholder` | `string` | optional | Ghost text in the search field. Also its accessible name. Default `搜索命令…`. |
| `emptyText` | `string` | optional | Shown in place of the list when nothing matches. Default `没有匹配的命令`. |
| `hotkey` | `string \| null` | optional | Single key that opens the palette with Cmd (macOS) or Ctrl. Default `"k"`. `null` turns the shortcut off, for a host that binds its own. |
| `ariaLabel` | `string` | optional | Accessible name for the dialog and the listbox. Default `命令面板`. |
| `onSelect` | `(value: string) => void` | optional | Fires with the chosen `value`, after the palette has closed. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the palette is on screen. |
| `open()` | `void` | Show the palette, focused and with an empty query. |
| `close()` | `void` | Dismiss the palette and hand focus back. |
| `toggle()` | `void` | Open when closed, close when open. |
| `setItems(items: CommandItem[])` | `void` | Replace the command list. Keeps the current query and re-ranks. |
| `setHotkey(key: string \| null)` | `void` | Change the shortcut key, or `null` to disable it. Silent. |
| `destroy()` | `void` |  |

### DatePicker

A macOS date picker wrapping a native `<input type="date">`.

`datepicker.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `string` | optional | Initial date as `YYYY-MM-DD`. |
| `min` | `string` | optional | Earliest selectable date, inclusive, as `YYYY-MM-DD`. |
| `max` | `string` | optional | Latest selectable date, inclusive, as `YYYY-MM-DD`. |
| `disabled` | `boolean` | optional | — |
| `label` | `string` | optional | Optional label rendered above the control and linked through `for`/`id`. |
| `onChange` | `(value: string) => void` | optional | Fires with `YYYY-MM-DD` (or "" when cleared) once the value is committed. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The current date as `YYYY-MM-DD`, or "" when empty. |
| `setValue(value: string)` | `void` | Set the date; an empty string clears it. Silent, like every setter. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the field, using the native attribute. |
| `focus()` | `void` | Move keyboard focus into the field. |

### Disclosure

A collapsible section.

`disclosure.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | **required** | Section title shown in the header. |
| `content` | `Child` | optional | Collapsible content. |
| `open` | `boolean` | optional | Start expanded. Defaults to false, the macOS convention. |
| `meta` | `string` | optional | Optional trailing summary, visible whether open or closed. |
| `disabled` | `boolean` | optional | — |
| `onToggle` | `(open: boolean) => void` | optional | — |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the section is currently expanded. |
| `contentElement` | `HTMLDivElement` | The region content is appended to after construction. |
| `setOpen(open: boolean, notify = false)` | `void` | Expand or collapse the section. |
| `setMeta(meta: string)` | `void` | Update the trailing summary text. |

### Divider

A one-pixel separator.

`divider.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `orientation` | `"horizontal" \| "vertical"` | optional | `horizontal` draws a rule across the container (the default); `vertical` draws a short rule between inline items, the way a toolbar separates button groups. |
| `label` | `Child` | optional | Centre a label on the rule ("或", "高级"). A labelled divider always renders horizontally, because a rotated label reads badly. |
| `inset` | `boolean` | optional | Start the rule at the inset margin instead of the container edge, the way a macOS sidebar separator lines up with the row text rather than the icon. |

| Member | Returns | Description |
| --- | --- | --- |
| `orientationValue` | `"horizontal" \| "vertical"` | Whether the rule is currently horizontal or vertical. |
| `setOrientation(orientation: "horizontal" \| "vertical")` | `void` | Switch the axis. A labelled divider cannot become vertical: its text would have nowhere to sit, so the call is ignored rather than producing a broken layout. |
| `setInset(inset: boolean)` | `void` | Show or hide the inset leading margin. |
| `setLabel(label: Child)` | `void` | Replace the centred text; an empty value drops the label back to a plain rule. |

### EmptyState

The placeholder shown where content would be.

`emptystate.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | **required** | Headline. Short: "没有结果", "还没有项目". |
| `message` | `Child` | optional | One or two sentences of guidance. Optional: a title alone is often enough. |
| `icon` | `string` | optional | Icon path in the 24×24 viewBox used across the kit. Defaults to a document glyph, which suits list and detail views equally. |
| `action` | `EmptyStateAction` | optional | Primary recovery action, usually "新建" or "清除筛选". |
| `compact` | `boolean` | optional | Tighter padding for a small pane (a sidebar, a popover). |

### FormRow

One row of a {@link Form}.

`form.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `Child` | **required** | Row label, in the leading column. |
| `hint` | `Child` | optional | Second line under the label: a current value, a constraint, a note. |
| `control` | `Child` | **required** | The control. Any node; it is adopted as-is. |
| `htmlFor` | `string` | optional | Id of the control this label belongs to. When set the label becomes a real `<label for>`, so clicking it focuses the field. |
| `wide` | `boolean` | optional | Let the control fill its column instead of sizing to its content. |

### InlineNotice

An inline notice: a tinted strip that reports a state in the flow of the page.

`inlinenotice.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `message` | `string` | **required** | The sentence itself. |
| `title` | `string` | optional | Optional bold line above the message. |
| `tone` | `NoticeTone` | optional | Tint, edge and glyph. Default `info`. |
| `icon` | `string` | optional | Leading SVG path data in the kit's 24×24 viewBox, replacing the tone's glyph. |
| `dismissible` | `boolean` | optional | Show a close button. Default `false`: a notice reports a condition the page still believes is true, so hiding it has to be a decision the caller makes. |
| `onDismiss` | `() => void` | optional | Fires when the user dismisses the notice. |

| Member | Returns | Description |
| --- | --- | --- |
| `tone` | `NoticeTone` | The current tone. |
| `isDismissed` | `boolean` | True once the user (or the caller) dismissed the notice. |
| `setTone(tone: NoticeTone)` | `void` | Change the tone: tint, edge, glyph and — for `danger` — the live-region role. Silent. |
| `setIcon(path: string)` | `void` | Replace the leading glyph. Passing a path makes the glyph tone-independent. |
| `setTitle(title: string)` | `void` | Replace the bold line; an empty string removes it. Silent. |
| `setMessage(message: string)` | `void` | Replace the sentence. Silent. |
| `setDismissible(dismissible: boolean)` | `void` | Show or hide the close button. Silent. |
| `dismiss()` | `void` | Hide the notice and report it. The node stays where it is: a caller that removes it in the handler would leave the layout to jump in the same frame, and an undismissed notice has to keep its place. The condition is the caller's to clear. |

Related types: `NoticeTone`

### Kbd

A keyboard shortcut, drawn as macOS keycaps.

`kbd.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `keys` | `string \| string[]` | **required** | One or more keys. A string is split on `+` and spaces, so `"⌘+S"`, `"cmd shift p"` and a single `"K"` all work; an array is taken as-is. Long names (`cmd`, `shift`, `esc`, `enter`, `up`) are mapped to glyphs. |
| `variant` | `"caps" \| "plain"` | optional | `caps` (default) draws keycaps; `plain` renders bare glyphs, for menus. |
| `size` | `"s" \| "m"` | optional | Keycap height. `s` matches menu rows, `m` (default) matches body text. |
| `label` | `string` | optional | Accessible description, e.g. "Command S". Defaults to the visible text. |

| Member | Returns | Description |
| --- | --- | --- |
| `keyList` | `string[]` | The individual keys, already normalised and ordered. |
| `setKeys(keys: string \| string[])` | `void` | Replace the shortcut; re-renders and re-orders the same way as the constructor. |

### LevelIndicator

A segmented level meter — the `NSLevelIndicator` a mixer or an activity panel uses.

`levelindicator.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `number` | optional | Fill level, 0..1. Not a percentage: every level in the kit is normalised, and the `aria-valuenow` percentage is derived rather than stored. |
| `segments` | `number` | optional | Number of discrete segments. Default 20. |
| `tone` | `"level" \| "accent"` | optional | `level` colours the bar green → yellow → red by position, the way an audio meter does. `accent` paints every lit segment in the accent colour, for a meter that is a gauge rather than a warning. |
| `orientation` | `"horizontal" \| "vertical"` | optional | — |
| `label` | `string` | optional | Accessible name. Default "电平". |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The current level, 0..1. |
| `segmentCount` | `number` | The number of segments the bar was built with. |
| `setValue(value: number)` | `void` | Set the level, 0..1. Silent. |

Related types: `LevelTone`

### List

A macOS list box: rows, optional section headings, one or many selected.

`list.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `items` | `ListItem[]` | **required** | — |
| `value` | `string \| string[]` | optional | Initially selected value, or the initial values for `multiple`. |
| `selection` | `ListSelection` | optional | Selection model. Default `single`. |
| `showSections` | `boolean` | optional | Draw a heading above each run of rows that shares a `section`. Default true; when false `section` is ignored and the rows render flat. |
| `ariaLabel` | `string` | optional | Accessible name for the listbox, since a list has no visible label. |
| `onSelect` | `(value: string \| string[]) => void` | optional | Fires after a user-driven change; every setter stays silent. |
| `reorderable` | `boolean` | optional | Let the reader drag a row to a new position. A row dropped into another section takes that section's name: the headings are drawn from the data, so a row that kept its old section would jump back to where it came from on the next render. |
| `onReorder` | `(values: string[]) => void` | optional | Fires with the full new order after a drop or an Alt+Arrow move. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string \| string[]` | The selection: an array in `multiple`, a string otherwise (`""` for `none`). |
| `items` | `ListItem[]` | A copy of the rows, so a caller cannot mutate the rendered model. |
| `selection` | `ListSelection` | How many rows may be selected at once. |
| `setItems(items: ListItem[])` | `void` | Replace the rows. The selection survives for values that still exist and is dropped for values that do not, the way `Table.setRows` treats its keys. Silent. / |
| `setValue(value: string \| string[])` | `void` | Set the selection programmatically. Silent, and values that are not in the list are ignored rather than painted as a selection with no row. / |
| `setSelection(mode: ListSelection)` | `void` | Switch the selection model. Silent. Narrowing to `single` keeps the first selected row in document order and drops the rest — leaving three rows marked in a control that now promises one would contradict every later report — and `none` clears the selection. / |
| `focus()` | `void` | Move focus to the selected row, or to the first selectable one. |

Related types: `ListSelection`

### NumberField

A numeric field on a native `<input type="number">`.

`numberfield.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `Child` | optional | Label rendered above the field; it is wired to the input through `for`/`id`. |
| `min` | `number` | optional | Smallest accepted value; also bounds the native spinner. |
| `max` | `number` | optional | Largest accepted value; also bounds the native spinner. |
| `step` | `number` | optional | Increment used by the stepper buttons and the arrow keys. Default 1. |
| `value` | `number` | optional | Initial value; defaults to `min`, then 0. |
| `onChange` | `(value: number) => void` | optional | Fires only for a legal value — a finite number inside `min`/`max`. A blank or out-of-range entry stays in the field but is not committed. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The last committed value. A blank or illegal entry is not reported. |
| `setValue(value: number)` | `void` | Replace the value; out-of-range input is clamped rather than committed as-is. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the field and its stepper buttons. |

### Pagination

A macOS-styled pager.

`pagination.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `page` | `number` | optional | Current page, 1-based. |
| `pageCount` | `number` | **required** | Total number of pages. At least 1. |
| `total` | `number` | optional | Total row count. When given, a "共 N 条" readout appears before the buttons; the pagination does not compute it, because it counts pages of whatever the caller listed. |
| `siblingCount` | `number` | optional | Pages shown on each side of the current one. Default 1. |
| `showEnds` | `boolean` | optional | Show first/last page buttons flanking the arrows. Default false. |
| `disabled` | `boolean` | optional | Disable the whole control. |
| `onChange` | `(page: number) => void` | optional | Fires with the requested page; never fires with the current page. |

| Member | Returns | Description |
| --- | --- | --- |
| `currentPage` | `number` | The current page, 1-based. |
| `pages` | `number` | Total pages. |
| `setPage(page: number, report = false)` | `void` | Move to a page. A silent write: `report` is only true for a user activation, which is the same rule every other control in the kit follows. |
| `setPageCount(pageCount: number)` | `void` | Replace the page count; the current page is clamped into the new range. |
| `setTotal(total: number \| undefined)` | `void` | Update the "共 N 条" readout, or pass `undefined` to hide it. |
| `setDisabled(disabled: boolean)` | `void` | Disable every button at once. |

### Progress

A progress bar with a determinate and an indeterminate face.

`progress.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `number` | optional | Progress from 0 to 100. Ignored while `indeterminate` is set. |
| `indeterminate` | `boolean` | optional | Show the barber-pole used when the duration is unknown. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The percentage currently shown, 0–100. |
| `setValue(value: number)` | `void` | Set the percentage; values outside 0–100 are folded into the range. |
| `setIndeterminate(indeterminate: boolean)` | `void` | Switch between the determinate bar and the barber-pole. |

### ProgressRing

A circular progress indicator.

`progressring.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `number` | optional | Progress from 0 to 100. Ignored while `indeterminate` is set. |
| `size` | `ProgressRingSize` | optional | — |
| `thickness` | `number` | optional | Stroke width in CSS pixels. Defaults per size: 2, 3, 4. |
| `indeterminate` | `boolean` | optional | Spin a partial arc instead of showing a percentage. |
| `showValue` | `boolean` | optional | Print the percentage in the middle. Ignored for `s` and indeterminate. |
| `label` | `string` | optional | Replacement for the percentage readout, e.g. "3/12". |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The percentage currently shown, 0–100. |
| `spinning` | `boolean` | True while the ring is spinning instead of reporting a percentage. |
| `setValue(value: number)` | `void` | Set the percentage; values outside 0–100 are folded into the range. |
| `setIndeterminate(indeterminate: boolean)` | `void` | Switch between a determinate arc and the spinner. |
| `setLabel(label: string)` | `void` | Replace the centre text (only drawn when the ring was built with one). |

Related types: `ProgressRingSize`

### RadioGroup

A radio group with macOS-shaped buttons.

`radiogroup.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `options` | `RadioOption[]` | **required** | — |
| `value` | `string` | optional | Initially selected value. Default: nothing selected. |
| `name` | `string` | optional | Group name. Generated when omitted — one is required, because the native arrow-key navigation only works between radios that share a name. |
| `orientation` | `"vertical" \| "horizontal"` | optional | `vertical` (default) stacks rows; `horizontal` lays them out in a row. |
| `disabled` | `boolean` | optional | Disable the whole group. |
| `onChange` | `(value: string) => void` | optional | Fires with the newly selected value; setters stay silent. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The selected value, or `""` when nothing is selected. |
| `setValue(value: string)` | `void` | Select an option; silent, and a no-op when the value is not in the list. |
| `setOptions(list: RadioOption[], value = this.value)` | `void` | Replace the option list, keeping the current selection when it survives. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable every radio in the group. |
| `focus()` | `void` | Move focus to the selected radio, or the first one when nothing is selected. |

### RangeSlider

A two-thumb range slider.

`rangeslider.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `min` | `number` | optional | Smallest value. Default 0. |
| `max` | `number` | optional | Largest value. Default 100. |
| `value` | `[number, number]` | optional | Initial pair, lower bound first; defaults to the whole range. |
| `step` | `number` | optional | Increment between stops. Default 1. |
| `disabled` | `boolean` | optional | Disable both thumbs. |
| `showValue` | `boolean` | optional | Print both bounds underneath the track. |
| `format` | `(value: number) => string` | optional | Render one bound for the read-out and for `aria-valuetext`. |
| `onChange` | `(value: [number, number]) => void` | optional | Fires on commit — pointer release, or each keyboard step. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `[number, number]` | The current pair, lower bound first, whatever the two inputs hold. |
| `min` | `number` | Smallest selectable value. |
| `max` | `number` | Largest selectable value. |
| `setValue(value: [number, number])` | `void` | Replace the pair; it is ordered and clamped before it lands. Silent. |
| `setBounds(min: number, max: number)` | `void` | Replace the bounds; the current pair is folded into the new range. Silent. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable both thumbs, using the native attribute. |

### Rating

A star rating, the way macOS shows one in a review row or a detail pane.

`rating.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `number` | optional | Current rating, 0..`max`. Fractions are allowed and are drawn honestly — a stored average of 3.4 renders three stars and two fifths of a fourth. |
| `max` | `number` | optional | Number of stars. Default 5. |
| `allowHalf` | `boolean` | optional | Let the pointer pick halves. The keyboard still moves in whole stars. |
| `readOnly` | `boolean` | optional | Display only: no tab stop, no gestures. |
| `disabled` | `boolean` | optional | — |
| `size` | `RatingSize` | optional | Star size presets. |
| `label` | `string` | optional | Accessible name. Default "评分". |
| `onChange` | `(value: number) => void` | optional | Fires only for a change the user made; every setter stays silent. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The committed rating. A pointer resting on the stars does not change it. |
| `setValue(value: number)` | `void` | Set the rating programmatically. Silent, and folded into `0..max`. |
| `setMax(max: number)` | `void` | Change the number of stars. Silent; the value is clamped to the new top. |
| `setReadOnly(readOnly: boolean)` | `void` | Switch between display-only and interactive. Silent. |
| `setDisabled(disabled: boolean)` | `void` | Block or restore every gesture. Silent. |

Related types: `RatingSize`

### SearchField

A macOS search field.

`searchfield.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `placeholder` | `string` | optional | Placeholder; defaults to "搜索". |
| `value` | `string` | optional | Initial text. |
| `shape` | `"pill" \| "rounded"` | optional | `pill` (default) is the rounded Finder/Safari shape, `rounded` matches a text field. |
| `size` | `"s" \| "m"` | optional | `s` matches a toolbar, `m` (default) matches a form row. |
| `disabled` | `boolean` | optional | — |
| `debounce` | `number` | optional | Idle time before `onChange` fires, in ms. Default 200. `0` reports on every keystroke instead. |
| `onInput` | `(value: string) => void` | optional | Fires on every keystroke, before the debounce. |
| `onChange` | `(value: string) => void` | optional | Fires once typing pauses, on Enter, or on clear. |
| `onSearch` | `(value: string) => void` | optional | Fires when Enter is pressed, with the current value. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The current query. |
| `setValue(value: string)` | `void` | Replace the query without raising callbacks, as a DOM write would not. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the field, using the native attribute. |
| `setPlaceholder(placeholder: string)` | `void` | Replace the placeholder and the accessible name in one step. |
| `focus()` | `void` | Move keyboard focus into the field. |
| `select()` | `void` | Select the query, the way ⌘A does inside a search field. |
| `flush()` | `void` | Fire any pending `onChange` now. |

### SegmentedControl

A macOS segmented control.

`segmented.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `options` | `SegmentedOption[]` | **required** | — |
| `value` | `string` | optional | Initially selected value. Defaults to the first enabled option. |
| `block` | `boolean` | optional | Stretch to the container's width. |
| `onChange` | `(value: string) => void` | optional | — |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The selected value. |
| `setValue(value: string)` | `void` | Change the selection programmatically. |
| `setDisabled(disabled: boolean)` | `void` | Disable every segment. |

### Select

A macOS pop-up button.

`select.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `options` | `SelectOption[]` | **required** | — |
| `value` | `string` | optional | Initially selected value. Defaults to the first enabled option. |
| `disabled` | `boolean` | optional | — |
| `block` | `boolean` | optional | Stretch to the container's width. |
| `ariaLabel` | `string` | optional | Accessible name, since the control has no visible label. |
| `onChange` | `(value: string) => void` | optional | — |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The selected value. |
| `setOptions(options: SelectOption[], value?: string)` | `void` | Replace the option list. |
| `setValue(value: string)` | `void` | Change the selection programmatically. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the control. |

### Skeleton

A loading placeholder: the grey bars that hold a region's shape while its real content is on the way.

`skeleton.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `variant` | `SkeletonVariant` | optional | Shape of the placeholder. Default "text". |
| `width` | `string \| number` | optional | Number, treated as px, or any CSS length. Default: fills the parent. |
| `height` | `string \| number` | optional | Number, treated as px, or any CSS length. Default: the variant's own. |
| `lines` | `number` | optional | Line count for the "text" variant. Default 1. |
| `animated` | `boolean` | optional | Sweep the highlight. Default true; the animation also honours reduced motion. |

| Member | Returns | Description |
| --- | --- | --- |
| `variant` | `SkeletonVariant` |  |
| `lines` | `number` |  |
| `animated` | `boolean` |  |
| `setVariant(variant: SkeletonVariant)` | `void` | Switch shape. Silent. A shape change also changes the bar count — "text" is a stack, the other two are one block — so the bars are rebuilt rather than restyled. |
| `setLines(count: number)` | `void` | Set the number of text lines. No effect on the single-shape variants. |
| `setSize(width?: string \| number, height?: string \| number)` | `void` | Set the footprint. Silent. Each dimension is independent: a number is px, a string passes through, and `undefined` clears the inline value so the stylesheet's default applies again. Only a dimension the caller actually passed is written — an unconditional `width`/`height` would make the variant classes dead, and a circle would stop being square. |
| `setAnimated(animated: boolean)` | `void` | Start or stop the shimmer. Reduced motion still wins over `true`. |

Related types: `SkeletonVariant`

### Slider

A horizontal slider on a native `<input type="range">`.

`slider.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `Child` | optional | Label rendered above the track; it is wired to the input through `for`/`id`. |
| `min` | `number` | optional | Smallest value. Default 0. |
| `max` | `number` | optional | Largest value. Default 100. |
| `step` | `number` | optional | Increment between stops. Default 1. |
| `value` | `number` | optional | Initial value; defaults to `min`. |
| `showValue` | `boolean` | optional | Show the current value at the trailing edge. |
| `onChange` | `(value: number) => void` | optional | Fires on every move with the new number. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The current value, clamped to the configured range. |
| `setValue(value: number)` | `void` | Replace the value; out-of-range input is clamped rather than committed as-is. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the slider, using the native attribute. |

### Spinner

An indeterminate activity indicator.

`spinner.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `string` | optional | Optional caption beside the ring. |
| `size` | `SpinnerSize` | optional | — |
| `ariaLabel` | `string` | optional | Accessible name. Defaults to the label, then to a generic busy message. |

| Member | Returns | Description |
| --- | --- | --- |
| `setLabel(label: string)` | `void` | Replace the visible caption. |

Related types: `SpinnerSize`

### SplitButton

A macOS split button: a primary action fused to a menu of alternatives.

`splitbutton.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `string` | **required** | Visible label on the action half. |
| `items` | `MenuItem[]` | **required** | Menu rows offered by the chevron half. |
| `variant` | `SplitButtonVariant` | optional | — |
| `size` | `SplitButtonSize` | optional | — |
| `icon` | `string` | optional | Leading SVG path data, drawn before the label. |
| `disabled` | `boolean` | optional | — |
| `onAction` | `() => void` | optional | Fires when the action half is clicked (or activated by Enter/Space). |
| `onSelect` | `(value: string) => void` | optional | Fires with the value of the chosen menu row. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the menu is currently open. |
| `label` | `string` | The label shown on the action half. |
| `setLabel(label: string)` | `void` | Replace the action half's label. |
| `setItems(items: MenuItem[])` | `void` | Replace the menu rows. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the control. Disabling closes an open menu. |
| `focus()` | `void` | Move keyboard focus to the action half. |
| `destroy()` | `void` |  |

Related types: `SplitButtonVariant`, `SplitButtonSize`

### SplitView

A draggable two-pane split view.

`splitview.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `orientation` | `SplitViewOrientation` | **required** | `horizontal` puts the panes left/right, `vertical` stacks them. |
| `primary` | `Node` | optional | Content of the leading pane (left or top). |
| `secondary` | `Node` | optional | Content of the trailing pane (right or bottom); it takes the remainder. |
| `primarySize` | `number \| string` | optional | Initial primary size: pixels as a number, or any CSS length e.g. "40%". |
| `minPrimary` | `number` | optional | Smallest allowed primary size in pixels. Default 0. |
| `minSecondary` | `number` | optional | Smallest allowed secondary size in pixels. Default 0. |
| `onResize` | `(size: number) => void` | optional | Fires while dragging and on keyboard resize, with the new size in pixels. |

| Member | Returns | Description |
| --- | --- | --- |
| `setPrimarySize(size: number \| string)` | `void` | Set the primary pane's size: a pixel number or any CSS length ("40%"). A number is clamped like a drag would be, so the panes never violate the declared minimums. Silent — the caller already knows, and a programmatic resize is not a user gesture. |

Related types: `SplitViewOrientation`

### Stepper

A macOS stepper: two chevron segments that walk a value up and down.

`stepper.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `number` | optional | Initial value; folded into `min`/`max`. Default 0 (or `min`, if higher). |
| `min` | `number` | optional | Smallest value. Default 0. |
| `max` | `number` | optional | Largest value. Default 100. |
| `step` | `number` | optional | Increment per click and per arrow key. Default 1. |
| `wrapping` | `boolean` | optional | Wrap from a bound to the other one instead of stopping. Default false. |
| `disabled` | `boolean` | optional | — |
| `ariaLabel` | `string` | optional | Accessible name. Without one a spinbutton is announced unlabelled. |
| `onChange` | `(value: number) => void` | optional | Fires only for a user-driven change; every setter stays silent. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `number` | The current value. |
| `isDisabled` | `boolean` | True while the control is disabled. |
| `setValue(value: number)` | `void` | Replace the value; out-of-range input is folded into the bounds. Silent. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable both segments, using the native attribute. |
| `setRange(min: number, max: number)` | `void` | Replace the bounds; a reversed pair is normalised and the current value is re-folded into the new range. Silent. |

### Switch

A macOS switch on a native `<button role="switch">`.

`switch.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `checked` | `boolean` | optional | Initial on/off state. Default off. |
| `disabled` | `boolean` | optional | — |
| `label` | `string` | optional | Accessible name, exposed as `aria-label`. A switch is drawn as a bare track, so the label cannot sit inside the control itself. |
| `onChange` | `(checked: boolean) => void` | optional | Fires with the new state after a user toggle; setters stay silent. |

| Member | Returns | Description |
| --- | --- | --- |
| `checked` | `boolean` | The current state. |
| `setChecked(checked: boolean)` | `void` | Set the state; a write that changes nothing is skipped, and `onChange` stays silent. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the switch, using the native attribute. |
| `focus()` | `void` | Move keyboard focus onto the switch. |

### TabBar

The iOS tab bar: one row of glyph-over-caption buttons pinned to the bottom of the screen.

`tabbar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `items` | `TabBarItem[]` | **required** | — |
| `value` | `string` | optional | Initially selected item. Defaults to the first one. |
| `ariaLabel` | `string` | optional | Accessible name for the list. Default "标签栏". |
| `onChange` | `(value: string) => void` | optional | Fires with the value of the tab the user picked. Silent on `setValue`. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The selected item's value. |
| `setValue(value: string)` | `void` | Select an item by value without reporting it. Unknown values are ignored. |
| `setBadge(value: string, badge: string)` | `void` | Set or clear an item's badge; an empty string removes it. |

### Table

A macOS data table.

`table.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `columns` | `TableColumn[]` | **required** | — |
| `rows` | `any[]` | **required** | — |
| `rowKey` | `(row: any, index: number) => string` | optional | Stable identity per row, used by selection and by the `is-selected` class. Defaults to a primitive `row.id` when present, otherwise the row index — so pass one if rows are reordered or paginated. |
| `selectable` | `boolean` | optional | Render a leading checkbox column with select-all in the header. |
| `selectedKeys` | `string[]` | optional | Keys selected on first paint; only meaningful with `selectable`. |
| `onSelectionChange` | `(keys: string[]) => void` | optional | Fires after a user-driven selection change, with the new key list. |
| `filter` | `(row: any, index: number) => boolean` | optional | Hide rows that do not pass the test. Filtering is a view concern, so the callback sees the row and its index in the array you passed to `rows` — never an index into the filtered result, which would change as the reader types. |
| `sort` | `TableSort \| null` | optional | Sort applied on first paint. |
| `onSortChange` | `(sort: TableSort \| null) => void` | optional | Fires when the reader clicks a sortable header. |
| `emptyText` | `string` | optional | Text shown in place of rows when `rows` is empty. |
| `filterEmptyText` | `string` | optional | Text shown when rows exist but the filter rejects all of them. |
| `resizable` | `boolean` | optional | Let the reader drag a column edge to change its width. The layout is frozen on the first paint when this is on: every column gets the width it happened to have, and from then on the widths are the reader's, not the content's. That is what a resizable table is — a column that kept re-fitting itself to its widest cell would undo the drag as soon as one long value arrived. Action columns are not resizable: they size to their buttons by design. |
| `onColumnResize` | `(key: string, width: number) => void` | optional | Fires with the column key and its new width once a drag or a key press ends. |

| Member | Returns | Description |
| --- | --- | --- |
| `selectedKeys` | `string[]` | Keys of the selected rows, in the order they were selected. |
| `visibleRows` | `any[]` | Rows after filtering and sorting, in the order the body shows them. |
| `sort` | `TableSort \| null` | The active sort, or null when the table shows the order the data arrived in. |
| `filter` | `((row: any, index: number) => boolean) \| null` | The active row test, or null when every row shows. |
| `setRows(rows: any[])` | `void` | Replace the row data. Existing selection is kept for keys that still exist and dropped for keys that do not; like every setter in the kit, this does not raise `onSelectionChange`. |
| `clearSelection()` | `void` | Drop the selection without raising `onSelectionChange`. |
| `setSort(sort: TableSort \| null)` | `void` | Sort by a column key. Silent, like every setter in the kit. Pass `null` to restore the source order. The key does not have to belong to a `sortable` column: the button is the affordance, not a restriction. |

Related types: `TableAlign`, `TableSortDirection`

### TagInput

A macOS token field: chips plus a bare input inside one bordered box.

`taginput.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `string[]` | optional | Initial tags. |
| `placeholder` | `string` | optional | Placeholder shown while the field is empty. |
| `max` | `number` | optional | Upper bound on the number of tags; unlimited when omitted. |
| `allowDuplicates` | `boolean` | optional | Allow the same text twice. Defaults to false. |
| `label` | `string` | optional | Label rendered above the control, wired to the input through `for`/`id`. |
| `disabled` | `boolean` | optional | — |
| `onChange` | `(value: string[]) => void` | optional | Fires after a commit or a removal, with a copy of the tag list. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string[]` | The current tags, as a copy. |
| `setValue(tags: string[])` | `void` | Replace every tag; silent, like every setter in the kit. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the field and every chip's remove button. |
| `setPlaceholder(text: string)` | `void` | Replace the placeholder text. |
| `focus()` | `void` | Move keyboard focus into the field. |

### TextArea

A multi-line text field.

`textarea.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `Child` | optional | Label rendered above the field. |
| `placeholder` | `string` | optional | — |
| `value` | `string` | optional | Initial text. |
| `rows` | `number` | optional | Visible rows; drives the initial height. |
| `maxLength` | `number` | optional | Hard limit; shows a counter when set. |
| `disabled` | `boolean` | optional | — |
| `readOnly` | `boolean` | optional | — |
| `onInput` | `(value: string) => void` | optional | — |
| `onChange` | `(value: string) => void` | optional | — |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The current text. |
| `setValue(value: string)` | `void` | Replace the text. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the editor. |
| `focus()` | `void` | Move keyboard focus into the editor. |

### TextField

A single-line text field on a native `<input type="text">`.

`textfield.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `label` | `Child` | optional | Label rendered above the field; it is wired to the input through `for`/`id`. |
| `placeholder` | `string` | optional | Placeholder shown while the field is empty. |
| `icon` | `string` | optional | Leading SVG path data, drawn at the control's icon size. |
| `clearable` | `boolean` | optional | Show a clear button at the trailing edge once the field holds text. |
| `type` | `"text" \| "password"` | optional | `password` masks the value and adds a reveal toggle at the trailing edge, the way a macOS secure field does. Defaults to `text`. |
| `disabled` | `boolean` | optional | — |
| `readOnly` | `boolean` | optional | — |
| `value` | `string` | optional | Initial value. |
| `ariaLabel` | `string` | optional | Accessible name for a field that has no visible `label`. A placeholder is not a name: it disappears the moment the user types, so a screen reader left relying on it loses the field's purpose mid-sentence. `SearchField` already names itself from its placeholder; this closes the same gap for the plain text field. |
| `onInput` | `(value: string) => void` | optional | Fires on every keystroke with the current value. |
| `onChange` | `(value: string) => void` | optional | Fires when the value is committed: blur, Enter, or the clear button. Typing alone only raises `onInput`. |

| Member | Returns | Description |
| --- | --- | --- |
| `isRevealed` | `boolean` | Whether a password field is currently showing its value in plain text. |
| `value` | `string` | The current value. |
| `setRevealed(revealed: boolean)` | `void` | Show or mask a password field. No-op on a text field: there is nothing to reveal, and silently changing a normal input's type would be a surprise. |
| `setValue(value: string)` | `void` | Replace the value; does not raise the callbacks, as a DOM write would not. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the input, using the native attribute. |
| `focus()` | `void` | Move keyboard focus into the input. |

### TimePicker

A macOS time picker wrapping a native `<input type="time">`.

`timepicker.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `value` | `string` | optional | Initial time as `HH:MM`, or `HH:MM:SS` when `step` is under a minute. |
| `min` | `string` | optional | Earliest selectable time, inclusive, same format as `value`. |
| `max` | `string` | optional | Latest selectable time, inclusive, same format as `value`. |
| `step` | `number` | optional | Granularity in seconds: 60 shows hours and minutes, 1 shows seconds too, and 900 offers quarter-hours. Default 60. |
| `disabled` | `boolean` | optional | — |
| `label` | `string` | optional | Optional label rendered above the control and linked through `for`/`id`. |
| `onChange` | `(value: string) => void` | optional | Fires with the committed time once the user leaves the field or picks one. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The current time as `HH:MM` (or `HH:MM:SS`), or "" when empty. |
| `setValue(value: string)` | `void` | Set the time; an empty string clears it. Silent, like every setter. |
| `setDisabled(disabled: boolean)` | `void` | Enable or disable the field, using the native attribute. |
| `focus()` | `void` | Move keyboard focus into the field. |

### TreeView

An outline view: a tree of rows, collapsible, single selection.

`treeview.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `nodes` | `TreeNode[]` | **required** | — |
| `value` | `string` | optional | Initially selected value. |
| `expanded` | `string[]` | optional | Values of the parents to open. Overrides every node's own `expanded` flag, so a caller can open one subtree without rewriting the data it passed. |
| `indent` | `number` | optional | Pixels of indentation per level. Default 16. |
| `ariaLabel` | `string` | optional | — |
| `onSelect` | `(value: string) => void` | optional | Fires when the user selects a node; setters stay silent. |
| `onToggle` | `(value: string, expanded: boolean) => void` | optional | Fires only from a user gesture, never from `setExpanded`. |

| Member | Returns | Description |
| --- | --- | --- |
| `value` | `string` | The selected value, or "" when nothing is selected. |
| `expanded` | `string[]` | Values of the parents that are open, in document order. |
| `setNodes(nodes: TreeNode[])` | `void` | Replace the tree. The selection and the expanded set survive for values that still exist and are dropped for values that do not — keeping a stale value would make it reappear the moment `setNodes` brings the node back. Silent. |
| `setValue(value: string)` | `void` | Select a value programmatically. Silent, and a value that is not in the tree is ignored rather than reported as a selection with no row. |
| `setExpanded(values: string[])` | `void` | Open exactly the given parents. Silent, then repaint. |
| `focus()` | `void` | Move focus onto the tree's tab stop. |

## Layout (6)

### Sidebar

A macOS source list.

`sidebar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `selected` | `string` | optional | Initially selected item id. |
| `onSelect` | `(id: string) => void` | optional | Fires when the selection changes. |

| Member | Returns | Description |
| --- | --- | --- |
| `selected` | `string \| null` | The currently selected item id. |
| `collapsed` | `boolean` | True when the sidebar is collapsed. |
| `setSelected(id: string, notify = false)` | `void` | Select an item by id and optionally notify the caller. |
| `setCollapsed(collapsed: boolean)` | `void` | Collapse or expand the sidebar. |

### StatusBar

The thin bar along the bottom of the window.

`statusbar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `text` | `string` | optional | Leading status text. |
| `state` | `StatusDotState` | optional | Colour of the leading dot. |
| `trailing` | `string` | optional | Trailing text, typically a clock. |

| Member | Returns | Description |
| --- | --- | --- |
| `setText(text: string)` | `void` | Update the leading text. |
| `setState(state: StatusDotState)` | `void` | Update the dot colour. |
| `setTrailing(text: string)` | `void` | Update the trailing text. |

Related types: `StatusDotState`

### TabView

A macOS tab view.

`tabview.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `tabs` | `TabItem[]` | **required** | — |
| `selected` | `string` | optional | Initially selected tab. Defaults to the first enabled tab. |
| `onSelect` | `(id: string) => void` | optional | Fires when the user changes the tab (not on programmatic `select`). |
| `ariaLabel` | `string` | optional | Accessible name for the tab list. |
| `closable` | `boolean` | optional | Show a close affordance on every tab. The view removes the tab itself and selects its neighbour, because the strip owns the order: a caller that had to re-render would be re-creating the very element the click came from. |
| `onClose` | `(id: string) => void` | optional | Fires after a tab is closed, with the id that is gone. |

| Member | Returns | Description |
| --- | --- | --- |
| `selected` | `string` | The selected tab id, or an empty string when no tab is selectable. |
| `addPanel(id: string, node: Node)` | `void` | Attach content to a tab. Replacing the panel's children keeps repeated calls idempotent instead of stacking content. An unknown id is ignored: the panel set is fixed when the view is constructed, so a typo must not create an orphan panel that no tab can ever reveal. |
| `setSelected(id: string)` | `void` | Select a tab programmatically. Does not fire `onSelect`. |
| `closeTab(id: string)` | `boolean` | Close a tab: remove its button and panel, then select what is left. The neighbour that takes over is the one to the right, falling back to the one to the left — the order the strip reads in. Closing the last tab leaves the view with no selection at all rather than an empty panel that pretends to be one. Silent except for `onClose`, so a caller can close a tab from its own code without being told about it. Returns false for an unknown or non-closable id. |
| `destroy()` | `void` |  |

### TitleBar

The window's title bar.

`titlebar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | optional | Centred window title. |
| `trafficLights` | `boolean` | optional | Show the macOS traffic lights at the leading edge. Default true. |
| `onClose` | `TrafficLightsOptions["onClose"]` | optional | Callbacks forwarded to the traffic lights. |
| `onMinimise` | `TrafficLightsOptions["onMinimise"]` | optional | — |
| `onZoom` | `TrafficLightsOptions["onZoom"]` | optional | — |
| `trailing` | `Child[]` | optional | Nodes placed at the trailing edge (search field, toolbar buttons). |
| `leading` | `Child[]` | optional | Nodes placed between the lights and the title (rarely needed). |
| `onDoubleClick` | `() => void` | optional | Double-clicking the empty part of the title bar zooms the window. Wails only wires this up on macOS: its runtime checks `IsMac()` before sending `wails:drag:doubleclick` (see internal/runtime/.../drag.ts), so on Windows and Linux the gesture reaches the page as an ordinary dblclick and does nothing. The kit handles it itself so the behaviour is the same everywhere. |

| Member | Returns | Description |
| --- | --- | --- |
| `trafficLights` | `TrafficLights \| null` | The traffic lights, or null when they were disabled. |
| `setTitle(title: string)` | `void` | Update the centred title. |
| `addTrailing(node: HTMLElement)` | `void` | Add a node to the trailing toolbar cluster. |
| `destroy()` | `void` |  |

### Toolbar

A macOS window toolbar.

`toolbar.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `leading` | `Child[]` | optional | Cluster pinned to the left edge. |
| `center` | `Child[]` | optional | Cluster centred in the bar. |
| `trailing` | `Child[]` | optional | Cluster pinned to the right edge. |
| `position` | `"top" \| "bottom"` | optional | Which window edge the bar sits against; drives the separator side. |
| `bordered` | `boolean` | optional | Draw the hairline separator. Defaults to true. |
| `ariaLabel` | `string` | optional | Accessible name for the bar, e.g. "编辑器工具栏". |

| Member | Returns | Description |
| --- | --- | --- |
| `bordered` | `boolean` | True when the separator is drawn. |
| `slots` | `` | The three slot elements, for callers that mount their own children. |
| `addTrailing(node: Child)` | `void` | Append a control to the right-hand cluster. |
| `addLeading(node: Child)` | `void` | Append a control to the left-hand cluster. |
| `addCenter(node: Child)` | `void` | Append a control to the centred cluster. |
| `setBordered(bordered: boolean)` | `void` | Show or hide the separator without rebuilding the bar. |

### TrafficLights

The three macOS window buttons.

`traffic-lights.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `onClose` | `() => void` | optional | Red light: close the window. |
| `onMinimise` | `() => void` | optional | Yellow light: minimise the window. |
| `onZoom` | `(event: MouseEvent) => void` | optional | Green light: zoom (or fullscreen while Alt is held). |

| Member | Returns | Description |
| --- | --- | --- |
| `setZoomed(zoomed: boolean)` | `void` | Reflect whether the window is zoomed (swaps the green glyph and title). |
| `setFocused(focused: boolean)` | `void` | Dim the lights when the window is not the active window. |

## Overlays (8)

### Alert

A modal macOS alert with a promise API.

`alert.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | **required** | — |
| `message` | `Child` | optional | Body text, or any node for rich content. |
| `icon` | `AlertIcon \| false` | optional | Glyph beside the title. `false` hides it. Defaults to `info`. |
| `buttons` | `AlertButton[]` | optional | Buttons, leading-to-trailing. Default: a single primary "好". |
| `suppressLabel` | `string` | optional | Add a tick row at the bottom of the body ("不再提示"). The promise still resolves with the button value; read `isSuppressed` on the instance, or use the `onClose` callback which receives both. |
| `onClose` | `(value: string, suppressed: boolean) => void` | optional | Fires once with the chosen value and the tick state. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the alert is on screen. |
| `isSuppressed` | `boolean` | Whether the "do not show again" row is ticked. Always `false` when absent. |
| `open()` | `Promise<string>` | Show the alert; the promise resolves with the chosen button value. |
| `close(value?: string)` | `void` | Close without a choice, resolving with the cancel value. |
| `destroy()` | `void` |  |

Related types: `AlertIcon`

### ContextMenu

A macOS context menu: right-click, Control-click, or the keyboard menu key.

`contextmenu.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `items` | `MenuItem[] \| ((event: MouseEvent \| null) => MenuItem[])` | **required** | Items for the menu. A function is called at every opening with the event that requested it, which is how a per-row menu gets its row. |
| `onSelect` | `(value: string, event: MouseEvent \| null) => void` | optional | Fires with the chosen value. |
| `onClose` | `() => void` | optional | Fires once the menu has closed. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the menu is on screen. |
| `attachTo(target: HTMLElement)` | `this` | Bind the context-menu gesture on an element. Covers the mouse path (`contextmenu`, which also fires for Control-click) and the keyboard path (the menu key and Shift+F10). Returns `this` so the call can be chained. |
| `openAt(x: number, y: number, event: MouseEvent \| null = null)` | `void` | Open at viewport coordinates. `event` is forwarded to a dynamic `items`. |
| `close()` | `void` | Close the menu if it is open. |
| `destroy()` | `void` |  |

### Dialog

A modal macOS alert.

`dialog.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | **required** | — |
| `body` | `Child` | optional | Body content: a string, or any node for rich content. |
| `confirmLabel` | `string` | optional | — |
| `cancelLabel` | `string` | optional | — |
| `onConfirm` | `() => void` | optional | Fires when the user confirms. |
| `onCancel` | `() => void` | optional | Fires when the user cancels, presses Escape or clicks the scrim. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the dialog is on screen. |
| `open()` | `void` | Show the dialog modally. |
| `close()` | `void` | Hide the dialog and restore focus. |
| `confirm()` | `void` | Confirm and close. |
| `cancel()` | `void` | Cancel and close. |
| `destroy()` | `void` |  |

### Menu

A macOS pop-up menu.

`menu.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `items` | `MenuItem[]` | **required** | — |
| `placement` | `Placement` | optional | — |
| `onSelect` | `(value: string) => void` | optional | Fires with the chosen value. |
| `onClose` | `() => void` | optional | Fires after the menu has closed, whatever closed it. The one-shot helpers use this to release the instance: a menu registers document-level listeners for outside clicks and Escape, and a per-click menu that is never destroyed would pile one pair up per opening. |
| `offset` | `number` | optional | Gap between the anchor and the panel, in px. Defaults to 6, which suits a menu hanging off a button; a context menu passes 0 so its corner sits on the pointer. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the menu is currently open. |
| `open(anchor: HTMLElement)` | `void` | Open the menu anchored to an element. |
| `close()` | `void` | Close the menu and restore focus to whatever opened it. |
| `destroy()` | `void` |  |

### Popover

A macOS popover: arbitrary content attached to an anchor element.

`popover.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `content` | `Node \| string` | **required** | Arbitrary content: a string becomes text, a node is adopted as-is. |
| `placement` | `Placement` | optional | Preferred side; flips automatically when there is no room. |
| `offset` | `number` | optional | Gap between the anchor and the panel, in px. |
| `arrow` | `boolean` | optional | Draw a pointer aimed at the anchor. |
| `ariaLabel` | `string` | optional | Accessible name for the dialog; a popover has no title of its own. |
| `onClose` | `() => void` | optional | Fires whenever the popover closes, whatever closed it. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the popover is currently on screen. |
| `open(anchor: HTMLElement)` | `void` | Show the popover next to an anchor. Re-opening with a new anchor moves it. |
| `close()` | `void` | Hide the popover and hand focus back to the anchor. |
| `destroy()` | `void` |  |

### Sheet

A macOS sheet: a modal attached to the window's top edge that slides down.

`sheet.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | **required** | Sheet heading, also the accessible name of the dialog. |
| `body` | `Child` | optional | Body content: a string, or any node for rich content. |
| `confirmLabel` | `string` | optional | — |
| `cancelLabel` | `string` | optional | — |
| `onConfirm` | `() => void` | optional | Fires when the user confirms. |
| `onCancel` | `() => void` | optional | Fires when the user cancels, presses Escape or clicks the scrim. |

| Member | Returns | Description |
| --- | --- | --- |
| `isOpen` | `boolean` | Whether the sheet is on screen. |
| `content` | `HTMLElement` | The body element, for callers that fill it after construction. |
| `open()` | `void` | Slide the sheet in. Idempotent. |
| `close()` | `void` | Slide the sheet out and restore focus. Idempotent. |
| `confirm()` | `void` | Confirm and close. |
| `cancel()` | `void` | Cancel and close. |
| `destroy()` | `void` |  |

### Toast

A macOS-style toast.

`toast.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `message` | `Child` | optional | Body. A string renders as text; a node is adopted as-is, so a toast can carry a link, a code snippet or a small list. |
| `detail` | `Child` | optional | Secondary line under the message. Same rules. |
| `duration` | `number` | optional | Auto-dismiss delay in ms; 0 keeps it until dismissed. |
| `variant` | `ToastVariant` | optional | — |
| `action` | `ToastAction` | optional | A button rendered with the message, e.g. undo or open. |

| Member | Returns | Description |
| --- | --- | --- |
| `show(message?: Child, detail?: Child)` | `void` | Show the toast, replacing its content. Mounts itself into the shared stack. |
| `setDuration(duration: number)` | `void` | Update the auto-dismiss delay for subsequent shows. |
| `setAction(action: ToastAction \| null)` | `void` | Set or replace the action button. Pass `null` to remove it. |
| `hide()` | `void` | Dismiss immediately. |
| `destroy()` | `void` |  |

Related types: `ToastVariant`

### Tooltip

A macOS tooltip.

`tooltip.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `content` | `string` | **required** | — |
| `placement` | `Placement` | optional | — |
| `delay` | `number` | optional | Delay before showing, in ms. macOS uses a noticeable pause. |

| Member | Returns | Description |
| --- | --- | --- |
| `attachTo(trigger: HTMLElement)` | `void` | Bind the tooltip to an element. A tooltip serves one trigger at a time. |
| `detach()` | `void` | Unbind from the current trigger and remove the tooltip. |
| `open()` | `void` | Show the bubble next to the trigger. |
| `close()` | `void` | Hide the bubble. |
| `destroy()` | `void` |  |

## Mobile (1)

### MobileShell

The mobile counterpart of the desktop shell.

`shell.ts`

| Option | Type | | Description |
| --- | --- | --- | --- |
| `title` | `string` | **required** | Large navigation title shown above the content. |
| `tabs` | `MobileTab[]` | optional | Tab bar entries. Empty hides the bar (a single-pane screen). |
| `selected` | `string` | optional | Initially visible tab. |
| `onTabChange` | `(id: string) => void` | optional | Fired when the tab changes. |
| `action` | `HTMLElement` | optional | Optional trailing action on the navigation bar. |

| Member | Returns | Description |
| --- | --- | --- |
| `content` | `HTMLElement` | The region host panes are appended to. |
| `selected` | `string \| null` | The active tab id, or null when the shell has no tabs. |
| `setTitle(title: string)` | `void` | Update the large title. |
| `setSelected(id: string, notify = false)` | `void` | Switch the active tab. |


_59 components._
