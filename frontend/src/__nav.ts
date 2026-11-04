import {Sidebar} from "./ui";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

window.addEventListener("load", async () => {
  const out: string[] = [];
  let selected = "";
  const sidebar = new Sidebar({
    groups: [{items: [
      {id: "overview", label: "概览"},
      {id: "showcase", label: "组件"},
      {id: "settings", label: "设置"},
    ]}],
    selected: "overview",
    onSelect: (id) => { selected = id; },
  });
  document.getElementById("app")!.appendChild(sidebar.element);

  const items = [...sidebar.element.querySelectorAll(".mac-sidebar__item")] as HTMLElement[];
  out.push(`侧边栏项数: ${items.length}`);
  out.push(`初始选中: ${(sidebar.element.querySelector(".is-selected") as HTMLElement)?.textContent?.trim()}`);

  // 点击「组件」
  const showcaseItem = items.find(i => (i.textContent ?? "").includes("组件"));
  out.push(`找到「组件」项: ${!!showcaseItem}`);
  showcaseItem?.click();
  await wait(150);
  out.push(`点击后 onSelect 收到: "${selected}"`);
  out.push(`点击后选中项: ${(sidebar.element.querySelector(".is-selected") as HTMLElement)?.textContent?.trim()}`);
  out.push(`selection getter: ${sidebar.selection}`);

  const pre = document.createElement("pre");
  pre.id = "result";
  pre.textContent = out.join("\n");
  document.body.appendChild(pre);
});
