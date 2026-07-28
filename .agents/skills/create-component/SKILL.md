---
name: create-component
description: 指导在前端项目中按团队规范创建和拆分 Vue 3 组件，包括目录结构、文件命名、样式与主题变量使用。当前端需要新增或重构组件时使用本技能。
---

# 创建与拆分组件

## 使用场景

当你需要：

- 新增一个**可复用通用组件**
- 为某个页面新增**页面级组件**
- 拆分过大的页面/组件文件

请使用本技能，并同时遵守 `.agents/rules/03-项目结构.md` 与 `.agents/rules/04-组件规范.md`。

---

## 组件放在哪里？

详见 `.agents/rules/04-组件规范.md` 中的“组件放置决策树”。

- **通用组件**（跨页面复用）：`src/components/<component-name>/`
- **页面级组件**（只在单页使用）：`src/routes/<route>/components/`

命名约定：

- 目录名：`kebab-case`，例如 `error-boundary`
- Vue 组件名：`PascalCase`，例如 `ErrorBoundary`

---

## 标准目录结构

通用组件示例：

```text
src/components/shentu-button/
  ├─ index.vue
  └─ index.module.css
```

页面级组件示例：

```text
src/routes/home/components/header/
  ├─ index.vue
  └─ index.module.css
```

---

## 步骤 1：创建组件骨架

```vue
<!-- src/components/shentu-button/index.vue -->
<script setup lang="ts">
defineOptions({ name: 'ShentuButton' })

interface Props {
  disabled?: boolean
}

const { disabled = false } = defineProps<Props>()
const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    type="button"
    :class="$style.shentuButton"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style module src="./index.module.css"></style>
```

并在 `src/components/index.ts` 中集中导出：

```ts
// src/components/index.ts
export { default as ShentuButton } from './shentu-button/index.vue'
```

---

## 步骤 2：样式与主题变量

在 `index.module.css` 中：

```css
/* src/components/shentu-button/index.module.css */
.shentuButton {
  padding: 8px 16px;
  border: 0;
  border-radius: var(--ui-radius);
  cursor: pointer;
  background-color: var(--ui-primary);
  color: var(--ui-text-inverted);
}
```

**原则：**

- 保持 CSS Modules 模式：`index.module.css`
- 可结合 Tailwind CSS 4 工具类处理布局和常规样式
- 自定义颜色必须使用主题 CSS 变量：
  - Nuxt UI 变量：`var(--ui-primary)`、`var(--ui-text)` 等
  - 项目变量：`var(--bg-panel)`、`var(--radius-control)` 等
- 禁止在业务组件样式中直接硬编码主色。

**样式还原检查**：涉及 UI 还原的组件样式开发，请参考 `.agents/skills/create-proposal/SKILL.md` 中的“样式还原验证检查清单”及对应页面的 `docs/样式还原/<名称>-UI分析清单.md`。

---

## 步骤 3：组件职责与拆分

- 单个 `.vue` 文件建议不超过 **400 行**，超过时优先考虑拆分为子组件。
- 拆分时遵循：
  - **页面级组件**：只在一个路由使用 → 放在该路由的 `components/` 下。
  - **通用组件**：在多个路由使用 → 提取到 `src/components`。
- 一个组件应聚焦单一职责（一个明确的 UI 区块或交互单元）。

---

## 步骤 4：与 Nuxt UI 协同

通用交互控件应基于 Nuxt UI v4 进行二次封装：

```vue
<script setup lang="ts">
interface Props {
  loading?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  disabled: false,
})
</script>

<template>
  <UButton
    color="primary"
    :loading="props.loading"
    :disabled="props.disabled"
  >
    <slot />
  </UButton>
</template>
```

单根组件中，调用方传入的 `class` 会按 Vue attribute fallthrough 规则自动合并到 `UButton`，不需额外定义样式类名 Prop。

---

## 快速检查清单

- [ ] 组件目录是否放在了正确位置（通用 vs 页面级）？
- [ ] 是否使用了 `index.vue + index.module.css` 的结构？
- [ ] 是否通过 `src/components/index.ts` 集中导出通用组件？
- [ ] 样式是否使用 CSS Modules / Tailwind CSS 4，且颜色使用主题变量？
- [ ] 交互控件是否优先使用 Nuxt UI？
- [ ] 组件文件是否过大，是否需要拆分子组件？
