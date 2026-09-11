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

### 2. teams 弹窗说明文字无样式

- `src/routes/platform-resource/teams/create/index.vue:73` — `class="pl-modal-copy"`
- `src/routes/platform-resource/teams/edit/index.vue:93` — `class="pl-modal-copy"`

CSS Modules 会哈希化类名，裸 `class=` 拿不到定义；且 `teams/create/index.vue`
全文无 `<style>` 块。`.pl-modal-copy` 只存在于 plans 的样式文件里。

同目录的正确写法可参照 `teams/detail/index.vue:200`
（`:class="styles['tm-modal-copy']"`，定义在 `teams/edit/index.module.css:46`）。

## Acceptance Criteria

- [ ] agent 编辑页的启用开关在 `data-state=checked` 时背景为 `--ui-primary`（`#2dd4bf`），
      在 `data-state=unchecked` 时保持原有灰色，与 workflow 编辑页表现一致
- [ ] 输入框与文本域的底色、边框、`box-shadow` 表现与本改动前**完全一致**（无回归）
- [ ] 在 agent 编辑页用 DevTools 确认：`button[data-slot='base'][data-state='checked']`
      的 `background-color` 计算值为 `rgb(45, 212, 191)`
- [ ] teams create 与 teams edit 的「当前修改尚未保存，离开后将丢失」弹窗文字
      呈现与 plans 同位置一致的样式（字号、颜色、行距）
- [ ] 全仓 grep `pl-modal-copy` 不再出现裸 `class=` 形式

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
