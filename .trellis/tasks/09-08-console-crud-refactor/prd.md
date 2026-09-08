# 控制台 CRUD 页面改造（对照理想清单 + 若依布局）

## 背景

2026-09-08 对全站页面做了一次对照"理想 CRUD 页面清单"的只读审计（结论见 `research/audit-findings.md`）。一句话结论：**CRUD 骨架相当完整**（无原生 `confirm()`、确认弹窗普遍带对象名、编辑页有脏检查、提交有 loading 防重、新建/编辑复用同一表单组件），**真正的缺口集中在四条线**：

1. **URL 即状态全量缺失**：所有列表页的搜索词、筛选、分页只存 Pinia，刷新/后退/分享全丢。
2. **保存成功后不回列表、无反馈、不高亮**：编辑 hook 一律 `goToDetail`，没有 toast，列表看不到新行。
3. **权限可见性未落地**：全站无 `usePermissions`/`can()`，所有编辑/删除/启停按钮对任何登录用户一律可点。

以若依（RuoYi-Vue-Plus）的"用户管理 / 部门管理"两页作为布局参照（拆解见 `research/ruoyi-layout-reference.md`）：它给出了成熟后台的两种标准形态——**左树右表**（部门作为范围选择器 + 筛选卡 + 列表卡 + 分页）与**树形表格**（部门作为被管理对象，带"新增子级"与"展开/折叠"）。本任务借用其**结构与交互语义**，不复制其视觉。

## 目标

- 修复审计列出的 10 条共性问题与各模块专项差距（**chat 工作台除外**，见"范围"），达到 `## 跨子任务验收标准`。
- 抽出一层可复用的列表页基础设施（`useListUrlState`、`FilterPanel`、`ListCard`、升级后的 `ResourceTable`/`ResourcePagination`），让 platform 下所有资源列表统一为「筛选卡 + 列表卡 + 分页」。
- organization 模块落地：people 页左树右表、departments 页树形表格、groups 页套用标准列表。
- skills 页改为标准 CRUD（列表 + 详情路由 `/skills/:name` + 上传新建 + 编辑 + 删除）。

## 范围

- **只改造 platform 资源列表、memories、skills 三类 CRUD 页**。
- **不包含 chat 工作台**：其中确有一处真 bug（`src/stores/console.ts:508-521` 切会话不中止旧流）与多处可信度问题（`app-runtime-panel` 假操作、`seedConversation` 掩盖失败），但用户已明确本期不动 chat 工作台，故整体移出本任务，单独记录（见"后续事项"）。

## 非目标

- **不改后端接口**：只使用现有 `limit/offset/keyword/is_enabled/is_active` 参数；缺的能力前端过渡。
- **不做若依 tag-view 多页签**：本产品是聊天工作台形态，侧栏 + 面包屑足够。
- **不做视觉重绘**：沿用现有 CSS Modules 与 Nuxt UI 主题，只改布局结构与交互。
- **不引入新的 UI 库**：全部使用 `@nuxt/ui` 4.10 已有组件（`UTree/UTable/UPagination/USwitch/UBadge/UCollapsible/UInputDate/UTooltip/UDropdownMenu` 均已确认存在于 `node_modules`）。
- **不改 chat 工作台**（用户明确排除，见"范围"）。

## 总体需求集

### A. 共性问题（跨模块，编号沿用审计报告）

