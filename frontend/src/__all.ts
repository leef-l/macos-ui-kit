import {
  Badge, Button, Checkbox, ComboBox, DatePicker, Dialog, Disclosure,
  Menu, MobileShell, NumberField, Popover, Progress, SegmentedControl,
  Select, Sheet, Sidebar, Slider, Spinner, SplitView, StatusBar, Switch,
  TabView, Table, TextArea, TextField, TitleBar, Toast, Toolbar, Tooltip,
  TrafficLights,
} from "./ui";

const out: string[] = [];
function check(name: string, fn: () => HTMLElement) {
  try {
    const el = fn();
    if (!el || !el.className) { out.push(`FAIL ${name}: no root element`); return; }
    out.push(`OK   ${name.padEnd(17)} ${el.className.split(" ")[0]}`);
  } catch (e) {
    out.push(`FAIL ${name}: ${(e as Error).message}`);
  }
}

check("Badge", () => new Badge({text: "x"}).element);
check("Button", () => new Button({label: "x"}).element);
check("TextField", () => new TextField({placeholder: "x"}).element);
check("NumberField", () => new NumberField({value: 1}).element);
check("TextArea", () => new TextArea({placeholder: "x"}).element);
check("Slider", () => new Slider({value: 5}).element);
check("Progress", () => new Progress({value: 50}).element);
check("Spinner", () => new Spinner({label: "x"}).element);
check("Switch", () => new Switch({checked: true}).element);
check("Checkbox", () => new Checkbox({label: "x"}).element);
check("SegmentedControl", () => new SegmentedControl({options: [{label: "a", value: "a"}]}).element);
check("Select", () => new Select({options: [{label: "a", value: "a"}]}).element);
check("ComboBox", () => new ComboBox({options: [{label: "a", value: "a"}]}).element);
check("DatePicker", () => new DatePicker({value: "2026-01-01"}).element);
check("Disclosure", () => new Disclosure({title: "x"}).element);
check("Table", () => new Table({columns: [{key: "a", title: "A"}], rows: [{a: 1}]}).element);
check("SplitView", () => new SplitView({orientation: "horizontal"}).element);
check("TitleBar", () => new TitleBar({title: "x"}).element);
check("TrafficLights", () => new TrafficLights({}).element);
check("Sidebar", () => new Sidebar({groups: [{items: [{id: "a", label: "A"}]}]}).element);
check("StatusBar", () => new StatusBar({text: "x"}).element);
check("Toolbar", () => new Toolbar({}).element);
check("TabView", () => new TabView({tabs: [{id: "a", label: "A"}]}).element);
check("Menu", () => new Menu({items: [{label: "a", value: "a"}]}).element);
check("Tooltip", () => new Tooltip({content: "x"}).element);
check("Dialog", () => new Dialog({title: "x"}).element);
check("Popover", () => new Popover({content: "x"}).element);
check("Sheet", () => new Sheet({title: "x"}).element);
check("Toast", () => new Toast({message: "x"}).element);
check("MobileShell", () => new MobileShell({title: "x"}).element);

const okCount = out.filter(l => l.startsWith("OK")).length;
out.push("");
out.push(`TOTAL=${out.filter(l => l.startsWith("OK") || l.startsWith("FAIL")).length}  OK=${okCount}  FAIL=${out.length - okCount - 1}`);

const pre = document.createElement("pre");
pre.id = "result";
pre.textContent = out.join("\n");
document.body.appendChild(pre);
