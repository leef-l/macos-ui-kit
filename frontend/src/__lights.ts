import {TrafficLights, themeManager} from "./ui";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

window.addEventListener("load", async () => {
  const out: string[] = [];
  const lights = new TrafficLights({});
  document.body.appendChild(lights.element);
  const close = lights.element.querySelector(".mac-traffic-light--close") as HTMLElement;
  const bg = () => getComputedStyle(close).backgroundColor;

  for (const theme of ["macos-dark", "macos-light"]) {
    themeManager.apply(theme);
    lights.setFocused(true);
    await wait(300);                      // 等过渡完成
    const f = bg();
    lights.setFocused(false);
    await wait(300);                      // 等过渡完成
    const u = bg();
    out.push(`${theme.padEnd(11)} focused=${f}  unfocused=${u}  ${f !== u ? "VARIES OK" : "SAME (BUG)"}`);
  }

  const pre = document.createElement("pre");
  pre.id = "result";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
});
