# 控制台交互审计

Vue 3 控制台 · 增删改查页面审计

对照「理想增删改查页面」清单，逐页核对本项目的列表、表单、详情、删除与多处贯穿性原则，汇总差距与改法。覆盖 5 大模块、31 个页面。

## 全站优先整改（跨模块）

一句话结论：**CRUD 骨架已相当完整**——无原生 confirm、确认弹窗普遍带对象名、编辑页有脏检查、提交有 loading 防重。真正的差距集中在 **「URL 即状态」系统性缺失**、**「保存后不回列表不保留筛选不高亮」**、**工作台一个真 bug（切会话不中止旧流）**，以及**权限可见性**在所有页面都未落地。

1. **URL 即状态**——5 个列表模块全量缺失：筛选/分页/详情选择都不进 URL，刷新即丢、无法分享复现。
2. **保存成功后不回列表**——agents/workflows/plans/memories 保存后一律跳详情，丢筛选分页、无成功 toast、不高亮新行。
3. **权限可见性**——编辑/删除/启停按钮无权限字段判断，无权限用户照样可点、点了才失败。
4. **切会话不中止旧流**（工作台）——唯一会直接污染另一会话的脏状态 bug。

## 一、共性问题（跨模块）

同一问题在多个模块重复出现，优先在此统一修，比逐页修高效。

### [关键] URL 即状态完全缺失

- 清单：清单 #2 · #4 · #9 · #10
- 文件：memories/list-panel · skills 列表 · agents/workflows/plans/list · departments/groups/people/list · chat 会话侧栏

**现象：** 搜索词、状态筛选、分页、每页条数全部只存 Pinia store，过滤是前端全量。

**差距：** 刷新 / 浏览器后退 / 复制链接发给同事后，筛选与分页状态全部回到默认，无法复现同一视图。

**改法：** 在 manager hook 里注入 `useRoute/useRouter`，把条件双向绑定到 `route.query`（监听初值反初始化，watch 变化后 `router.replace`）。可抽一个 `useListUrlState(filters)` 组合函数统一处理。

### [关键] 保存成功后不回列表、无反馈、不高亮

- 清单：清单 #7 · #10
- 文件：agents / workflows / plans / memories 的 use*Editor.ts（如 useWorkflowEditor.ts:110-113、usePlanEditor.ts:127、useMemoryEditor.ts:172）

**现象：** 保存成功后 `goToDetail(savedId)` 直接跳详情页，editor 里没有 useToast，也不带 query 回列表。

**差距：** "关闭容器 + 短 toast + 保留筛选分页刷新 + 高亮新行"四项全缺；用户看不到"已保存"，也无法回到原来的列表位置。

**改法：** 成功后 `router.push({ name:'list', query: 当前筛选分页 })`；调 `toast.add({ title:'保存成功' })`；列表 store 加 `highlightId`，列表加载后定位并闪亮该行。

### [高] 权限可见性未落地

- 清单：清单 #10
- 文件：agents/workflows/plans · departments/groups/people · chat composer · skills

**现象：** 全站 grep `permission / can( / usePermissions / role`，仅命中 radio 语义与 CSS；所有编辑/删除/启停按钮对登录用户一律可点。

**差距：** 无权限用户点了才报错，而不是提前隐藏或禁用并说明原因。

**改法：** 在 auth store 增加 `hasPermission(action, resource)`，列表/详情/表单按钮按权限 `:disabled="!canDelete(item)"` + tooltip，或从后端透传权限字段。

### [高] 分页是"计数器"，不是真分页

- 清单：清单 #4
- 文件：agents/workflows/plans/list · departments/groups/people/list · memories 列表（:items-per-page="0"）

**现象：** `items-per-page="0"` → `ResourcePagination.isPaged()` 为 false，只渲染一行"当前显示 X/Y 条"，无页码、无每页条数调节。

**差距：** 数据靠 store 循环拉全量后前端过滤；people 模块用户目录还按 200 条硬截断（usePeopleManager.ts:16）。

**改法：** 传真实 `itemsPerPage` + 绑定 `page/onPage`，把分页状态接入 URL；人员走真分页参数而非截断。

