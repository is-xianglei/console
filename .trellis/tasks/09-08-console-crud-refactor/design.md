# 共享层技术设计（p0 编码依据）

> 所有子任务共用的页面骨架、组合函数与组件在此定案。p1/p2/p3 只做"套用"，不得各自再发明一套布局或 URL 同步逻辑。

## 1. 页面骨架：固定高 + 内部滚动

```
列表页根          h-[calc(100vh-var(--app-header-h))] flex gap-5 p-5 overflow-hidden
├─ 范围树(可选)    w-80 shrink-0 flex flex-col           ← 仅 people 页；头部含折叠按钮
└─ 主列            flex-1 min-w-0 flex flex-col gap-5    ← min-w-0 必写，否则宽表撑出横向滚动
   ├─ FilterPanel  shrink-0（可折叠）
   └─ ListCard     flex-1 min-h-0 flex flex-col
      ├─ 头部       shrink-0（标题 + 说明 | 工具栏）
      ├─ 表格容器   flex-1 min-h-0 overflow-auto（UTable sticky header）
      └─ 分页       shrink-0 justify-end
```

- `--app-header-h` 由 `src/components/app-shell` 提供；若已有等价变量沿用，不新增。
- 树折叠态写 `localStorage`（键 `console.list.<资源>.treeCollapsed`），折叠后主列自动占满。
- 窄屏（`< 1200px`）范围树改为 `USlideover`，入口放在筛选卡"部门"字段旁。
- 原则：**整页不滚动，表格自己滚，分页永远可见**。

## 2. 组合函数 `useListUrlState`

位置 `src/hooks/useListUrlState.ts`。

```ts
export interface ListUrlStateOptions<T extends Record<string, unknown>> {
  /** 各字段默认值；等于默认值的字段不写入 query。page/pageSize 为保留字段名。 */
  defaults: T
  /** 字段级编解码；缺省规则：string 原样，number 转字符串，boolean 转 '1'/'0'，string[] 逗号拼接。 */
  codecs?: Partial<{ [K in keyof T]: { encode(v: T[K]): string | undefined; decode(s: string): T[K] } }>
  /** 非分页字段变化时把 page 复位为 1，默认 true；highlight 等字段可在 exemptFromReset 里豁免。 */
  resetPageOnChange?: boolean
  exemptFromReset?: (keyof T)[]
}

export function useListUrlState<T extends Record<string, unknown>>(options: ListUrlStateOptions<T>): {
  state: T                          // reactive，manager hook 用它替代零散的 ref
  apply(patch: Partial<T>): void    // 批量写入（筛选卡"搜索"按钮）
  reset(): void                     // 回到 defaults（"重置"按钮，同时清树选中）
  isDefault: ComputedRef<boolean>   // 供"重置"按钮禁用
}
```

规则：
- 只用 `router.replace({ query })`，不产生历史记录；写入前与当前 `route.query` 逐键比较，相同不写，切断"写 query → watch → 再写"回环。
- `pageSize` 允许值 `[10, 20, 50, 100]`，默认 20；非法值回落默认；`page` 非正整数回落 1。
- 数组用逗号拼接，空数组不写；字符串 `trim()` 后为空不写。
- `watch(() => route.query, decode, { immediate: true })`，解码失败的字段回落默认值，不抛错。
- people 的 `departmentId`（树选中）与 `highlight` 也走这里；`highlight` 放进 `exemptFromReset`。
- 接线示例：`useDepartmentManager.ts:10-11` 的 `search/enabledFilter` 两个 ref 替换为 `const { state, apply, reset } = useListUrlState({ defaults: { keyword: '', enabled: 'all', page: 1, pageSize: 20 } })`，然后 `watch(state, () => loadPage(), { deep: true })`；模板绑定路径从 `search` 改为 `state.keyword`。

## 3. 布局组件（放 `src/components/resource/`，经 `src/components/resource/index.ts` 导出）

