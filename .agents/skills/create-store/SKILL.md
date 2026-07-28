---
name: create-store
description: 指导在前端项目中按团队规范使用 Pinia 创建和维护全局状态 store，包括目录结构、命名与持久化策略。当前端需要新增或重构状态管理时使用本技能。
---

# 创建与维护 Pinia Store

## 使用场景

当你需要：

- 为业务模块新增全局状态（如主题、用户信息、AI 编辑器状态）
- 重构原有的状态管理逻辑到统一的 `src/stores` 目录

请使用本技能，并同时遵守 `.agents/rules/03-项目结构.md`（目录结构约束）与 `.agents/rules/07-状态管理.md`。

---

## 目录与命名

- 所有 store 文件必须放在：`src/stores`
- 每个业务模块一个文件：`src/stores/<module>.ts`
- Store 使用函数名称：`useXxxStore`（PascalCase 中的 Xxx 与模块含义一致）

示例：

```ts
// 结构示意
// src/stores/theme.ts       -> useThemeStore
// src/stores/user.ts        -> useUserStore
// src/stores/ai-editor.ts   -> useAiEditorStore
```

---

## 步骤 1：创建基本 Store

```ts
// src/stores/theme.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ThemeMode } from '@/constants/theme'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>(ThemeMode.LIGHT)

  function setTheme(value: ThemeMode) {
    theme.value = value
  }

  function toggleTheme() {
    theme.value = theme.value === ThemeMode.LIGHT
      ? ThemeMode.DARK
      : ThemeMode.LIGHT
  }

  return { theme, setTheme, toggleTheme }
})
```

---

## 步骤 2：使用持久化（如需要）

当状态需要跨页面或刷新保留时，在 Pinia store 中显式与 `localStorage` 同步，不引入项目尚未安装的持久化插件：

```ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { ThemeMode } from '@/constants/theme'

const STORAGE_KEY = 'huayiyi-theme'

export const useThemeStore = defineStore('theme', () => {
  const storedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  const theme = ref<ThemeMode>(storedTheme ?? ThemeMode.LIGHT)

  watch(theme, (value) => {
    localStorage.setItem(STORAGE_KEY, value)
  })

  function setTheme(value: ThemeMode) {
    theme.value = value
  }

  return { theme, setTheme }
})
```

---

## 使用约定

- 状态逻辑必须集中在 `src/stores`，**禁止**在组件层直接用 `ref` / `reactive` 维护本应全局共享的业务状态。
- Store 中不要直接耦合具体 UI 组件，只存纯数据与业务行为。
- 页面/组件使用 `storeToRefs` 保留解构后状态的响应性：

```ts
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const { theme } = storeToRefs(themeStore)
const { toggleTheme } = themeStore
```

---

## 快速检查清单

- [ ] store 文件是否放在了 `src/stores` 根目录？
- [ ] 是否使用 `defineStore` 定义并导出 `useXxxStore`？
- [ ] 是否仅在确有跨刷新需求时持久化？
- [ ] 是否避免在 store 中写与 UI 绑定的逻辑？
- [ ] 组件解构 store 状态时是否使用了 `storeToRefs`？
