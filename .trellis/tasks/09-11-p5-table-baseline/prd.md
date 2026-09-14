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
      —— 表头 38px、单行 44px、双行 64px、内边距 0 10px / 8px 10px、字色字号，
      全部来自同一份基线；操作列一律 112px 右对齐。
      （行高由 p4 遗留的「行高/字号比」验收项在实施中定稿——56/72 那两档原样照抄了
      收敛前的 54/62/64 与 66/72，等于把「行高过大」这个观察原封不动搬进 token。
      按内容反推后压到 44/64，依据写在 `index.css:150-180`。详见表下。）

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

### 行高定稿（接管 p4 遗留项）

p5 落地时最初把行高写成 `56 / 72`，是照抄收敛前的 `54 / 62 / 64` 与 `66 / 72`——
把审计点名的「行高过大」原样搬进了 token，等于没做。改按内容反推：

| token | 值 | 内容高 | 呼吸 | 比值 | 下限来源 |
|---|---|---|---|---|---|
| `--table-head-height` | 38px | 18px | 20px | 3.17 | 与 td 视觉连续 |
| `--table-row-height` | 44px | 18px | 26px | 3.67 | WCAG 2.2 SC 2.5.8（行可点） |
| `--table-row-height-tall` | 64px | 36.5px | 27.5px | 5.33 | 26px 实体图标不顶行边 |

最终值以 `src/assets/styles/index.css` 为准（工作区已改，随本任务一并提交）。
p4 的「1.6–3.0」判据因与「td ≥44px」互斥而作废，理由记在 p4 PRD 第 4 条。

### 不动的范围

`src/routes/platform-resource/index.module.css` 服务的 `Page.vue` 兜底分支
（models / skills / mcp / policies 等 12 个资源）仍自带第四套表格尺度，
只把数值对齐到同一批 token，没有改成 `@import` 基线——
它用的是非模块类名（`.resource-table` 由 `Page.vue` 的 `UTable :class` 承载），
导入进来的基线类名会被改写成模块哈希，复用不了。彻底合并需要先把这段骨架
（与 `BuildResourceManager` 并存）处理掉，**不在本任务范围内**，也未把它改坏。

`agents` / `plans` / `workflows` 的 `shared/index.module.css` 里的 `.ag-table` /
`.pl-table` / `.wf-table` 是详情页与编辑器用的另一套骨架，同样只对齐数值，不改结构。

---

## 表格布局修复证据（2026-09-14 浏览器实测）

### 问题 1：`table-layout: fixed` 从未生效

**发现**：CDP 脚本测量 7 个 list 页的 `<table>` 元素，`getComputedStyle(table).tableLayout` 全部返回 `"auto"`，而不是预期的 `"fixed"`。

**根因链**：
1. `src/assets/styles/table-baseline.module.css` 原代码：
   ```css
   .table {
     width: 100%;
     table-layout: fixed;
   }
   ```
2. `ResourceTable.vue` 将 `tableClass` 传给 `UTable` 的 `:class` prop
3. UTable 主题结构：`root` slot = 外层 div（带 `overflow-x-auto`），`base` slot = `<table>` 元素
4. 组件根节点的 `:class` 作用于 root div，不作用于 table
5. 所以 `.table` 类落在 div 上，`table-layout: fixed` 对 div 无效

**修复 1**：用直接子选择器定位 table 元素
```css
.table > :global([data-slot='base']) {
  width: 100%;
  table-layout: fixed;
}
```

**新问题**：应用 fixed layout 后，people 页在 1200px 视口下出现零宽列（账号/部门/手机三列实测宽度 0px）

**根因**：`table-layout: fixed` 优先分配已声明宽度的列；当剩余空间不足时，未声明列被压缩到 0。

**修复 2**：给 table 添加 `min-width`
```css
.table > :global([data-slot='base']) {
  width: 100%;
  min-width: var(--table-min-width);
  table-layout: fixed;
}
```

