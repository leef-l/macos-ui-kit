import {themeManager, setDensity, getDensity} from "./ui/theme";
import {Button, TextField, Switch} from "./ui";

function run() {
  const out: string[] = [];
  const cs = () => getComputedStyle(document.documentElement);
  const v = (n: string) => cs().getPropertyValue(n).trim();

  themeManager.apply("macos-dark");
  out.push(`dark   bg-window=${v("--mac-bg-window")}  accent=${v("--mac-accent")}  scale=${v("--mac-scale")}`);

  themeManager.apply("macos-light");
  out.push(`light  bg-window=${v("--mac-bg-window")}  accent=${v("--mac-accent")}  appearance=${document.documentElement.dataset.appearance}`);

  themeManager.apply("hc-dark");
  out.push(`hc     border=${v("--mac-border")}  appearance=${document.documentElement.dataset.appearance}`);

  themeManager.register({name:"brand", appearance:"dark", tokens:{accent:"#ff6b35","bg-window":"#101018"}});
  themeManager.apply("brand");
  out.push(`custom accent=${v("--mac-accent")}  bg-window=${v("--mac-bg-window")}`);

  themeManager.apply("macos-dark");
  out.push(`reset  accent=${v("--mac-accent")}  bg-window=${v("--mac-bg-window")}`);

  setDensity("compact");
  out.push(`compact scale=${v("--mac-scale")}  control-h=${v("--mac-control-height")}`);
  setDensity("touch");
  out.push(`touch   scale=${v("--mac-scale")}  control-h=${v("--mac-control-height")}`);
  setDensity("comfortable");
  out.push(`comfy   scale=${v("--mac-scale")}  density=${getDensity()}`);

  new Button({label:"x"}); new TextField({placeholder:"x"}); new Switch({checked:true});
  out.push(`components OK: ${themeManager.list().join(", ")}`);

  const pre = document.createElement("pre");
  pre.id = "result";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
}

// 等样式表全部加载后再测量
window.addEventListener("load", run, {once: true});
