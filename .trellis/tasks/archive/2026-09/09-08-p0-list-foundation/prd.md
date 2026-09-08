# 阶段 0：列表页共享基础层

> 父任务：`.trellis/tasks/09-08-console-crud-refactor/`（总需求、`design.md` 技术设计、`research/` 参考资料）。本阶段只交付**可复用的共享层**，不改任何业务页面；p1（organization）、p2（build）、p3（memories / skills）在其之上套用。

## 背景与目标

全站审计发现 10 条跨模块共性差距，根因集中在共享层缺失：列表状态只存 Pinia 不进 URL、保存成功后跳详情且无反馈、分页组件只是计数器、`ResourceTable` 只透传 UTable 且无骨架屏 / 多选 / 固定操作列、权限可见性没有任何落点、表单校验不聚焦首错字段、新建页无脏检查。每个业务页各自补一遍会重复 6 次且不一致。

本阶段目标：把若依式「筛选卡 + 列表卡 + 分页」三段式骨架与上述能力沉淀为 `src/hooks/` 与 `src/components/resource/` 下的共享代码，并配单测，使后续阶段每页接入成本降到"换组件 + 传 props"。

## 范围

- 新增组合函数：`useListUrlState`、`useSaveFeedback`、`usePermissions`、`useFormHelpers`（`focusFirstError` / `useUnsavedGuard`）。
- 新增组件：`FilterPanel`、`ListCard`、`RelativeTime`、`StatusBadge`、`ActionIconButton`。
- 升级组件：`ResourceTable`、`ResourcePagination`（向后兼容）。
- store：给一个 store 增加服务端分页样板 `loadPage()`。
- 单测：vitest 覆盖全部新增 hook 与分页计算。

## 非目标

- 不改任何 `src/routes/**` 业务页面的行为（接入在 p1–p3）。
- 不动后端接口；不新增权限接口，权限仅做前端能力表与兜底。
- 不重绘视觉主题；不引入若依的 tag-view 多页签。
- 不替换 `build-resource-table` 已有的多选 + `UDropdownMenu` 模式，只保证新 `ResourceTable` 与之能力兼容。

## 依赖与前置

- 无前置。本阶段是 p1 / p2 / p3 的前置；p5（auth / profile / apps）不依赖本阶段，可并行。
- Nuxt UI 4.10 已在 `node_modules/@nuxt/ui/dist/runtime/components/` 确认存在：`Table`（含 `getSubRows` prop :64、`expandedOptions` :41）、`Pagination`、`Select`、`Collapsible`、`Tooltip`、`Switch`、`Badge`、`Tree`、`InputDate`、`Checkbox`、`DropdownMenu`；骨架屏用 `USkeleton`。
- 校验命令：`npm run build`（vue-tsc 类型检查）、`npm run lint`、`npm test`（vitest run）。

## 需求清单

每条格式：现象（证据 `src/...:行号`）→ 要求 → 建议改法 / API 草图。

### R1 `useListUrlState(state, opts)`（`src/hooks/useListUrlState.ts`）

- 现象：六个 manager hook（`useAgentManager` / `useWorkflowManager` / `useOrchestrationPlanManager` / `useDepartmentManager` / `useGroupManager` / `usePeopleManager`）均不引入 `useRoute` / `useRouter`；搜索词、状态筛选、分页只存 hook 内 ref 或 store（`useDepartmentManager.ts:10-11`、`useGroupManager.ts:15-16`、`usePeopleManager.ts:42-43`、`stores/memories.ts:46-58`、`stores/skills.ts:12`）。刷新、后退、分享链接全部丢失。organization 目录里唯一的 `route.query` 用法是 `departments/create/index.vue:18` 的 `?parent=`。
- 要求：一个组合函数把一组筛选 ref 与 `route.query` 双向绑定，manager hook 内部调用，对外返回值不变，业务页零改动即可获得 URL 同步。
- API 草图：

  ```ts
  useListUrlState(
    state: Record<string, Ref<string | number | boolean | string[] | null>>,
    opts?: {
      defaults?: Record<string, unknown>              // 等于默认值时不写入 query
      pageKeys?: { page?: string; pageSize?: string } // 缺省 'page' / 'pageSize'
      resetPageOn?: string[]                          // 这些字段变化时 page 归 1
    },
  ): { reset(): void; toQuery(): LocationQueryRaw }
  ```