**`filter-panel/index.vue`（`FilterPanel`）**
- props：`title = '筛选条件'`、`collapsible = true`、`columns = 3`、`v-model:collapsed`（可选，缺省内部状态 + `localStorage` 记忆）。
- 结构：头部（标题 + 折叠箭头）+ `UCollapsible` 包裹的栅格 `grid grid-cols-[repeat(3,auto_minmax(0,1fr))] gap-x-6 gap-y-3 items-center`。
- 插槽：`#default` 放若干 `<UFormField>`（标签固定 `w-20 text-right`，日期区间控件可 `col-span-2`）；`#actions` 缺省渲染「搜索」（primary）「重置」两个按钮并 `emit('search' | 'reset')`。
- 键盘：栅格内任一输入按 Enter 触发 `search`；重置按钮在 `isDefault` 时禁用。
- 条件 ≤ 3 个时可传 `inline` 让它退化为列表卡头部的一行工具条，不单独成卡。

**`list-card/index.vue`（`ListCard`）**
- props：`title`、`description`、`total?: number`（有则在说明后渲染"共 N 条"）。
- 插槽：`#toolbar`（业务按钮，主按钮在最左、实心；依赖选中的批量按钮次之，描边；低频操作收进 `UDropdownMenu`「更多」）、`#tools`（刷新 / 列设置等图标，与 toolbar 间竖线分隔）、`#default`（表格）、`#footer`（分页）。
- 自身负责 `flex-1 min-h-0` 与内部滚动，父组件不再写这些类。

**`time-cell/index.vue`（`TimeCell`）**
- props：`value: string | null`。24 h 内显示"x 分钟/小时前"，7 天内显示"x 天前"，更早显示 `YYYY-MM-DD`；外层 `UTooltip` 显示 `toLocaleString('zh-CN', { hour12: false })`；无效日期显示 `—`。
- 替换目标：`workflows/detail:38-41`、`plans/detail:44-47`、`departments/detail:42-46`、`memory-list-panel:51-56,166`、`skill-detail-panel:37-42` 的 `formatTime`。

## 4. `ResourceTable` 升级（`src/components/resource/table/index.vue`）

在现有 `columns/data/loading/rowKey/activeId/tableClass` 基础上新增：

| prop / 插槽 | 说明 |
|---|---|
| `selectable?: boolean` + `v-model:selected: string[]` | 在 `columns` 前插入 `id: 'select'` 列（表头 `UCheckbox` 全选/半选，行 `UCheckbox`，`size: 44`） |
| `pinActions?: boolean = true` | 通过 UTable `:column-pinning="{ right: ['actions'] }"` 固定操作列；**约定操作列 `id` 必须为 `actions`** |
| `#loading` | 缺省渲染 `skeletonRows`（= `pageSize`，默认 8）行 `USkeleton`，列数与 `columns.length` 一致；调用方可覆盖 |
| `getSubRows?: (row: T) => T[] \| undefined` + `v-model:expanded` | 透传 UTable 的 `getSubRows` / `expandedOptions`（Table.vue:64,176-177 已支持）；名称列 cell 用 `row.depth * 16` px 缩进，`row.getCanExpand()` 时渲染箭头调用 `row.toggleExpanded()` |
| `highlightId?: string \| null` | 来自 `route.query.highlight`，命中行加 `styles.highlight`（与 `activeId` 并存） |
| `#empty` | 缺省区分两种空态：`data.length === 0 && !hasFilter` → "还没有 X，去新建"；`hasFilter` → "没有匹配的结果，试试重置筛选"；调用方传 `hasFilter` |

配套子组件 **`row-actions/index.vue`（`RowActions`）**：`items: { label; icon; onClick; color?; hidden?; disabled?; reason? }[]`，前 3 个渲染为带 `UTooltip` 的图标按钮，其余进 `UDropdownMenu`；`disabled` 时 tooltip 显示 `reason`（如"请先勾选一行"、"不能删除自己"）。参照现有 `build-resource-table/index.vue:119-130`。

