# 阶段 2：build 模块——agents / workflows / plans 列表与编辑闭环

## 背景与目标

审计结论：build 模块的 CRUD 骨架在全站里最完整——新建/编辑复用同一 Builder、名称必填标记、`saving` 三层防重（builder:300 / editor:95-96 / store:144）、Esc 与 Cmd/Ctrl+S 快捷键（workflow builder:139-145,156-164）、删除弹窗带对象名（workflow detail:140-142、plan detail:146）、复制走 `?duplicate`（create/index.vue:12-21）、无原生 `confirm()`、无整页遮罩，这些都已达标。

缺口集中在三条线：
1. **列表层没有接共享基础**：三个 manager hook（useAgentManager / useWorkflowManager / useOrchestrationPlanManager）都不引入 `useRoute/useRouter`，筛选、搜索、分页只存内存；`:items-per-page="0"` 只是计数器；操作列 4~5 个图标平铺、无 select 列（多选与 `UDropdownMenu`「更多」模式只在 `platform-resource/Page.vue:26,283` 与 `build-resource-table/index.vue:27-66` + `build-resource-manager:86-92` 里有）。
2. **编辑闭环断在两头**：编辑页 404 时只写 error 字符串、Builder 仍渲染空草稿（useWorkflowEditor.ts:60、usePlanEditor.ts:60-61）；保存成功直接 `goToDetail`、无 toast、不回列表、不高亮（useWorkflowEditor.ts:110-113、usePlanEditor.ts:127,160）；三个 create 页无路由级脏检查；校验失败不聚焦首错字段。
3. **一处真 bug + 若干不一致**：WorkflowBuilder 底部「取消」按钮绕过脏检查（已核实，见 B-5）；plans 启停非乐观更新而 workflows 是；plan edit 未守卫 NaN；workflow edit 页两个 UModal 可叠放。

本阶段目标：三个资源的列表页统一套用阶段 0 的共享布局与 URL 状态，编辑/新建/详情页补齐反馈闭环与守卫，把三个资源的交互行为拉平到同一套约定。

## 范围

- `src/routes/platform-resource/{agents,workflows,plans}/{list,create,edit,detail}/`
- `src/routes/platform-resource/workflows/builder/index.vue`、`components/plan-builder/`、`components/agent-builder/`（仅改关闭/校验/保存反馈相关逻辑）
- `src/hooks/useAgentManager.ts`、`useWorkflowManager.ts`、`useOrchestrationPlanManager.ts`、`useAgentEditor.ts`、`useWorkflowEditor.ts`、`usePlanEditor.ts`
- `src/stores/agents.ts`、`workflows.ts`、`orchestrationPlans.ts`（仅分页/失效规则）

## 非目标

- 不重做 Builder 的成员勾选、拖拽排序、路由/循环配置 UI
- 不改后端接口；若后端不支持某筛选字段，前端过滤并在 PRD 里标注
- 不做批量导入导出
- 不改 chat 工作台对 agent / plan 的引用方式

## 依赖与前置

依赖阶段 0（`09-08-p0-list-foundation`）交付的：`useListUrlState`、`FilterPanel` / `ListCard`、升级后的 `ResourceTable`（select 列、操作列右固定、`#loading` 骨架屏、tooltip 图标、`highlightId`）、真分页版 `ResourcePagination`、`RelativeTime`、反馈闭环工具（toast + `?highlight=`）、`focusFirstError`、`useUnsavedGuard`、`usePermissions`。阶段 0 未归档前本阶段不 `start`。

## 需求清单

### A. 三个列表页统一套用共享布局

