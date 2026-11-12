# @leef-l/macos-ui-kit

macOS 风格的 UI 组件，纯 TypeScript，零运行时依赖。没有 React，没有 Vue，没有
虚拟 DOM —— 只用 `document.createElement` 包装加两层设计 token，一次 import
就得到整套设计系统。

**在线预览：<https://leef-l.github.io/macos-ui-kit/>**

**English** | 简体中文

- **30 个组件** —— 17 个控件、6 个布局、6 个浮层、1 个移动端外壳
- **零运行时依赖**
- **只用 Light DOM** —— 没有 Shadow DOM，原生窗口拖拽和读屏软件都能正常工作
- **运行时主题** —— 四套内置主题，外加自定义 token 覆盖
- **密度缩放** —— 一个 `--mac-scale` 因子就能调整整个界面

## 范围：只做前端

这个包**只有 UI 组件**。没有后端、没有服务端、没有数据层、没有构建期代码生成。

- **不依赖 Go，不依赖 Wails 运行时。** `package.json` 里没有 `dependencies`
  也没有 `peerDependencies`；打包产物没有任何 import。`src/` 里没有一处读取
  `_wails` 全局对象、IPC 桥或原生 API。
- **不依赖框架。** 只用 DOM API。能跑在任何浏览器、Electron 或 Tauri 的
  webview、Wails 窗口，或者一个从磁盘打开的普通 HTML 文件里。
- **不发网络请求。** 组件从不 fetch 任何东西，你传什么就渲染什么。

Wails v3 是**适配目标**，不是前提条件：拖拽区域和移动端外壳是为无边框桌面窗口
调校的，那也是它最好看的地方。在普通浏览器里，这些行为静默失效而不是报错。

凡是涉及宿主行为的地方，都只用标准 Web API：

| 行为 | 实现方式 | 桌面壳之外 |
|---|---|---|
| 窗口拖拽 | 标题栏上的 `--wails-draggable` CSS 自定义属性 | 被忽略，没有窗口可拖 |
| 双击缩放 | 监听 `dblclick` | 什么都不做 |
| 移动端探测 | `matchMedia("(pointer: coarse)")` + 宽度查询 | 到处都能用 |
| 侧边栏 / 浮层 | 纯 DOM + CSS | 到处都能用 |

本仓库里的 Go 应用是另一回事：它只是一个恰好用到这些组件的演示宿主。你不需要它，
这个包里也没有任何东西从它 import。

---

## 安装

### 从 npm（推荐）

```sh
npm install @leef-l/macos-ui-kit
```

零配置、不需要 token。这是最省事的方式。

### 直接从 GitHub Release（不经过任何 registry）

```sh
npm install https://github.com/leef-l/macos-ui-kit/releases/download/v0.1.2/leef-l-macos-ui-kit-0.1.2.tgz
```

同样的文件、同样的类型、同样的导出。适合锁定精确构建，或者无法访问 registry 时。

### 从 GitHub Packages

也发布到那里了，但 **GitHub Packages 即使是公开包也要求 token**，所以它不是
npm 的等价替代。把 scope 指向 GitHub 的 registry，并提供带 `read:packages`
的个人访问令牌：

```ini
# .npmrc
@leef-l:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
npm install @leef-l/macos-ui-kit
```

### 从克隆的仓库

```sh
git clone https://github.com/leef-l/macos-ui-kit
cd macos-ui-kit/packages/macos-ui-kit
npm install
npm run build

# 在你的项目里
npm install /absolute/path/to/packages/macos-ui-kit
```

### 完全不用构建工具

从 release 下载 `dist/macos-ui-kit.iife.js` 和 `dist/macos-ui-kit.css`
（或者构建后直接取 `packages/macos-ui-kit/dist/` 里的文件），使用全局变量
`MacUI`：

```html
<link rel="stylesheet" href="./macos-ui-kit.css" />
<script src="./macos-ui-kit.iife.js"></script>
<script>
    const button = new MacUI.Button({label: "你好", variant: "primary"});
    document.body.appendChild(button.element);
</script>
```

IIFE 版本需要把 `assets/` 目录放在样式表旁边，因为样式表用相对路径引用
Inter 字体。

---

## 使用