| # | 名称 | 严重度 | 证据摘要 | 统一改法 |
|---|---|---|---|---|
| 1 | URL 即状态缺失 | 关键 | `src/routes/memories/components/memory-list-panel/index.vue:81-84,129-134`、`src/stores/skills.ts:12`、`src/hooks/useAgentManager.ts` / `useWorkflowManager.ts` / `useOrchestrationPlanManager.ts` 无 `useRoute`、`src/hooks/useDepartmentManager.ts:10-11`、`useGroupManager.ts:15-16`、`usePeopleManager.ts:42-43` | 新增 `useListUrlState(filters)` 双向绑定 `route.query`，各 manager hook 接入 |
| 2 | 保存后不回列表/无 toast/不高亮 | 关键 | `src/hooks/useWorkflowEditor.ts:110-113`、`usePlanEditor.ts:127,160`、`useMemoryEditor.ts:172`、`useDepartmentEditor.ts:157-160`、`useGroupEditor.ts:187-190` | 编辑 hook 统一：成功 toast → `router.push` 回列表带 `?highlight=<id>` → 列表高亮 2s |
| 3 | 权限可见性未落地 | 高 | 全站 grep `permission/can(/usePermissions` 仅命中 `role="radio"`；仅 `usePeopleManager.ts:87-89,140-143` 有"不能删自己" | 新增 `usePermissions` 能力表，按钮按 `can(action, resource)` 隐藏/禁用并给原因 |
| 4 | 分页只是计数器 | 高 | 各列表 `:items-per-page="0"`（`departments/list:116`、`groups:117`、`people:118`、build 三列表同）；`src/components/resource/pagination/index.vue:24-26`；people 200 条截断 `usePeopleManager.ts:16-17,60,80-85` | `ResourcePagination` 真分页四件套；store 改服务端 limit/offset |
| 5 | 多选/批量未实现 | 高 | 各列表列定义无 select 列；仅 `build-resource-table/index.vue:27-66` 有 | `ResourceTable` 提供 `selectable` + `v-model:selected`，工具栏批量按钮按选中数启用 |
| 6 | 加载无骨架屏 | 中 | 列表未提供 `#loading` 插槽；`memory-list-panel:147`、`skill-list-panel:93` 用"加载中…"文字 | `ResourceTable` 内置 `#loading` 骨架（`USkeleton` × 每页行数） |
| 7 | 时间绝对无相对 + hover | 中 | `workflows/detail:38-41`、`plans/detail:44-47`、`departments/detail:42-46`、`memory-list-panel:51-56,166` | 新增 `TimeCell`：相对时间 + `UTooltip` 绝对时间 |
| 8 | 操作列未固定右侧且图标平铺 | 中 | `src/components/resource/table/index.vue:50` 仅 `sticky="header"`；`groups/list:113` 4 图标平铺 | 操作列 `pin: right`；≤3 个图标各配 `UTooltip`，更多收进 `UDropdownMenu` |
| 9 | 校验不聚焦首错字段 | 中 | 全库无 `scrollIntoView/.focus()`；`workflow builder:128-132`、`plan-builder:140-150` 仅置 `saveAttempted` | 校验失败后 `nextTick` 聚焦首错 `UFormField`，Builder 同时切分区并 `scrollIntoView` |
| 10 | 新建页缺路由级脏检查 | 低 | build 三个 `create` 无 `onBeforeRouteLeave`（edit 有：`workflows/edit/index.vue:19-57`）；`plan-builder:165-167` 快照随 props 重置；无 `beforeunload` | 抽 `useDirtyGuard(snapshotFn)`，create/edit 共用，含 `beforeunload` |

路径前缀说明：表中 `departments/list` 等缩写指 `src/routes/platform-resource/organization/<资源>/list/index.vue`；`workflows/detail`、`plans/edit` 指 `src/routes/platform-resource/<资源>/<页面>/index.vue`；`plan-builder`、`build-resource-table` 在 `src/routes/platform-resource/components/` 下。

### B. 模块专项

**build（agents / workflows / plans）**
- 编辑页 404 无"未找到"空态：`src/hooks/useWorkflowEditor.ts:60`、`usePlanEditor.ts:60-61` 只写 error 字符串，Builder 仍渲染空草稿（详情页已有空态可复用：`workflows/detail:96`、`plans/detail:102`）。
- 删除后不回退：`useAgentManager.ts:72-88`、`useOrchestrationPlanManager.ts:121-137`、`src/stores/workflows.ts:178-183`。
- 详情页用 `section` 堆叠而非 Tab（`workflows/detail:107-131`、`plans/detail:113-137`）。
- store 以 `limit:100` 循环拉全量再前端过滤（`stores/workflows.ts:40-50`、`stores/orchestrationPlans.ts:43-53`）。
- PlanBuilder `UForm` 无 `:schema`，`required` 仅视觉（`plan-builder:196-197,295,298,311-312`）；plan edit `planId` 为 NaN 不守卫（`plans/edit/index.vue:13-16`）；plans 启停非乐观更新（`useOrchestrationPlanManager.ts:197-224`）；agents 只有 enabled 一个筛选。
- WorkflowBuilder `onCancel` 绕过 `onCloseRequest`（疑似 bug，p2 核实）；AgentBuilder 保存失败切分区但不滚动/聚焦。

