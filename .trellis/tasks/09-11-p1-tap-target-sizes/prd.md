# p1 可点击目标与控件尺寸达标

## Goal

把低于 WCAG 2.2 SC 2.5.8（Target Size Minimum，24×24 CSS px）下限的可点击目标补足。
这些是全站最省事、收益最高的改动——约 10 行 CSS 消掉三个 AA 失败点。

父任务：`.trellis/tasks/09-11-console-design-audit-fixes`
完整证据：父任务 `research/design-audit-findings.md` 第 4.4 节。

## Requirements

### 1. 表格树形展开按钮（影响最大）

`src/components/resource/table/index.module.css:98-100`

```css
width: 20px;
height: 20px;
flex: 0 0 20px;
```

这是 `departments/list` 树形展开的**唯一**入口——点行是 `@select` 跳详情，不触发展开。
20×20 低于下限，且没有任何其他方式可以展开树节点。

### 2. 筛选面板收起按钮

`src/components/resource/filter-panel/index.module.css:32-41`

`.toggle` 没有声明 `width` / `height`，`font-size: 10px`（`:39`）+ 图标
`font-size: 12px`（`:48`）→ 内容盒约 **16×14**。
这是唯一收起/恢复筛选的按钮。

### 3. 批量操作复选框

`src/components/resource/table/index.vue:218, 221`

`UCheckbox` 在 Nuxt UI `size='sm'` 下为 `size-3.5`（14×14），命中区 `h-4`（16px）。
含全选与行选，批量操作的入口。

### 4. UPagination 补显式 size

`src/components/resource/pagination/index.vue:96-101` 的 `<UPagination>`
未声明 `size`，完全依赖 `vite.config.ts` 的全局 `defaultVariants.size='sm'`。
三个同级控件里唯一靠全局默认的，属脆性写法。

### 5. 顺带记录（本次可不改）

以下也低于 44px 触屏建议值，但已在移动端断点做过部分补偿，
本次仅记录，是否调整由实施者判断：

- 顶栏图标 30×30
- rail 图标 36×36
- 行内图标 27×27 / 26×26
- 会话行操作按钮 21×21（含「删除」危险操作，优先级高于其他行内按钮）
- `收起` 按钮 **34×15**（全站最差，但它是纯文本按钮，修法与前几项不同）

## Acceptance Criteria

- [x] `components/resource/table/index.module.css` 的展开按钮命中区 ≥24×24
- [x] `components/resource/filter-panel/index.module.css` 的 `.toggle` 命中区 ≥24×24
- [x] `table/index.vue` 的全选与行选复选框命中区 ≥24×24
- [x] `pagination/index.vue` 的 `UPagination` 显式声明 `size`
- [x] 三处控件在视觉上**不显得臃肿**——命中区扩大优先用透明内边距或
      `::before` 伪元素撑开，不去放大可见图标本身
- [x] departments 列表页的树形展开在扩大命中区后仍能正确触发展开/收起
      （注意不要与行的 `@select` 冲突）—— **静态证实**，浏览器实测仍缺，见下

### 第 5 条的证据与残留风险

`table/index.vue:226-234`：

```html
<button v-if="slotProps.row.getCanExpand()" type="button"
        :class="styles.treeToggle"
        @click.stop="slotProps.row.toggleExpanded()">
```

`@click.stop` 是 Vue 3 的 `.stop` 修饰符，编译为
`withModifiers(handler, ['stop'])` → 入口先 `event.stopPropagation()` 再执行业务。
行的 `@select` 挂在祖先 `<tr>` 上，事件在 `<button>` 处即被切断，
**不会**同时跳详情。这一点与命中区大小无关，扩大前后都成立。

伪元素不会「吞掉」点击：`::before` 是该 button 自身生成的盒子，
落在它上面的点击，`event.target` 仍是这个 button（伪元素不产生独立节点，
不可作为事件目标），所以在原 20×20 内点、或在新增的 4px 边缘环上点，
走的都是同一条 handler。

`::before` 是绝对定位，`position: relative` 的定位于 `.treeToggle`（`width: 20px`），
故它**不参与布局**——sticky/flex 行高不受影响，28×28 溢出到行内的部分不撑行
（`flex: 0 0 20px` 的 20px 仍是它的占位）。

**残留风险（未能排除）**：`.treeToggle` 与相邻的名称单元格之间只有
`gap` 的横向间距，28px 命中区在左右各外扩 4px，可能与名称单元格的
`<a>` / 文本可点区域在边缘 4px 上重叠。重叠时 DOM 上后渲染者/更高层级的
元素先收到点击——这里 `.treeToggle` 是 `position: relative`（有定位），
名称单元格是静态定位，**定位元素在绘制顺序上高于静态元素**，
因此这 4px 归 `.treeToggle`。此结论来自 CSS 绘制顺序规则，未经浏览器确认。

**未做的部分**：`getBoundingClientRect()` 实测与真机点击。
Chrome DevTools MCP 在本项目中始终无响应（`navigate` / `evaluate` / `screenshot`
一律无输出），本机亦无 playwright / puppeteer / jsdom。

## Notes

### 实施记录

| 位置 | 原命中区 | 改法 | 改后 |
|---|---|---|---|
| `table/index.module.css` `.treeToggle` | 20×20 | `::before` 28×28 绝对居中 | 28×28 |
| `filter-panel/index.module.css` `.toggle` | ~16×14 | `::before` `inset: 50% -4px auto -4px` + `height: 24px` | 内容宽+8 × 24 |
| `table/index.module.css` `.selectCell [data-slot='base']` | 14×14 | `padding: 5px`（透明） | 24×24 |
| `pagination/index.vue` | 依赖全局默认 | 显式 `size="sm"` | 与同级控件对齐 |

三处均未改动可见尺寸：`.treeToggle` 的 20×20 盒子、`.toggle` 的 10px 字号、
checkbox 的 indicator（`size-full` → 仍由 `size-3.5` 决定）都保持原值。
checkbox 的 `padding: 5px` 落在 `size-3.5` 外部（Tailwind `size-*` 是
`width`/`height`，内容盒 + padding 后命中区 24×24），环线 `ring-inset`
位于 padding 外缘，可见方块视觉不变。

`pagination` 的 `size` 选 `sm` 而非其他值，理由是与同一 `styles.controls`
行内的 `USelect`（`:92`）和 `UInputNumber`（`:109`）一致——原先它靠
`vite.config.ts` 的全局 `defaultVariants.size='sm'` 兜底，渲染结果相同，
改动只是把隐式依赖显式化，无视觉变化。

### 验证方式

DevTools 里逐个数 `getBoundingClientRect()`，不要只看 CSS 声明值——
`flex: 0 0 20px` 这类约束会让 `padding` 撑不开实际命中区。

本次会话 DevTools MCP 连接不可用（`navigate` / `evaluate` / `screenshot`
均无输出），改为用 Vite dev server 的转译产物核对选择器与声明值：
`curl -s http://localhost:5173/src/components/resource/table/index.module.css`
确认 `._selectCell_4myj8_77 [data-slot='base'] { padding: 5px }` 与
`.treeToggle` 的 `::before` 规则均已生成且未被合并丢弃。
**树形展开的实际点击行为与三处 `getBoundingClientRect()` 仍需浏览器复测。**
