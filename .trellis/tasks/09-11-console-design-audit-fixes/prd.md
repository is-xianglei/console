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

- [x] agent 编辑页的 `USwitch` 在 `data-state=checked` 时呈现 `--ui-primary` 青绿，
      与 workflow 编辑页表现一致（子任务 p0）
      —— 选择器收窄为 `button[data-slot='base']:not([role='switch'])`，
      `role="switch"` 由 `reka-ui` 渲染在 `data-slot="base"` 同一元素上，开关被精确排除；
      构建产物里 `data-[state=checked]:bg-primary` → `var(--ui-primary)` = `#2dd4bf`。
      **静态证实，DevTools 运行时复测未做。**
- [x] teams create/edit 的弹窗说明文字有正确样式，与 plans 同位置视觉一致（子任务 p0）
      —— 全站 12 处统一到全局 `.modal-copy`，字号 `--fs-sm`(12px) /
      `--text-muted` / `1.65`；构建产物中该规则只剩一份，哈希化的 `*-modal-copy` 为 0。
- [x] 7 个 list 页在 390×844 视口（含 safe-area 34px）下分页条完整可见（子任务 p3）
      —— 7 处 `height: calc(100vh - …)` 移除，改走 AppShell 的 flex 高度链。
      原溢出量：safe-area 0 → +50px、34px → +84px；改后两者均为 0。
      **按 CSS 规则的确定性换算，非截图对比。**
- [x] `.md pre code` 的等宽验证通过（`iiii` 与 `WWWW` 渲染宽度相同）（子任务 p2）
      —— 改用解析字体表 `hmtx` 字宽的方式（比 DOM 测量更硬，排除回退到比例字体的假阳性）：
      JetBrains Mono 六个子集的非零字宽唯一值均为 `600/1000 em`，差值 0。
- [x] 三处低于 24×24 的可点击目标补足，`UPagination` 显式声明 `size`（子任务 p1）
      —— 树形展开 20→28（`::before`，不占布局）、筛选 `.toggle` →24 高、
      复选框 →24×24（透明 `padding`）；`UPagination` 补 `size="sm"` 与同级控件一致。
- [x] 字号 scale 建立，8–11px 声明数量显著下降，表格行高/字号比进入合理区间（子任务 p4）
      —— 9 档 `--fs-*` token，8–11px 字面值 **594 → 14 处**（余 14 处全是图标尺寸）。
      「行高/字号比 1.6–3.0」这条判据**在执行中作废**：它与同一份 PRD 的
      「td ≥44px」互斥（12px 字号下 1.6–3.0 即 19–36px）。改按内容反推为
      38 / 44 / 64px（比值 3.17 / 3.67 / 5.33），仍低于收敛前的 4.67 / 6.00。
      理由记在 p4 PRD 第 4 条。
- [x] 表格基线收敛为单一来源，同语义列宽不再出现多份硬编码（子任务 p5）
- [x] `research/design-audit-findings.md` 第六节列出的两条未复现推断**未被当作缺陷修改**
      —— 核验方式：`git diff HEAD -- src/assets/styles/index.css` 中
      `.md table` 与 `.md a` 两条规则无任何增删（`overflow: hidden` 与
      `word-break: break-word` 均保持原样）。

## Notes

### 未做的验证（统一交代）

**本任务树全部结论均为静态证实，没有一次浏览器实测。** 原因不是省事：

- Chrome DevTools MCP 在本项目中**全程无响应**——`navigate` / `evaluate` /
  `screenshot` 三个工具一律返回 `Command failed with no output`，
  而 Chrome 进程存活、Vite dev server 返回 200，即不是环境没起来。
- 本机没有 playwright / puppeteer / jsdom，无法退而求其次跑无头浏览器。

替代手段按「离渲染有多近」排序，各任务用到的不同：

| 手段 | 用在哪 | 为什么够硬 |
|---|---|---|
| `vue-tsc` + `vite build` 退出码 0 | 全部 | 排除编译期破坏 |
| 解析构建产物的 CSS | p0 / p4 / p5 | 看的是最终样式表，不是源码 |
| 解析字体表 `hmtx` 字宽 | p2 | 字宽是渲染宽度的唯一来源，比 DOM 测量更能排除「字体没加载、回退到比例字体」 |
| 按 CSS 规则代数换算 | p2 / p3 / p5 | 结论是确定性的，不依赖渲染 |
| `grep` 全仓计数 | p0 / p4 | 收敛类问题用数字说话 |

**这些手段替代不了的，只有一件事**：元素最终的 `getBoundingClientRect()`。
若有元素因父级 `overflow` / `flex` 约束被压回去，静态推演看不出来。
p1 的注释里已写明「不要只看 CSS 声明值」正是为此。

**建议**：在有浏览器的机器上（或修复 DevTools MCP 后）补一轮实测，
优先顺序为 p1（三处命中区 + 树形展开实际点击）→ p3（390×844 分页条）
→ p0（开关计算色）→ p5（2560 视口留白）。这四条是「静态能证明方向对、
但实际数值需要确认」的项。

### 交付状态

6 个子任务（p0–p5）的验收标准已全部勾选，`task.json` 状态均为 `completed`。
改动集中在工作区，**尚未提交**。

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