**organization（departments / groups / people）**
- 删除依赖拦截是静态文案（`departments/list:119-121`、`stores/departments.ts:169-179`；`groups/list:120-122`、`stores/groups.ts:163-169`），而详情页已拉到 `descendants/members`。
- people 目录 200 条硬截断；列表无时间列；长文本仅名称列 ellipsis。
- 目标形态：people = 左树右表（`UTree` 部门树 + 筛选卡 + 多选工具栏 + `USwitch` 状态 + 真分页）；departments = 树形表格（`UTable getSubRows`、行内"新增子部门"复用已有 `?parent=`：`departments/create/index.vue:18`、`UBadge` 状态、展开/折叠、不分页）；groups = 标准列表。

**memories / skills**
- memories：空状态不分"从未创建 / 筛选无结果"（`memory-list-panel:178-182`）；删除弹窗无对象名（`:188`、`detail:141`）；删除后不回退（`stores/memories.ts:191-206`）；长文本无 tooltip。
- skills：非标准 CRUD——`<ul>` 列表（`skill-list-panel:98-141`）、无搜索/筛选/分页/详情路由；页头无主按钮仅 `UFileUpload`；删除无对象名/无 `:loading`/失败静默（`stores/skills.ts:113-115` 空 `catch`）；删当前项不选相邻项（`stores/skills.ts:103-116`）。**本任务改为标准 CRUD**。

**chat 工作台（移出本期，见"后续事项"）**
- 已知问题记录在此备查，不在本期实现：切会话不中止旧流（`src/stores/console.ts:508-521`）；无停止生成入口（`console.ts:321,469,965`）；`AppRuntimePanel` 假操作（`app-runtime-panel/index.vue:52-53,65,129-138`）；`loadSessions` 失败被 `seedConversation` 掩盖（`App.vue:35`、`console.ts:1076-1108`）；流式错误无重试（`console.ts:885-896`）；会话列表 `count` 恒 0（`console.ts:85/527/837`）；删除会话弹窗无对象名（`session-sidebar:435-444`）；`openApp` 不写路由（`console.ts:599-616`）。

**profile / settings / login / register / apps**
- `src/http/index.ts:96-98` 只抛 `HTTP ${status}`，吞掉后端 message；登录/注册错误不聚焦字段（`login/Page.vue:99`、`register/Page.vue:129`）；注册无确认密码、无失焦校验（`register:20-31,86`）；`safeRedirect` 三份重复（`src/routes/index.ts:233-237` vs login/register 内联）。
- apps 只 `launchApp` 不 `openApp`（`apps/Page.vue:13-25`），`constants/seed.ts:4-23` mock 当真实数据，`AppTile` 无 enabled/permission。
- profile：`workspace-editor-modal:128-130,199`、`accept-modal:39,65` 无脏检查；`delete-modal:39-49` 后果文案笼统；错误载体不一致（`workspace-panel:65-68` toast+UAlert vs `member-panel:160-167` 仅 UAlert）。
- settings：`permissions.ts:39,66` 吞错只显示"请稍后重试"；`settings/Page.vue:161-171` 删规则无对象名；`password-panel:19-21` 仅 `length<6`；全库无 `validate-on`。
- `error-boundary` 只有整页 reload 无"返回首页"；`auth.ts:133-143` refresh 失败无重试。

## 子任务地图

| 阶段 | 目录 | 优先级 | 依赖 | 交付物 |
|---|---|---|---|---|
| p0 | `09-08-p0-list-foundation` | P0 | 无 | `useListUrlState`、`useDirtyGuard`、`usePermissions`、`useEditorFeedback`；`FilterPanel`、`ListCard`、`TimeCell`；`ResourceTable`（select 列 / 操作列固定 / 骨架屏 / 树表）与 `ResourcePagination`（真分页）升级；store 分页基类；groups 列表作为迁移样板 |
| p1 | `09-08-p1-organization-tree-table` | P1 | p0 归档 | people 左树右表、departments 树形表格、groups 标准列表；删除依赖拦截程序化；people 去 200 截断 |
| p2 | `09-08-p2-build-lists` | P1 | p0 归档 | agents/workflows/plans 列表套用共享层与 URL 状态；编辑页 404 空态、删除回退、详情 Tab、校验聚焦、新建页脏检查、NaN 守卫、乐观启停 |
| p3 | `09-08-p3-memories-skills` | P2 | p0 归档 | memories 空态分型/删除文案/回退/URL 状态/tooltip；skills 标准 CRUD 化（列表 + 详情路由 `/skills/:name` + 上传新建 + 编辑 + 删除 + 分页） |
| p5 | `09-08-p5-auth-profile-apps` | P2 | 无 | `authRequest` 错误透传与分场景文案、字段聚焦、确认密码、`safeRedirect` 复用、apps 接 `openApp` 与数据源标注、弹窗脏检查、删除后果文案、错误载体统一 |

