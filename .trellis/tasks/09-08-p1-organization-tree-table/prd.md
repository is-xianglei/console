# 阶段 1：organization 模块——人员左树右表、部门树形表格、群组标准列表

## 背景与目标

organization 模块是全站验收度最高的一块（页头说明 + 新建、多字段搜索 + 筛选、`UBadge` 语义色、空状态三态、共用表单、create/edit 均有 `onBeforeRouteLeave`、删除弹窗带对象名、详情 Tab 都已具备），但三张列表页仍是"平表 + 计数器"形态，和若依那套成熟的后台布局相比缺了三件事：**范围导航、真分页、有依据的删除拦截**。

本阶段把若依"用户管理 / 部门管理"两张页面的形态落到本项目，核心认识是：**同一份部门数据有两种呈现**——

- 在 people 页里，部门是**筛选范围**：做成左侧常驻的部门树，选中即"看该部门及其子部门的人"；
- 在 departments 页里，部门是**被管理的对象本身**：做成树形表格，行内可"新增子部门"，不分页、不批量。

目标：people 页改为"左树右表"三段式；departments 页改为树形表格；groups 页套用阶段 0 的标准列表布局；三个 editor 接入"保存回列表 + toast + 高亮"闭环。

## 范围

- `src/routes/platform-resource/organization/{people,departments,groups}/list/index.vue` 三张列表页及其 manager hook（`usePeopleManager` / `useDepartmentManager` / `useGroupManager`）。
- `src/stores/{departments,groups}.ts` 与 `useOrganizationSupport.ts` 中为列表提供数据的部分（分页、按部门取成员、删除前置判断）。
- `useDepartmentEditor` / `useGroupEditor` / `usePeopleEditor` 保存与删除后的跳转与反馈。
- departments 详情页"新建下级部门"入口保持不变，只在列表行内复用。

## 非目标

- 不改后端接口；接口不支持的筛选留在前端做，并在"风险"中记录待后端补齐项。
- 不做若依的 tag-view 多页签、不做整站导航外壳改造。
- 不做批量导入 / 导出、不做角色分配弹窗。
- 不重绘视觉风格；沿用现有 CSS Modules 与 Nuxt UI 4.10 主题。

## 依赖与前置

依赖阶段 0（`09-08-p0-list-foundation`）交付的共享层，本阶段只做业务接入，不重复造轮子：

| 阶段 0 交付物 | 本阶段用途 |
|---|---|
| `useListUrlState(filters)` | people / groups 的 `query` 对象进 URL；departments 的搜索词与展开状态进 URL |
| `FilterPanel` / `ListCard` | 三张页的"筛选卡 + 列表卡 + 分页"骨架，固定高 + 内部滚动 |
| `ResourceTable` 升级（select 列、操作列右固定、`#loading` 骨架、`getSubRows`、`highlightId`） | people 多选与高亮；departments 树表 |
| `ResourcePagination` 真分页四件套 | people（服务端分页）与 groups（前端分页） |
| `RelativeTime` 单元格 | 三张页补创建时间列 |
| 反馈闭环工具（toast + `?highlight=` 约定） | 三个 editor 保存 / 删除后的跳转 |
| `usePermissions()` / `can()` | people 行级隐藏（不能删自己、不能操作管理员） |
| `loadPage({ limit, offset })` store 样板 | people 用户目录真分页 |

阶段 0 未归档前，本阶段可先做 B（departments 树表）中不依赖新组件的部分：树数据源切换、删除前置判断、"新增子部门"行操作。

## 需求清单

每条格式：**现象**（`src/...:行号`）→ **要求** → **改法**。

### A. people 页（左树右表）

**A1 页面骨架**
- 现象：`people/list/index.vue` 是"页头 + 一行筛选 + 平表 + 计数器"单列结构，部门只能通过归属筛选下拉间接过滤。
- 要求：改为若依式三段式——左侧 320px 固定宽的部门面板（标题 + 折叠按钮 + 本地搜索框 + `UTree`），右侧纵向依次为 `FilterPanel`（姓名 / 账号 / 手机 / 状态 / 创建时间区间）、`ListCard`（标题 + 说明 + 工具栏 + 表格）、`ResourcePagination`。整页固定高、左树与表格各自内部滚动，分页固定在列表卡底部永远可见。
- 改法：外层 `h-[calc(100vh-顶栏)]` + `flex`，左栏 `shrink-0 w-80`，主列 `flex-1 min-w-0 flex-col`，列表卡 `flex-1 min-h-0`；左树数据用 `getDepartmentTree`（`src/http/department.ts:33`）而不是平表再前端组树；左侧搜索只做树内过滤与高亮，不触发列表请求。