### [高] 多选 / 批量操作未实现

- 清单：清单 #5
- 文件：agents/workflows/plans/list · departments/groups/people/list · memories/list-panel · skills 列表

**现象：** 列定义无 checkbox 列，也没有 `selectedIds`；批量多选只在 `build-resource-table`（plans 之外的 BuildResource）和 Page.vue 有。

**差距：** 无"已选 N 项 + 批量删除/启用"浮出栏，未勾选时不占空间的引导也没有。

**改法：** 在共用 `ResourceTable` 加可选 `v-model:row-selection` 与 `select` 列（参照 build-resource-table 的实现），各列表在工具栏渲染浮出批量栏，一处改、多页复用。

### [中] 加载态用文字空态，无骨架屏

- 清单：清单 #3
- 文件：departments/groups/people/list（#empty 分支）· memories 列表 · skills 列表"加载中…"

**现象：** 把 `:loading` 传给 ResourceTable（透传 UTable），但没提供 `#loading` 插槽；UTable 的 loading 分支只在有插槽时命中，否则落到 #empty，所以加载期间显示的是文字，不是骨架行。

**改法：** 列表页加 `#loading` 插槽，用 `USkeleton` 渲染单元格占位（create 页已有写法可参照）。

### [中] 时间列：绝对时间，无 relative + hover

- 清单：清单 #3
- 文件：agents/workflows/plans/detail · departments/groups/people 列表 · memories 列表（dateFormatter）· skills 详情

**现象：** 全部用 `toLocaleString` 输出绝对时间，无"x 分钟前"相对化，也无 tooltip 展示完整时间。

**差距：** 相对时间 + 悬停绝对时间均未实现。

**改法：** 新增 `formatRelative(iso)`，外层 `<UTooltip :text="absolute">` 包一层。

### [中] 操作列未固定右侧、操作过多平铺

- 清单：清单 #3
- 文件：departments/groups/people/list · agents/workflows/plans/list（资源列表列定义 + shared css .listPane overflow:auto）

**现象：** ResourceTable 只 `sticky="header"`，操作列未 `position:sticky; right:0`；横向滚动时操作列滚走。且列表用 4~5 个图标平铺（群组甚至 4 个：详情/编辑/加入退出/删除），无"更多"收纳。

**改法：** 给操作列 td/th 加 `position:sticky; right:0; background:面板色; z-index:1`；把低频项收敛进 `UDropdownMenu`，行内只留 1~2 个高频操作（参照 build-resource-table 的 br-desktop/mobile-actions）。

### [中] 表单校验不聚焦首个错误字段

- 清单：清单 #7
- 文件：agents/workflows/plans builder（onSave 只 saveAttempted）· departments/groups/people sub-form · memory-form · password-panel

**现象：** 错误在底部分组清单 + 顶部 UAlert，保存按钮不因校验失败禁用（这点正确），但 `scrollIntoView / .focus()` 全库无命中，提交失败不定位字段，用户要自己找。

**改法：** 提交后 `nextTick(()=>document.querySelector('[data-error]')?.scrollIntoView({block:'center'})/.focus())`，或依赖 UForm 的 `highlight` 特性。

### [低] 新建页缺路由级脏检查（编辑页才有）

- 清单：清单 #7
- 文件：agents/workflows/plans create（无 onBeforeRouteLeave）· memories create/edit 有 onBeforeRouteLeave · 但 build 各 builder 的 onCloseRequest 已覆盖关闭按钮与 Esc

**现象：** 编辑页有 `onBeforeRouteLeave`，新建页没有；新建页靠 Builder 内 props 快照做关闭确认，但 props 引用变化会重置快照，侧栏切换/浏览器后退时基本无脏保护。

**改法：** 给 create 页补同样的 `onBeforeRouteLeave` + 快照比对，与 edit 对齐。

## 二、build 模块（agents / workflows / plans）

三组资源结构与组织模块高度一致，因而是共性问题最集中的地方。下面只列本模块特有或更严重的差距。

### [高] 编辑页 404 无"未找到"空态

