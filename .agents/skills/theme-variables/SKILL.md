---
name: theme-variables
description: 指导在前端项目中正确使用 Nuxt UI v4、Tailwind CSS 4 与自定义主题 CSS 变量，避免业务样式硬编码颜色并保证暗色/浅色主题切换一致性。当前端编写或修改样式时使用本技能。
---

# 主题 CSS 变量与样式规范

## 使用场景

当你在：

- 为组件/页面编写新的样式
- 修改已有样式以适配暗色/浅色主题
- 为 Nuxt UI 组件或 Tailwind CSS 工具类补充项目主题

请使用本技能，并同时遵守 `.agents/rules/04-组件规范.md` 与 `.agents/rules/09-样式规范.md`。

---

## 基本原则

- 业务样式必须使用 **CSS 变量**或 Nuxt UI 语义工具类表达主题相关的颜色与尺寸。
- 禁止在业务组件中硬编码主色、文本色、背景色等主题值。
- 颜色字面量只能集中出现在全局主题 token 定义中。

---

## Nuxt UI 语义主题变量

在 CSS 中直接使用：

```css
color: var(--ui-text);
background-color: var(--ui-bg-elevated);
border-color: var(--ui-border);
```

常用变量举例：

- 主色：`var(--ui-primary)`
- 默认文本：`var(--ui-text)`
- 强调文本：`var(--ui-text-highlighted)`
- 次要文本：`var(--ui-text-muted)`
- 容器背景：`var(--ui-bg-elevated)`
- 边框：`var(--ui-border)`

Tailwind CSS 4 中优先使用 `text-default`、`text-muted`、`bg-elevated`、`border-muted` 等 Nuxt UI 语义工具类，避免在业务组件中使用 `text-gray-*` 等原始色板类。

---

## 项目主题变量示例

项目已定义的常用 token 包括：

- `var(--bg-card)`
- `var(--text-primary)`
- `var(--border)`
- `var(--accent-agent)`
- `var(--radius-control)`
- `var(--font-ui)`

在组件样式中使用：

```css
.card {
  color: var(--text-primary);
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  font-family: var(--font-ui);
}
```

---

## Tailwind CSS 4 与 Nuxt UI 入口

全局样式入口必须加载 Tailwind CSS 与 Nuxt UI：

```css
@import "tailwindcss";
@import "@nuxt/ui";
```

需要新增品牌色时，在集中主题文件中通过 `@theme static` 定义完整色阶，再在 Nuxt UI 配置中映射到 `primary` / `secondary` 等语义色。

---

## 反例（不要这样写）

```css
.button {
  background-color: #1677ff;
  color: #ffffff;
}
```

---

## 快速检查清单

- [ ] 业务样式中的主题颜色是否来自 CSS 变量或 Nuxt UI 语义工具类？
- [ ] 是否优先使用 Nuxt UI 语义变量，其次使用项目自定义变量？
- [ ] 是否避免在组件/页面样式中写死颜色值？
- [ ] 新增主题 token 是否同时考虑了暗色与浅色状态？