插槽透传 `v-for="(_, name) in $slots"` 保持不变；新增插槽名（`loading/empty`）与列名不冲突。

## 5. `ResourcePagination` 真分页（`src/components/resource/pagination/index.vue`）

- 新 props：`total`、`page`、`pageSize`、`pageSizes = [10, 20, 50, 100]`、`showJump = true`；emit `update:page`、`update:pageSize`（`pageSize` 变化时同时 emit `update:page` = 1）。
- 结构（靠右）：`共 {total} 条` → `USelect`（每页条数）→ `UPagination` → `前往 [UInputNumber] 页`（越界钳制到 `[1, pageCount]`）。
- 兼容：保留 `shown + itemsPerPage=0` 的旧调用一个阶段，仍渲染计数条并在 dev 下 `console.warn('ResourcePagination: 请迁移到真分页')`；p1/p2/p3 归档后删除旧分支。
- 树形表格页（departments）不渲染本组件，改由 `ListCard.total` 显示"N 个部门"。

## 6. 保存回列表闭环 `useEditorFeedback`

位置 `src/hooks/useEditorFeedback.ts`。

```ts
export function useEditorFeedback(listRoute: RouteLocationRaw, resourceLabel: string) {
  const toast = useToast()
  const router = useRouter()
  return {
    async afterSave(item: { id: number | string; name?: string }, mode: 'create' | 'edit') {
      toast.add({ title: `${resourceLabel}「${item.name ?? item.id}」已${mode === 'create' ? '创建' : '保存'}`, color: 'success' })
      await router.push({ ...(listRoute as object), query: { highlight: String(item.id) } })
    },
    async afterDelete(name: string) {
      toast.add({ title: `已删除「${name}」`, color: 'neutral' })
      if (window.history.length > 1) router.back()   // 详情页删除：回上一页
      else await router.push(listRoute)               // 直达详情页无历史：回列表
    },
    onError(message: string) { toast.add({ title: message, color: 'error' }) },
  }
}
```

- 各 `use*Editor.ts` 成功分支把 `goToDetail(saved)` 换成 `afterSave(saved, mode)`（`useWorkflowEditor.ts:110-113`、`usePlanEditor.ts:127,160`、`useMemoryEditor.ts:172`、`useDepartmentEditor.ts:157-160`、`useGroupEditor.ts:187-190`）。
- 列表页读到 `highlight` 后传给 `ResourceTable.highlightId`，`setTimeout(2000)` 后 `router.replace` 去掉该字段；若目标行不在当前页，不做额外查找。
- 列表页行内删除只 toast、不跳转；删除弹窗标题统一 `删除「{name}」？`，描述写明后果。

## 7. 脏检查 `useDirtyGuard`

位置 `src/hooks/useDirtyGuard.ts`：`useDirtyGuard(snapshot: () => string)` 返回 `{ dirty, markClean(), confirmOpen, confirmLeave(), cancelLeave() }`；内部注册 `onBeforeRouteLeave`（脏则拦截并打开 `UModal`）与 `beforeunload`。create/edit 页同用；保存成功后 `markClean()`。替换 `workflows/edit/index.vue:19-57`、`plans/edit:37-42` 的手写逻辑，并补齐 build 三个 `create` 页；`plan-builder:165-167` 的 props 快照改为只在 `mode` 切换或 `plan.id` 变化时重置。

## 8. 权限可见性 `usePermissions`

位置 `src/hooks/usePermissions.ts`。

```ts
type Action = 'create' | 'edit' | 'delete' | 'toggle' | 'assignRole' | 'resetPassword' | 'remove'
type Resource = 'agent' | 'workflow' | 'plan' | 'department' | 'group' | 'person' | 'memory' | 'skill' | 'session' | 'workspaceMember'
export function usePermissions() {
  function can(action: Action, resource: Resource, target?: { id?: number | string; ownerId?: number; role?: string }): { allowed: boolean; reason?: string }
  return { can }
}
```