**A2 一个 `query` 对象驱动一切**
- 现象：`usePeopleManager.ts` 只有 `search` / `membershipFilter` 两个 ref，不读写 `route.query`；organization 目录里唯一的 `route.query` 用法是 `departments/create/index.vue:16-20` 的 `?parent=`。
- 要求：people 页所有输入源写入同一个对象 `query = { departmentId, keyword, status, dateRange, page, pageSize }`，通过 `useListUrlState` 双向绑定 URL；刷新、后退、分享链接都能还原树选中态、筛选与页码。
- 改法：点树节点 → 写 `departmentId` 且 `page` 归 1；点搜索 → 写表单值且 `page` 归 1；点重置 → 清表单**同时清树选中**（否则用户以为重置了，列表仍被部门限制）；换页 / 换每页条数 → 只改分页字段。

**A3 依赖选中的工具栏**
- 现象：页头只有一个"新建"按钮；表格无勾选列，无任何批量动作。
- 要求：工具栏三层——主操作"新增"（唯一实心）；依赖选中集合的"启用 / 停用 / 删除"（`selectedIds.length === 0` 时置灰并用 `UTooltip` 提示"请先勾选人员"）；低频动作收进 `UDropdownMenu`"更多"。右端保留"刷新"图标按钮。
- 改法：`ResourceTable` 开启 select 列并 `v-model:selected`；批量启停 / 删除逐条调用现有单条接口并汇总结果 toast（后端无批量接口）；批量删除弹窗列出将删除的人数与前 3 个姓名，且自动剔除"自己"。

**A4 表格列与就地操作**
- 现象：`people/list/index.vue:110-116` 列为 姓名 / 邮箱 / 角色 / 部门 / 职务 / 操作，无状态开关、无创建时间；操作列三个图标平铺且不固定右侧（`:116`）。
- 要求：列改为 ☐ / 姓名（链接到详情）/ 账号 / 部门 / 手机 / 状态（`USwitch`）/ 创建时间（`RelativeTime`）/ 操作（右固定，编辑 / 删除 / 更多）。状态开关**先弹确认再改**（"确认要停用 xxx 吗？"），成功只刷新该行，失败回滚并 toast 原因。
- 改法：状态字段以后端 `is_active` / 成员关系为准（核对 `WorkspaceMemberDetailResponse`）；若后端无用户级启停接口，本列退化为 `UBadge` 并在"风险"记录。图标按钮全部带 `UTooltip`；操作列通过阶段 0 的列固定能力钉在右侧。

**A5 真分页取代 200 条截断**
- 现象：`usePeopleManager.ts:16-17` `USER_LIST_LIMIT = 200`，注释明确"工作区成员接口无分页，本期不做真分页"；`:60` `userLimitReached` 只在顶部提示"仅显示前 N 名"；`people/list/index.vue:118` `ResourcePagination :items-per-page="0"` 只是计数器。
- 要求：用户目录按服务端分页拉取（`getUserList` 已支持 `limit` / `offset`，`src/interfaces/user/api.ts:3-4`），列表 >200 人时可翻页看到全部；每页条数可选 10 / 20 / 50；总数、页码、跳转四件套齐全。
- 改法：用阶段 0 的 `loadPage({ limit, offset })` 样板改 `useOrganizationSupport` 的用户目录加载；成员关系表（`getWorkspaceMemberList`，`src/http/workspace.ts:62-66` 无分页）仍一次拉全并按 `user_id` 合成行；关键词 / 状态 / 部门在后端不支持时于当前页做前端过滤，并在筛选卡上标注"当前页内筛选"。

**A6 权限可见性**
- 现象：`usePeopleManager.ts:87-89` `isSelf` + 列表 `:116` 删除按钮 `:disabled="manager.isSelf(...)"` 是全站唯一的行级规则。
- 要求：行级规则统一走阶段 0 的 `can()`：不能删自己、不能停用自己、非管理员不能操作管理员；不满足时**按钮不渲染**（对齐若依 admin 行无操作按钮），批量集合自动剔除。
- 改法：把 `isSelf` 与角色判断封装为 `canDeletePerson(row)` / `canTogglePerson(row)` 并同时用于行内与批量。

