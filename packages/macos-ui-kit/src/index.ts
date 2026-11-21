/**
 * macOS UI Kit — public surface.
 *
 * The foundation stylesheets are imported here as a side effect, before any
 * component: every component stylesheet reads `--mac-*` custom properties, and a
 * variable that is never declared resolves to nothing, which silently strips an
 * entire design system down to unstyled boxes.
 *
 * Relying on the *app* to import tokens first would make the kit fragile — any
 * other entry point (a test page, a second window, a component demo) would get
 * broken styling. Importing them here means `import {...} from "./ui"` is always
 * sufficient.
 */

import "./tokens.css";
import "./base.css";
import "./fonts.css";
import "./scrollbars.css";
import "./touch.css";

export {Component} from "./component";
export {el, append, clear, svgIcon, rafThrottle, uid} from "./dom";
export type {Child, Attrs} from "./dom";
export {
    positionOverlay,
    trackOverlay,
    nextZIndex,
    focusableWithin,
    trapFocus,
} from "./overlay";
export type {Placement, PositionOptions} from "./overlay";

// --- Theme --------------------------------------------------------------------
export {ThemeManager, themeManager, setDensity, getDensity, BUILTIN_THEMES} from "./theme";
export type {ThemeDefinition, Appearance} from "./theme";

// --- Controls -----------------------------------------------------------------
export {Button} from "./controls/button";
export type {ButtonOptions, ButtonVariant, ButtonSize} from "./controls/button";

export {TextField} from "./controls/textfield";
export type {TextFieldOptions} from "./controls/textfield";

export {NumberField} from "./controls/numberfield";
export type {NumberFieldOptions} from "./controls/numberfield";

export {Slider} from "./controls/slider";
export type {SliderOptions} from "./controls/slider";

export {Progress} from "./controls/progress";
export type {ProgressOptions} from "./controls/progress";

export {Badge} from "./controls/badge";
export type {BadgeOptions, BadgeVariant} from "./controls/badge";

export {Switch} from "./controls/switch";
export type {SwitchOptions} from "./controls/switch";

export {Checkbox} from "./controls/checkbox";
export type {CheckboxOptions} from "./controls/checkbox";

export {SegmentedControl} from "./controls/segmented";
export type {SegmentedControlOptions, SegmentedOption} from "./controls/segmented";

export {Select} from "./controls/select";
export type {SelectOptions, SelectOption} from "./controls/select";

export {Spinner} from "./controls/spinner";
export type {SpinnerOptions, SpinnerSize} from "./controls/spinner";

export {TextArea} from "./controls/textarea";
export type {TextAreaOptions} from "./controls/textarea";

export {Disclosure} from "./controls/disclosure";
export type {DisclosureOptions} from "./controls/disclosure";

export {Form, FormRow} from "./controls/form";
export type {FormOptions, FormRowOptions} from "./controls/form";

export {Table} from "./controls/table";
export type {TableOptions, TableColumn, TableSort, TableSortDirection} from "./controls/table";

export {SplitView} from "./controls/splitview";
export type {SplitViewOptions} from "./controls/splitview";

export {ComboBox} from "./controls/combobox";
export type {ComboBoxOptions, ComboBoxOption} from "./controls/combobox";

export {DatePicker} from "./controls/datepicker";
export type {DatePickerOptions} from "./controls/datepicker";

export {RadioGroup} from "./controls/radiogroup";
export type {RadioGroupOptions, RadioOption} from "./controls/radiogroup";

export {SearchField} from "./controls/searchfield";
export type {SearchFieldOptions} from "./controls/searchfield";

export {Divider} from "./controls/divider";
export type {DividerOptions} from "./controls/divider";

export {Kbd, normalizeKey} from "./controls/kbd";
export type {KbdOptions} from "./controls/kbd";

export {Pagination, pageItems} from "./controls/pagination";
export type {PaginationOptions} from "./controls/pagination";

export {EmptyState} from "./controls/emptystate";
export type {EmptyStateOptions, EmptyStateAction} from "./controls/emptystate";

export {Avatar, initials, toneFor} from "./controls/avatar";
export type {AvatarOptions, AvatarSize, AvatarStatus} from "./controls/avatar";

export {Breadcrumb} from "./controls/breadcrumb";
export type {BreadcrumbOptions, BreadcrumbItem} from "./controls/breadcrumb";