- 清单：清单 #7 · #9
- 文件：agents useAgentEditor · workflows useWorkflowEditor.ts:60 · plans usePlanEditor.ts:60-61

**现象：** `openEdit` 里 load 返回 null 时只写 `error.value = '...详情加载失败...'`，但 `loadingDetail` 已置 false，于是 Builder 仍以空草稿渲染，顶部只亮一个 UAlert；**没有**"方案不存在 + 返回列表"的空态页。

**差距：** 详情页有失败空态（detail 页 UAlert + 返回按钮），编辑页却没有。

**改法：** load 失败且为 null 时渲染"未找到 + 返回列表"空态（复用详情页写法），而不是空表单 + 顶部横幅。

### [高] 删除后无"当前页空了回退上一页"

- 清单：清单 #8
- 文件：useAgentManager:72-88 · useWorkflowManager · useOrchestrationPlanManager:121-137 · stores/workflows.ts:178-183（只 filter + total-1）

**现象：** 删除成功后只 toast + 刷新，不判断删除后当前页（筛选结果）是否为空，空则回退上一页。

**改法：** confirmDelete 后计算删除后的 `filteredItems`，若空且 page>1 则 page-- 同步 URL 并刷新。

### [中] 详情页无关联资源 Tab，用分区

- 清单：清单 #9
- 文件：agents/workflows/plans detail（执行成员/服务端信息均为 section）

**现象：** 详情页是纯上下分区（基础信息描述列表 + 执行成员区 + 服务端信息），无 `UTabs`。

**差距：** 归属分级可读，但对关联资源较多者（成员/运行记录/策略）滚动较长。

**改法：** 按需改 `UTabs`（概览 / 成员 / 服务端信息），与组织模块统一。

### [中] store 全量拉取 + 前端过滤，缺服务端分页

- 清单：清单 #4 · #10
- 文件：stores/agents.ts · stores/workflows.ts:40-50（getAllWorkflowPages limit:100 循环）· stores/orchestrationPlans.ts:43-53

**现象：** 三个 store 都用 `limit:100` 循环 offset 拉满 total，前端再做筛选搜索；接口层其实已支持 `limit/offset/keyword/is_enabled`。

**改法：** 让 store 走真分页参数，把 keyword/状态过滤下沉到后端，减轻首屏加载。

### [中] PlanBuilder 成员路由字段必填但无表单规则

- 清单：清单 #7
- 文件：plan-builder/index.vue:196,294-301（UForm :state 无 :rules/:schema）

**现象：** `required` 只渲染红色星标（纯视觉），UForm 没配规则，Nuxt UI 的表单级 blur/input/submit 校验完全不生效；真正校验全靠手写 `validatePlan`，只在提交时触发。

**改法：** 给 UForm 配 `:rules` 或让 validatePlan 支持失焦触发，字段错误内联到对应 UFormField。

## 三、organization 模块（departments / groups / people）

这一模块验收完成度最高——页头/筛选/语义色标签/空状态三态/表单复用/删除带对象名/详情页关联分区都已达标。真正缺口集中在 URL、树形依赖拦截与权限。

### [高] 删除依赖拦截是静态文案，非前置检查

- 清单：清单 #8
- 文件：departments/list/index.vue:119-121（请确认该部门没有仍需保留的成员或下级部门）· stores/departments.ts:169-179 · groups/list:120-122

**现象：** 确认弹窗 body 是写死的泛化警告，与实际数据无关；remove 直接调接口，没有任何基于 `descendants/members` 数量的阻塞判断（这些数据详情页已拉取）。

**差距：** "有依赖提前拦截说明原因"未落地——只是提醒用户自行确认，而不是程序判断"该部门下有 N 个子部门/M 名成员，无法删除"。

**改法：** 确认弹窗读取 `descendants.length/members.length`，有依赖时改文案为"N 个下级部门、M 名直属成员，请先处理后再删"，并在 confirmDelete 前置 `if(有依赖){ loadingError='...'; return }`；后端 409 时把 ApiError 文案透传到 loadingError。

### [中] 长文本略 + tooltip 不完整