**A7 窄屏适配**
- 要求：视口 <1200px 时左树收成抽屉（`USlideover`），筛选卡内出现"部门"级联选择作为替代入口；折叠按钮状态记入 `localStorage`。

### B. departments 页（树形表格）

**B1 树表替代平表**
- 现象：`departments/list/index.vue:108-116` 是平表，`parent-cell` 只显示上级名称，层级关系靠读文字推断。
- 要求：`UTable` 传 `:get-sub-rows="row => row.children"`（Nuxt UI 4.10 `Table.vue:64` 已支持），数据源改用 `getDepartmentTree`（`src/http/department.ts:33`，返回 `DepartmentTreeResponse.children`）；名称列按 `row.depth` 缩进（每级约 16px），仅 `row.getCanExpand()` 为真的行画展开箭头；删掉"上级部门"列，保留 编码 / 负责人 / 排序 / 状态 / 创建时间 / 操作。
- 改法：manager 的 `filteredDepartments` 改为对树做递归过滤；排序列文案说明为"同级内权重"（`sort_order`，`src/interfaces/department/model.ts:10`），同级按它升序。

**B2 工具栏：只有 新增 / 展开·折叠 / 刷新**
- 要求：**不加**勾选列与批量按钮（树结构下"批量删"的父子依赖无法可靠表达，若依同样不提供）。"展开 / 折叠"是一键翻转全部节点的全局开关；"刷新"重新拉树。
- 改法：展开状态用 `UTable` 的 `expanded` v-model 整体置全展开 / `{}`；默认展开到第 2 级；当前展开集合与搜索词进 URL（`useListUrlState`），刷新后保持。

**B3 行操作：编辑 / 新增子部门 / 删除**
- 现象：`departments/list/index.vue:112` 行操作为 详情 / 编辑 / 删除；"新建下级部门"只在详情页有入口（`create/index.vue:16-20` 已支持 `?parent=<id>` 预填上级）。
- 要求：行操作改为 编辑 / **新增子部门**（跳 `department-create` 并带 `query: { parent: id }`，复用现有逻辑）/ 删除；三个图标必配 `UTooltip`，"新增子部门"尤其要有文字提示。名称列点击进详情，去掉单独的"详情"图标。
- 改法：仅路由跳转，不新增表单逻辑。

**B4 状态用徽章，不用开关**
- 现象：`departments/list/index.vue:111` 已是 `UBadge`（启用 / 停用）。
- 要求：**保持徽章**，明确不做就地开关——停用部门会级联影响子部门与成员归属，后果重，改状态须进编辑表单。徽章要区分语义色（启用 success / 停用 neutral）并在停用节点的子树上给出弱化样式。

**B5 不分页 + 计数文案**
- 现象：`departments/list/index.vue:116` `ResourcePagination :items-per-page="0"` 显示"当前显示 X/Y 条"。
- 要求：树表一次全量加载、不分页（分页会把父子拆到两页）；底部只保留计数，文案改为"共 N 个部门，已展开 M 个"；部门数 >1000 时改为懒加载子节点而非分页（本期只留 TODO）。

**B6 搜索保留祖先链**
- 现象：现有 `filteredDepartments` 是平表过滤，改成树后直接过滤会让命中节点失去父级、树断裂。
- 要求：按名称 / 编码搜索时，结果 = 命中节点 ∪ 其全部祖先；祖先节点以弱化样式显示、命中节点高亮，且搜索态自动全展开；清空搜索恢复之前的展开集合。
- 改法：前端递归 `filterTree(nodes, predicate)`，父节点保留条件为"自身命中或任一子孙命中"。

**B7 删除拦截改为程序判断**
- 现象：`departments/list/index.vue:119-121` 删除弹窗是固定文案"请确认该部门没有仍需保留的成员或下级部门"；`stores/departments.ts:169-179` `removeDepartment` 直接调 `deleteDepartment`，失败只返回 `errorMessage`。详情页已能拿到 `descendants` / `members`（`detail/index.vue:39-40`）。
- 要求：点删除时先判断依赖——树节点本身有 `children` 即"存在下级部门"，成员数用 `getDepartmentMemberList(id, { include_descendants: false })`（`src/http/department.ts:91-104`）取；有依赖时确认按钮禁用并在弹窗中列出"下级部门 N 个、直属成员 M 人"的具体原因与"去详情处理"的链接；无依赖时才允许确认。后端返回的拦截原因（`DepartmentDeleteResult` / 错误 message）原样展示，不再用泛化文案。
- 改法：manager 新增 `requestDelete` 前置的 `inspectDeleteBlockers(dept)`，弹窗 body 按结果渲染；根节点是否可删沿用后端规则，前端不额外禁止。