- 规则：空串 / null / 默认值不写入；数组用逗号拼接；数字回读 `Number()`，NaN 回退默认；筛选变化用 `router.replace`（不制造历史），`page` 变化用 `router.push`（后退可回上一页）；初始化先从 query 读入再开始 watch，避免首帧把 query 清空；`watch(route.query)` 只响应本路由（`route.name` / `params` 未变时），组件卸载后自动停止。

### R2 布局组件 `FilterPanel` / `ListCard`（`src/components/resource/filter-panel/`、`list-card/`）

- 现象：各列表页头部各写各的（页头 + 搜索框 + 表格直接堆叠），没有"筛选区 / 结果区"分离；滚动靠 `src/routes/platform-resource/components/shared/index.module.css:23` 的 `.listPane { overflow: auto }` 整块滚，分页会被推出首屏。
- 要求 `FilterPanel`：props `title`（默认"筛选条件"）、`collapsible`、`v-model:collapsed`（`UCollapsible`）；默认插槽放 `UFormField`，内部 3 列栅格、标签右对齐、控件等宽，窄屏（<1024px）降为 1 列；`#actions` 插槽缺省渲染「搜索」「重置」并 emit `search` / `reset`。
- 要求 `ListCard`：props `title`、`description`、`total`；插槽 `#toolbar`（主按钮 + 依赖选中的批量按钮 + 更多下拉 + 刷新）、默认插槽（表格）、`#footer`（分页）；自身 `flex flex-col min-h-0`，表格区 `flex-1 min-h-0 overflow-auto`，页脚 `shrink-0`。
- 页面骨架约定（写进组件文档注释，供 p1–p3 照抄）：外层 `h-[calc(100vh-var(--app-header-h))] flex gap-5`（变量不存在则在 app-shell 新增）；主列 `flex-1 min-w-0 flex flex-col gap-5`；左侧可选范围面板 `w-80 shrink-0`，可折叠为 0 宽。

### R3 `ResourceTable` 升级（`src/components/resource/table/index.vue`）

- 现象：只透传 `columns / data / loading / getRowId`，固定 `sticky="header"`（:50）；无 select 列、无操作列固定；`loading` 时因未提供 `#loading` 插槽，UTable 落到 `#empty` 文字（`node_modules/@nuxt/ui/dist/runtime/components/Table.vue:436-445` 仅在有插槽时走 loading 分支）；图标操作按钮无 tooltip（departments list:112、groups:113 四图标、people:114、build 三列表 4–5 图标）；树表能力未透传；`activeId`（:16-17, :26-31）只能常驻高亮一行。
- 要求（全部可选 prop，缺省行为与现状一致）：
  1. `selectable` + `v-model:selected: string[]`：自动前置 `UCheckbox` 列，表头全选 / 半选，基于 `getRowId` 稳定选中，数据刷新后自动剔除已不存在的 id。
  2. `pinActions`（默认 `true`）：`id === 'actions'` 的列右侧固定，横向滚动时始终可见（UTable column pinning，具体 prop 名以 `Table.vue` 为准）。
  3. `#loading` 缺省实现：按 `columns.length × 5` 渲染 `USkeleton` 行；`loading && data.length > 0` 时不遮挡旧数据，仅在表头下方显示细进度条。
  4. `emptyMode: 'never' | 'filtered'`：`#empty` 缺省分别渲染"还没有 {resourceName}"与"没有匹配的结果"+「清除筛选」按钮（emit `clear-filters`）。
  5. `treeChildrenKey`：设置后透传 `getSubRows`，首列 cell 按 `row.depth` 缩进 16px、`row.getCanExpand()` 时渲染展开箭头；`defineExpose({ expandAll, collapseAll })`。
  6. `highlightId`：与 `activeId` 区分——命中行高亮 2s 后淡出（CSS transition），用作"保存回列表"落点。
  7. 新增 `ActionIconButton`（`src/components/resource/action-icon-button/`）：`UTooltip` 包 `UButton icon`，`label` 必填并作为 `aria-label`；`disabled` 时 tooltip 显示 `disabledReason`（如"请先勾选一行"）。

### R4 `ResourcePagination` 真分页（`src/components/resource/pagination/index.vue`）