- 清单：清单 #3
- 文件：departments/groups/people/list 各列（仅名称列 .primaryCell strong 有 ellipsis，shared/index.module.css:31）

**现象：** 编码、邮箱、描述、上级部门名等字段纯文本输出，既无省略也无 UTooltip。

**改法：** 加通用 `.ellipsis-cell` 样式 + `<UTooltip :text="全文">`。

### [高] people 目录按 200 条硬截断

- 清单：清单 #4
- 文件：usePeopleManager.ts:16-17（USER_LIST_LIMIT=200）、:60,80-85

**现象：** 人员列表表面"全部用户"，实际只取前 200 条，无分页。

**改法：** 走真分页参数（offset/limit），或明确分页显示。

## 四、memories / skills

两模块风格与 build/organization 不同：memories 是整页 CRUD，skills 是"列表+右抽屉"形态。

### [关键] memories 筛选/分页/选中全靠 store，不写 URL

- 清单：清单 #2 · #4 · #10
- 文件：memories/list-panel/index.vue:81-84,129-134,186 · stores/memories.ts:46-58

**现象：** 搜索、类型、页码、每页条数、selectedId 全部只存 Pinia，从不读 `useRoute()`，也不写 `router.replace(query)`。

**差距：** 刷新/后退即丢。

**改法：** 列表面板加 `useRoute/useRouter`，双向绑定 query；onMounted 从 query 反初始化并 load。

### [高] memories 保存成功后跳详情，无 toast、不回列表

- 清单：清单 #7
- 文件：useMemoryEditor.ts:159-177（saveDraft 成功后 goToDetail，无 useToast）· create/edit 页无 toast

**现象：** 保存后 `goToDetail` 直接跳详情，既不清空表单也 back 不到列表位置，无成功提示。

**改法：** 同"共性问题"：回列表 + toast + 保留筛选分页 + 高亮新行。

### [高] memories 删除确认弹窗不带对象名

- 清单：清单 #11
- 文件：memories/list-panel/index.vue:188（title="删除 Memory？" 未插入 ${item.name}）· detail:141 同样缺

**现象：** 确认文案不写对象名，用户无法确认删的是哪条。

**改法：** title 改 `` `删除「${name}」？` ``。

### [中] memories 空状态不区分"从未创建 / 筛选无结果"

- 清单：清单 #3
- 文件：memories/list-panel/index.vue:178-182（写死"暂无 Memory"+新建按钮）

**现象：** 搜索"abc"无命中仍显示"暂无 Memory"，把用户误导成"一条都没有"。

**改法：** v-if 判断有无筛选条件：有条件→"未找到匹配的 Memory"+ 清空筛选按钮；无条件→"暂无 Memory"+ 新建。

### [中] memories 表单校验只在 submit 触发，无失焦、不定位字段

- 清单：清单 #7
- 文件：memory-form/index.vue:36 · useMemoryEditor.ts:160

**现象：** `<UForm :validate>` 只在提交触发；错误只渲染在顶部 UAlert，无滚动聚焦。

**改法：** 逐字段 `@blur` 校验 + 提交后聚焦首错字段。

### [高] skills 整体非标准 CRUD 形态

- 清单：清单 #1–#5 · #9
- 文件：src/routes/skills/（仅 /skills 一个路由，无 :name 详情路由；列表是 `<ul>`，无搜索/筛选/分页；选中只存 selectedSkillName，不写 URL）

**现象：** 无表格/筛选/分页/搜索，详情是右抽屉，刷新丢失选中，无法 URL 直达某技能。

**差距：** 若按标准清单要求则多项缺失；但产品形态更接近"上传即用"的轻量页。

**改法：** 二选一——(a) 对齐清单：加 `skills/:name` 路由 + 搜索分页；(b) 明确为"上传型轻量页"特例豁免，但仍建议补选中态同步 URL（至少刷新保留）。若选 (b)，把特例写明，避免被当作"标准 CRUD"再纠结。

### [高] skills 删除确认无对象名、无 loading、失败静默吞错

- 清单：清单 #8 · #10 · #11
- 文件：skill-list-panel/index.vue:144-154（UModal description="删除后需要重新上传技能包才能恢复。" 未插 ${name}；确认按钮无 :loading）· stores/skills.ts:113-115（catch{} 静默）