```ts
import {Button, TextField, showToast} from "@leef-l/macos-ui-kit";
// 样式表是独立的：JS 产物里不含 CSS。
import "@leef-l/macos-ui-kit/style.css";

const field = new TextField({placeholder: "你的名字"});
document.body.appendChild(field.element);

const button = new Button({
    label: "问候",
    variant: "primary",
    onClick: () => showToast(`你好 ${field.value}`),
});
document.body.appendChild(button.element);
```

每个组件都暴露 `element`，那就是你要挂载的节点。构造它、append `element`、
保留实例以便调用方法。

### 整体引入还是单个组件

同一个 import，只取你要的：

```ts
// 想要全部
import * as ui from "@leef-l/macos-ui-kit";

// 只要一个
import {Button} from "@leef-l/macos-ui-kit";
```

只有一个入口，ESM 产物可 tree-shake：只要打包器尊重包里的 `sideEffects` 字段
（Vite、Rollup、webpack、esbuild 都会），没用到的组件会被删掉。

**如实说明：** JavaScript 会被 tree-shake，**样式表不会**。CSS 是单个 63 KB
文件，包含每个组件的规则。对桌面窗口来说，按组件拆 CSS 换来的额外请求不划算；
但如果你在慢网络上发行、且只用了三个组件，要知道你仍然下载了三十个组件的规则。

### 主题

```ts
import {themeManager, setDensity} from "@leef-l/macos-ui-kit";

themeManager.apply("macos-dark");   // macos-dark | macos-light | hc-dark | hc-light
setDensity("compact");              // compact | comfortable | touch
```

或者在你自己的样式表里覆盖 token —— 组件只读语义层 token，改一处就能换掉全局：

```css
:root {
    --mac-accent: #7c5cff;
    --mac-radius-m: 10px;
}
```

---

## API 约定

三条规则，贯穿全部 30 个组件，让你没用过的控件也符合直觉：

| 关注点 | 规则 | 示例 |
|---|---|---|
| **读状态** | 属性 getter | `field.value`、`toggle.checked`、`sheet.isOpen` |
| **写状态** | `setX()`，一律静默 | `setValue()`、`setChecked()`、`setSelected()` |
| **可关闭浮层** | `open(anchor?)` / `close()` / `isOpen` | `dialog.open()`、`popover.open(btn)` |

`setX()` 永远不触发变更回调 —— 只有用户交互才触发。这样从渲染路径里调用是安全的。

`Toast` 是唯一例外：它是通知，不是浮层，所以用 `show()` / `hide()`。

---

## 组件

| 分组 | 组件 |
|---|---|
| 控件 | `Button` `TextField` `TextArea` `NumberField` `Slider` `Progress` `Spinner` `Badge` `Switch` `Checkbox` `SegmentedControl` `Select` `ComboBox` `DatePicker` `Disclosure` `Table` `SplitView` |
| 布局 | `TitleBar` `TrafficLights` `Sidebar` `StatusBar` `Toolbar` `TabView` |
| 浮层 | `Menu` `Tooltip` `Dialog` `Popover` `Sheet` `Toast` |
| 移动端 | `MobileShell` |

每个组件还暴露 `element`、`destroy()`（释放监听器与 observer）、以及适用时的
`focus()`。

---

## 产物

```
dist/index.js               ESM 产物              （打包器里 import）
dist/macos-ui-kit.iife.js   IIFE，全局 MacUI      （<script> 标签）
dist/macos-ui-kit.css       一份样式表
dist/index.d.ts             类型声明
dist/assets/                Inter 字体 + OFL 许可
```

## 字体

Apple 的 SF Pro 不能再分发，所以库里附带 **Inter**（SIL Open Font License 1.1，
位于 `dist/assets`）作为形近替代。字体栈在 macOS 上把真正的系统字体排在第一位，
所以 Apple 用户看到的是 SF Pro，其他平台看到的是几乎一致的字形。

样式表以 `./assets/Inter-Medium.ttf` 引用字体。如果你的打包器会移动 CSS 资源，
把 `dist/assets/` 复制到样式表旁边 —— 或者删掉 `@font-face` 块，用你自己的字体。

## 许可

MIT。捆绑的 Inter 字体：SIL Open Font License 1.1。
