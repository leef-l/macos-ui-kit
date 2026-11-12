# macOS UI Kit v2 — 主题与三端架构

本文记录 v2 的架构决策。v1（19 个组件、双层 token 未分离、尺寸硬编码）的问题在
第 1 节列清，第 2 节起是 v2 的设计。

---

## 1. v1 的实际问题（审计结果，非推测）

| 问题 | 实测数据 | 后果 |
|---|---|---|
| 硬编码颜色 | 4 处（`segmented.css` 阴影、`traffic-lights.css` 图标、`dialog.css` 遮罩） | 深色主题下红绿灯图标用 `rgba(0,0,0,.62)` 是错的，应随外观翻转 |
| 硬编码尺寸 | **82 处** `px` | 无法整体缩放；手机端要放大只能逐组件覆写 |
| 字体不可配 | `--mac-font` 是固定字符串 | 换字体需改源码 |
| 主题只有两套 | `data-theme="dark|light"` | 无法定义高对比度、品牌主题 |
| 组件仅 19 个 | macOS HIG 标准控件约 40+ | 覆盖不足 |

---

## 2. 双层 Token 架构

### 2.1 为什么必须分两层

如果所有视觉细节都直接给组件用（`--mac-bg-card: #333337`），那么：
- 定义高对比度主题要重写全部颜色 → 几十个值，容易漏
- 换品牌色要改所有语义色的来源

Apple 的解法是两层：

```
基础层（Base）    原始值，与外观无关
  --mac-gray-950: #1e1e20
  --mac-blue-dark: #0a84ff
  --mac-font-size-md: calc(13px * var(--mac-scale))

        ↓  被引用

语义层（Semantic）  按用途命名，随外观变化
  --mac-bg-window: var(--mac-gray-950)      （暗色）
  --mac-bg-window: var(--mac-gray-150)      （亮色）
  --mac-accent:    var(--mac-blue-dark)     （暗色）
  --mac-accent:    var(--mac-blue-light)    （亮色）

        ↓  被引用

组件             只读语义层
  .mac-button { background: var(--mac-accent); }
```

**关键约束：组件永远不直接引用基础层。** 这样换主题只需改语义层，
组件代码零改动。

### 2.2 数量控制

- 基础层约 60 个（调色板 + 字号 + 间距 + 圆角 + 动效 + 尺寸）
- 语义层约 45 个（表面 / 文字 / 边框 / 强调色 / 状态色 / 阴影 / 焦点）
- **使用方需要配的，只有语义层这 45 个** —— 这是可维护的边界

---

## 3. 密度与缩放

### 3.1 一个因子驱动全部可缩放尺寸

```css
:root {
  --mac-scale: 1;
  --mac-control-h: calc(28px * var(--mac-scale));
  --mac-font-size-md: calc(13px * var(--mac-scale));
  --mac-icon-md: calc(16px * var(--mac-scale));
}
```

**缩放什么、不缩放什么：**

| 缩放 | 不缩放 |
|---|---|
| 控件高度、字号、图标尺寸 | 边框（1px 是物理发丝线） |
| 内边距、外间距 | 阴影模糊半径 |
| 圆角 | 焦点环 offset |

### 3.2 密度预设

```css
:root[data-density="compact"]      { --mac-scale: 0.92; }
:root[data-density="comfortable"]  { --mac-scale: 1; }
:root[data-density="touch"]        { --mac-scale: 1.2; }

/* 触屏设备自动提升，但显式设置优先 */
@media (pointer: coarse) {
  :root:not([data-density]) { --mac-scale: 1.15; }
}
```

`:not([data-density])` 是关键：显式选择不被自动检测覆盖。

**手机端 44px 点击区自动满足**：28px × 1.2 = 33.6px，仍需组件内 `min-height`
兜底，见 §6.2。

---

## 4. 主题运行时

### 4.1 无闪烁原则

**默认深/浅色必须是纯 CSS**，不能靠 JS 注入 —— 否则首帧会闪。

因此分工：
- **CSS**：`[data-appearance="dark|light"]` 定义完整语义层
- **JS**：`ThemeManager` 只负责「在某个外观基础上追加覆盖」

```css
:root[data-appearance="dark"]  { --mac-bg-window: #1e1e20; ... }
:root[data-appearance="light"] { --mac-bg-window: #ececee; ... }
```