**现象：** 删除成功/失败均无 toast；确认文案不带对象名；失败被吞。

**改法：** 标题写 `` `删除技能「${name}」？` `` + 确认按钮 `:loading="deleting"`；store 返回错误串，失败 `toast.add`。

### [低] skills 删除后不回退相邻项

- 清单：清单 #10
- 文件：stores/skills.ts:103-116（删当前项后 selectedSkillName=null，详情回到空态）

**改法：** 删除当前选中项后选相邻项，详情不回空。

## 五、chat 工作台（辅助性核心）

工作台不是标准 CRUD，但它的交互质量直接决定产品体验。以下按"工作台应有交互"审查。

### [关键] 流式进行中切会话，不中止旧流，污染新会话

- 清单：维度 D
- 文件：stores/console.ts:508-521（selectSession 不 dataGeneration+=1、不 activeStreamAbort()）· :880-905（streamHandlers 以 generation===dataGeneration 为缝）

**现象：** 旧流仍在跑，事件继续经 onTaskSnapshot/onNodeEvent/onWorkflowProgress 写 `state.tasks/graphNodes/progress`，全部落到**新会话**视图；`state.busy` 保持 true，阻塞新会话派发直到旧流结束。

**差距：** 唯一会直接复现的脏状态 bug。

**改法：** 抽 `stopActiveStream()`（`dataGeneration+=1; activeStreamAbort?.(); activeStreamAbort=null; state.busy=false`），在 `selectSession/openApp` 开头调用；resetConsole 复用同一函数。

### [关键] 无「停止生成」入口

- 清单：维度 B · D
- 文件：stores/console.ts:321,469,965（activeStreamAbort 只在 resetConsole 被调用）· composer 在 busy 时把发送键变 spinner 且 !sendActive，用户被锁死到流自然结束

**现象：** dispatch/respondInteraction 都返回了 abort 函数，但没有任何用户可触发的"停止"动作。

**改法：** 加 store action `stopGeneration()`（abort + busy=false），composer 在 `state.busy` 时把箭头键换"停止"按钮。

### [高] AppRuntimePanel 用写死假数据 + toast 假装"操作成功"

- 清单：维度 J
- 文件：app-runtime-panel/index.vue:52-53,65,129-138（"1 个操作待审批""运行耗时 01:42"写死；"创建操作单/提交审批/独立打开"只 notify 不真实执行；事件时间硬编码）· app-registry.ts 静态演示对象

**现象：** 点了只弹 toast 的假按钮，比不显示更破坏信任——用户以为创建了操作单，实则什么都没有。

**改法：** 真实接口接入前，把"创建操作单/提交审批/独立打开"标 `:disabled + title="功能接入后端后可用"` 或明确"演示数据"徽标。

### [高] loadSessions 失败被"种子对话"掩盖

- 清单：维度 I
- 文件：App.vue:35（if(!ok) consoleStore.seedConversation()）· console.ts:1076-1108

**现象：** 后端连接失败时 seed 注入 4 条假会话 + 一条"pump-01"演示对话，用户看到的是假数据演示页而非"后端连接失败"的可行动错误。

**改法：** 失败时不 seed，渲染空态 + 顶部错误 + "重试"；seed 仅保留给"首次登录无任何数据"的演示场景。

### [高] 流式错误无重试

- 清单：维度 B
- 文件：stores/console.ts:885-896（onError 推入 {kind:'tool', tag:'ERROR', body:err.message}）· tool-call-card:14-24 对 tag==='ERROR' 无特殊处理

**现象：** 错误块对用户展示但没有"重试"入口，用户只能整条重发。

**改法：** onError 把块标记可重试，ToolCallCard 增 `@retry` 事件，携带原请求体重发；或至少在卡片下放"重试"按钮。

### [高] 会话列表不渲染 count / time 元数据

- 清单：维度 A
- 文件：session-sidebar/index.vue:361,378（只渲染 session.title 与总数；count 在 console.ts:85,527,837 初始化 0 后从不更新）