- 兜底策略：后端尚无权限模型时 `can` 默认 `allowed: true`，只集中已知硬规则——people 不能删自己（迁自 `usePeopleManager.ts:87-89,140-143`）、workspace owner 不可移除 / 非 admin 不可改角色（迁自 `workspace-member-panel:90-102`）、超级管理员行不渲染操作。
- 后端补齐后只改本文件；按钮层通过 `RowActions.items[].hidden/disabled/reason` 与工具栏 `:disabled` 消费，不再各写判断。
- 不可见与不可用的取舍：**无权限 → 隐藏**；**有权限但当前状态不满足**（未勾选、正在保存）→ 禁用 + 原因 tooltip。

## 9. store 分页迁移

- 现状：`stores/workflows.ts:40-50`、`stores/orchestrationPlans.ts:43-53` 以 `limit:100` 循环拉全量；`usePeopleManager.ts:60,80-85` 硬截 200。
- 目标：每个列表 store 暴露 `loadPage(params: { keyword?; is_enabled?; limit; offset; ...资源特有 })`，`state.items` 只存当前页，`state.total` 取响应；`upsert/remove` 成功后重拉当前页，不再本地 `unshift`/`filter`（`stores/workflows.ts:85-91,178-183` 等）。
- 接口支持矩阵（已确认字段）：`agent` 有 `keyword/is_enabled`（`src/interfaces/agent/api.ts:3-4`）；`department` 有 `is_active`（`interfaces/department/api.ts:9,20`）；`group` 有 `is_active`（`interfaces/group/api.ts:30`）；`memory/user/workspace` 有 `limit/offset`。接口不支持的筛选保留"当前页内筛选"并在筛选卡标注，子任务 PRD 逐资源核对。
- 树数据（departments 树、people 页左树）单独 `loadTree()` 一次全量，与分页列表解耦；部门超千级再考虑懒加载子节点。
- 请求竞态沿用现有 `loadRequest` 计数模式（`useDepartmentManager.ts:17,45`），旧响应丢弃。

## 10. 涉及的 Nuxt UI 4.10 组件

均已在 `node_modules/@nuxt/ui/dist/runtime/components/` 确认存在：`UTree`（people 左树）、`UTable`（`getSubRows`/`expandedOptions`/`columnPinning`）、`UPagination`、`USelect`、`UInputNumber`、`USwitch`（后果轻的状态，如人员启用）、`UBadge`（后果重的状态，如部门状态）、`UCollapsible`、`UInputDate`（创建时间区间）、`UTooltip`、`UDropdownMenu`、`USkeleton`、`UCheckbox`、`USlideover`、`UTabs`（详情页分区）。状态控件选择规则：**可逆且后果轻 → `USwitch` 就地切换（先弹确认）；后果重或级联 → `UBadge` 展示，进表单修改**。

## 11. 测试策略（vitest，`npm run test`）

- `useListUrlState`：默认值不写 query；数组/布尔编解码往返；非法 `pageSize` 回落；`apply` 非分页字段时 `page` 复位；相同 query 不调用 `router.replace`（`vi.fn` 断言次数）；`highlight` 不触发复位。
- `ResourcePagination`：`pageSize` 变化 emit 且 `page` 复位 1；跳转越界钳制；旧 `itemsPerPage=0` 调用仍渲染计数条。
- `ResourceTable`：`selectable` 全选/半选；`getSubRows` 下 `row.depth` 缩进；`#loading` 缺省骨架行数 = `skeletonRows`；操作列 `id !== 'actions'` 时 dev 警告。
- `useEditorFeedback`：`afterSave` push 带 `highlight`，toast 文案含对象名；`afterDelete` 有历史时 `back`、无历史时 push 列表。
- `useDirtyGuard`：脏时 `onBeforeRouteLeave` 返回 false 并打开确认；`markClean` 后放行。
- 现有 `useDepartmentEditor.test.ts` 等保持通过。

