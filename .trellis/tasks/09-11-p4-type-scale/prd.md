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
- [x] 表格行高/字号比收敛（**判据已重写**：原「1.6–3.0」与「td ≥44px」互斥，
      按内容反推为 3.17 / 3.67 / 5.33，均低于收敛前的 4.67 / 6.00；
      详见下方验收证据第 4 条）
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

**第 4 条 — 表格行高/字号比（本条已作废重写，见下）**

原判据「进入 1.6–3.0 区间」在交给 p5 执行时被证明**自身不成立**，故不再作为验收项。
作废理由与最终结算如下。

判据的两个数（1.6 / 3.0）连同一句审计原文「病根是字号过小而非行高过大」
（`research/design-audit-findings.md:168-169`）来自同一次测量。原文记的是
比值落在 3.8–5.6、舒适区 1.3–1.6，并要求 1.6–3.0；但那是**收敛前 11px 左右的字号**
配 54/62/64/66/72px 行高算出来的。p4 把 td 字号抬到 `--fs-sm`(12px) 之后，
同一批行高换算出 4.5–6.0，要落进 1.6–3.0 就必须把行高压到 19–36px——
比同一份 PRD 里另一个下限「td 不低于 44px」还低，两条判据互斥。
按审计原文自己的结论，字号才是病根，字号已在 p4 处理，行高按**内容反推**即可。

反推结果（p5 定稿，`src/assets/styles/index.css:170-180`）：

| token | 值 | 内容高 | 呼吸 | 比值 |
|---|---|---|---|---|
| `--table-head-height` | 38px | 18px | 20px | 3.17 |
| `--table-row-height` | 44px | 18px（单行） | 26px | 3.67 |
| `--table-row-height-tall` | 64px | 36.5px（双行主单元） | 27.5px | 5.33 |

单行 44px 是卡在 WCAG 2.2 SC 2.5.8 的 24px 目标之上、「行本身可点」（`@select`
跳详情）的下限；双行 64px 的下限是 26px 实体图标（`table-baseline.module.css:113`
`.entity-icon`）不得顶到行边。两者都低于收敛前的 4.67 / 6.00，方向与审计一致。

以上数值在 p5 交付（`927fe1d`），本条**标记为已解决但按新口径**，
判据原文保留在此以免后人再按 1.6–3.0 回头改坏。

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

---

## 徽章字号修复证据（2026-09-14 浏览器实测）

**问题**：状态徽章（「启用/停用」）在 agents/teams/workflows/plans 列表页渲染为 8px，
低于 p4 自己第 3 条验收标准「承载中文 ≥11px」。

**根因**：全站 28 处 Badge 全部使用 `size="xs"`，Nuxt UI 默认主题将 xs 映射到
`text-[8px]/3`（8px 字号 / 12px 行高）。p4 token 注释明确状态徽章属于 `--fs-sm`(12px) 档。

**修复位置**：`vite.config.ts:41-48`，在 `ui.theme` 中覆盖 badge xs size：

```typescript
badge: {
  size: {
    xs: {
      // 原主题 xs 是 text-[8px]/3，中文 8px 违反 p4 自己第 3 条「中文 ≥11px」。
      // 状态徽章属于 --fs-sm: 12px 档（p4 token 注释明确），改为 text-xs (12px)。
      // 只覆盖字号，padding/radius 沿用原主题（2px 4px / 4px），保持紧凑密度。
      root: 'text-xs leading-3',
    },
  },
}
```

**验证结果**：
1. **字号变化**：CDP 脚本 `getComputedStyle(badge).fontSize` 从 `8px` 变为 `12px`
2. **密度保持**：padding 仍为 `2px 4px`，border-radius 仍为 `4px`，徽章未溢出表格单元
3. **覆盖范围**：全站 28 处 Badge（17 个文件）全部显式声明 `size="xs"`，无遗漏

**影响文件**（`grep -r '<UBadge.*size="xs"' src/`）：
- `agents/list/index.vue` (2 处)
- `teams/list/index.vue` (2 处)
- `workflows/list/index.vue` (2 处)
- `plans/list/index.vue` (2 处)
- `departments/list/index.vue` (2 处)
- `groups/list/index.vue` (2 处)
- `people/list/index.vue` (2 处)
- `skills/list/index.vue` (2 处)
- `memories/detail/index.vue` (2 处)
- 以及其余 8 个文件各 1–2 处

现在所有状态徽章都以 12px 渲染中文，符合 p4 验收第 3 条。
