import {
  Badge, Button, Checkbox, Dialog, Menu, MobileShell, NumberField, Progress,
  SegmentedControl, Select, Sidebar, Slider, StatusBar, Switch, TextField,
  TitleBar, Toast, Tooltip, TrafficLights,
} from "./ui";

const out: string[] = [];
function check(name: string, fn: () => HTMLElement) {
  try {
    const el = fn();
    if (!el || !el.className) { out.push(`FAIL ${name}: 无根元素`); return; }
    out.push(`OK   ${name.padEnd(18)} class="${el.className}"`);
  } catch (e) {
    out.push(`FAIL ${name}: ${(e as Error).message}`);
  }
}

check("Badge", () => new Badge({text: "x"}).element);
check("Button", () => new Button({label: "x"}).element);
check("Checkbox", () => new Checkbox({label: "x"}).element);
check("Dialog", () => new Dialog({title: "x"}).element);
check("Menu", () => new Menu({items: [{label: "a", value: "a"}]}).element);
check("MobileShell", () => new MobileShell({title: "x"}).element);
check("NumberField", () => new NumberField({value: 1}).element);
check("Progress", () => new Progress({value: 50}).element);
check("SegmentedControl", () => new SegmentedControl({options: [{label: "a", value: "a"}]}).element);
check("Select", () => new Select({options: [{label: "a", value: "a"}]}).element);
check("Sidebar", () => new Sidebar({groups: [{items: [{id: "a", label: "A"}]}]}).element);
check("Slider", () => new Slider({value: 5}).element);
check("StatusBar", () => new StatusBar({text: "x"}).element);
check("Switch", () => new Switch({checked: true}).element);
check("TextField", () => new TextField({placeholder: "x"}).element);
check("TitleBar", () => new TitleBar({title: "x"}).element);
check("Toast", () => new Toast({message: "x"}).element);
check("Tooltip", () => new Tooltip({content: "x"}).element);
check("TrafficLights", () => new TrafficLights({}).element);

const pre = document.createElement("pre");
pre.id = "smoke-result";
pre.textContent = out.join("\n");
document.body.appendChild(pre);
