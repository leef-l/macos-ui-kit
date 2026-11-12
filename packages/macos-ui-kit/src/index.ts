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
export type {TableOptions, TableColumn} from "./controls/table";

export {SplitView} from "./controls/splitview";
export type {SplitViewOptions} from "./controls/splitview";

export {ComboBox} from "./controls/combobox";
export type {ComboBoxOptions, ComboBoxOption} from "./controls/combobox";

export {DatePicker} from "./controls/datepicker";
export type {DatePickerOptions} from "./controls/datepicker";

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

// --- Mobile -------------------------------------------------------------------
export {MobileShell, looksLikeMobile} from "./mobile/shell";
export type {MobileShellOptions, MobileTab} from "./mobile/shell";