**现象：** 每会话只有标题，无消息数 / 最后活跃时间。

**改法：** dispatch() 里对当前会话 count+=1、刷新 time；session-item 补渲染。

### [中] 归档会话会把用户带回列表首条

- 清单：维度 A
- 文件：stores/console.ts:684-693（archiveSessionAction 成功后 loadSessions() 无条件把 activeSessionId 设为 session[0]）

**现象：** 即使归档的是非当前会话，当前会话也被切走。

**改法：** 归档被归档的不是当前会话时，`loadSessions(state.activeSessionId)` 保持选中。

### [中] 对话区 loadMessages 失败无重试

- 清单：维度 I
- 文件：stores/console.ts:434-437（失败置 state.messages=[]; health='error'，对话区空，顶部 health dot 显示 BACKEND OFFLINE）

**现象：** 历史消息失败显示空态，无行动项。

**改法：** 空态旁加"重新加载"按钮，仅重跑 loadMessages/loadSessions。

## 六、profile / settings 与 login / register / apps（辅助）

这些页面质量普遍较好，多为细节缺口。

### [中] workspace-editor / accept 弹窗缺脏检查

- 清单：维度 K
- 文件：workspace-editor-modal/index.vue:128-130,199 · workspace-accept-modal:39,65

**现象：** 编辑模式改了 description/logo 等字段后点"取消"或关闭（X/外点）直接丢弃，无"有未保存修改"提示；accept 弹窗输入过 ID 后取消同样无提示。

**改法：** 加 `dirty` 标记（保存成功重置），脏时先弹确认；两弹窗策略统一。

### [中] 删除 workspace 后果文案太笼统

- 清单：维度 E · K
- 文件：workspace-delete-modal/index.vue:39-49（"业务数据可能一并失效""可能"是弱承诺）· workspace-member-panel:42-46

**现象：** 未写明会删会话/Agent/成员关系/消息历史，且"可能"一词与"输入 slug 才可确认"的不删严肃度不匹配。

**改法：** 写实后果（"该工作区的成员关系、全部会话、Agent 与相关数据将被永久移除，无法恢复"），移除成员补一句该成员访问权限变化。

### [中] settings 删除权限规则无对象名、无二次确认

- 清单：维度 E · K
- 文件：settings/Page.vue:161-171（description="删除后，该工具将重新使用平台默认权限策略。" 无 tool_name）

**现象：** 与 profile delete-modal（输 slug 确认 + 明确对象名）相比明显偏弱，同为不可逆删除。

**改法：** description 写 `` `将删除规则「${r.tool_name}」` ``，并按 profile 补一层确认中间态。

### [中] 同页错误提示载体不一致 + 吞错

- 清单：维度 I · J
- 文件：workspace-panel/index.vue:65-68（toast+UAlert 双提示）vs workspace-member-panel:160-167（只 UAlert）· settings/Page.vue:156-157（"请稍后重试"非行动信息）· stores/permissions.ts:39,66（catch{} 吞错）

**现象：** 同一页面内，破坏性操作用 toast、表单提交用 inline，但同一页面两种载体并存；settings 拿不到后端具体错误，只给一句"请稍后重试"。

**改法：** 统一约定（破坏类→toast，提交类→inline UAlert）；permissions store catch 返回真实 message，Settings 页用 toast 显示。

### [中] 密码表单校验弱 + 无失焦/socket 校验

- 清单：维度 K
- 文件：password-panel/index.vue:19-21,57-62（仅 length<6）

**现象：** 无强度校验（字母数字/大小写/特殊字符），且全库无 `validate-on`，只靠默认失焦，confirm 字段存在漏检缝隙。

**改法：** 加强度规则 + `:validate-on="['blur','submit']"`；profile-info/workspace-editor 同步补 submit。

### [高] 登录/注册错误提示不可行动

- 清单：维度 B · C
- 文件：http/index.ts:96-98（authRequest 非 2xx 只抛 HTTP {status}，吞掉后端 message/detail）· login/Page.vue:99 · register/Page.vue:129

**现象：** 密码错 / 网络错 / 429 在登录页都显示同一句"HTTP 401/429"，用户无法分辨；错误也不聚焦到出错字段。

