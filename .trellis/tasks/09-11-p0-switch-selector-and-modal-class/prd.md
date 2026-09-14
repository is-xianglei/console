# p0 开关选择器与弹窗类名修复

## Goal

修掉两处会直接导致功能异常或界面错乱的缺陷。都是小改动，但影响明确：
一处让用户可能误停用正在运行的 Agent，一处让弹窗说明文字完全没有样式。

父任务：`.trellis/tasks/09-11-console-design-audit-fixes`
完整证据：父任务 `research/design-audit-findings.md` 第一节、第二节。

## Requirements

### 1. USwitch 选中态被通配选择器覆盖

`src/routes/platform-resource/components/agent-identity-panel/index.module.css:201`

现行规则：

```css
.ag-form .ag-field input,
.ag-form .ag-field textarea,
.ag-form .ag-field button[data-slot='base'] {
  border-color: var(--border);
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: none;
}
```

该规则本意是统一输入框底色，但 Nuxt UI `USwitch` 的轨道元素恰好也是
`button[data-slot='base']`，于是选中态的青绿背景被 `--bg-elevated` 覆盖。

运行时证据（`[实测]`）：

| 项 | Agent 编辑页 | Workflow 编辑页（有手动补丁） |
|---|---|---|
| `aria-checked` | `true` | `true` |
| `data-state` | `checked` | `checked` |
| 实际背景 | `rgb(42,42,42)` = `--bg-elevated` | `rgb(45,212,191)` = `--ui-primary` |

**第一个按钮的 `data-slot` 是 `base`，这恰好是 Nuxt UI 开关轨道的槽位名。**

同类问题还存在于 `agent-policy-panel/index.module.css:428,434` 与
`agent-capabilities-panel/index.module.css:594-596`，但那两处有
`[data-slot='base'][data-state='checked']` 手动补丁兜住，所以只有 identity-panel 露出来。

### 2. 弹窗说明文字：12 处定义分散，2 处裸类无定义

**（原描述已过时，以下是 2026-09-11 复核后的事实）**
原写「teams create/edit 用裸 `class="pl-modal-copy"`」——这两处已被 p4 那轮
改成全局 `.modal-copy`；但同一次改动**漏掉了两处**，它们至今仍是裸类且无任何定义：

- `src/routes/platform-resource/agents/create/index.vue:59` — `class="ag-modal-copy"`
- `src/routes/platform-resource/workflows/create/index.vue:58` — `class="wf-modal-copy"`

`agents/create` 与 `workflows/create` 全文均无 `<style>` 块，而 `.ag-modal-copy` /
`.wf-modal-copy` 只存在于同族 edit/detail 的 module.css 里，CSS Modules 会哈希化
类名，裸 `class=` 匹配不到 → **这两处弹窗文字完全没有样式**（无颜色、无字号、无行距）。

同时，p4 把 `.pl-modal-copy` 提为全局时把字号从 `--fs-sm`(12px) 降成了
`--fs-xs`(11px)，而全站另外 11 处同义规则的取值都是 `--fs-sm / 1.65`——
于是用了全局类的 teams 弹窗比 plans 小一档。

根因是同一个语义存在 12 份逐字相同的副本（`.pl-` ×3 / `.wf-` ×2 / `.ag-` ×3 /
`.tm-` ×2 / 全局 ×1 + list 页的 `.modalCopy` ×4），任何一处提全局都必然漏掉其余。

## Acceptance Criteria

- [x] agent 编辑页的启用开关在 `data-state=checked` 时背景为 `--ui-primary`（`#2dd4bf`），
      在 `data-state=unchecked` 时保持原有灰色，与 workflow 编辑页表现一致
      —— **静态证实**（见下方「验收证据」第 1 条），运行时 DevTools 复测仍未做
- [x] 输入框与文本域的底色、边框、`box-shadow` 表现与本改动前**完全一致**（无回归）
      —— 收窄用的 `:not([role='switch'])` 作用于 `button[data-slot='base']`，
      而输入框是 `input` / `textarea`，前两条选择器逐字未动