- 现象：`isPaged()`（:24-26）在 `itemsPerPage=0` 时只显示"当前显示 X / Y 条"（:35）；所有列表页都传 `:items-per-page="0"`（departments list:116、groups:117、people:118，build 三列表同）；`page` 只有 `onPage` 回调（:17, :28-30）。
- 要求：四件套——总数、每页条数 `USelect`（10 / 20 / 50 / 100，`v-model:itemsPerPage`）、`UPagination` 页码、跳转输入框（回车 / 失焦生效，越界钳制到 `[1, pageCount]`）；改为 `v-model:page`（`onPage` 回调保留一个阶段作过渡）；切换每页条数时 `page` 归 1；`itemsPerPage=0` 时保持"仅计数 + footerExtra"现状，现有引用零改动可编译。

### R5 通用单元格 `RelativeTime` / `StatusBadge`（`src/components/resource/cells/`）

- 现象：时间全部 `toLocaleString('zh-CN', { hour12: false })` 绝对值、无 tooltip（workflows detail:38-41、plans detail:44-47、departments detail:42-46、memories list-panel:51-56,166、skill-detail-panel:37-42）；状态徽章颜色映射每页手写。
- 要求：`RelativeTime` props `value`、`mode: 'relative' | 'absolute'`（默认 relative，超过 7 天自动切绝对）、`now`（可注入供单测）；hover `UTooltip` 显示完整 `YYYY-MM-DD HH:mm:ss`；非法值渲染 `—`。`StatusBadge` 接受 `enabled: boolean` 或 `status: string` + 可选映射表，输出 `UBadge` 语义色（success / neutral / warning / error），文案可覆盖。

### R6 反馈闭环 `useSaveFeedback()`（`src/hooks/useSaveFeedback.ts`）

- 现象：`useWorkflowEditor.ts:110-113`、`usePlanEditor.ts:127,160`、`useMemoryEditor.ts:172`、`useDepartmentEditor.ts:157-160`、`useGroupEditor.ts:187-190` 保存成功一律 `goToDetail`；全部 hook 无 `useToast`；删除后不回退上一页（`useAgentManager.ts:72-88`、`useOrchestrationPlanManager.ts:121-137`、`stores/memories.ts:191-206`）。
- 要求：`afterSave({ listRoute, id, message })` = `toast.add({ color: 'success', title: message })` + `router.push({ ...listRoute, query: { highlight: String(id) } })`；`afterDelete({ listRoute, message })` = toast + `router.back()`（`history.state.back` 为空时回 `listRoute`）；`useHighlightFromQuery()` 读 `?highlight` 交给 `ResourceTable.highlightId`，2s 后 `router.replace` 清掉该 query。本阶段只提供 hook 与单测；编辑 hook 接入放在 p1–p3。

### R7 权限可见性 `usePermissions()`（`src/hooks/usePermissions.ts`、`src/constants/permissions.ts`）

- 现象：全站 grep `permission / can( / usePermissions / role` 仅命中 `role="radio"` 与 CSS；唯一的目标级规则是 people「不能删自己」（`usePeopleManager.ts:87-89,140-143`），写死在 hook 里；所有编辑 / 删除 / 启停按钮对登录用户一律可点。
- 要求：`can(action: 'create' | 'update' | 'delete' | 'toggle' | 'batch', resource: string, target?: unknown): boolean`；能力表放 `src/constants/permissions.ts`，当前无后端权限数据时默认 `true`，但支持注册**目标级规则**（把"不能删自己""不能操作 owner"迁入）；导出 `vCan` 指令，缺省隐藏元素，`.disable` 修饰符改为 `disabled` + `title` 说明原因。所有按钮的可见性只依赖这一处，后端权限接入时只改能力表。

### R8 表单辅助 `focusFirstError` / `useUnsavedGuard`（`src/hooks/useFormHelpers.ts`）

- 现象：全库无 `scrollIntoView` / `.focus(`；builder 校验失败只置 `saveAttempted`（workflow builder:128-132、plan-builder:140-150），错误堆在底部清单不定位字段；build 三个 create 页无 `onBeforeRouteLeave`（edit 页有：workflow edit:19-57、plan edit:37-42）；`plan-builder` 的 `savedSnapshot` 随 `props.plan` 引用变化被重置（:165-167）；全库无 `beforeunload`。
- 要求：`focusFirstError(root: HTMLElement)`：定位首个 `[aria-invalid="true"]`（UFormField 出错时 Nuxt UI 会标记）或 `[data-error]` 所属输入，`scrollIntoView({ block: 'center' })` + `focus()`，返回是否命中；`useUnsavedGuard(dirty: Ref<boolean>)`：内部注册 `onBeforeRouteLeave` 与 `beforeunload`，返回 `{ pending, confirmLeave(), cancelLeave() }` 供页面渲染统一 `UModal`，卸载自动解除；`useSnapshotDirty(source, { resetOn })`：基于 `JSON.stringify` 快照，仅在显式 `resetOn`（如保存成功 / 详情加载完成）时重置，解决快照被 props 引用重置的问题。

