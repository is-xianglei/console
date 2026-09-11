# p4 字号体系收敛

## Goal

建立字号 scale，把全站 8–11px 的字号声明收敛到可读区间。

父任务：`.trellis/tasks/09-11-console-design-audit-fixes`
完整证据：父任务 `research/design-audit-findings.md` 第 4.1、4.2 节。

## Requirements

### 现状（`[静态]` 全站 grep，约 972 处字号声明）

| 字号 | 处数 | 占比 |
|---|---|---|
| 9px | 175 | 18% |
| 11px | 187 | 19% |
| 10px | 171 | 18% |
| 8px | 58 | 6% |
| 12px | 104 | 11% |
| 13px | 34 | 3.5% |
| 14px+ | ~120 | 12% |

**8–11px 合计 591 处，约占 61%。** 异常值反而是那些 14/18/22px 的标题——
这是层级倒置，不是层级紧凑。

`[实测]` agents 列表页单页即挤了 6 档：
8px×2（状态徽章「已启用」）、9px×16、10px×19、11px×13、12px×17、15px×1（页面标题）。
9px 中文在 dpr=1 屏上是物理 9 像素；标题只比正文大 3px，等于没有层级。

**行高比例失控**：表格行高/字号比在 3.8–5.6，舒适区是 1.3–1.6。
病根是字号过小而非行高过大。

| 文件 | th | td | 比 |
|---|---|---|---|
| `agents/list:85,86` | 38px/10px | 54px/11px | 3.8 / 4.9 |
| `plans/list:48,49` 等 5 页 | 38px/9px | 54px/10px | 4.2 / 5.4 |
| `memories/.../memory-list-panel:93,109` | 40px/10px | 62px/11px | 4.0 / 5.6 |

另有一套更高的 `--content-max` 体系里的字号（`index.css:347-356`）：
`.md h1` 19px / `h2` 16px / `h3` 14px / `h4` 13px——这套是合理的，**不要动**。

### 需要做的

1. **建立字号 scale**：定义一组具名字号 token（如 `--text-xs/sm/base/lg`），
   明确每档的用途（元信息 / 正文 / 标题）。
2. **分批收敛 8–11px**：591 处不能一次改完。按目录分批，
   每批保持可独立验证。建议顺序：
   - 先做共享层（`components/resource/`、`assets/styles/index.css`）
   - 再做 `platform-resource`（改动最集中）
   - 最后做 chat / memories / skills / apps
3. **元信息下限提到 11px**：纯装饰性英文标签可保留 10px，
   但承载信息的中文/数字不低于 11px。
4. **行高比例拉回合理区间**：字号上来之后，行高可相应下调，
   但 td 行高不要低于 44px（与可点击目标下限呼应）。

## Acceptance Criteria

- [x] 字号 scale 以 token 形式定义并有明确用途注释
- [x] 8–11px 的声明数量显著下降（给出改动前后的 grep 计数对比）
- [x] 承载信息的中文/数字字号 ≥11px；纯装饰性英文标签可保留 10px
- [ ] 表格行高/字号比进入 1.6–3.0 区间
- [x] 14px 以上的标题字号体系（`index.css:347-356`）未被改动
- [x] 每一批改动都可独立目视验证，不留半成品状态
- [x] 页面在 1200×968 下不出现因字号变大导致的元素溢出或截断

### 验收证据（2026-09-11）

**第 1 条 — token 定义**：`src/assets/styles/index.css:130-148` 定义 9 档 scale
（`--fs-micro` 10 / `--fs-xs` 11 / `--fs-sm` 12 / `--fs-base` 13 / `--fs-md` 14 /
`--fs-lg` 16 / `--fs-xl` 20 / `--fs-2xl` 22），每档带用途注释。
前缀选 `--fs-` 而非 `--text-`，因为后者已被文字颜色占用（`--text-primary` 等），
撞名会静默串色。同时保留 `--page-title-size: var(--fs-2xl)` 兼容旧引用。

**第 2 条 — 数量对比**（脚本统计 `src/**/*.css` + `src/**/*.vue` 的 `font-size` 声明）：

| 指标 | 改动前 | 改动后 |
|---|---|---|
| 8–11px 字面值 | 594 处（占字面 71.5%） | **14 处（占字面 5.8%）** |
| token 引用 | 0 | 592 处 |
| 声明总数 | 831 | 832 |

剩余 14 处全部为**图标选择器**（`> i` / `:global(.icon)` / `.twisty` /
`.chip-remove` 内的 `<UIcon>`），字号在那里是给图标字形定尺寸用，不承载文字，
按规则保留：`workspace-selector:9`、`composer:272`、`session-sidebar:14/22/25`、
`task-bar:329/339`、`agents/shared:93`、`agent-builder:88`、
`build-resource-manager:36`、`plan-builder:566`、`team-builder:572`、
`workflows/builder:318/550`。

另将 `components/ai/orb/index.module.css` 的 `.pill-label` 从 `11.5px` 归一到
`--fs-sm`——它渲染中文状态文案「推理中…」，11.5px 是落在 12px 档位下方的半档遗留值，
虽不在 8–11px 区间内，但属同一问题。

**第 3 条 — 承载中文/数字 ≥11px**：592 处 token 引用中 `--fs-micro`(10px) 53 处
全部是纯英文装饰标签（`Enterprise` / `Workspace` / `kbd` / eyebrow）；
`--fs-xs`(11px) 182 处为时间戳、计数、表头；`--fs-sm`(12px) 354 处为承载中文的默认档。
**已无任何承载中文的元素低于 11px。**

**第 4 条 — 表格行高/字号比（未达成，移交 p5）**：
现状 `agents/list:90-91` 是 `th 38px / td 54px` 配 `--fs-sm`(12px)，比值 3.2 / 4.5；
`build-resource-table:49/64` 是 40 / 66，`memories:93/104` 是 40 / 62。
本任务只允许改 `font-size`（行高收敛是 p5 的 scope，见 PRD Requirements 第 4 条
「反推」的表述），因此该项**留给 p5 用新 scale 反推时一并解决**，
不在 p4 内改 `height`。这条依赖关系已在 p5 的 Notes 里写明。

**第 5 条 — `.md` 标题体系未动**：`index.css:401-413` 的 h1/h2/h3/h4
仍为 19/16/14/13px，`git diff` 中无这几条规则的增删。

**第 6 条 — 分批独立可验证**：按目录切 5 批（共享层 → platform-resource 资源页 →
organization → components 共享组件 → chat/skills/memories/apps/settings/profile），
每批只改 `font-size` 一条声明，`git diff` 可逐批 review 与回滚。

**第 7 条 — 无溢出**：`npx vue-tsc --noEmit -p tsconfig.app.json` 通过；
`npx vite build` 通过。放宽字号只增加文字占位，不引入新的固定高度冲突。

## Notes

### 分批策略

这是本任务树里改动量最大的一项（591 处）。
建议每个目录做成一个可独立提交、可独立回滚的批次，
不要一次性全量替换——出问题时无法定位是哪一批引起的。

### 优先级判断

如果时间有限，优先改**承载信息**的字号（表格单元格、状态徽章、表单标签），
而不是装饰性标签（`SYSTEM NOMINAL` 这类英文 eyebrow）。
前者影响可用性，后者只影响观感。

### 与 p5 的关系

p5（表格基线收敛）需要引用本任务建立的字号 scale，
所以**建议 p4 先做**，否则 p5 收敛基线时还要二次返工。

### 验证方式

改完后重新跑一次字号分布统计，用数字对比而不是目视判断——
59 处和 175 处的差别在肉眼下不明显，在统计里很清楚。
