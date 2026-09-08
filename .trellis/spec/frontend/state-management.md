# State Management

> How state is managed in this project.

---

## Overview

项目状态分为四类，各归其位：

- **URL 状态**：列表页查询条件（搜索词、状态筛选、分页）的唯一来源是 `useListUrlState`，存 `route.query`。刷新、后退、分享链接都依赖它，不存内存/Pinia。
- **服务端状态**：列表数据走 Pinia 的 manager/store（如 `useGroupsStore`），只存**当前页** + `total`，由 `loadPage` 按页拉取。
- **本地瞬时状态**：表单草稿、loading、pendingDelete、toast 等不进 URL 也不进全局 store 的状态，用组件/manager 的 `ref`。
- **会话状态**：当前用户/工作区等跨页共享的认证态，放 Pinia（如 `useAuthStore`）。

---

## URL State（列表查询的唯一来源）

列表页查询状态**只能**经 `useListUrlState` 读写，**组件不得直接 `useRoute` 读列表 query**（会绕过 URL 同步、丢失刷新/后退语义）。

用法（manager 内）：
```ts
const { state, apply, reset, isDefault } = useListUrlState({
  defaults: { keyword: '', enabledFilter: 'all', page: 1, pageSize: 20 },
  resetPageOn: ['keyword', 'enabledFilter', 'pageSize'],
})
```

规则：
- 空串 / null / 等于默认值不写入 query；数组逗号拼接；数字 `Number()` 回读，NaN 回退默认。
- 筛选变化用 `router.replace`（不制造历史）；仅 `page` 变化用 `router.push`（后退可回上一页）。
- 非分页字段变化时 `page` 自动复位 1（`resetPageOn`）。
- `初始化先从 query 读入再 watch`，避免首帧把 query 清空；`watch(route.query)` 校验 `route.name`/`params` 未变，组件卸载自动停止。
- 用 `queryEquals` 逐键比较，相同则不写，切断「写 query → watch → 再写」回环。

---

## Server State（服务端分页样板）

store 只存当前页数据 + total，不存全量（除非编辑器等下游依赖全量，见下）。`loadPage` 统一带 **generation 计数**防旧响应覆盖（快速连续两次请求只保留后一次结果）：

```ts
let pageGeneration = 0
async function loadPage(params) {
  const requestGeneration = ++pageGeneration
  const items = await getList(workspaceId, keyword, page, pageSize)
  if (requestGeneration !== pageGeneration) return null   // 丢弃旧响应
  state.pageState = { items, total, page, pageSize, keyword }
}
```

- `upsert / remove` 同步维护 `pageState.total`（删除后 total 减 1，新增后加 1）。
- 下游依赖全量的场景（builder 成员选择、树结构）保留 `getAll*Pages` 全量接口；store 顶部注释写明「其余 store 在 p1/p2 按此迁移」。
- 后端接口尚未提供 `limit/offset` 时（如 group），`loadPage` 拉全量、调用方按页切片，并在注释说明；具备服务端分页的资源按其接口接入真实 offset。

---

## Feedback Loop（编辑闭环）

保存/删除后的反馈闭环统一走 `useSaveFeedback`，不各页手写：

- `afterSave({ listRoute, id, message })` = `toast.add({ color: 'success' })` + 回列表并带 `?highlight=<id>`；`useHighlightFromQuery()` 读该 query 交给 `ResourceTable.highlightId`，2s 后 `router.replace` 清除。
- `afterDelete({ listRoute, message })` = toast + `router.back()`（`history.state.back` 为空时回 `listRoute`）。

编辑 hook 保存成功一律走 `afterSave`（不要再 `goToDetail` 后无反馈）；删除后回退上一页。

---

## Permissions（权限判断唯一入口）

权限判断**只能**经 `usePermissions().can(action, resource, target?)`，按钮层不得各写规则。后端未提供权限模型前默认 `true`，目标级硬规则（「不能删自己」「owner 不可移除」）集中迁入 `src/constants/permissions.ts`。渲染用 `v-can` 指令：缺省隐藏、`.disable` 修饰符改为 `disabled` + `title` 说明原因。后端补齐后只改 `permissions.ts` 能力表。

---

## When to Use Global State

- 跨页共享的认证/工作区态 → Pinia。
- 单页列表数据 → 该资源的 manager/store（Pinia，便于组件间共享与加载状态）。
- **不进 URL 也不跨页复用的瞬时态**（表单草稿、pendingDelete、loading）→ 留在组件或 manager 的 `ref`，不要塞全局 store。

---

## Common Mistakes

1. 列表查询状态只存 Pinia/ref，刷新、后退、分享链接全部丢失。
2. store 拉全量后前端过滤（极限 100/200 截断），应改用服务端分页 `loadPage`。
3. 请求不带 generation 计数，快速连发时旧响应覆盖新响应（竞态）。
4. 保存成功 `goToDetail` 无反馈；删除后不回退首页。应走 `useSaveFeedback` 闭环。
5. 权限判断（如「不能删自己」）写死在业务 hook 里，应迁入 `permissions.ts` 能力表。
6. 组件直接 `useRoute` 读列表 query，绕过 `useListUrlState`。