- **A-1 页面骨架**：agents / workflows / plans 三个 `list/index.vue` 改为「FilterPanel + ListCard（工具栏 / 表格 / 分页）」纵向三段，外层固定高、表格内部滚动。现有顶部统计卡（agents list:108 的已启用计数等）保留在 ListCard 标题右侧的说明文案或折叠到工具栏，不再单独占一屏。
- **A-2 FilterPanel 字段**：关键字（名称 / ID / 描述；agents 额外含模型名，沿用 agents list:115 的匹配范围）、启用状态（全部 / 已启用 / 已停用，替换 agents list:116 的 `UTabs` 形态）、类型或模式（workflows / plans 为编排模式 sequential / parallel / routing / loop；agents 为模型）、创建时间区间。≤3 个条件时允许退化为工具栏内联形态，由阶段 0 组件按字段数自动决定。
- **A-3 URL 状态**：三个 manager hook 注入 `useListUrlState`，`{ keyword, enabled, mode, dateRange, page, pageSize }` 全部进 `route.query`；筛选变更时 `page` 归 1；重置按钮清空全部并回第 1 页。
- **A-4 工具栏**：新建（唯一实心主色）｜依赖选中的 启用 / 停用 / 删除（未勾选置灰，tooltip「请先勾选至少一行」）｜更多（复制、刷新）。批量启停 / 删除复用 D-3 的 store 方法，逐条串行并汇总结果 toast。
- **A-5 表格列**：
  - select 列；名称列为详情链接；状态 `UBadge`（沿用现有 `published / disabled` 语义色）
  - 模式列（workflows / plans）或模型列（agents）；成员 / 能力计数列
  - 创建时间改 `RelativeTime`（hover 显示绝对时间，替换 workflows list:37-40 的 `formatTime`）
  - 操作列右侧固定，只保留「编辑」一个直出按钮，其余（复制、启停、删除）进 `UDropdownMenu`，参照 `build-resource-table/index.vue:119-130`
  - 每个图标按钮必须带 `UTooltip`，由阶段 0 的 `ResourceTable` 统一保证
- **A-6 分页策略**：本阶段 **保留全量拉取 + 前端筛选**，但分页改为真分页（`ResourcePagination` 接 `page / pageSize`，前端切片）。理由：三类资源量级为几十到几百，后端 `limit: 100` 循环（stores/workflows.ts:40-50、orchestrationPlans.ts:43-53）在此量级下成本可控，且 chat 工作台等处依赖 store 里的全量 items 做选择器；改服务端分页放到 E-2 作为可选项。
- **A-7 加载与空态**：`ResourceTable` 传 `loading` 走骨架屏；空态区分「从未创建」（引导新建）与「筛选无结果」（清除筛选），替换 agents list:139 的单一文案。

### B. 编辑 / 新建页闭环

- **B-1 编辑页 404 空态**：`useWorkflowEditor.openEdit` / `usePlanEditor.openEdit` / `useAgentEditor.openEdit` 在详情为 `null` 时置 `notFound = true`，edit 页 `v-if="editor.notFound"` 渲染与详情页一致的 `UAlert`（复用 workflow detail:96 / plan detail:102 的文案与「返回列表」动作），不再渲染空草稿 Builder。
- **B-2 保存成功反馈**：三个 editor 的 `saveDraft` / `publish` 成功后：`useToast` 提示「已保存 <名称>」，`router.push` 回列表并带 `?highlight=<id>`，列表高亮该行 2s 后清 query。新建与编辑一致。若产品上仍需停留详情，则改为「回列表」为默认、详情页作为高亮行的点击目标。
- **B-3 create 页脏检查**：三个 `create/index.vue` 接 `useUnsavedGuard(dirty)`，`dirty` 基于 editor 草稿快照；`?duplicate` 加载完成后重置快照（避免刚复制就判脏）。同时补 `beforeunload`。
- **B-4 双守卫合一**：edit 页当前有「Builder 内部 `closeConfirmOpen`」+「路由级 `confirmLeave`」两套（workflow edit/index.vue:19-57,83-86），Builder 的 `savedSnapshot` 又随 `props` 引用重置（plan-builder:165-167）。改为：
  - Builder 不再自持脏快照，返回键 / Esc / 取消都只 `emit('close')`
  - 脏判断与确认弹窗统一由页面层的 `useUnsavedGuard` 承担，路由离开走同一个入口
  - 快照在 `openEdit` 完成、`?duplicate` 加载完成、保存成功三处重置
  - 从结构上消除两个 `UModal` 叠放的可能
