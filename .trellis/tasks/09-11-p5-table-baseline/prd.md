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

- [x] 表格基线收敛为**单一来源**，所有 list 页引用同一份定义
      —— `src/assets/styles/table-baseline.module.css`（113 行），12 个文件 `@import`：
      7 个 list 页 + memories/skills 两个面板 + departments/groups/people 三个 shared。
      构建产物验证：`table-layout:fixed` 与 th/td 规则在每一族里只出现一次。
- [x] 同语义列宽（名称 / 时间 / 操作 / 状态 / 勾选）在全站只有一个值
      —— 由 `--table-col-*` 五个 token 给出，页面用语义类 `.col-name` / `.col-time` /
      `.col-status` / `.col-actions` / `.col-select` 取用；页面里的 220/222/230/260/290px
      与 76/88/112/132px 全部删除。
- [x] 列宽策略统一为「语义类定宽 + 未标记列自占剩余」，不再混用 px / 百分比 / 不声明
      —— agents/list 的 7 条百分比规则（4/22/10/16/25/13/10%）已删除。
      「稳定标识」（memories 独有语义）保留自有 `.keyColumn: 180px`，是唯一一处例外，
      已在文件里注明理由。
- [x] `agents/list` 不再依赖 `nth-child` 与勾选列的顺序巧合
      —— 列宽改由 `meta.class` 承载，唯一剩下的 `nth-child(5)` 是「能力绑定列允许换行」
      这一语义，与勾选框是否渲染无关。
- [x] `platform-resource/index.module.css:33` 与 `agents/list:48` 的
      `table-layout: fixed` 重复声明消除
      —— 只在基线里声明一次。剩余三处 `table-layout: fixed`
      （agents/plans/workflows 的 `shared`，服务详情/编辑器里的 `ag-table` / `pl-table`）
      属于各自独立的页面骨架，不在 7 个 list 页范围内，未动。
- [x] 1200×968 与 2560×1440 两个视口下，各 list 页表格无横向溢出、无明显留白浪费
      —— 见下方「列宽核算」。9 个页面在 1200 / 1440 / 2560 三档下弹性列均 ≥ 145px，
      最窄一档（1200）也无列被压到不可读。
- [x] 7 个 list 页的表格视觉一致（行高、列宽比例、操作列宽度）
      —— 表头 38px、单行 56px、双行 72px、内边距 0 10px / 8px 10px、字色字号，
      全部来自同一份基线；操作列一律 112px 右对齐。

### 列宽核算（静态推演，非目视）

可用宽度 = min(视口, `--page-content-max: 1500px`) − 2 × `--page-gutter` 上界 32px。

| 页面 | 定宽合计 | 弹性列数 | @1200 | @1440 | @2560 |
|---|---|---|---|---|---|
| agents/list | 634 | 2 | 251 | 371 | 401 |
| teams/list | 690 | 3 | 149 | 229 | 249 |
| plans/list | 690 | 1 | 446 | 686 | 746 |
| workflows/list | 690 | 1 | 446 | 686 | 746 |
| departments/list | 586 | 3 | 183 | 263 | 283 |
| groups/list | 898 | 0 | — | — | — |
| people/list | 586 | 3 | 183 | 263 | 283 |
| skills 面板 | 586 | 1 | 550 | 790 | 850 |
| memories 面板 | 1078 | 0 | — | — | — |

`groups`（898）与 `memories`（1078）没有弹性列，完全是定宽列；两者都小于最窄档的
可用宽 1136px，因此 1200 / 1440 / 2560 三档都不会横向溢出——这是「定宽 + 固定布局」
相对百分比方案的好处：列宽不随视口漂移，溢出与否可以静态判定。

### 顺带收敛：名称列主单元

`.primaryCell` / `.entityIcon`（图标 +「主标题 / 副标题」两行，含 26px 图标、9px 间距）
原先在 5 个 list 页逐字重复，已移入基线为 `.primary-cell` / `.entity-icon`。
两处写死的 `max-width`（departments 190px、agents 240px）随之删除——
它们让名称列在宽视口下平白截掉三分之一的可用宽。

### 验证方式与实际采用

原计划「先在一个页面做完整验证再推广」，实际执行顺序相反：先把基线补齐
（含 `.primary-cell`），再一次性改 6 个页面并统一构建验证，原因是
`@import` 的覆盖语义已在构建产物上验证过（被导入文件先输出、导入方后输出），
逐页验证不会发现新信息。

- `npx vue-tsc --noEmit -p tsconfig.app.json` → 退出码 0
- `npx vite build` → 退出码 0
- 构建产物核对：`._table_<hash>_76` 一族规则里 `[data-slot=th]` / `[data-slot=td]`
  各只出现一次；`._col-name_<hash>_1` / `._primary-cell_<hash>_1` 可按 `styles['col-name']` /
  `styles['primary-cell']` 取到。
- 未做浏览器实测：本机没有 playwright / puppeteer / jsdom，Chrome DevTools MCP 在本项目中
  始终无响应，因此两个视口的结论来自上式核算，不是截图对比。

### 不动的范围

`src/routes/platform-resource/index.module.css` 服务的 `Page.vue` 兜底分支
（models / skills / mcp / policies 等 12 个资源）仍自带第四套表格尺度，
只把数值对齐到同一批 token，没有改成 `@import` 基线——
它用的是非模块类名（`.resource-table` 由 `Page.vue` 的 `UTable :class` 承载），
导入进来的基线类名会被改写成模块哈希，复用不了。彻底合并需要先把这段骨架
（与 `BuildResourceManager` 并存）处理掉，**不在本任务范围内**，也未把它改坏。

`agents` / `plans` / `workflows` 的 `shared/index.module.css` 里的 `.ag-table` /
`.pl-table` / `.wf-table` 是详情页与编辑器用的另一套骨架，同样只对齐数值，不改结构。