### C. groups 页（标准列表）

**C1 套用共享布局与 URL 状态**
- 现象：`groups/list/index.vue:113,117` 与 departments 同构：操作列 4 图标平铺、`:items-per-page="0"`、`useGroupManager.ts:15-16` 的筛选只在内存。
- 要求：改为 `FilterPanel`（名称 / 类型 / 创建时间区间）+ `ListCard` + 真分页；`query = { keyword, groupType, dateRange, page, pageSize }` 进 URL。
- 改法：`getGroupList` 已支持 `group_type` / `search`（`src/http/group.ts:33-45`），关键词与类型走后端；接口无分页，分页在前端按 `page/pageSize` 切片，`ResourcePagination` 用真分页模式。

**C2 删除拦截与列补齐**
- 现象：`groups/list/index.vue:120-122` 删除弹窗固定文案"请确认该群组没有仍需保留的成员或引用"；`stores/groups.ts:163-169` `removeGroup` 直接删。列表无时间列，长文本只有名称列有 ellipsis（`shared/index.module.css:31`）。
- 要求：删除前用 `getGroupMemberList`（`src/http/group.ts:74`）取成员数，有成员时禁用确认并列出人数；补"创建时间"列（`RelativeTime`）；描述列 ellipsis + `UTooltip` 显示全文。
- 改法：操作列收成"编辑"主操作 + `UDropdownMenu`"更多"（详情 / 删除），名称列点击进详情。

### D. 三个 editor 接入反馈闭环

- 现象：`useDepartmentEditor.ts:157-160` 与 `useGroupEditor.ts:187-190` 保存成功后 `goToDetail(savedId)`，无 toast；`usePeopleEditor.ts:177,187,213` 同样 `goToDetail`；三处 create/edit 页均无 `useToast`。删除成功后 `removeDepartment` / `removeGroup` 只 `loadDepartments` / `loadGroups`，不回退页面。
- 要求：保存成功 → `useToast` 成功提示 + `router.push` 回列表并带 `?highlight=<id>`，列表用阶段 0 的 `highlightId` 高亮该行 2 秒后清 query；从详情页进入编辑的场景保留回详情（按 `route.query.from` 区分）。删除成功 → 列表页内删除只 toast 并保留当前筛选与页码，详情页内删除回退到列表。
- 改法：三个 editor 的成功分支统一改为调用阶段 0 提供的 `afterSaveNavigate({ id, from })`；不再各自 `goToDetail`。

## 验收标准

- [ ] people 页选中左树某部门后刷新页面：树选中态、筛选表单、页码全部保留；后退能回到上一组条件；点"重置"后树选中同时清空。
- [ ] people 页在用户目录 >200 人的工作区里能翻页看到全部用户，每页条数切换生效，总数与后端一致；顶部不再出现"仅显示前 200 名"提示。
- [ ] people 页未勾选任何行时"启用 / 停用 / 删除"置灰且 hover 有提示；勾选后可用；批量删除弹窗列出人数与姓名，且当前登录用户永远不会出现在批量集合里。
- [ ] people 页当前登录用户所在行不渲染删除按钮（而非禁用）；状态开关切换先弹确认，失败后开关回滚并显示后端原因。
- [ ] people 页左树可折叠，折叠后表格占满宽度；视口 <1200px 时左树变为抽屉且筛选卡出现部门级联选择。
- [ ] departments 页以树形展示，层级缩进正确，仅有子节点的行有箭头；"展开 / 折叠"一键生效；刷新后展开集合保持。
- [ ] departments 页搜索"市场"能看到命中节点及其完整父级链，父级弱化、命中高亮；清空搜索恢复展开状态。
- [ ] departments 页行内"新增子部门"跳到 `department-create?parent=<id>` 且表单上级已预填。
- [ ] departments 页删除有下级部门或直属成员的部门时，确认按钮禁用并显示"下级部门 N 个 / 直属成员 M 人"的具体原因；无依赖的部门可正常删除；后端拦截信息原样展示。
- [ ] departments 页状态列仍为徽章，无就地开关；底部计数文案为"共 N 个部门"。
- [ ] groups 页筛选（名称 / 类型 / 时间）进 URL，可分享；分页四件套齐全；删除有成员的群组时被程序拦截并显示人数。
- [ ] 三张列表页操作列图标全部有 tooltip，操作列在横向滚动时固定右侧；三张页都有创建时间列。
- [ ] 部门 / 群组 / 人员保存成功后：出现成功 toast，回到列表且新行高亮约 2 秒，URL 中的 `highlight` 随后被清除；筛选与页码不丢。
- [ ] `vitest run` 新增用例通过：people `query` ↔ URL 序列化、departments `filterTree` 祖先链保留、删除阻断判断、分页切片。
- [ ] `npm run typecheck` 与 lint 全绿；页面无原生 `confirm()`；无整页遮罩 loading。