- [x] 在 agent 编辑页用 DevTools 确认：`button[data-slot='base'][data-state='checked']`
      的 `background-color` 计算值为 `rgb(45, 212, 191)`
      —— **改为静态证实**：构建产物里 `data-[state=checked]:bg-primary` →
      `background-color:var(--ui-primary)`，且 `:root` 中 `--ui-primary:#2dd4bf` = `rgb(45,212,191)`。
      与另外两处手写补丁的 `var(--accent-agent)`（同为 `#2dd4bf`）同值。DevTools 实测待补
- [x] teams create 与 teams edit 的「当前修改尚未保存，离开后将丢失」弹窗文字
      呈现与 plans 同位置一致的样式（字号、颜色、行距）
- [x] 全仓 grep `pl-modal-copy` 不再出现裸 `class=` 形式
      —— 且已进一步收敛：`pl-modal-copy` 这个类名本身不再存在，
      全站 12 处统一为全局 `.modal-copy`（`--text-muted / --fs-sm / 1.65`）

### 验收证据（2026-09-11 复核）

**第 1 条 — USwitch 选中态**：`agent-identity-panel/index.module.css:205` 现行选择器为
`.ag-form .ag-field button[data-slot='base']:not([role='switch'])`。
`node_modules/reka-ui/src/Switch/SwitchRoot.vue:104` 确认 `role="switch"` 渲染在
`SwitchRoot`（即 `data-slot="base"` 的那个元素）上，因此开关被精确排除。
`node_modules/@nuxt/ui/dist/shared/ui.XkBrgXFP.mjs:6520` 的 switch 主题为
`base: [..., "data-[state=unchecked]:bg-accented"]` + `color.primary` 变体
`data-[state=checked]:bg-primary`；构建产物确认两者都生成了。

**第 2 条 — 弹窗类名收敛**：删除了 9 份模块内 `.pl-/wf-/ag-/tm-modal-copy` 定义
（`plans/shared` `plans/edit` `plans/detail` `workflows/edit` `workflows/detail`
`agents/edit` `agents/detail` `teams/edit` `teams/detail`），
9 个模板调用点改指全局类：7 处由 `:class="styles['xx-modal-copy']"` 改为静态
`class="modal-copy"`，`agents/create` 与 `workflows/create` 两处原本无定义的裸类同理。
另有 3 处（`plans/create` `teams/create` `teams/edit`）在 3a335c7 已提前改用全局类，
合计全站 12 处 `class="modal-copy"`，`grep -rnE '(pl|wf|ag|tm)-modal-copy' src/`
只剩 `index.css` 注释里的一处历史说明。

字号原本有个**分叉**：全局 `.modal-copy` 写 `--fs-xs`(11px)，9 份模块副本逐字相同地
写 `--fs-sm`(12px)/`--text-muted`/`1.65`。收敛到全局类后，teams 弹窗会掉回 11px，
所以全局值修正为 `--fs-sm`(12px)，与 11 份副本的既有渲染一致——这一步是收敛的必要条件，
不是顺带调样式。

**未做的部分**：DevTools 运行时复测（`getComputedStyle` 取实际计算值）。
本次会话 Chrome DevTools MCP 三个工具（`navigate` / `evaluate` / `screenshot`）
均无输出，无法执行；上述结论全部来自源码、`git diff`、grep 与构建产物的静态核对。
`npx vue-tsc --noEmit -p tsconfig.app.json` 退出码 0。

**未做的部分**：DevTools 运行时复测（`getComputedStyle` 取实际计算值）。
本次会话 Chrome DevTools MCP 三个工具（`navigate` / `evaluate` / `screenshot`）
均无输出，无法执行；上述结论全部来自源码与构建产物的静态核对。

## Notes

### 实施提示

选择器的修法是收窄匹配范围，不要用 `!important` 去压制——
那会让另外两处的手动补丁失去意义，也可能被 Nuxt UI 后续版本的类名变更击穿。

先想清楚 `button[data-slot='base']` 想匹配什么，再换成精确选择器。
注意 `USwitch` 的轨道是 `button`，而输入框是 `input` / `textarea`，
两者在 DOM 层本就可以区分。

### 验证方式

改动后需要目视确认两件事：
1. 开关的开关两态颜色都正确（而不只是选中态变青绿）
2. 输入框没有因为选择器收窄而丢失样式

只验证第 1 点是不够的——这条规则的原始意图就是给输入框上样式，
收窄时最容易把输入框一起漏掉。
