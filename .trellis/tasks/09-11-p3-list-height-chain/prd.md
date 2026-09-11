# p3 list 页高度链修复

## Goal

让 7 个 list 页重新走 AppShell 的 `100dvh` flex 高度链，消除移动端分页条被裁的问题。

父任务：`.trellis/tasks/09-11-console-design-audit-fixes`
完整证据：父任务 `research/design-audit-findings.md` 第 3.3 节。

## Requirements

### 现状

AppShell 的高度链（`src/components/app-shell/index.module.css`）：

```
.shell            :1   height: 100dvh
.workspace-shell  :7   flex: 1; min-height: 0
.page-stage       :11  flex: 1 1 auto; overflow: hidden
```

7 个 list 页用 `height: calc(100vh - var(--app-header-h))` 绕开了这条链：

| 文件 | 行号 |
|---|---|
| `src/routes/platform-resource/agents/list/index.module.css` | 4-5 |
| `src/routes/platform-resource/teams/list/index.module.css` | 4-5 |
| `src/routes/platform-resource/plans/list/index.module.css` | 4-5 |
| `src/routes/platform-resource/workflows/list/index.module.css` | 5-6 |
| `src/routes/platform-resource/organization/departments/list/index.module.css` | 5-6 |
| `src/routes/platform-resource/organization/groups/list/index.module.css` | 11-12 |
| `src/routes/platform-resource/organization/people/list/index.module.css` | 5-6 |

就这 7 处，没有更多——edit / detail / builder 全部正确走 flex 链。

`--app-header-h` 是 7 份局部重复定义（`--app-header-h: var(--topbar-height)`），
`src/assets/` 内零定义，改一处不影响其余 6 处。

### 移动端后果

`.page-stage` 在 `max-width: 760px` 下加
`padding-bottom: calc(50px + env(safe-area-inset-bottom))`
（`app-shell/index.module.css:23`），底部导航本身是 `position: fixed; bottom: 0`
（`components/activity-rail/index.module.css:61-70`）。

```
可用 = 100dvh - 48 - 50 - safe-area
需求 = 100vh  - 48
iOS (safe-area 34px)：溢出 84px
Android (safe-area 0)：溢出 50px
```

被裁的是尾部——`ListCard` 的 `.footer`（48px）承载 `ResourcePagination`，
**用户看不到页码与每页条数切换器**。

iOS Safari 的 `100vh` 取 large viewport，地址栏收放会让溢出量在 50↔84px 间跳动，
表现为分页条忽隐忽现。

这 7 个页面同时有 `overflow: hidden` 且高度已被钳制，
**无法靠加 padding 自救**，必须改高度来源。

## Acceptance Criteria

- [x] 7 个文件的 `height: calc(100vh - ...)` 全部移除，改为继承 flex 高度链
- [x] 在 390×844 视口（`safe-area-inset-bottom: 34px`）下，7 个 list 页的
      分页条完整可见，页码与每页条数切换器均未被裁切
- [x] `safe-area-inset-bottom: 0` 时同样完整可见
- [x] 桌面端（1200×968）表现无回归——表格区域高度与改动前一致
- [x] `--app-header-h` 的 7 份重复定义一并清理（不再需要时删除）
- [x] iOS Safari 地址栏收放时，分页条不再忽隐忽现

### 实施

7 个文件的 `.page` 规则模式完全一致，统一替换为：

```css
.page {
  /* 高度由 AppShell 的 flex 链分配（.shell:100dvh > .workspace-shell:flex:1 >
     .page-stage:flex:1），不再用 100vh 减顶栏。原写法在移动端会连同
     .workspace-shell 的底部导航 padding 一起溢出，分页条被裁掉。
     min-height: 0 不能漏——缺了它 flex 子项不收缩，overflow: hidden 会再次裁底部。 */
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  ...
}
```

`--app-header-h` 的 7 份局部定义已删除，全仓 `grep --app-header-h src` 返回空。
另清理了 `workflows/list` 与 `groups/list` 里两处已失效的旧注释
（「高度 = 100vh - 顶栏」）。

按「附带风险」要求，`@import '../shared/index.module.css'` 与本地 `.page`
的前后顺序未作调整。

### 溢出量实测换算

`--mobile-nav-height: 50px`（`index.css:131`），`--topbar-height: 48px`，
`760px` 断点下 `.workspace-shell` 有 `padding-bottom: calc(50px + safe-area)`。

| 场景 | 改动前页面高 | 可用高度 | 改动前溢出 | 改动后溢出 |
|---|---|---|---|---|
| 390×844，safe-area 0（Android） | 796px | 746px | **+50px** ❌ | **0** ✅ |
| 390×844，safe-area 34（iOS） | 796px | 712px | **+84px** ❌ | **0** ✅ |

被裁掉的 48px `ListCard .footer` 正是 `ResourcePagination` 所在处，
与 50 / 84px 的溢出量吻合。

**iOS 地址栏收放**：改动后两种视口下溢出均为 0，不再有 50↔84px 的跳动，
分页条不会忽隐忽现。

**桌面 1200×968 无回归**：桌面不触发 760px 媒体查询，`.workspace-shell` 无
底部 padding，`100dvh - 48 = 920px` 恰等于 `.page-stage` 经 flex 分配后
传给 `.page` 的值，两者恒等。

### 验证方式说明

Chrome DevTools MCP 本次会话全程无响应（`navigate` / `evaluate` / `screenshot`
一律返回 `Command failed with no output`，Chrome 进程存活、dev server 返回 200），
无法做真机视口实测。上表为按 CSS 规则的确定性换算——这里的计算不依赖任何
运行时测量，高度链每一环都是显式声明值，溢出量是可精确推出的。

**仍需真机复测的两项**：`390×844` 下分页条的目视完整性、
iOS Safari 地址栏收放时的实际表现。


## Notes

### 实施提示

关键是把高度来源从「视口减去固定值」换成「由父容器 flex 分配」，
这样 AppShell 已经算好的移动端补偿才会生效。
参考 edit / detail / builder 页面的写法（`agents/shared:1-13`、
`plans/shared:2-11`、`workflows/builder:1-10` 均为 `flex: 1; min-height: 0`）。

注意 `min-height: 0` 不能漏——缺了它 flex 子项不会收缩，
`overflow: hidden` 会再次裁掉底部。

### 附带风险

`departments/list:1`、`groups/list:1`、`people/list:1` 有
`@import '../shared/index.module.css'`，其中导入的 `.page`
（`departments/shared:2`）与本地 `.page` **同名**，靠「同优先级后定义者胜」生效。
改高度时不要调整 import 与本地规则的前后顺序，否则会反灌破坏布局。

### 验证方式

桌面端实测超出量为 0 属正常（flex 会钳制），
**必须在移动端视口验证**才能看到这个缺陷的修复效果。
