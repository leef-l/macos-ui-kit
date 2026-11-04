import {buildShowcase} from "./showcase/showcase";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

window.addEventListener("load", async () => {
  const out: string[] = [];
  const root = buildShowcase();
  document.getElementById("app")!.appendChild(root);
  await wait(200);

  const before = [...root.querySelectorAll(".mac-showcase__state")].map(n => n.textContent?.trim() ?? "");
  out.push(`点击前 state 快照: ${JSON.stringify(before.slice(0, 4))}`);

  // 找到「主要」按钮并真实点击
  const primary = [...root.querySelectorAll("button")].find(b => (b.textContent ?? "").includes("主要")) as HTMLButtonElement | undefined;
  out.push(`找到主要按钮: ${!!primary}  text="${primary?.textContent?.trim()}"`);
  if (primary) {
    primary.click();
    primary.click();
    await wait(150);
    const after = [...root.querySelectorAll(".mac-showcase__state")].map(n => n.textContent?.trim() ?? "");
    out.push(`点击两次后: ${JSON.stringify(after.slice(0, 4))}`);
    out.push(`含「点击」的条目: ${after.filter(t => t.includes("点击")).join(" | ") || "无"}`);
  }

  // 验证 Switch 交互
  const sw = root.querySelector(".mac-switch") as HTMLElement;
  out.push(`switch aria-checked 前: ${sw?.getAttribute("aria-checked")}`);
  (sw as HTMLElement)?.click();
  await wait(150);
  out.push(`switch aria-checked 后: ${sw?.getAttribute("aria-checked")}`);

  const pre = document.createElement("pre");
  pre.id = "result";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
});