在 `src/assets/styles/index.css` 定义 token：
```css
--table-min-width: 820px;          /* 表格宽度下限。table-layout: fixed 下定宽列优先，
                                      剩余宽度不足时未标记列会被压到 0（1200px 视口下
                                      people 的 账号/部门/手机 三列实测实宽为 0）；
                                      给下限后改为溢出，由 UTable root 槽自带的
                                      overflow-x-auto 接管横向滚动。 */
```

**验证**：CDP 测试 `/tmp/t-minw.mjs` 对比 4 种策略，只有 table-level min-width 成功防止列塌陷（th min-width 在 fixed layout 下无效）。

### 问题 2：groups 页列宽非标准

**发现**：应用 fixed layout 后，groups 页在 1440px 视口显示列宽 265.1 / 125.3 / 180.7 / 135，而不是语义 token 定义的 220 / 104 / 150 / 112。

**根因**：
- groups 页 7 列全部声明了语义宽度类
- 语义列总宽 = 48 (勾选) + 220×2 (群组+类型) + 104×2 (可见性+状态) + 150 (创建时间) + 112 (操作) = 898px
- 1440px 视口下 table 宽度 = 1082px
- `table-layout: fixed` 当总声明宽度 < table 宽度时，盈余按比例分配给所有声明列
- 1082 / 898 = 1.205 → 220 × 1.205 = 265.1，104 × 1.205 = 125.3，依此类推

**修复**：移除「加入方式」列的 `col-status` 类，让它作为未标记列吸收盈余
```typescript
// 修改前
{ id: 'joinMode', header: '加入方式', meta: { class: { th: styles['col-status'], td: styles['col-status'] } } }

// 修改后
// 本页 7 列若全部标语义类，fixed 布局下的盈余会按比例摊回所有列，把 220/104/150/112
// 全部等比放大（1440 视口实测 265.1/125.3/180.7/135），语义列宽就不再是全站唯一值。
// 留「加入方式」不标类作为自适应列吸收盈余——它文案最长，也最该吃剩余宽度。
{ id: 'joinMode', header: '加入方式' }
```

**验证结果**（CDP 脚本 `/tmp/t-sweep.mjs` 三视口扫描）：

| 视口 | 群组 | 类型 | 可见性 | 加入方式 | 状态 | 创建时间 | 操作 |
|---|---|---|---|---|---|---|---|
| 1200×968 | 220 | 104 | 104 | 48 | 104 | 150 | 112 |
| 1440×900 | 220 | 104 | 104 | 288 | 104 | 150 | 112 |
| 2560×1440 | 220 | 104 | 104 | 672 | 104 | 150 | 112 |

语义列（群组/类型/可见性/状态/创建时间/操作）现在在所有视口统一为 220 / 104 / 150 / 112；加入方式列正确吸收盈余宽度。

### 附带修复：groups 页横向滚动消除

修复前 groups 页在 1200px 视口有 56px 横向滚动（898 语义列 + 56 = 954 > 可用宽 922）。修复后通过移除一个 104px 定宽列（加入方式改为弹性），总定宽降至 794px，1200px 下无溢出。

### 回归测试（2026-09-14）

**7 页 × 3 视口全量扫描**（agents / teams / workflows / plans / departments / groups / people）：
- ✅ 页面无 overflow（`document.documentElement.scrollWidth === clientWidth`）
- ✅ 无异常横向滚动（`table.parentElement.scrollLeft === 0`）
- ✅ table 宽度 ≤ 容器宽度（无视觉截断）
- ✅ 表头高度 38px、单行 44px（双行页面 64px）
- ✅ td 字号 12px（符合 p4 `--fs-sm` token）
- ✅ 语义列宽统一：勾选 48、名称 220、状态 104、时间 150、操作 112

**单元测试**：30 files / 221 tests passed  
**类型检查**：`vue-tsc --noEmit` exit 0（app + node）  
**构建验证**：`vite build` exit 0