export {ProgressRing} from "./controls/progressring";
export type {ProgressRingOptions, ProgressRingSize} from "./controls/progressring";
export {List} from "./controls/list";
export type {ListOptions, ListItem, ListSelection} from "./controls/list";
export {Stepper} from "./controls/stepper";
export type {StepperOptions} from "./controls/stepper";
export {SplitButton} from "./controls/splitbutton";
export type {SplitButtonOptions, SplitButtonVariant, SplitButtonSize} from "./controls/splitbutton";
export {TagInput} from "./controls/taginput";
export type {TagInputOptions} from "./controls/taginput";
export {RangeSlider} from "./controls/rangeslider";
export type {RangeSliderOptions} from "./controls/rangeslider";
export {Calendar} from "./controls/calendar";
export type {CalendarOptions} from "./controls/calendar";

export {TreeView} from "./controls/treeview";
export type {TreeViewOptions, TreeNode} from "./controls/treeview";

export {Skeleton} from "./controls/skeleton";
export type {SkeletonOptions, SkeletonVariant} from "./controls/skeleton";

export {CommandPalette} from "./controls/commandpalette";
export type {CommandPaletteOptions, CommandItem} from "./controls/commandpalette";

export {InlineNotice} from "./controls/inlinenotice";
export type {InlineNoticeOptions, NoticeTone} from "./controls/inlinenotice";

export {Rating} from "./controls/rating";
export type {RatingOptions, RatingSize} from "./controls/rating";

export {Card} from "./controls/card";
export type {CardOptions, CardVariant, CardPadding} from "./controls/card";

export {ColorWell} from "./controls/colorwell";
export type {ColorWellOptions, ColorWellSize} from "./controls/colorwell";

export {LevelIndicator} from "./controls/levelindicator";
export type {LevelIndicatorOptions, LevelTone} from "./controls/levelindicator";

export {TimePicker} from "./controls/timepicker";
export type {TimePickerOptions} from "./controls/timepicker";

export {TabBar} from "./controls/tabbar";
export type {TabBarOptions, TabBarItem} from "./controls/tabbar";

export {ActionSheet} from "./controls/actionsheet";
export type {ActionSheetOptions, ActionSheetAction, ActionSheetTone} from "./controls/actionsheet";

// --- Layout -------------------------------------------------------------------
export {TitleBar} from "./layout/titlebar";
export type {TitleBarOptions} from "./layout/titlebar";

export {TrafficLights} from "./layout/traffic-lights";
export type {TrafficLightsOptions} from "./layout/traffic-lights";

export {Sidebar} from "./layout/sidebar";
export type {SidebarOptions, SidebarItem} from "./layout/sidebar";

export {StatusBar} from "./layout/statusbar";
export type {StatusBarOptions, StatusDotState} from "./layout/statusbar";

export {Toolbar} from "./layout/toolbar";
export type {ToolbarOptions} from "./layout/toolbar";

export {TabView} from "./layout/tabview";
export type {TabViewOptions, TabItem} from "./layout/tabview";

// --- Overlays -----------------------------------------------------------------
export {Menu, showMenu} from "./overlays/menu";
export type {MenuOptions, MenuItem} from "./overlays/menu";

export {Tooltip} from "./overlays/tooltip";
export type {TooltipOptions} from "./overlays/tooltip";

export {Dialog} from "./overlays/dialog";
export type {DialogOptions} from "./overlays/dialog";

export {Popover} from "./overlays/popover";
export type {PopoverOptions} from "./overlays/popover";

export {Sheet} from "./overlays/sheet";
export type {SheetOptions} from "./overlays/sheet";

export {Toast, showToast} from "./overlays/toast";
export type {ToastOptions, ToastVariant} from "./overlays/toast";

export {Alert, showAlert} from "./overlays/alert";
export type {AlertOptions, AlertButton, AlertIcon} from "./overlays/alert";

export {ContextMenu, showContextMenu} from "./overlays/contextmenu";
export type {ContextMenuOptions} from "./overlays/contextmenu";

// --- Mobile -------------------------------------------------------------------
export {MobileShell, looksLikeMobile} from "./mobile/shell";
export type {MobileShellOptions, MobileTab} from "./mobile/shell";
