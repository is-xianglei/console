# 阶段 3：memories 与 skills 页面标准化

## 背景与目标

memories 与 skills 是控制台里两个"知识资产"页面。对照理想 CRUD 清单的审计结论：memories 已具备列表 / 详情 / 新建 / 编辑四个路由与共用表单，新建页有脏检查，但列表层的 URL 状态、加载态、空态分型、删除与保存反馈缺失；skills 整体不是标准 CRUD 形态（单路由 + `<ul>` 列表 + 只读详情），删除失败静默、选中态刷新即丢。

本阶段目标：

1. memories 列表接入阶段 0 的共享能力（URL 状态、骨架屏、相对时间、反馈闭环），空态与删除文案达到清单要求。
2. skills 改为**标准 CRUD**：`FilterPanel + ListCard + 真分页` 列表页 + 搜索 / 筛选 + **详情路由 `/skills/:name`** + 新建（zip 上传）+ 编辑 + 删除闭环；选中态、加载态、时间均按标准处理。

## 范围

- memories：列表面板、详情页、编辑 hook、store 的删除 / 加载逻辑。
- skills：从"单路由 + `<ul>` 列表 + 右抽屉详情"重构为标准列表页（列表 + 详情路由 + 上传新建 + 编辑 + 删除），页头主按钮与上传入口调整。
- 两者的时间显示、空态、删除弹窗文案、URL 状态。

## 非目标

- 不改后端接口；skills 搜索 / 分页若后端未提供则用前端过滤 + 全量分页兜底（记录为后续接口化）。
- 不重做 memory 表单字段与校验规则（校验聚焦首错字段由阶段 0 的 `focusFirstError` 统一接入）。
- 不改 skills 包结构与上传格式；创建入口是上传 zip，编辑按需做字段编辑，详情保持只读。
- 不做 memory / skill 的批量导入导出。

## 依赖与前置

- 阶段 0（`09-08-p0-list-foundation`）交付：`useListUrlState`、`FilterPanel` / `ListCard`、`ResourceTable` 的 `#loading` 骨架屏、`ResourcePagination`（真分页）、`RelativeTime` 单元格、反馈闭环约定（toast + `?highlight=<id>`）、`focusFirstError`。
- skills 与 memories 都依赖阶段 0；若阶段 0 未完成，两者都等待。

## 需求清单

### A. memories 列表（`src/routes/memories/components/memory-list-panel/index.vue`）

1. **空状态分型**
   - 现象：`memory-list-panel/index.vue:178-182` 无论"从未创建"还是"筛选无结果"都渲染同一空态。
   - 要求：区分三态——加载失败（重试按钮）/ 从未创建（主按钮"新建记忆"）/ 筛选无结果（"清除筛选"按钮 + 回显当前条件）。
   - 改法：以 `store.total === 0 && !hasActiveFilter` 判定"从未创建"，否则为"无结果"；`UEmpty` 的 actions 分别绑定 `goToCreate` 与 `resetFilters`。
2. **URL 即状态**
   - 现象：关键字、类型 / 范围筛选与分页只存 store（`memory-list-panel/index.vue:81-84,129-134,186`；`src/stores/memories.ts:46-58`），刷新即丢。
   - 要求：keyword / 筛选 / page / pageSize 同步到 `route.query`，刷新与后退可还原。
   - 改法：接入 `useListUrlState`，store 的 filters 由 URL 初始化，变更用 `router.replace`。
3. **加载骨架屏**
   - 现象：`memory-list-panel/index.vue:147` 加载中只显示文字或空白。
   - 要求：首屏与切换筛选时渲染与行高一致的骨架行。
   - 改法：`ResourceTable` 传 `loading` 并提供 `#loading` 插槽（`USkeleton` × 5）。
4. **时间显示**
   - 现象：`memory-list-panel/index.vue:51-56,166` 使用绝对时间。
   - 要求：列表显示相对时间，hover 显示完整 `YYYY-MM-DD HH:mm:ss`。
   - 改法：换用阶段 0 的 `RelativeTime`。
5. **长文本 tooltip**
   - 现象：`src/routes/memories/index.module.css:164-171` 仅 CSS 截断，无 tooltip。
   - 要求：截断文本 hover 可看全文。
   - 改法：截断单元格包 `UTooltip`（`text` 为完整内容）；内容超过 200 字时改为"展开"按钮。
6. **删除弹窗与删除后行为**
   - 现象：`memory-list-panel/index.vue:188` 与 `src/routes/memories/detail/index.vue:141` 删除弹窗无对象名；`src/stores/memories.ts:191-206` 删除后当前页可能为空且不回退页码。
   - 要求：弹窗标题含记忆标题（超过 30 字截断）；删除后若当前页无数据则回退到上一页并重拉；删除成功 toast；详情页删除后回列表。
   - 改法：`title` 用模板字符串带对象名；`removeMemory` 后 `if (items.length === 0 && page > 1) page -= 1`。