### 4.2 主题定义

```ts
interface ThemeDefinition {
  name: string;                        // data-theme 值，唯一
  appearance: "light" | "dark";        // 继承哪套基础语义层
  tokens?: Record<string, string>;     // 语义层覆盖，键名省略 --mac- 前缀
}
```

内置四套：

| 名称 | 外观 | 覆盖 |
|---|---|---|
| `macos-dark` | dark | 无（纯 CSS） |
| `macos-light` | light | 无（纯 CSS） |
| `macos-hc-dark` | dark | 高对比度：边框加粗、文字提亮 |
| `macos-hc-light` | light | 高对比度 |

### 4.3 应用机制

```ts
applyTheme(name):
  1. 清除上一次写入的内联属性
  2. 设置 html[data-appearance]  → 触发 CSS 基础语义层
  3. 设置 html[data-theme]       → 供 CSS 选择器定位
  4. 写入 tokens 覆盖为内联属性
```

内置的 `macos-dark` / `macos-light` 没有 tokens，第 4 步为空，所以**纯 CSS 生效，零 JS 依赖**。

### 4.4 自定义主题

使用方注册自己的主题，只需给语义层覆盖：

```ts
themeManager.register({
  name: "brand",
  appearance: "dark",
  tokens: {
    "accent": "#ff6b35",
    "accent-soft": "rgba(255,107,53,.22)",
    "bg-selected": "#ff6b35",
  },
});
themeManager.apply("brand");
```

只写 3 个值就得到一个品牌主题 —— 这是双层架构的收益。

---

## 5. 字体与 macOS 一致性

### 5.1 无法做到的部分（必须诚实说明）

macOS 用 **SF Pro**，是 Apple 私有字体，**授权禁止随应用分发**。
Windows/Linux 上不可能拿到真正的 SF Pro。

### 5.2 能做到的最好方案

| 平台 | 实际使用的字体 | 说明 |
|---|---|---|
| macOS / iOS | `-apple-system` → **真 SF Pro** | 系统自带，100% 一致 |
| Windows / Linux | **Inter** | 专为 UI 设计，字形与度量最接近 SF 的开源字体，SIL OFL 可分发 |

字体栈：
```css
--mac-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                   "Inter Fallback", "Segoe UI", ...;
```

### 5.3 缩小差异的手段

1. **Inter 的 SF 近似特性开关**：`font-feature-settings: "cv05", "cv08", "cv11"`
   （圆角 l、带尾 l、单层 a —— 更接近 SF）
2. **光学字距**：SF Pro 在大字号收紧字距，用 `--mac-tracking-*` 按字号分级
3. **行高统一**：所有字号配套 `--mac-leading-*`，不依赖字体默认行高
4. **灰度抗锯齿**：`-webkit-font-smoothing: antialiased`（两端统一，避免 macOS 更细）

### 5.4 字体的可配置性

字体是 **token**，可以被主题覆盖：

```ts
tokens: { "font-family": '"MyBrand Sans", sans-serif' }
```

---

## 6. 三端兼容

### 6.1 策略

| 平台 | 目标 |
|---|---|
| macOS 桌面 | 像素级对齐 HIG |
| Windows 桌面 | 结构/颜色一致，字体用 Inter 近似（§5） |
| Linux 桌面 | 同 Windows |
| iOS / Android | **可用性优先**：44px 点击区、安全区、无 hover 依赖 |

### 6.2 手机端硬性要求

| 要求 | 实现 |
|---|---|
| 点击区 ≥44px | `@media (pointer: coarse)` 给交互控件加 `min-height: 44px` |
| 输入框 ≥16px | 否则 iOS 聚焦时自动缩放页面 |
| 安全区 | `env(safe-area-inset-*)` |
| 无 hover | `@media (hover: none)` 改 `:active` 反馈 |
| 滚动惯性 | `-webkit-overflow-scrolling: touch` |

### 6.3 明确不承诺

手机端**不追求**像素级对齐 iOS HIG。原因是两套人机规范本身不同
（桌面 28px 控件 vs 触屏 44pt），强行统一会牺牲可用性。

---

## 7. 可扩展性设计

「可扩展」在不同组件上是不同东西，逐个定义：