## 风险与注意事项

- **people 的部门范围过滤依赖接口能力**：`getUserList` 只有 `limit/offset`（`src/interfaces/user/api.ts:2-5`），`getWorkspaceMemberList` 无参数（`src/http/workspace.ts:62-66`）。"选中部门 → 只看该部门的人"需组合 `getDepartmentMemberList(id, { include_descendants: true })` 得到 user_id 集合再与用户目录合成；在后端补齐 `department_id` / `keyword` 参数之前，部门范围与关键词都是"当前页内"或"成员集合内"过滤，筛选卡上必须标注，以免用户误以为漏数据。
- **用户级启停接口待核对**：若后端没有停用用户 / 成员的接口，A4 状态列退化为徽章，A3 的"启用 / 停用"批量按钮不做，只保留批量删除。
- **树表 API 以 node_modules 为准**：`UTable` 的 `getSubRows`、`expanded` v-model、`row.depth` / `row.getCanExpand()` / `row.toggleExpanded()` 的实际签名以 `node_modules/@nuxt/ui/dist/runtime/components/Table.vue` 为准，不要凭记忆写；列固定能力取决于阶段 0 的实现方式。
- **树与平表双数据源**：`stores/departments.ts` 目前以平表 `items` 为主；引入 `getDepartmentTree` 后要保证详情 / 编辑 / support 的 `departmentName`、`parentDepartmentOptions` 仍可用（可由树 flatten 得到平表，避免两次请求不一致）。
- **删除前置判断的额外请求**：每次点删除多一次成员列表请求，需要 loading 态；树节点 `children` 判断下级不需要请求。
- **不要破坏已达标项**：三张页现有的空状态三态、`onBeforeRouteLeave`、删除弹窗对象名、详情 Tab 在改造后必须保留并通过回归。

## 涉及文件

- `src/routes/platform-resource/organization/people/list/index.vue`、`src/hooks/usePeopleManager.ts`、`src/hooks/useOrganizationSupport.ts`、`src/hooks/usePeopleEditor.ts`
- `src/routes/platform-resource/organization/departments/list/index.vue`、`src/hooks/useDepartmentManager.ts`、`src/hooks/useDepartmentEditor.ts`、`src/stores/departments.ts`、`src/http/department.ts`（只读引用）
- `src/routes/platform-resource/organization/groups/list/index.vue`、`src/hooks/useGroupManager.ts`、`src/hooks/useGroupEditor.ts`、`src/stores/groups.ts`、`src/http/group.ts`（只读引用）
- `src/routes/platform-resource/organization/shared/index.module.css`、各列表页 `index.module.css`
- `src/components/resource/**`（阶段 0 产物，本阶段只消费）
- 测试：`src/hooks/usePeopleManager.test.ts`（新增）、`src/hooks/useDepartmentManager.test.ts`（新增）、`src/stores/departments.test.ts`（如已存在则补用例）

## 目标形态 ASCII 草图

### A. people：左树右表（部门作范围导航）

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
│   ▸ 长沙分公司    │ │ ‹滚动…›                               │                 │
│                  │ │                  分页：共N条  页大小  页码                  │
│  本地过滤树       │ └──────────────────────────────────────────────────────────┘
│  ≤320px 固定      │  右侧 = query 对象 {departmentId,keyword,status,dateRange,page,pageSize}
│  可折叠为图标条    │  点树节点→departmentId 且 page 归 1；重置→清表单+清树选中
└─────────────────┘  <1200px 窄屏：左树收成抽屉或退化为筛选区的部门级联
```

### B. departments：树形表格（部门是被管理的对象本身）

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
│  状态=UBadge（后果重，进表单改）；删除按程序判断（有子部门/有人则拦截并显示原因）     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### C. groups：标准列表（同 design.md §13-A 骨架，字段为 名称/负责人/成员数/状态/创建时间）