7. **保存反馈闭环**
   - 现象：`src/hooks/useMemoryEditor.ts:159-177`（`:172` `goToDetail`）保存后直接跳详情，无 toast，不回列表高亮。
   - 要求：保存成功 toast；新建后回列表并高亮新行（`?highlight=<id>`）；编辑后按阶段 0 约定回列表或详情。
   - 改法：接阶段 0 的反馈闭环工具函数，去掉 hook 内部直接 `goToDetail`。

### B. skills（`src/routes/skills/**`）——标准 CRUD

8. **形态定位：标准列表页（采用原方案 A）**
   - 现象：`src/routes/skills/Page.vue` 单路由；`skill-list-panel/index.vue:98-141` 用 `<ul>` 平铺列表，无搜索 / 筛选 / 分页；`skill-detail-panel/index.vue:62-136` 是右抽屉只读详情，无操作无 Tab。
   - 要求：重构为 `FilterPanel + ListCard + 真分页` 的标准列表页，并新增**详情路由 `/skills/:name`**；上传新建、编辑、删除、筛选、分页齐全。
   - 改法：路由表加 `/skills/:name` 与 `/skills/edit/:name`（或复用 detail 作编辑入口）；列表用 `ResourceTable`，复用阶段 0 布局组件。
9. **列表列与搜索 / 分页**
   - 要求：表格列 = 名称（链接，点击进详情）/ 描述 / 版本 / 更新时间（`RelativeTime`）/ 操作（编辑、删除）；筛选 = 关键字（名称 / 描述）+ 可选类型；排序按更新时间倒序。
   - 改法：关键字 + 分页进 `route.query`（`useListUrlState`）；后端有搜索 / 分页接口则调用，无则前端全量过滤 + 内存分页兜底（**需在代码注释与文档标注"接口化 TODO"**）。
10. **页头主按钮**
    - 现象：`skill-list-panel/index.vue:58-89` 页头无主按钮，只有 `UFileUpload` zip 拖拽区。
    - 要求：页头右侧唯一主按钮"上传技能包"，点击触发文件选择；拖拽区保留为次要入口；上传中按钮 loading。
    - 改法：`UButton` 触发隐藏的文件 input / `UFileUpload` 的 open 方法；上传成功 toast + 回列表 `?highlight=<新 name>`。
11. **删除反馈**
    - 现象：`skill-list-panel/index.vue:144-154,48-53` 删除弹窗无对象名、确认按钮无 `:loading`；`src/stores/skills.ts:113-115` `catch {}` 失败静默。
    - 要求：弹窗标题"删除技能「name」？"；确认按钮 `:loading`；失败 toast 带后端 message；成功 toast；删除后回列表并退页纠正。
    - 改法：store 的 `removeSkill` 在 catch 中返回错误串（对齐 `workspaces.ts` 的 `errorMessage` 模式），面板据此 `toast.add`。
12. **详情页 / 编辑页**
    - 要求：`/skills/:name` 详情路由页——头部"编辑 / 删除"按钮，内容分区超过 3 块用 `UTabs`（概览 / 文件 / 元数据），否则保持分区；时间为 `RelativeTime` + hover 绝对；删除后回列表并选相邻项；编辑页接阶段 0 的 `useDirtyGuard` 与保存反馈闭环。
    - 改法：新增 `src/routes/skills/detail/index.vue` 与 `src/routes/skills/edit/index.vue` 路由页，复用 `useSkillEditor` 类 hook。
13. **选中态进 URL**
    - 现象：`src/stores/skills.ts:12` 选中只存 `state.selectedSkillName`，刷新丢失。
    - 要求：删除 / 选中项的联动可由详情路由表达（`/skills/:name`）；列表点击跳详情路由；刷新后路由即状态。
    - 改法：用路由参数替代纯 store 选中态；store 仅保留"当前路由对应 skill"的派生。
14. **加载态**
    - 现象：`skill-list-panel/index.vue:93` 用"加载中…"文字。
    - 要求：列表 loading 渲染 `USkeleton` 骨架行；空态分型（上传即创建 / 筛选无结果）。

## 保持不变（已符合项）

- memories 新建 / 编辑复用同一表单组件；create 页有脏检查（`onBeforeRouteLeave`）。
- 全库无原生 `confirm()`；删除均为 `UModal`。
- skills 上传为 zip 入口，成功后自动刷新列表。

## 验收标准