- **B-5 WorkflowBuilder「取消」bug**：`workflows/builder/index.vue:134-136` 的 `onCancel` 直接 `emit('close')`，跳过 `onCloseRequest` 的脏检查，与顶部返回键（:170）和 Esc（:140）行为不一致——有未保存修改时点「取消」会直接丢失。修复：`onCancel` 改为调用 `onCloseRequest()`；B-4 落地后该函数随之并入统一入口。agent-builder 与 plan-builder 没有独立 `onCancel`，无同类问题。
- **B-6 plan edit NaN 守卫**：`plans/edit/index.vue:13-16` 的 `planId` 为 `NaN` 时仍发 `getPlanDetail(NaN)`；对齐详情页 :81 的守卫，非法 id 直接走 B-1 的 404 空态。三个 edit 页统一。
- **B-7 校验失败行为**：`onSave` 在 `issues.length` 时调用 `focusFirstError`（按 issue 的 `section` 切到对应分区并滚动到首个问题字段），替换 workflow builder:128-132 / plan-builder:140-150 只置 `saveAttempted` 的做法；AgentBuilder 的 `onSave` 切 `activeSection` 后同样滚动 + 聚焦。保存按钮保持可点（不因校验禁用），错误横幅与底部清单保留。
- **B-8 PlanBuilder 字段级错误**：`plan-builder:196` 的 `UForm` 无 `:validate`，`required` 仅视觉（:197,295,298,311-312）。把 `validatePlan`（useOrchestrationPlanManager.ts:92-124）包装为 `UForm :validate` 返回 `{ name, message }[]`，让错误落到对应 `UFormField` 下方；顶部横幅只保留「共 N 处问题」摘要。WorkflowBuilder 同法处理名称 / 成员数。
- **B-9 identity panel 必填标记**：agent-builder 的 identity panel 名称等必填字段补 `UFormField required`，与 workflow / plan 名称一致。

### C. 详情页

- **C-1 分区改 Tab**：workflow detail:107-131、plan detail:113-137、agent detail:82-88 的多个 `<section>` 改为 `UTabs`：「基础信息」（描述 / 模式 / 状态）、「成员」（agents 为「绑定能力 + 系统提示词」）、「服务端信息」。Tab 切换只切视图，不重拉详情；当前 Tab 写入 `route.query.tab` 便于分享。
- **C-2 删除后回退**：`confirmDelete` 成功后若 `history.state.back` 存在则 `router.back()`，否则 `goToList()`；替换 detail 页固定 `goToList()`（workflow detail:60-72、plan detail:73）。列表页删除同理不跳转、只刷新当前页。
- **C-3 时间显示**：创建 / 更新时间改 `RelativeTime`（替换 workflows detail:38-41、plans detail:44-47 的 `formatTime`）。
- **C-4 启停开关**：详情页 **不补** 就地开关。理由：停用 workflow / plan 会让已绑定会话失效（plan detail:146 文案已说明），属后果重操作；保留列表页开关（先确认后切换）与编辑页表单两条路径。agent 同理。

### D. 列表交互一致性