## 12. 目标形态 ASCII 草图（实现后长这样）

### A. 各列表页共用骨架：筛选卡 + 列表卡 + 分页（固定高，整页不滚动）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  顶栏（路由 / 会话，唯一固定区域，不随页面滚动）                                     │
└──────────────────────────────────────────────────────────────────────────────┘
  页面区 为 100vh-顶栏 高度，flex-col，gap 16px，padding 16px
┌─ 筛选条件 ────────────────────────────────────────────────────────── [恢复 ▾] ─┐
│ 用户名称 [____________]  用户昵称 [____________]  手机号码 [____________]        │
│ 状态     [用户状态    ▾]  创建时间 [开始日期] ~ [结束日期]        [搜索] [重置]   │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ 用户列表  ·  共 9 条记录，支持部门筛选、状态切换、导入导出和角色分配 ──────────────┐
│ [+ 新增] [修改] [删除] [解锁] [更多 ▾]        ⇄刷新  ⚙列设置   ← 工具栏          │
│ ┌────┬──────────┬────────┬────────┬──────────┬───────┬────────────┬────────┐ │
│ │ ☐  │ 用户名称   │ 用户昵称 │ 部门    │ 手机号码  │ 状态   │ 创建时间     │ 操作    │ │
│ ├────┼──────────┼────────┼────────┼──────────┼───────┼────────────┼────────┤ │
│ │ ☐  │ admin    │ 疯狂的狮子Li │ 研发部门 │ 1588…   │ ●开启  │ 2026-07-30 │ ✎ 🗑 ⇄ │ │ ← 可滚动的行区
│ │ ☑  │ test1    │ 本部门   │ 市场部门 │ 1500…   │ ●开启  │ 2026-07-30 │ ✎ 🗑 ⇄ │ │
│ └────┴──────────┴────────┴────────┴──────────┴───────┴────────────┴────────┘ │
│                                          共 9 条  [10条/页 ▾]   ‹ 1 ›  前往 [ ] 页 │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 筛选卡可折叠（点头部 [恢复/收起 ▾] 整体收成一行标题）；3 列栅格，标签右对齐 ~80px，控件 ~230px；≤3 条件时退化为表格标题栏里的工具条。
- 工具栏：`新增` 主色实心；`修改/删除/解锁` 描边 + 语义色，未勾选时置灰且 tooltip 写明"请先勾选一行"；低频项收进 `更多 ▾`；最右 `刷新` 和 `列设置` 是表格自身的设置，用竖线隔开。
- 表格：表头 `sticky`；勾选列 + 操作列最右 `pinned`；行高亮（`?highlight=<id>`）持续 2s 后清 query。
- 分页固定在列表卡底部，不属于页面级滚动。
- 空态 = 正文居中插画 + "暂无数据"，与"筛选无结果"文案区分。

