# macOS UI Kit — 设计文档

一套用 Vanilla TypeScript 写的 macOS 风格组件库，供 Wails 桌面应用使用。
本文记录**架构决策与取舍**，实现细节见各组件源码。

---

## 1. 为什么是 Vanilla（以及它的边界）

先说清楚什么时候它快、什么时候它慢，避免盲目乐观。

**Vanilla 的真实优势：**

| 维度 | 说明 |
|---|---|
| 启动 | 无框架运行时下载与解析，冷启动最快 |
| 内存 | 无 VDOM/响应式依赖追踪，堆占用最小 |
| 包体 | 现在整个应用 31 KB JS，引入 React 至少 +45 KB |

**Vanilla 的弱项（必须在设计上规避）：**

- **批量更新**：框架的 diff 能合并多次变更后一次性提交；手写 DOM 容易在循环里反复触发重排。
- **状态同步**：没有响应式系统，状态与视图容易漂移。
- **开发效率**：无组件复用机制时，重复代码多。

**结论**：本项目是「窗口壳 + 设置面板类轻交互」，没有虚拟滚动、没有千行实时表格，正好避开 Vanilla 的弱项。设计纪律比框架更重要 —— 见第 5 节。

---

## 2. 核心决策

### 2.1 不用 Web Components / Shadow DOM

考虑过自定义元素（`<mac-button>`），**否决**，理由是具体的：

1. **Shadow DOM 会破坏 Wails 的拖动区域检测。**
   Wails 运行时这样判断可拖动：
   ```js
   const target = eventTarget(event);            // 事件目标
   getComputedStyle(target).getPropertyValue("--wails-draggable")
   event.offsetX < target.clientWidth            // 还依赖 offsetX 相对目标
   ```
   Shadow DOM 会把 `event.target` **重定向**到宿主元素，`offsetX` 的参照系也随之改变。
   标题栏拖动依赖这套机制，一旦失效窗口就拖不动了 —— 这是不可接受的回归。

2. 自定义元素的核心价值是「在 HTML 里声明式使用」。但本项目的 UI 全部由 TS 构建，
   声明式没有收益，只剩属性/特性反射的样板代码。

3. 无 Shadow DOM 时，自定义元素本质上只是「持有宿主元素的类」——
   和直接用类没有区别，却多了生命周期与属性的复杂度。

**采用**：类 + **Light DOM**，BEM 风格 `mac-` 前缀避免类名冲突。

### 2.2 类继承的运行时成本可以忽略

TS 的 `class` 编译为原型链，每个实例只有「元素引用 + 清理函数数组」两个字段，
相比函数工厂几乎无差异。换来的是：

- 统一的 `destroy()` 生命周期，**自动清理事件监听**（Vanilla 最常见的泄漏源）
- 一致的 `element` / `mount()` / `remove()` 接口
- 继承复用样式状态逻辑

### 2.3 组件不认识 Wails

组件库**不 import 任何 Wails API**。

`TrafficLights` 只接受回调：
```ts
new TrafficLights({ onClose, onMinimise, onZoom })
```
由应用层（`main.ts`）接到 `WindowService`。

**理由**：组件库可以被纯浏览器测试、可以被别的壳复用；Wails 是集成点，不是组件的前提。

### 2.4 CSS 自定义属性作为唯一的主题通道

所有颜色/圆角/间距/动效读 `--mac-*` 变量，切换外观只改 `<html data-theme>`。

好处：主题切换零重渲染、零 JS、可被使用方覆盖（级联即可）。
这是 light DOM 方案的红利 —— Shadow DOM 里要另外处理变量穿透。

### 2.5 样式与组件同目录

```
controls/button.ts
controls/button.css     ← 由 button.ts 顶部 import
```

Vite 会把它们打进同一份产物 CSS。优点：删组件时不会留下孤儿样式，改样式时不必在 800 行的大文件里找。

---

## 3. 目录结构

```
src/ui/
├── tokens.css          设计令牌（颜色/间距/圆角/字号/动效）
├── dom.ts              元素构造、SVG、rAF 节流等工具
├── component.ts        组件基类（生命周期、监听器托管）
├── overlay.ts          浮层定位与背板（Menu/Tooltip/Dialog 的基础）
├── index.ts            统一导出（手写维护，避免并行冲突）
├── controls/           Button, IconButton, TextField, SearchField,
│                       Switch, Checkbox, RadioGroup, SegmentedControl, Select
├── layout/             TitleBar, TrafficLights, Sidebar, StatusBar, Card, Pane
└── overlays/           Menu, Tooltip, Dialog, Toast
```

---

## 4. 组件契约

每个组件遵循同一套形状，降低使用者的心智负担。