- **D-1 plans 启停改乐观更新**：`useOrchestrationPlanManager.toggleEnabled`（:197-224）当前等接口返回再改；改为与 `useWorkflowManager.ts:215-239` 一致：先翻转本地 `is_enabled`，失败时回滚该行并 toast 错误。三个资源统一为「先确认弹窗 → 乐观翻转 → 失败回滚」。
- **D-2 agents 筛选补齐**：agents 目前只有启用状态一个筛选（agents list:116），按 A-2 补模型、创建时间区间；搜索范围保持名称 / ID / 描述 / 模型。
- **D-3 批量操作走同一 store 方法**：`saveAgent` / `saveWorkflow` / `savePlan` 与 `remove*` 不新增批量接口；批量在 manager 层串行调用并汇总（成功 N / 失败 M），失败项保留选中态便于重试。
- **D-4 删除弹窗**：列表页与详情页删除弹窗共用同一文案模板（含对象名 + 后果说明），plans 的「已绑定的会话需要重新选择编排」文案沿用。

### E. store

- **E-1 保持现有语义**：`upsert*`（新建 `unshift`、编辑原位替换、`total = max(total, items.length)`）与 `remove*`（filter + `total - 1`）不变；保存失败重拉列表回滚的逻辑（stores/workflows.ts:150-165）保留。
- **E-2 服务端分页（可选）**：若阶段 0 已在 people / departments 上做出 `loadPage({ limit, offset, keyword, is_enabled })` 样板，则 build 三个 store 补同款方法但 **默认不启用**；启用条件为单资源超过 500 条。失效规则：`upsert` / `remove` 后调用 `invalidate*ListRequests()` 并重拉当前页；切换工作区清空全部页缓存。
- **E-3 高亮参数消费**：store 不感知 `highlight`；由列表页读取 `route.query.highlight` 并在数据就绪后滚动到该行。

## 建议实施顺序

1. **B-5 + B-6** 先修（两处独立小改，可单独提交，作为本阶段的第一个 commit）。
2. **A-1 ~ A-7** 以 workflows 列表为样板先做一个，通过验收后再复制到 plans、agents，避免三处同时改导致共享组件 API 反复变动。
3. **B-1 / B-2 / B-3 / B-4** 按 editor hook 逐个资源落地：先 workflows（有完整叶子报告、最熟），再 plans，最后 agents。
4. **B-7 / B-8 / B-9** 校验与聚焦，依赖 B-4 之后 Builder 的职责已经收窄。
5. **C-1 ~ C-4** 详情页，与列表层无耦合，可与第 3 步并行。
6. **D-1 ~ D-4、E-1 ~ E-3** 收尾，跑通批量操作与高亮消费后做整体回归。

每一步完成后跑 `npm run lint && npm test`；第 2、3 步各产出一个 commit，不 push。

## 验收标准

- [ ] 三个列表页在筛选 / 分页后刷新浏览器，条件与页码不丢；后退可回到上一组条件
- [ ] 三个列表页工具栏在未勾选时禁用批量按钮并显示 tooltip；勾选 2 行执行批量停用后两行状态同步、toast 汇总结果
- [ ] 三个列表页 `loading` 期间显示骨架屏；无数据时显示「新建」引导，筛选无结果时显示「清除筛选」
- [ ] 访问 `/platform/build/workflows/999999/edit`、`/plans/abc/edit`、`/agents/0/edit` 均显示「未找到 + 返回列表」，不渲染空 Builder
- [ ] 新建 / 编辑保存成功后：出现 toast，回到列表且对应行高亮约 2s，URL 中的 `highlight` 随后被清除
- [ ] 在三个 create 页修改任意字段后点侧栏其它菜单 / 浏览器后退 / 刷新，均弹出离开确认
- [ ] WorkflowBuilder 有未保存修改时点击底部「取消」，弹出「放弃未保存的修改？」而非直接离开
- [ ] edit 页任意时刻只存在一个确认弹窗（返回键、Esc、取消、路由离开走同一弹窗）
- [ ] 校验失败时页面滚动并聚焦到首个错误字段，PlanBuilder 的错误显示在对应字段下方
- [ ] 详情页三个 Tab 切换不触发网络请求；`?tab=members` 直达成员 Tab
- [ ] 从列表进入详情后删除，回到列表且保留进入前的筛选与页码；从直链进入详情后删除，回到列表第 1 页
- [ ] plans 列表启停切换即时生效；断网时切换回滚并提示错误
- [ ] `npm run lint`、`vue-tsc -b`（`npm run build` 前半段）、`npm test` 全绿；新增 vitest 覆盖 `toggleEnabled` 乐观回滚与 editor `notFound` 分支