（原 p4 `09-08-p4-chat-stream-fixes` 已按用户要求移出本期，任务保留但不再挂钩——见"后续事项"。）

## 执行顺序与并行建议

1. **p0 先开工**：共享层是 p1/p2/p3 的前置，未归档前禁止 p1/p2/p3 触碰 `src/components/resource/`。
2. **p0 与 p5 并行**：两者无共享文件。
3. **p0 归档后 p1 ∥ p2 ∥ p3**：单人顺序取 p1 → p2 → p3（p1 是若依形态的完整样板，p2 复用，p3 最轻）。
4. 每个子任务独立走 Plan → Execute → Finish；父任务在全部归档后做集成评审并勾选下方验收项。

## 后续事项（本期不做）

- **chat 工作台**：用户明确本期不动。已单独记录问题清单，后续若要处理，建议新建独立任务（可复用 `p4-chat-stream-fixes` 的内容），核心是先修 `console.ts:508-521` 的 `stopActiveStream`。
- **skills 接口化**：后端提供搜索 / 分页接口后，替换前端过滤 + 内存分页兜底（p3 B-9 已标注 TODO）。
- **spec 回写**（属于本期收尾，见 `implement.md`）。

## 跨子任务验收标准

- [ ] 全站 7 个列表页（agents/workflows/plans/departments/groups/people/memories）刷新后搜索词、筛选、页码、每页条数、树选中不丢；复制 URL 到新标签页得到同一视图。（skills 列表计入第 8 个。）
- [ ] 每类资源新建/编辑保存成功后：toast 含对象名 → 回到列表 → 目标行高亮约 2 秒 → URL 的 `highlight` 被清除。
- [ ] 每类资源删除成功后：回到列表或上一页，toast 含对象名，列表总数正确。
- [ ] 所有分页列表为真分页（总数 / 每页条数 / 页码 / 跳转），people 不再 200 条截断；departments 树表不分页但有"N 个部门"计数与展开/折叠。
- [ ] 所有表格：加载态为骨架屏；操作列固定右侧；图标操作有 tooltip；≥4 个操作收进下拉。
- [ ] 全库 `grep -rnE "confirm\(|alert\(" src/` 无命中；无"点击只弹 toast 不执行"的假按钮。
- [ ] 权限判断只经过 `usePermissions`，people "不能删自己"等已知规则迁入其中。
- [ ] `npm run build`（`vue-tsc -b && vite build`）、`npm run lint`（`--max-warnings=0`）、`npm run test`（`vitest run`）全绿。
- [ ] `.trellis/spec/frontend/component-guidelines.md`、`state-management.md`、`quality-guidelines.md` 写入本次约定。

## 风险

- **过滤语义变窄**：服务端分页后前端全量过滤消失，`keyword` 只匹配接口支持的字段；各子任务 PRD 须列出接口支持矩阵，不支持的字段保留"当前页内筛选"并在 UI 标注。
- **`ResourceTable` 多处复用**：升级时插槽透传（`$slots` 循环）必须兼容旧调用；先补快照/渲染测试再改。
- **query 回环**：`useListUrlState` 写 `route.query` 会触发自身 `watch`，需要深比较去重，否则死循环。
- **并行冲突**：p1/p2/p3 同时改 `src/components/resource/` 会冲突，故设 p0 归档门禁；p5 不碰该目录。
- **skills 依赖细节**：后端暂无搜索 / 分页接口，需前端过滤 + 内存分页兜底并在代码标注接口化 TODO；详情改路由页后要避免 `route.params.name` 与 store 选中态双状态源。

## 参考资料

- `research/audit-findings.md` — 全站审计差距清单（文件:行号 + 改法）。
- `research/ruoyi-layout-reference.md` — 若依左树右表 / 树形表格拆解与 Nuxt UI 组件映射。
- `design.md` — 共享层技术设计（p0 编码依据）。
- `implement.md` — 阶段门禁、Trellis 操作、检查清单、提交与 spec 回写。