| 组件 | 扩展点 |
|---|---|
| `Table` | `columns[].render(cell, row)` 自定义单元格；`rowKey(row)`；行选择回调 |
| `Toolbar` | 任意 `Child[]` 作为插槽，不预设内容 |
| `TabView` | 每个 tab 接受任意 `Node` 作为面板 |
| `SplitView` | 面板内容任意，`min/max` 尺寸约束可配 |
| `Popover` | 内容任意 Node + 自定义 anchor |
| `ComboBox` | `renderOption` 自定义选项渲染 |
| 全部 | `class` 追加（合并不覆盖）、`data-*` 透传 |

**统一原则**：内容用 `Node | string` 注入，不用模板字符串；扩展点用回调，不用继承。

---

## 8. 组件范围（v2 = 30 个，已达成）

**控件 controls（17）**

| 组件 | 说明 |
|---|---|
| `Button` | 按钮，5 变体 × 3 尺寸 |
| `TextField` | 单行输入，图标/清除 |
| `TextArea` | 多行输入，字数计数 |
| `NumberField` | 数字输入 + 步进器 |
| `Slider` | 滑块，带数值 |
| `Progress` | 进度条，含不确定态 |
| `Spinner` | 环形加载指示器 |
| `Badge` | 语义标签 |
| `Switch` | 拨动开关 |
| `Checkbox` | 复选框，含半选 |
| `SegmentedControl` | 分段控件，滑动指示条 |
| `Select` | 下拉选择（原生 select 包装） |
| `ComboBox` | 输入 + 建议下拉 |
| `DatePicker` | 日期选择（原生 date 包装） |
| `Disclosure` | 可折叠区块 |
| `Table` | 数据表格，列渲染回调 + 行选择 |
| `SplitView` | 可拖拽分栏，键盘可调 |

**布局 layout（6）**

| 组件 | 说明 |
|---|---|
| `TitleBar` | 标题栏，拖动 + 双击缩放 |
| `TrafficLights` | 红绿灯三按钮 |
| `Sidebar` | 侧边栏源列表 |
| `StatusBar` | 底部状态栏 |
| `Toolbar` | 工具条容器 |
| `TabView` | 选项卡面板 |

**浮层 overlays（6）**

| 组件 | 说明 |
|---|---|
| `Menu` | 弹出菜单，键盘导航 |
| `Tooltip` | 悬浮提示，hover + focus |
| `Dialog` | 模态对话框，焦点陷阱 |
| `Popover` | 锚定浮层，任意内容 |
| `Sheet` | 从顶部滑下的附着模态 |
| `Toast` | 轻提示，自动堆叠 |

**移动端 mobile（1）**

| 组件 | 说明 |
|---|---|
| `MobileShell` | 手机外壳，安全区 + 底部标签栏 |

**基础设施**：`Component` 基类、`dom` 工具、`overlay` 定位/焦点、`theme` 主题管理、
`tokens.css` 双层令牌、`fonts.css` 字体统一、`scrollbars.css` 滚动条统一。

**验证**：30/30 组件在真实无头 Chrome 中成功实例化，零异常。

---

## 9. 迁移策略

v1 → v2 的兼容处理：

| 破坏性变更 | 处理 |
|---|---|
| `--mac-text` 改名 | 保留为 `--mac-text-primary` 的**别名**，旧代码继续工作 |
| `--mac-font` 改名 | 保留别名 |
| `--mac-text-large/title/body/small` 改名 | 保留别名 |
| 硬编码尺寸 token 化 | 不影响 API，纯内部改动 |
| `data-theme` 语义变化 | 增加 `data-appearance`，`data-theme` 退化为主题名 |

**不做全量重命名**，避免 19 个组件的无谓 churn。

---

## 10. 已知取舍

| 取舍 | 代价 | 为什么接受 |
|---|---|---|
| 不做运行时主题编辑器 UI | 用户需写 JSON | 编辑器是独立产品，不属于组件库 |
| 手机不追求像素级 | 手机观感不如桌面精细 | 人机规范本就不同 |
| 字体无法真正一致 | Windows 用 Inter 近似 | 授权限制，非技术选择 |
| 语义 token 只有 ~45 个 | 极端精细的调优做不到 | 超过这个数量没人会去配 |
| 保留旧 token 别名 | 存在冗余定义 | 避免破坏性变更 |