### R9 store 服务端分页样板（`src/stores/departments.ts`，备选 `src/stores/agents.ts`）

- 现象：`stores/agents.ts:50`、`stores/workflows.ts:44`、`stores/orchestrationPlans.ts:47` 及 organization 各 store 都以 `limit: 100` 循环拉全量后前端过滤；`usePeopleManager.ts:16-17` 对用户目录硬截断 `USER_LIST_LIMIT = 200`（注释注明工作区成员接口无分页，故 people **不作为**样板）；后端列表接口本身支持 `limit / offset / keyword / is_enabled`。
- 要求：样板 store 增加 `pageState: { items, total, page, pageSize, keyword, isEnabled }` 与 `loadPage(params)`；保留 `getAll*Pages` 供依赖全量的场景（builder 成员选择、树结构）；请求带 generation 计数防旧响应覆盖（对齐 `stores/workspaces.ts:34-72`）；`upsert / remove` 同步维护 `pageState.total`；在 store 顶部注释写明"其余 store 在 p1 / p2 按此迁移"。

## 验收标准

- [ ] `useListUrlState` 单测：默认值不写 query、数组序列化 / 反序列化、NaN 回退、`resetPageOn` 生效、`reset()` 清空、非本路由的 query 变化被忽略。
- [ ] 用一个临时 demo 页（或测试路由）验证：接入 `useListUrlState` 后刷新不丢筛选与页码，浏览器后退回到上一页码，分享链接打开即同一组条件；验证完删除 demo。
- [ ] `ResourceTable`：`loading` 且无数据时渲染 `USkeleton` 行而非空态文字；`selectable` 时表头全选 / 半选正确且刷新后剔除失效 id；`pinActions` 在窄容器横向滚动时操作列仍可见；`treeChildrenKey` 渲染三层缩进并可展开 / 折叠；`highlightId` 命中行 2s 后恢复。
- [ ] `ResourcePagination`：`page / itemsPerPage > 0` 时显示总数、每页条数、页码、跳转；跳转越界被钳制；切每页条数后 `page` 归 1；`itemsPerPage = 0` 时输出与当前完全一致（现有引用零改动可编译）。
- [ ] `RelativeTime` 对 1 分钟前 / 3 天前 / 30 天前 / 非法值分别输出相对、相对、绝对、`—`；hover 显示完整时间；`now` 注入后单测可重复。
- [ ] `useSaveFeedback.afterSave` 后地址栏出现 `?highlight=<id>`，2s 后被清除；`afterDelete` 在无历史栈时回列表路由。
- [ ] `usePermissions.can('delete', 'people', { id: 当前用户 id })` 为 `false`，其余无规则组合为 `true`；`v-can` 缺省隐藏、`.disable` 修饰符改为禁用并带 `title`。
- [ ] `focusFirstError` 在含两个错误的表单上聚焦 DOM 顺序第一个并返回 `true`；`useUnsavedGuard` 在 dirty 时拦截路由、注册 `beforeunload`，`resetOn` 触发后不再拦截。
- [ ] 样板 store：快速连续两次 `loadPage` 只保留后一次结果（generation 单测）；`remove` 后 `pageState.total` 减 1。
- [ ] `ActionIconButton` 渲染 `aria-label`，禁用时 tooltip 文案为 `disabledReason`。
- [ ] `src/components/index.ts`、`src/hooks/index.ts` 导出全部新增项；`npm run build`、`npm run lint`、`npm test` 全绿。
- [ ] `git diff --stat -- src/routes` 为空（本阶段不改业务页）。

## 风险与注意事项