### B. organization·people：左树右表（部门作范围导航）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  顶栏                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ 部门结构 ─ ‹ ─┐ ┌─ 筛选条件 ──────────────────────────────────── [恢复 ▾] ─────┐
│ [🔍 请输入部门名称]│ │ 用户名称 [____]  用户昵称 [____]  手机号码 [____]           │
│ ▾ XXX科技        │ │ 状态 [状态▾]  创建时间 [日期]~[日期]        [搜索] [重置]   │
│   ▸ 防锈服       │ └──────────────────────────────────────────────────────────┘
│   ▸ 分销部门     │ ┌─ 用户列表  ·  共 9 条… ────────────────────────────────────┐
│   ▾ 深圳总公司    │ │ [+ 新增][修改][删除][解锁][更多▾]           ⇄刷新 ⚙列设置    │
│     ▸ 研发部门    │ │ ☐│用户名称 │... │ 部门  │状态● │创建时间 │✎ 🗑 ⇄           │
│     ▾ 冰雪世界    │ │ ☑│admin   │... │研发部门│●开启 │…       │✎ 🗑 ⇄           │  ← 行区滚动
│   ▸ 长沙分公司    │ │ ‹滚动…›                                 │                 │
│                  │ │                  分页：共N条  页大小  页码                  │
│  本地过滤树       │ └──────────────────────────────────────────────────────────┘
│  ≤320px 固定      │  右侧 = query 对象 {departmentId,keyword,status,dateRange,page,pageSize}
│  可折叠为图标条    │  点树节点→departmentId 且 page 归 1；重置→清表单+清树选中
└─────────────────┘  <1200px 窄屏：左树收成抽屉或退化为筛选区的部门级联
```

交互要点：树是「范围」不是条件，所以它独立于右侧筛选卡；选中即"看该部门及其子部门"。

### C. organization·departments：树形表格（部门是被管理的对象本身）

```
┌─ 部门列表  ·  支持树状层级维护、负责人指定和部门状态管理 ──────────── [恢复 ▾] ─┐
│ [+ 新增]  [展开 · 折叠]      ⇄刷新                ← 无勾选/无批量，无分页       │
│ ┌────────────┬──────────┬──────┬────────┬────────────┬─────────────┐ │
│ │ 部门名称    │ 类别编码  │ 排序  │ 状态    │ 创建时间    │ 操作         │ │
│ ├────────────┼──────────┼──────┼────────┼────────────┼─────────────┤ │
│ │ ▾ XXX科技  │ __       │ 0    │ ●正常  │ 2026-07-30 │ ✎ ＋ 🗑       │ │ ← ＋ = 新增子部门
│ │   ▸ 防锈服 │          │ 0    │ ●正常  │ …         │ ✎ ＋ 🗑       │ │    跳 create?parent=<id>
│ │   ▾ 深圳总公司│        │ 1    │ ●正常  │ …         │ ✎ ＋ 🗑       │ │
│ │     ▸ 研发部门│        │ 1    │ ●正常  │ …         │ ✎ ＋ 🗑       │ │ ← 名称按 row.depth 缩进
│ │     ▸ 冰雪世界│        │ 0    │ ●正常  │ …         │ ✎ ＋ 🗑       │ │    有子节点才画 ▸/▾
│ │   ▸ 长沙分公司│        │ 2    │ ●正常  │ …         │ ✎ ＋ 🗑       │ │
│ └────────────┴──────────┴──────┴────────┴────────────┴─────────────┘ │
│  状态=UBadge（后果重，进表单改）；删除按程序判断（有子部门/有人则拦截并显示原因）       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### D. chat 工作台：会话切换 + 停止生成 + 会话侧栏元信息

```
┌──────────────────────────────────────────────────────────────────────────────┐
### D. skills：标准 CRUD 列表页 + 详情路由

```
┌─ 技能列表  ·  共 N 条，导入技能包或筛选已有技能 ──────────────── [恢复 ▾] ─┐
│ [⬆ 上传技能包]                            ⇄刷新  ⚙列设置   ← 主按钮唯一    │
│ 名称 [________]  类型 [全部 ▾]                        [搜索] [重置]     │
│ ☐ │名称(链接) │ 描述     │ 版本   │ ⏱ 更新时间 │ ✎ 🗑 …│  ← 操作列右固定  │
│ ── 空态：尚未上传技能包（CTA 上传）/ 无匹配结果（清除筛选）──         │
│                共 N 条  [10条/页 ▾]   ‹ 1 ›  前往 [ ] 页    │
└──────────────────────────────────────────────────────────────────────┘
  点击名称 → /skills/:name 详情路由页（头部 编辑 / 删除；分区 UTabs：概览/文件/元数据）
  编辑页：字段表单 + onBeforeRouteLeave 脏检查 + 保存成功回列表 ?highlight=<id>
```

（p3 的子任务 PRD 有同图的完整版与 memories 图。）

> 注：chat 工作台已按用户要求移出本期，不再绘制其目标形态；问题清单存于 `prd.md`"后续事项"。