- [ ] memories 列表：清空所有数据时显示"从未创建"空态并带"新建记忆"按钮；有数据但筛选无结果时显示"清除筛选"。
- [ ] memories 列表：设置关键字 + 筛选 + 第 2 页后刷新页面，三者均保留；浏览器后退回到上一组条件。
- [ ] memories 列表：加载中出现骨架行而非文字。
- [ ] memories 时间列显示"3 分钟前"类相对时间，hover 显示完整时间。
- [ ] memories 删除弹窗标题包含记忆标题；删除最后一页唯一一条后自动回到上一页；详情页删除后回到列表。
- [ ] memories 新建保存后出现成功 toast，列表中新行高亮约 2 秒后消失。
- [ ] skills 列表为 `FilterPanel + ListCard + 分页` 表格形态，列含 名称 / 描述 / 版本 / 更新时间 / 操作。
- [ ] skills 关键字搜索与分页写入 URL，刷新保留；后端无接口时走前端过滤 + 内存分页，代码标注"接口化 TODO"。
- [ ] skills 访问 `/skills/:name` 直接显示该技能详情；删除后回列表并选相邻项。
- [ ] skills 页头唯一主按钮"上传技能包"可触发上传；上传成功 toast + 回列表高亮新行。
- [ ] skills 删除弹窗含技能名，确认按钮有 loading；模拟后端失败时出现带真实 message 的错误 toast。
- [ ] skills 编辑页有脏检查；保存成功 toast + 回列表 `?highlight=<id>`。
- [ ] skills 列表加载中显示骨架行；空态分型（上传即创建 / 筛选无结果）。
- [ ] `vitest run` 通过；新增 `stores/skills` 删除逻辑单测（失败返回 message）与 `stores/memories` 删除回退页码单测。

## 风险与注意事项

- memories 详情已从组件迁为路由页 `src/routes/memories/detail/index.vue`（git 状态显示 `memory-detail-panel` 已删除），审计中的行号 `:141` 实施时需重新定位。
- skills 后端当前无搜索 / 分页接口，列表只能前端过滤 + 内存分页兜底；数据量增大后需接口化（见 B-9）。
- skills 详情改为路由页后，原本依赖 `state.selectedSkillName` 的高亮 / 选中逻辑要改为从 `route.params.name` 派生，避免双状态源。
- 删除后重选相邻项要与 URL 同步，避免 URL 指向已删除的 name。
- `RelativeTime` 与 `useListUrlState` 的最终 API 以阶段 0 交付为准，本阶段不要自行实现平行版本。

## 涉及文件

- `src/routes/memories/Page.vue`
- `src/routes/memories/components/memory-list-panel/index.vue`
- `src/routes/memories/detail/index.vue`
- `src/routes/memories/index.module.css`
- `src/hooks/useMemoryEditor.ts`
- `src/stores/memories.ts`
- `src/routes/skills/Page.vue`
- `src/routes/skills/components/skill-list-panel/index.vue`（重构为 ResourceTable 列表）
- `src/routes/skills/detail/index.vue`、`src/routes/skills/edit/index.vue`（新增）
- `src/hooks/useSkillEditor.ts`（新增）
- `src/stores/skills.ts`
- `src/routes/index.ts`（新增 `/skills/:name` 路由）

## 目标形态 ASCII 草图

### A. skills：标准 CRUD 列表页 + 详情路由

```
┌─ 技能列表  ·  共 N 条，导入技能包或筛选已有技能 ──────────────── [恢复 ▾] ─┐
│ [⬆ 上传技能包]                            ⇄刷新  ⚙列设置   ← 主按钮唯一    │
│ 名称 [________]  类型 [全部 ▾]                        [搜索] [重置]     │
│ ☐ │名称(链接) │ 描述       │ 版本   │ ⏱ 更新时间 │ ✎ 🗑 …│  ←操作列右固定  │
│ ── 空态：尚未上传技能包（CTA 上传）/ 无匹配结果（清除筛选）──        │
│                共 N 条  [10条/页 ▾]   ‹ 1 ›  前往 [ ] 页    │
└─────────────────────────────────────────────────────────────┘
  点击名称 → /skills/:name 详情路由页（头部：编辑 / 删除；分区 UTabs：概览/文件/元数据）
  编辑页：字段表单 + onBeforeRouteLeave 脏检查 + 保存成功回列表 ?highlight=<id>
  列：名称(链接) / 描述 / 版本 / 更新时间(RelativeTime) / 操作；删除弹窗带技能名
  + :loading + 失败真实 message toast；后端无分页接口 → 前端过滤 + 内存分页（标注 TODO）
```

### B. memories（沿用现有"左列表 + 右详情抽屉"，只补齐反馈与形态）

```
┌─ 记忆库 ──  ·  共 N 条 ────────────────────────────── [+ 新建记忆]  ⇄刷新 ──┐
│ [🔍 搜索记忆__] [标签▾] [类型▾]          ┌ 记忆详情（右侧抽屉）             │
│ ┌───────────┬──────────────┬─────────┐ │ 标题：…                        │
│ │ 标题(链接) │ 标签UBadge    │ ⏱ 2 天前 │ │ 时间：2026-07-30 09:43:05    │
│ │ …         │ …            │ …       │ │ [✎ 编辑] [🗑 删除（带名）]       │
│ │ ── 空态：从未创建 / 筛选无结果（两案）── │                                │
│ └───────────┴──────────────┴─────────┘ │ 长文本 hover 出完整 tooltip     │
│  分页：共N条 [每页▾] ‹ 1 ›              │                                │
└────────────────────────────────────────┴────────────────────────────────┘
```