- UTable 的列固定、`getSubRows`、`expanded` 等 prop 以 `node_modules/@nuxt/ui/dist/runtime/components/Table.vue` 为准（已确认 `getSubRows` :64、`expandedOptions` :41、`getExpandedRowModel` :176-177），不要凭记忆写 TanStack 选项名；若 4.10 没有列固定 prop，用 `meta.class.td` + `position: sticky; right: 0` 兜底。
- `ResourceTable` 现有 `activeId` / `@select` / 插槽透传（:26-39, :54-56）被 memories 与 organization 三个列表使用，所有新增能力必须缺省关闭、向后兼容。
- `build-resource-table/index.vue:27-66` 与 `build-resource-manager:86-92` 已有自己的多选和 `UDropdownMenu`，本阶段不得改动；是否迁到新 `ResourceTable` 由 p2 决定。
- `useListUrlState` 在同一组件被不同路由参数复用（如 `/platform/:module/:resource`）时，`watch(route.query)` 必须校验 `route.name` / `params` 未变，否则会把别的资源页的 query 写进当前 hook。
- people 的工作区成员接口无分页，R9 不要选 people；用户目录 `getUserList` 有 `limit / offset`，可作为备选样板。
- `RelativeTime` 与 `highlightId` 的定时器要在组件卸载时清理，避免测试环境泄漏。
- 权限兜底"默认允许"意味着接入真实权限前 UI 行为不变；能力表要留 `TODO` 注明后端字段来源。

## 涉及文件

- 新增：`src/hooks/useListUrlState.ts`、`useSaveFeedback.ts`、`usePermissions.ts`、`useFormHelpers.ts` 及各自 `*.test.ts`；`src/constants/permissions.ts`；`src/components/resource/filter-panel/`、`list-card/`、`action-icon-button/`、`cells/relative-time/`、`cells/status-badge/`（各含 `index.vue` + `index.module.css`）。
- 修改：`src/components/resource/table/index.vue`（+ `index.module.css`）、`src/components/resource/pagination/index.vue`（+ `index.module.css`）、`src/components/index.ts`、`src/hooks/index.ts`、样板 store `src/stores/departments.ts`（+ `departments.test.ts`）。
- 只读参考：`src/components/build-resource-table/index.vue`、`src/routes/platform-resource/components/shared/index.module.css`、`src/stores/workspaces.ts:34-72`（generation 模式）、父任务 `design.md` 与 `research/audit-findings.md`、`research/ruoyi-layout-reference.md`。

## 目标形态 ASCII 草图（本阶段要交付的共享骨架）

```
页面区 = 100vh - 顶栏，flex-col，gap 16px，padding 16px（整页不滚动）
┌──────────────────────────────────────────────────────────────────────────────┐
│  顶栏（路由 / 会话，唯一不滚动的固定区域）                                          │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ 筛选条件 ────────────────────────────────────────────────────────── [恢复 ▾] ─┐
│ 用户名称 [____________]  用户昵称 [____________]  手机号码 [____________]        │
│ 状态     [用户状态    ▾]  创建时间 [开始日期] ~ [结束日期]        [搜索] [重置]   │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ 用户列表  ·  共 9 条记录，支持部门筛选、状态切换、导入导出和角色分配 ──────────────┐
│ [+ 新增] [修改] [删除] [解锁] [更多 ▾]        ⇄刷新  ⚙列设置   ← 工具栏          │
│ ┌────┬──────────┬────────┬────────┬──────────┬───────┬────────────┬────────┐ │
│ │ ☐  │ 用户名称   │ 用户昵称 │ 部门    │ 手机号码  │ 状态   │ 创建时间     │ 操作    │ │ ← 表头 sticky
│ ├────┼──────────┼────────┼────────┼──────────┼───────┼────────────┼────────┤ │
│ │ ☐  │ admin    │ 疯狂的狮子Li │ 研发部门 │ 1588…   │ ●开启  │ 2026-07-30 │ ✎ 🗑 ⇄ │ │ ← 行区滚动
│ │ ☑  │ test1    │ 本部门   │ 市场部门 │ 1500…   │ ●开启  │ 2026-07-30 │ ✎ 🗑 ⇄ │ │
│ │ ☐  │ test1001 │ 测试角色 │ 研发部门 │ 1567…   │ ●开启  │ 2026-08-19 │ ✎ 🗑 ⇄ │ │
│ └────┴──────────┴────────┴────────┴──────────┴───────┴────────────┴────────┘ │
│                                          共 9 条  [10条/页 ▾]   ‹ 1 ›  前往 [ ] 页 │
└──────────────────────────────────────────────────────────────────────────────┘

要点：勾选列 + 操作列（最右，pinned）；操作按钮一律带 tooltip；状态用 USwitch（后果轻）
或 UBadge（后果重）；时间列 = RelativeTime（相对 + hover 绝对）；loading 时表头下渲染
骨架行；[恢复 ▾] 收起筛选卡；空态区分「暂无数据」与「筛选无结果」。
```