**改法：** authRequest 非 ok 分支解析 body 的 message/detail/code；按 status 分文案（401→"邮箱或密码错误"、429→"请求过于频繁"、status 0→"网络连接失败"）；catch 后 nextTick 聚焦 email/password。

### [中] 注册表单无确认密码 + 无失焦校验

- 清单：维度 K
- 文件：register/Page.vue:20-31,86（只有 password 一个字段，无 confirmPassword）

**现象：** 无"两次密码一致"判断；无失焦校验。

**改法：** 加 confirmPassword + `@blur="validate"`，错误定位到 confirmPassword。

### [高] apps 页点应用未接通 chat 工作台

- 清单：跨页一致性
- 文件：apps/Page.vue:13-25（卡片点击只 launchApp(\`@${a.name} \`)，从不设 activeAppId/切 split）· console.ts:599-616（openApp 才是真正绑定应用的入口）

**现象：** 应用卡片点击只是往通用对话里塞一句 prompt，chat 工作台不知道当前是哪个应用，也不切分屏；且 `launchApp` 返回 false（如 busy）时无任何反馈。

**改法：** onLaunchApp 里先 `openApp(a.tag)`（先统一 AppTile.tag 与 WorkbenchApp.id 命名）再 launchApp，并处理 busy 兜底。

### [高] AppTile 无权限/启用态字段（apps 卡片禁用只绑 busy）

- 清单：维度 H
- 文件：interfaces/app/model.ts:5-13 · apps/Page.vue:75,85,108

**现象：** "权限不足/未启用"的应用无法被禁用或展示原因。

**改法：** 给 AppTile 加 `enabled?/permission?`，卡片按 `!a.enabled` 置灰并显示"无权限：xxx"，把禁用原因从 busy 拆成独立维度。

### [中] apps 页把 mock 数据当真实应用展示

- 清单：维度 J
- 文件：apps/Page.vue:4 · constants/seed.ts:4-23（APPS/FEATURED_APP 硬编码演示数据）

**现象：** 无 mock 标记、无"待后端接口替换"注释，直接渲染成真实卡片。

**改法：** seed.ts 加 `// TODO: mock 数据` 并改为从 store/接口读取；保留 UEmpty 作接口空态。

### [中] safeRedirect 重复实现三份

- 清单：维度 J
- 文件：routes/index.ts:233-237 已有 safeRedirect · login/Page.vue:28-39 · register/Page.vue:33-44 各自内联 resolveAuthTarget

**现象：** 三段等价逻辑独立书写，容易被改漏。

**改法：** 导出 index.ts 的 safeRedirect，login/register import 复用。

### [中] Auth 过期刷新失败无重试、ErrorBoundary 重试只 reload

- 清单：维度 I
- 文件：stores/auth.ts:133-143（refresh() catch 直接 invalidateAuth，无一次性重试）· http/index.ts:43-45 · error-boundary/index.vue:13-21（onRetry 只 window.location.reload）

**现象：** 网络抖动被当成永久失败一次就踢回登录页；ErrorBoundary 只有"重新加载"（整页刷新丢状态），无"返回首页"。

**改法：** refresh 对 status 0/NETWORK_ERROR 做一次重试；ErrorBoundary 动作区加"返回首页"（router.replace('/chat')）。

## 结论与优先级

1. **根因级：URL 即状态 + 保存回列表闭环。** 这两项牵动"保筛选回列表/高亮新行/删除回退上一页"等一串下级问题，建议先做，且能靠一个 `useListUrlState` 组合函数 + 编辑 hook 的统一改动覆盖全局。
2. **真 bug 级：切会话不中止旧流、无停止生成。** 不修会在多会话/长任务场景直接出现脏状态，用户感知最强烈。
3. **信任级：假按钮 / 假数据兜底（AppRuntimePanel、seedConversation、apps mock）。** 点了只弹 toast 的按钮比不显示更伤人。
4. **体验区：权限可见性、真分页（含 people 200 截断）、骨架屏、多选批量。** 改动集中在共用 ResourceTable 层，复用面大。