```ts
export interface XxxOptions {
  /* 全部可选，都有合理默认值 */
}

export class Xxx extends Component<HTMLElement> {
  constructor(options: XxxOptions = {});
  // 只暴露必要的 setter，每个 setter 只改「确实变了」的那部分 DOM
  setLabel(text: string): void;
  setDisabled(disabled: boolean): void;
}
```

**约定：**

| 项 | 规则 |
|---|---|
| 根类名 | `mac-<component>`，状态类名 `is-<state>` |
| 可访问性 | 语义化标签优先；自定义控件补 `role` / `aria-*` |
| 事件 | 交互回调走构造参数 `onXxx`；需要冒泡时补发原生 `CustomEvent` |
| 禁用 | 用 `disabled` 特性 + `aria-disabled`，不靠 CSS 隐藏 |
| 文本 | 一律 `textContent`，**禁止用 `innerHTML` 拼用户数据**（XSS） |

---

## 5. 性能纪律（写代码时的硬规则）

这些规则比「用不用框架」更能决定实际流畅度。

1. **列表用 `DocumentFragment` 一次性插入**，避免 N 次重排。
2. **列表交互用事件委托**：容器上一个监听器，靠 `closest()` 定位目标，
   而不是每个条目绑一次（1000 行 = 1000 个监听器）。
3. **读写分离**：避免「读 `offsetHeight` → 改样式 → 再读」交替导致的强制同步布局。
4. **滚动/resize 用 `rafThrottle`**（已提供），一帧最多执行一次。
5. **setter 幂等**：值没变就直接 return，跳过 DOM 写入。
6. **长列表裁剪**：日志类列表保留上限（现有实现是 60 条），防止无限增长。
7. **动画只碰 `transform` / `opacity`**，不碰触发重排的属性。

---

## 6. 可访问性契约

macOS 应用对键盘用户同样可用，组件必须跟上：

| 组件 | 要求 |
|---|---|
| Button / IconButton | 原生 `<button>`，`aria-label` 必须有值 |
| Switch / Checkbox | `role="switch"` / `role="checkbox"`、`aria-checked`、Space 切换 |
| RadioGroup / Segmented | `role="radiogroup"`，方向键切换，roving tabindex |
| Menu | `role="menu"`，方向键移动、Home/End、Esc 关闭、焦点返回触发者 |
| Dialog | `role="dialog"` `aria-modal`，焦点陷阱、Esc 关闭、关闭后焦点归位 |
| Tooltip | `role="tooltip"` + `aria-describedby`，不只靠 hover（也要 focus 触发） |

**焦点可见性**：统一用 `:focus-visible`，鼠标点击不显示焦点环，键盘导航才显示。

**动画**：尊重 `prefers-reduced-motion`（tokens.css 已把时长归零）。

---

## 7. 外观

- **暗色/亮色**：跟随系统，通过 `data-theme` 切换。
- 采用 Apple 的深色系统色（`#0a84ff` 蓝、`#32d74b` 绿等），而非自定义配色。
- 间距遵循 **4pt 网格**；圆角用 Apple 桌面的三档：5 / 7 / 10 px。
- 窗口圆角 12px，与 AppKit 无边框窗口一致。

---

## 8. 与应用的边界

组件库提供「画出来的东西」，应用提供「真实行为」：

```
main.ts
  ├─ 创建 TrafficLights({ onClose: () => WindowService.Close().catch(...) })
  ├─ 订阅 window:state 事件 → 更新 TitleBar/TrafficLights 状态
  └─ 组装 Sidebar + Pane 切换
```

组件不知道「关闭窗口」意味着什么，只负责在红点上触发回调。

---

## 9. 范围

**本期实现（20 个组件）**

- 控件：Button、IconButton、TextField、SearchField、Switch、Checkbox、
  RadioGroup、SegmentedControl、Select
- 浮层：Menu、Tooltip、Dialog、Toast（基于 overlay.ts）
- 布局：TitleBar、TrafficLights、Sidebar、StatusBar、Card、Pane

**明确不做**（避免范围失控）

- 虚拟滚动列表
- 拖拽排序
- 富文本编辑
- 日期选择器、颜色选择器
- 主题编辑器（只做暗/亮两套内置主题）

---

## 10. 已知取舍

| 取舍 | 代价 | 理由 |
|---|---|---|
| 不用 Shadow DOM | 全局类名污染风险 | 换 Wails 拖动可用；靠 `mac-` 前缀隔离 |
| 不用框架 | 应用层状态需手工同步 | 场景简单；换来零运行时 |
| 每组件独立 CSS | 多个小文件 | 可维护性 > 文件数 |
| 手写 index.ts 导出 | 新增组件要手动登记 | 避免并行开发时的写冲突 |
