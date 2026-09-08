# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

质量门禁三命令全绿才能算完成：`npm run build`（vue-tsc 类型检查 + vite build）、`npm run lint`（eslint . --max-warnings=0，零警告）、`npm test`（vitest run）。新增逻辑必须配单测；页面级交互用 `npm run dev` 目测。

---

## Forbidden Patterns

1. **禁止原生 `confirm()` / `alert()`**。一律用 `UModal` + `UToast`（删除用 `UModal` 确认，成功用 `toast.add`）。用 `grep -rnE "confirm\\(|alert\\(" src/` 校验无命中。
2. **禁止「点击只弹 toast 不执行」的假按钮**。按钮明确标注是演示/未接后端时，用 `UBadge` 标注数据源（如 `LIVE API` / 演示数据），实际点击必须走真实行为或明确禁用。
3. **禁止用假数据掩盖后端失败**。后端报错要让用户看到，不能用 mock/seed 兜底。
4. **禁止新增 `items-per-page="0"`**（真分页的禁用态）。只有确实不计数的场景才允许；列表页一律用真分页 `ResourcePagination`。
5. **请求必须带 generation 计数防竞态**（对齐 `stores/workspaces.ts`），快速连发时丢弃旧响应。
6. **表单校验失败必须聚焦首错字段**（`focusFirstError`），不能只把错误堆在底部清单。

---

## Required Patterns

- 列表页用「`FilterPanel` + `ListCard` + `ResourceTable` + `ResourcePagination`」三段式骨架，整页不滚动、仅表格行区滚动。
- 列表查询状态进 URL（`useListUrlState`），store 只存当前页 + total。
- 保存/删除闭环走 `useSaveFeedback`（afterSave 回列表带 highlight、afterDelete 回退）。
- 操作列 id 必须 `actions`；图标按钮配 `UTooltip`（用 `ActionIconButton`）；≥4 个操作收 `更多` 下拉。
- 状态按后果选 `USwitch`（轻）/ `UBadge`（重）；树形列表不分页用展开折叠。
- 新增共享项必须在 `src/components/index.ts` / `src/hooks/index.ts` 导出。
- CSS Module 命名与同目录 `index.module.css` 风格一致；新组件放 `src/components/resource/<name>/index.vue`。

---

## Testing Requirements

- hooks 与纯函数（分页计算、generation 防竞态、remove-total）必须有 vitest 单测，参照现有 `*.test.ts` 风格。
- 表格/勾选/树形等 DOM 行为在 Node 环境无 `@vue/test-utils` 时，退化为类型检查 + 浏览器目测（`npm run dev`）。**不要**用占位断言假装覆盖。
- 定时器（`RelativeTime`、`highlightId`、`useSnapshotDirty`）必须在组件卸载清理，避免测试泄漏。
- 新增逻辑不能回退既有单测（尤其 `src/hooks/use*Editor.test.ts`）；`src/stores/console.test.ts` 属 chat 工作台，本期内不触碰。

---

## Code Review Checklist

- [ ] `git diff --stat -- src/routes` 只含本阶段应改的业务页（p0 只改 groups/list）。
- [ ] `grep -rnE "confirm\\(|alert\\(" src/` 无命中。
- [ ] 无新增 `console.log`。
- [ ] 新能力默认关闭、向后兼容既有 `activeId`/`@select` 调用。
- [ ] 本组件接管的插槽名排除在动态透传外（防重复渲染）。
- [ ] 定时器在 `onBeforeUnmount`/`onScopeDispose` 清理。
- [ ] 列表查询状态走 `useListUrlState`，无组件直接 `useRoute` 读列表 query。
- [ ] `npm run build` / `npm run lint` / `npm test` 全绿。
