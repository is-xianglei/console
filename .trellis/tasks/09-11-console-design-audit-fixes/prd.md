# console 前端设计审查与修复

## Goal

在 console 前端完成一次设计审查，回答三个问题——布局是否合理、组件长宽高参数是否合理、
组件放置位置是否恰当——并按优先级修复审查中确认的缺陷。

审查已完成，**完整结论与证据见 `research/design-audit-findings.md`**（含实测数据、
证据强度分级、以及两条被实测推翻的推断）。本任务树负责把结论落成可执行的修复。

审查方式：源码静态审查 + Chrome DevTools 真实渲染测量（viewport 1200×968，dpr=1）。
所有结论标注 `[实测]` / `[静态]` / `[未复现]` 三档证据强度，实施时据此判断可信度。

## Requirements

### 已确认的缺陷（必须修）

- **开关状态显示反了**：agent 编辑页 `USwitch` 被通配选择器盖成灰色，
  逻辑开、视觉关，用户可能误点导致停用正在运行的 Agent。
- **teams 弹窗说明文字无样式**：两处裸 `class="pl-modal-copy"` 在 CSS Modules 下无法解析。
- **移动端分页条被裁**：7 个 list 页绕开 flex 高度链，iOS 溢出 84px / Android 溢出 50px。
- **代码块无等宽字体**：`--font-mono` 指向比例字体 MiSans，实测字形宽度比 3.8:1。
- **可点击目标低于 WCAG 2.2 SC 2.5.8（24×24）下限**：最差为 34×15 的「收起」按钮。
- **字号体系缺失**：全站 61% 的字号声明在 8–11px，表格行高/字号比达 3.8–5.6。
- **三套表格基线并存**，同语义列宽最多 4 种值。

### 约束

- 不改变现有信息架构与页面路由结构，只调尺寸、间距、token 与样式选择器。
- 字号收敛必须分批进行（全站约 591 处 8–11px 声明），每批保持可独立验证。
- 沿用 CSS Modules + 设计 token 体系，不引入新的样式方案。
- 修复必须可回归：涉及交互的改动要有明确的目视验证步骤。

## Acceptance Criteria

- [ ] agent 编辑页的 `USwitch` 在 `data-state=checked` 时呈现 `--ui-primary` 青绿，
      与 workflow 编辑页表现一致（子任务 p0）
- [ ] teams create/edit 的弹窗说明文字有正确样式，与 plans 同位置视觉一致（子任务 p0）
- [ ] 7 个 list 页在 390×844 视口（含 safe-area 34px）下分页条完整可见（子任务 p3）
- [ ] `.md pre code` 的等宽验证通过（`iiii` 与 `WWWW` 渲染宽度相同）（子任务 p2）
- [ ] 三处低于 24×24 的可点击目标补足，`UPagination` 显式声明 `size`（子任务 p1）
- [ ] 字号 scale 建立，8–11px 声明数量显著下降，表格行高/字号比进入合理区间（子任务 p4）
- [x] 表格基线收敛为单一来源，同语义列宽不再出现多份硬编码（子任务 p5）
- [ ] `research/design-audit-findings.md` 第六节列出的两条未复现推断**未被当作缺陷修改**

## Notes

### 子任务地图

| 子任务 | 优先级 | 内容 | 依赖 |
|---|---|---|---|
| `09-11-p0-switch-selector-and-modal-class` | P0 | 开关选择器 + teams 弹窗类名 | 无 |
| `09-11-p1-tap-target-sizes` | P1 | 可点击目标与控件尺寸达标 | 无 |
| `09-11-p2-mono-font-and-reading-width` | P1 | 等宽字体 + 阅读宽度 token | 无 |
| `09-11-p3-list-height-chain` | P1 | 7 个 list 页高度链修复 | 无 |
| `09-11-p4-type-scale` | P1 | 字号体系收敛 | 建议在 p5 之前做 |
| `09-11-p5-table-baseline` | P2 | 表格基线与列宽收敛 | 依赖 p4 的字号 scale |

依赖说明：p0/p1/p2/p3 相互独立，可并行。p4 与 p5 都动表格字号与行高，
建议 p4 先做——p5 收敛基线时需要引用 p4 建立的字号 scale，否则会二次返工。

### 建议的实施顺序

前 5 项（p0 全部 + p1 + p2 的字体部分 + p3）合计约 30 行代码改动，
消掉一个误操作风险、三个 WCAG AA 失败点、一个移动端裁切、一个等宽字体缺失，
性价比最高，建议先做这一批。

### 不做什么

- 不改信息架构（如把 agent 编辑页的三栏改成顶部 tab），
  这类结构性调整在审查结论里有记录，但影响面大，留给后续单独评估。
- 不处理审查中记录但未纳入本任务树的项（如 `ActionIconButton` 0 引用、
  `--skeleton-cols` 失效、`workflows/builder` 缺「保存并启用」、teams 未接后端等）。
  这些在 `research/design-audit-findings.md` 第五节有完整记录，需要时再单独立项。
