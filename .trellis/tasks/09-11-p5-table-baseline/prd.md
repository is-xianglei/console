# p5 表格基线与列宽收敛

## Goal

把三套并存的表格基线收敛为单一来源，同语义列宽不再出现多份硬编码。

父任务：`.trellis/tasks/09-11-console-design-audit-fixes`
完整证据：父任务 `research/design-audit-findings.md` 第 4.2 节。

**依赖 p4**（字号体系收敛）：本任务需要引用 p4 建立的字号 scale，
否则收敛基线时会二次返工。

## Requirements

### 1. 三套基线并存

| 基线 | th | td | 名称列 | 操作列 | 定义位置 |
|---|---|---|---|---|---|
| 共享基线 | 36px | 64px | 220px | 76px | `platform-resource/index.module.css:34-39` |
| 构建资源 | 38px | 54px | auto / 22% | 10% / auto | 7 个 list 页各写 |
| memories | 40px | 62px | 290px | 88px | `memories/.../memory-list-panel/index.module.css` |

共享基线还写了 `min-width: 820px; table-layout: fixed`（`index.module.css:33`），
而 `agents/list/index.module.css:48` 也写了 `table-layout: fixed` 但列宽用百分比——
**共享基线被部分页面继承、被另一部分覆盖**。

这解释了实测 64px（容器层）与静态 54px（`td` 层）的差异。

### 2. 同语义列宽最多 4 种值

| 语义列 | 值 | 位置 |
|---|---|---|
| 名称 | `220px` | `skills/.../skill-list-panel:114` |
| 名称 | `290px` | `memories/.../memory-list-panel:132` |
| 名称 | `22%`（=317px@1440） | `agents/list:57-58` |
| 名称 | auto | teams 等 4 页 |
| 操作 | `88px` | `skills:130` / `memories:151` |
| 操作 | `10%`（=144px@1440） | `agents/list:67-68` |
| 操作 | `76px` | `platform-resource/index.module.css:39` |

三套 shared 之间也已漂移：

| 语义 | agents/shared | plans/shared | workflows/shared |
|---|---|---|---|
| 主列宽 | `:372` `222px` | `:397` `230px` | `:397` `260px` |
| 成员列宽 | `:375` `190px` | `:400` `230px` | `:400` `210px` |
| 操作列宽 | `:379` `112px` | `:402` `132px` | `:402` `132px` |

### 3. 策略层分叉

- **固定 px**：`skills` / `memories` / `build-resource-table`
- **百分比**：`agents/list`（`4%/22%/10%/16%/25%/13%/10%`，加总 100%）
- **不声明**：`teams` / `plans` / `workflows` / `departments`，交给 Nuxt UI 自动分配

`agents/list` 的百分比方案还有个隐患：它用 `nth-child` 定位列，
第 1 列是勾选框（`:55-56` `4%`），第 2 列才是「名称」（`22%`）——
**依赖「勾选列恰好插在首位」这一巧合**。`selectable` 关闭时全部错位。

### 4. 附带：2560px 下的留白

`agents/list:90` 给 `strong` 设了 `max-width: 240px`，
而 2560px 视口下名称列宽 `22%` = 563px → **323px 被浪费成留白**。

## Acceptance Criteria

- [ ] 表格基线收敛为**单一来源**，所有 list 页引用同一份定义
- [ ] 同语义列宽（名称 / 时间 / 操作 / 成员）在全站只有一个值
- [ ] 列宽策略统一（三选一，不再混用 px / 百分比 / 不声明）
- [ ] `agents/list` 不再依赖 `nth-child` 与勾选列的顺序巧合
- [ ] `platform-resource/index.module.css:33` 与 `agents/list:48` 的
      `table-layout: fixed` 重复声明消除
- [ ] 1200×968 与 2560×1440 两个视口下，各 list 页表格无横向溢出、
      无明显留白浪费
- [ ] 7 个 list 页的表格视觉一致（行高、列宽比例、操作列宽度）

## Notes

### 与 p4 的协作

p4 建立字号 scale 后，本任务的 `th` / `td` 行高应基于新的字号反推，
而不是继续沿用 36/38/40 与 54/62/64 这六个魔数。

### 不动的范围

`src/routes/platform-resource/index.module.css` 已被半废弃——
它现在只服务 `Page.vue:259` 的 `<main v-else>` 兜底分支
（models / skills / mcp / policies 等 12 个资源），
而 agents / plans / workflows / teams 走专用页、其余部分走 `BuildResourceManager`。
**同一入口并存两套列表骨架**是另一个问题（用户在 Models 与 Agents 间切换会看到两种视觉），
不在本任务范围内，但收敛基线时不要把它改坏。

### 验证方式

列宽改动容易「这套对齐了、那套错位了」。
建议先在一个页面做完整验证，确认收敛后的基线在
「列少」和「列多」两种表格上都能用，再推广到其余页面。
