# Component Guidelines

> How components are built in this project.

---

## Overview

本项目是一个 Vue 3 + Nuxt UI 4.10 + Pinia + vue-router 的管理台（console）。前端组件遵循「共享层沉淀 + 业务页套用」的两级结构：

- **共享层** 放在 `src/components/resource/` 下，沉淀所有列表页/表单页共用的能力（表、分页、筛选卡、单元格）。业务页只做「换组件 + 传 props」。
- **业务组件** 放在各路由目录（如 `src/routes/platform-resource/organization/groups/list/`），只放本页特有的结构，尺寸尽可能薄。

---

## Component Structure

一个组件文件 = `index.vue` + `index.module.css`（CSS Module），放同目录。命名用 `defineOptions({ name: 'PascalCase' })`，例如 `ResourceTable`、`FilterPanel`。

共享组件统一从 `src/components/index.ts` 或 `src/components/resource/index.ts` 导出；hooks 从 `src/hooks/index.ts` 导出。新增共享项必须同步更新对应 `index.ts`。

---

## Props Conventions

- props 用 `withDefaults(defineProps<{...}>(), {...})` 显式声明，必填项不给默认值，可选默认值要保证「缺省行为与现状一致」。
- 新能力一律用可选 prop 且**默认关闭**，避免破坏既有调用（如 `ResourceTable` 的 `activeId`/`@select` 被 memories、organization 三个列表使用）。
- 带反馈的变更用 `v-model` + 显式 `emit('update:xxx', ...)`；回调式 prop（如 `onPage`）只在过渡期保留一个阶段。
- 插槽透传要防重复：本组件已接管的插槽名（如 `ResourceTable` 的 `select-header`/`select-cell`/`tree-cell`/`loading`/`empty`）要排除在动态 `v-for` 透传之外，否则父组件同名插槽会与内置缺省渲染两份。

---

## List Page Skeleton（列表页三段式骨架）

列表页统一用「筛选卡 + 列表卡 + 分页」三段式骨架，整页不滚动、仅表格行区滚动。骨架约定（写进页面 CSS 注释）：

```
页面区 = 100vh - 顶栏，flex-col，gap 16px，padding 16px（整页不滚动）
├─ FilterPanel 筛选条件卡（可折叠，[恢复 ▾] 收起）
├─ ListCard 列表卡（标题 + description + total）
│  ├─ #toolbar：主按钮 + 依赖选中的批量按钮 + 更多下拉 + 刷新
│  ├─ ResourceTable：sticky 表头 + 行区滚动 + 操作列右侧固定
│  └─ #footer：ResourcePagination
└─ 外层 h-[calc(100vh-顶栏)] flex gap-5；主列 flex-1 min-w-0 flex flex-col gap-5；列表卡 min-h-0
```

CSS 要点：`--app-header-h: var(--topbar-height)`（本地作用域或 :root）；主列 `min-w-0`（否则表格撑宽页面）；列表卡 `min-h-0`（否则内部滚动失效）。

---

## ResourceTable 用法与禁忌

- 操作列 id 必须为 `actions`，且依赖 `pinActions`（缺省 true）右侧固定，横向滚动时始终可见。
- 图标按钮一律配 `UTooltip`（用 `ActionIconButton` 组件，`label` 必填作为 aria-label；禁用时 tooltip 显示 `disabledReason`）。
- 同一行 ≥4 个操作时收到 `更多` 下拉（`UDropdownMenu`），不要全部平铺。
- 状态按后果二选一：后果轻（可逆转）用 `USwitch`，先确认再切换；后果重（停用/删除）用 `UBadge`，走表单提交。
- 树形列表（如 departments）**不分页**，用 `expand/collapse` 代替；传 `treeChildrenKey` 后首列自动缩进 16px + 展开箭头。
- `loading` 且无数据时渲染 `#loading` 骨架屏（缺省 columns×5 行 USkeleton）；`loading && data.length>0` 不遮挡旧数据。
- 空态分型：`emptyMode="never"` →「还没有 {resourceName}」；`emptyMode="filtered"` →「没有匹配的结果」+ 清除筛选按钮（emit `clear-filters`）。

---

## Accessibility

- 图标按钮必须有 `aria-label`（内容不能只依赖图标）。
- 折叠/展开按钮带 `aria-expanded`；勾选行用 `UCheckbox` 的 `:aria-label`。
- 表单校验失败必须聚焦首错字段（`focusFirstError`），选中 `[aria-invalid="true"]`，`scrollIntoView({ block: 'center', behavior: 'smooth' })`。
- 删除/危险操作弹窗标题带对象名（如「删除群组「xx」？」）。

---

## Common Mistakes

1. 用模板字符串拼 Tailwind 任意类（如 `grid-cols-[repeat(${n},...)]`）：Tailwind JIT 只静态扫描源码，运行时拼接的类不生成样式。改用 CSS Module 静态 `grid-template-columns: repeat(var(--filter-cols,3),minmax(0,1fr))` + `:style` 绑变量。
2. 新能力不默认关闭导致既有调用被破坏。
3. 本组件接管的插槽名不排除在透传外，导致同名插槽渲染两份。
4. 定时器（`RelativeTime`、`highlightId`、`useSnapshotDirty`）不清理导致测试泄漏——必须在 `onBeforeUnmount`/`onScopeDispose` 清理。