## 风险与注意事项

- **双守卫合一是本阶段最容易出回归的改动**：Builder 去掉自持快照后，`?duplicate` 加载、`openEdit` 完成、保存成功三处都必须重置页面层快照，否则会误判脏或漏判脏；改完用 B-3 / B-4 的验收项逐一手测。
- `UTabs` 若用 `v-model` 绑定 `route.query.tab`，注意 `router.replace` 而非 `push`，避免污染后退栈。
- `ResourceTable` 的操作列固定与 `getSubRows` 以 `node_modules/@nuxt/ui/dist/runtime/components/Table.vue` 实际 props 为准（已确认存在 `getSubRows`、`expandedOptions`），不要凭记忆写 API。
- 批量操作串行调用时注意 `saving` 三层防重会拒绝并发（store:144 返回「正在保存」）；串行 `await` 即可，不要 `Promise.all`。
- 保留 `build-resource-table` / `build-resource-manager` 现有的多选与 `UDropdownMenu` 模式，本阶段是把三个列表页向它靠拢，而不是替换它。
- 保存后「回列表」改变了现有「跳详情」的用户路径，需在阶段 0 的反馈闭环约定里确认后再落地，避免与 organization 模块不一致。

## 涉及文件

- `src/routes/platform-resource/agents/{list,create,edit,detail}/index.vue`
- `src/routes/platform-resource/workflows/{list,create,edit,detail}/index.vue`、`workflows/builder/index.vue`
- `src/routes/platform-resource/plans/{list,create,edit,detail}/index.vue`
- `src/routes/platform-resource/components/plan-builder/index.vue`、`components/agent-builder/index.vue`、`components/agent-identity-panel/index.vue`
- `src/hooks/useAgentManager.ts`、`useWorkflowManager.ts`、`useOrchestrationPlanManager.ts`
- `src/hooks/useAgentEditor.ts`、`useWorkflowEditor.ts`、`usePlanEditor.ts`（及对应 `*.test.ts`）
- `src/stores/agents.ts`、`src/stores/workflows.ts`、`src/stores/orchestrationPlans.ts`
- `src/components/resource/**`（只消费阶段 0 产物，不在本阶段修改）

## 目标形态 ASCII 草图

三类列表（agents / workflows / plans）统一套用共享骨架（同 design.md §13-A / p0 的图），字段与工具栏略有差异：

```
┌─ Agent 列表  ·  共 12 条，支持启用状态与模型筛选 ──────────────── [恢复 ▾] ─┐
│ [+ 新建 Agent] [启用][停用][删除][更多▾]              ⇄刷新  ⚙列设置   │
│ ☐ │名称(链接) │ 模型      │ 启用USwitch │ ⏱更新 │ ✎ 🗑 …│   ← 操作列右固定+tooltip
│ ── 空态：尚未创建 Agent（CTA 新建）──                          │
│                   分页：共N条 [每页▾] ‹ 1 ›  前往[ ]页     │
└─────────────────────────────────────────────────────────────┘
  编辑页 404 → 复用详情页「未找到」空态 + [返回列表]；保存成功 → toast + 回列表 ?highlight=<id>
  create 页接 onBeforeRouteLeave 脏检查；详情页 section → UTabs（基础信息 / 成员 / 服务端信息）
```

`workflows` / `plans` 两张列表与其字段差异：`plans` 的启用可在行内 `USwitch`（乐观 + 失败回滚，与 workflows 一致）；`workflows` 有模式（native/parallel）与类型筛选；详情均用 UTabs，删除后回退上一页。
