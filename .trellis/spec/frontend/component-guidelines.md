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

## Organization 模块约定（people / departments / groups）

同一份部门数据有两种呈现，按页面语义二选一：

- **people 页**：部门是**筛选范围**，做左侧常驻部门树（`UTree`，数据源 `stores/xxx.state.tree`）+ 右侧列表。左树搜索只做树内过滤与高亮，**不触发列表请求**；点树节点写 `departmentId` 且 `page` 归 1；重置需**同时清树选中**。左栏 `shrink-0 w-80`，窄屏（<1200px）折叠为 `USlideover` 抽屉。
- **departments 页**：部门是**被管理的对象本身**，做树形表格（`ResourceTable :tree-children-key`），**不分页、无批量**；名称列按 `row.depth` 缩进，仅 `getCanExpand()` 画箭头。

其他通用约定：

- 树形递归过滤必须**保留祖先链**：父节点保留条件 = 自身命中或任一子孙命中；命中节点高亮、祖先弱化（`opacity:.55`），搜索态自动全展开。
- 删除/启用等**后果重**的操作，弹窗确认前先**程序化检查依赖**（树节点 children 判断下级、成员列表接口取人数），有依赖时确认按钮禁用并列出具体原因（"下级 N 个、成员 M 人"）+ "去详情处理"链接；后端拦截原因**原样展示**，不用泛化文案。
- 停用节点（`is_active=false`）若级联影响子树，子树整体弱化（`subtreeInactive` 标记自上而下传播）。
- 编辑页上下文依赖 `route.query`（如 `?parent=<id>` 新增子部门、`?from=detail` 从详情进编辑）：详情页编辑按钮带 `from=detail`，保存后按 `from` 分流回详情或回列表带 `?highlight`。
- 行级权限（删自己、非管理员操作管理员）统一走 `usePermissions().can()`，不满足时按钮**不渲染**（`v-if`）而非 disabled。

---

## Build 模块约定（agents / workflows / plans）

三个 build 资源（Agent / Workflow / Plan）共享同一套复杂编辑模式（Builder），且交互已按 p2 拉平到同一套约定：

- **列表页**：三资源统一 `FilterPanel`（关键字/启用状态/模式或模型/创建时间区间）+ `ListCard` + `ResourceTable` + `ResourcePagination`；`query = {keyword,enabled,mode|model,dateRange,page,pageSize}` 进 URL（`useListUrlState`）；操作列右固定、只留「编辑」直出、其余（复制/启停/删除）进 `UDropdownMenu`「更多」，行操作菜单**三资源完全一致**。
- **状态列**：用 `UBadge`（published/disabled 语义色），不做就地开关除非后果轻；行内启停走「更多」菜单项（先确认后切换），失败时**乐观回滚**（store 保存失败会重拉列表收敛，不要手动翻转导致与服务端不一致）。
- **Builder 编辑**（最复杂、最容易回归）：
  - Builder **不自持脏快照**——返回键/Esc/取消只 `emit('close')`；脏判断与确认弹窗统一由**页面层** `useUnsavedGuard` 承担（五条离开路径：浏览器退回/侧栏切换/顶部返回/Esc/取消 走同一弹窗，杜绝两个 UModal 叠放）。
  - 快照在 `openEdit` 完成、`?duplicate` 加载完成、保存成功**三处**都调用 `snapshot.reset()`，否则会误判脏/漏判脏（p2 回归重点）。
  - 校验失败调 `focusFirstError`（定位首个 `aria-invalid` / 滚到分区锚点），保存按钮保持可点（只 `:disabled="saving"`），错误横幅只留「共 N 处问题」摘要。
  - 字段级错误用 `UForm :validate`（返回 `{name,message}[]`）落到对应 `UFormField` 下方，不是只用 `required` 视觉标记。
  - 必填字段（名称/路由标识/系统提示词等）统一 `UFormField required`。
- **编辑页 404**：`openEdit` 详情为 null 时置 `notFound`，edit 页渲染「未找到 + 返回列表」`UAlert`，不渲染空草稿 Builder；id 为 `NaN`/非法时直接走 404 空态，不发详情请求。
- **保存成功**：统一 `useSaveFeedback.afterSave`（toast + 回列表 + `?highlight`），不再 `goToDetail`；详情页进编辑保留回详情的 `from=detail` 分流（p1 约定）。

---

## Memories / Skills 约定（知识资产页）

- **memories**：列表已路由化为标准形态（列表/详情/编辑/新建各自独立路由页）。列表用 `FilterPanel + ListCard + ResourceTable + ResourcePagination`，`keyword/type/page/pageSize` 经 `useListUrlState` 进 URL；空态分型三态——加载失败(重试)/从未创建(新建按钮)/筛选无结果(清除筛选+回显条件)，以 `total===0 && !hasActiveFilter` 判定「从未创建」；删除弹窗标题带记忆名(>30 字截断)，删除后 `items.length===0 && page>1` 回退页码并**重拉**；保存走 `useSaveFeedback`（新建/编辑回列表 + `?highlight`，从详情进编辑保存留详情）。
- **skills**：标准 CRUD。`/skills/:name` 详情路由 + `/skills/:name/edit` 编辑路由（name 是**字符串**，可含 `.zip`，路由不用 `\d+` 约束）。列表 `FilterPanel + ListCard + ResourceTable`，名称列链接进详情；选中态以 `route.params.name` 为主，`selectedSkillName` 只作已删邻项高亮派生，**避免双状态源**（不要在 upload 等方法里再写 `state.selectedSkillName`）。
- **接口未提供的兜底**（必须在代码注释与文档标注「接口化 TODO」）：
  - 后端无搜索/分页接口 → 前端过滤 + 内存分页（复用 groups 样板的 `filteredXxx/pagedItems` 切片），如 skills。
  - 后端无字段类型 → 用 `scope` 等现有字段替代筛选（如 skills 用「作用域」而非「类型」）。
  - 后端无更新接口 → 编辑页退化为「只读元数据 + 重新上传覆盖」，页面用 `UAlert` 明示、不误导用户（如 skills 用 zip 覆盖）。
  - 后端搜索态不支持 offset → 搜索退化为单次拉取并保留 `response.total`，不造假分页。

---

## Common Mistakes

1. 用模板字符串拼 Tailwind 任意类（如 `grid-cols-[repeat(${n},...)]`）：Tailwind JIT 只静态扫描源码，运行时拼接的类不生成样式。改用 CSS Module 静态 `grid-template-columns: repeat(var(--filter-cols,3),minmax(0,1fr))` + `:style` 绑变量。
2. 新能力不默认关闭导致既有调用被破坏。
3. 本组件接管的插槽名不排除在透传外，导致同名插槽渲染两份。
4. 定时器（`RelativeTime`、`highlightId`、`useSnapshotDirty`）不清理导致测试泄漏——必须在 `onBeforeUnmount`/`onScopeDispose` 清理。
