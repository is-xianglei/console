# console 前端设计审查结论

审查日期：2026-09-11
审查范围：`src/` 全量（布局 / 组件尺寸参数 / 组件放置位置）
审查方式：源码静态审查 + 真实渲染测量

## 证据强度分级

本文每条结论都标注证据强度，实施时请以此判断可信度：

- `[实测]` — 真实渲染测量得出（Chrome DevTools，viewport 1200×968，dpr=1，深色主题已登录状态）
- `[静态]` — 读源码得出，未经运行时验证
- `[未复现]` — 静态推断但实测推翻，**已从缺陷清单撤下**，列在文末避免重复踩坑

## 总体结论

布局骨架方向正确（rail → 侧栏 → 内容区的控制台惯例），桌面端高度链无故障。
问题集中在三处：

1. 一个会直接导致误操作的开关显示 bug
2. 全站 61% 的字号声明在 11px 以下
3. 导航占用约 42% 宽度，主任务区反而最窄

## 一、必修：开关状态显示反了（P0）

`[实测]` `src/routes/platform-resource/components/agent-identity-panel/index.module.css:201`

```css
.ag-form .ag-field button[data-slot='base'] { background: var(--bg-elevated); }
```

该规则本意是统一输入框底色，但 Nuxt UI `USwitch` 的轨道元素恰好也是
`button[data-slot='base']`，选中态的青绿背景被覆盖成灰色。

运行时证据：

| 项 | Agent 编辑页 | Workflow 编辑页（有手动补丁） |
|---|---|---|
| `aria-checked` | `true` | `true` |
| `data-state` | `checked` | `checked` |
| 实际背景 | `rgb(42,42,42)` = `--bg-elevated` | `rgb(45,212,191)` = `--ui-primary` |

结论：逻辑为「开」，视觉为「关」。用户看到灰色开关配「已启用」文字，
最自然的动作是点击它，**结果把正在运行的 Agent 停用**。

同类问题还存在于 `agent-policy-panel/index.module.css:428,434` 与
`agent-capabilities-panel/index.module.css:594-596`，但那两处有手动补丁
`[data-slot='base'][data-state='checked']` 兜住，所以只有 identity-panel 露出来了。

## 二、必修：teams 弹窗类名无样式（P0）

`[静态 + 独立复核]`

- `src/routes/platform-resource/teams/create/index.vue:73` — `class="pl-modal-copy"`
- `src/routes/platform-resource/teams/edit/index.vue:93` — `class="pl-modal-copy"`

CSS Modules 会把类名哈希化，裸 `class=` 拿不到 `.pl-modal-copy` 的定义；
且 `teams/create/index.vue` 全文无 `<style>` 块（grep 计数 0）。
`.pl-modal-copy` 只存在于 `plans/shared/index.module.css:635`、
`plans/edit/index.module.css:45`、`plans/detail/index.module.css:152`。

同目录的正确写法在 `teams/detail/index.vue:200`（`:class="styles['tm-modal-copy']"`），
定义在 `teams/edit/index.module.css:46`。

后果：两处「当前修改尚未保存，离开后将丢失」弹窗说明文字**无任何样式**。

## 三、布局合理性

### 3.1 宽度分配倒置 `[实测]`

1200px 视口下：

```
chat 页        rail 48 + 侧栏 276 + 对话 510 + 执行图 356  → 主任务区 42.5%
agent 编辑页   rail 48 + 侧栏 276 + 步骤导航 180 = 504    → 42% 被导航占用
```

agent 编辑页的 180px 左侧步骤导航只有 4 项，却占满全高；右侧 696px 的
「基本信息」面板只有 3 个字段，垂直方向约 56% 为空。4 项完全可以做成顶部横向 tab。

### 3.2 编辑页骨架分叉 `[静态]`

| 维度 | agents | teams / plans / workflows |
|---|---|---|
| 结构 | 三栏 `196px minmax(0,1fr) 300px` | 单列 |
| 宽度上限 | 无（1920px 铺满） | `max-width: 1100px` |
| 头部高 | 64px + 硬编码 `padding: 8px 14px` | 58px + `var(--page-gutter)` |
| 断点机制 | `@container`（侧栏开合会重排） | `@media (max-width: 900px)`（不重排） |
| 保存按钮 min-height | 40px | 34px |

位置：
- agents 三栏：`components/agent-builder/index.module.css:175`
- 其余上限：`team-builder:171`、`plan-builder:165`、`workflows/builder:138`
- 头部：`agent-builder:107-109` vs `team-builder:20-22`
- 按钮：`agent-builder:352` vs `team-builder:72` / `plan-builder:71` / `workflows/builder:71`
- 另有一套 `36px` 在页面层：`agents/shared:22`、`plans/shared:20`、`workflows/shared:20`

`workflows/edit` 还是纵向堆叠卡片、无导航，滚动 1.5 屏（876×862 视口 / 1331px 内容）。
同一资源族的两个编辑页，用户切换要重新学一遍。

### 3.3 移动端分页条被裁 `[静态，含换算]`

7 个 list 页用 `height: calc(100vh - var(--app-header-h))` 绕开 AppShell 的
`100dvh` flex 链（AppShell: `.shell{height:100dvh}` → `.workspace-shell{flex:1;min-height:0}`
→ `.page-stage{flex:1 1 auto;overflow:hidden}`）。

| 文件 | 行号 |
|---|---|
| `agents/list/index.module.css` | 4-5 |
| `teams/list/index.module.css` | 4-5 |
| `plans/list/index.module.css` | 4-5 |
| `workflows/list/index.module.css` | 5-6 |
| `organization/departments/list/index.module.css` | 5-6 |
| `organization/groups/list/index.module.css` | 11-12 |
| `organization/people/list/index.module.css` | 5-6 |

就这 7 处，**没有更多**——edit / detail / builder 全部正确走 flex 链。

`--app-header-h` 是 7 份局部重复定义（`--app-header-h: var(--topbar-height)`），
`src/assets/` 内零定义，改一处不影响其余 6 处。

移动端换算（`.page-stage` 在 `max-width:760px` 下加
`padding-bottom: calc(50px + env(safe-area-inset-bottom))`，底部导航为 `position:fixed`）：

```
可用 = 100dvh - 48 - 50 - safe-area
需求 = 100vh  - 48
iOS (safe-area 34px)：溢出 84px
Android (safe-area 0)：溢出 50px
```

被裁的是尾部——`ListCard` 的 `.footer`（48px）承载分页条，
**用户看不到页码与每页条数切换器**。iOS Safari 的 `100vh` 取 large viewport，
地址栏收放会让溢出量在 50↔84px 间跳动，表现为分页条忽隐忽现。

### 3.4 其他布局分叉 `[静态]`

- `departments/list` 没有分页，footer 换成手写计数条
  （`index.vue:197-198` + `index.module.css:62-67`，10px 裸文本、无 `border-top`），
  与其余六页的 `ResourcePagination`（48px + 分隔线）并排时底部不齐。
- `people/list` 的 `.page` 用 `gap: 0`（`:10`），其余六页 `gap: 16px`。
- 组织筛选栅格塌陷断点三个值：`departments/list:73` `720px` / `groups/list:88` `1024px` / `people/list:155` `1199px`。
- 四个构建资源 list 页的 css 里 `@media` 出现次数均为 **0**。

## 四、组件长宽高参数

### 4.1 字号体系基本不存在 `[静态，全站 grep]`

全站 `.css` 字号声明分布（约 972 处）：

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
9px 中文在 dpr=1 屏上是物理 9 像素，笔画会糊成块；标题只比正文大 3px，等于没有层级。

**行高比例失控**：所有表格行高/字号比在 3.8–5.6，舒适区是 1.3–1.6。
病根是字号过小而非行高过大。

| 文件 | th | td | 比 |
|---|---|---|---|
| `agents/list:85,86` | 38px/10px | 54px/11px | 3.8 / 4.9 |
| `plans/list:48,49` 等 5 页 | 38px/9px | 54px/10px | 4.2 / 5.4 |
| `memories/.../memory-list-panel:93,109` | 40px/10px | 62px/11px | 4.0 / 5.6 |

### 4.2 三套表格基线并存 `[实测 + 静态]`

| 基线 | th | td | 名称列 | 操作列 | 使用者 |
|---|---|---|---|---|---|
| 共享基线 | 36px | 64px | 220px | 76px | `platform-resource/index.module.css:34-39` |
| 构建资源 | 38px | 54px | auto / 22% | 10% / auto | 7 个 list 页 |
| memories | 40px | 62px | 290px | 88px | memories 独占 |

其中 `index.module.css:33` 还写了 `min-width: 820px; table-layout: fixed`，
`agents/list/index.module.css:48` 也写了 `table-layout: fixed` 但列宽用百分比——
**共享基线被部分页面继承、被另一部分覆盖**，这解释了实测 64px（容器层）
与静态 54px（`td` 层）的差异。

**同语义列宽最多 4 种值**：

| 语义列 | 值 | 位置 |
|---|---|---|
| 名称 | `220px` | `skills/.../skill-list-panel:114` |
| 名称 | `290px` | `memories/.../memory-list-panel:132` |
| 名称 | `22%`（=317px@1440） | `agents/list:57-58` |
| 名称 | auto | teams 等 4 页 |
| 操作 | `88px` | skills:130 / memories:151 |
| 操作 | `10%`（=144px@1440） | `agents/list:67-68` |
| 操作 | `76px` | `platform-resource/index.module.css:39` |

三套 shared 之间也已漂移：
主列 `agents/shared:372` `222px` / `plans/shared:397` `230px` / `workflows/shared:397` `260px`；
成员列 `190px` / `230px` / `210px`；操作列 `112px` / `132px` / `132px`。

### 4.3 内容宽度 token 语义重叠 `[实测]`

- `src/assets/styles/index.css:107` — `--content-max: clamp(880px, 84vw, 1400px)`（4 个使用点）
- `src/assets/styles/index.css:108` — `--page-content-max: 1500px`（其余全部）

`--content-max` 只被 chat / apps 使用，platform-resource 零命中（无跨域混用），
但 `--page-content-max: 1500px` 在 1440px 及以下视口**永不生效**；
7 个 list 页的 `.page` 则完全没有 `max-width`，而 detail 页有——同一资源「列表铺满、详情限宽」。

**阅读宽度超宽** `[实测]`：`--content-max` 在 1200px 视口是 1008px（约 71 汉字/行），
1920px 顶到 1400px（**约 102 汉字/行**），舒适区是 25–40 字/行。

### 4.4 可点击目标低于 WCAG 下限 `[实测 + 静态]`

WCAG 2.2 SC 2.5.8 下限为 24×24：

| 位置 | 实际尺寸 | 后果 |
|---|---|---|
| `components/resource/table/index.module.css:98-100` | 20×20 | 树形展开的**唯一**入口 |
| `components/resource/filter-panel/index.module.css:32-41` | 约 16×14 | 唯一收起/恢复筛选按钮 |
| `components/resource/table/index.vue:218,221` | 14×14（命中区 16px） | 批量操作勾选 |
| 顶栏图标 | 30×30 | — |
| `收起` 按钮 | **34×15** | 最难点击 |
| rail 图标 | 36×36 | — |
| 会话行操作按钮 | 21×21 | 含「删除」危险操作 |

另外 `components/resource/pagination/index.vue:96-101` 的 `<UPagination>` 未声明 `size`，
完全依赖 `vite.config.ts` 的全局 `defaultVariants.size='sm'`。

### 4.5 代码块没有等宽字体 `[实测]`

`src/assets/styles/index.css:5-6` 把 `--font-sans` 与 `--font-mono` 都定义为 `'MiSans', sans-serif`。

运行时验证：对 `.md pre code` 取 `font-family` 后测量字形宽度——

```
iiii 宽 12.4px  vs  WWWW 宽 47.4px   → 比 3.8:1，isMonospace = false
```

后果：代码块内的 YAML 缩进、ASCII 表格、列对齐注释全部错位；
行内代码无法通过字形与正文区分，只能靠背景色。

### 4.6 输入框与固定高度 `[静态]`

- `chat/components/composer/index.module.css:83` — `.field` 的 `max-height: 160px` 只够 7 行，
  粘贴长需求时只能在小窗口里上下翻。主流做法是取视口 30–40%（如 `min(40vh, 320px)`）。
- 硬编码高度魔数散落无 token：`thinking-block` 180px、`interaction-card:87` 260px、
  `task-bar` 320px。

## 五、组件放置位置

### 5.1 反向依赖（依赖方向错误）`[静态]`

1. **`teams` 反向 import `plans`**
   `teams/edit/index.module.css:1` 与 `teams/detail/index.module.css:1` 均为
   `@import '../../plans/shared/index.module.css';`。组织模块的依赖是收敛的
   （`groups/shared:2`、`people/shared:2` 都指向 `departments/shared`），
   唯独 teams 指向隔壁业务模块——改 plans 会静默影响 teams。

2. **chat 路由组件被全局外壳依赖**
   `AgentSidebar` / `SessionSidebar` 物理上住在 `src/routes/chat/components/` 内，
   却被 `src/components/app-shell/index.vue:5-6, 187, 203` 直接引用渲染到全局外壳。
   动 chat 路由目录结构会直接打断 AppShell。

3. **`components/ai/` 只有一个组件且是 chat 私有的**
   `src/components/ai/orb/index.vue` 经 `components/index.ts:2` 提升进全局 barrel，
   但两个使用点都在 chat 内部（`agent-card/index.vue:45`、`workbench-header/index.vue:69`）。

### 5.2 「半抽象」模式 `[静态，独立复核]`

| 组件 | 定义 | 引用数 | 对照 |
|---|---|---|---|
| `ActionIconButton` | `components/resource/action-icon-button/` | **0** | 同模板在 **26 个 .vue 里内联重复 100 次** |
| `StatusBadge` | `components/resource/cells/status-badge/` | **1** | 6 个页面另手写 `<UBadge variant="subtle" size="xs">` |
| `RelativeTime` | `components/resource/cells/relative-time/` | 15 | 正常 |

`ActionIconButton` 的 2 处 grep 命中分别是 `index.ts:5` 的导出行与组件自身的 `defineOptions`。
引用点是 `people/list/index.vue:306`（`StatusBadge`）。

组件抽出来了，但消费端没接上——比不抽象更值得清理。

### 5.3 失效的骨架变量 `[静态，独立复核]`

`components/resource/table/index.module.css:67`：

```css
grid-template-columns: repeat(var(--skeleton-cols, 1), minmax(0, 1fr));
```

全仓 `--skeleton-cols` **只有这一处读取，没有任何写入者**，恒回退到 1 列。
而 `table/index.vue:245` 仍按 `props.columns` 渲染 N 个 `USkeleton`
（配 `:73` 的 `height: 18px`）→ N 个方块**纵向堆成一列**，与注释「按表格列数等宽排布」不符。
`skills` 与 `memories` 各自传了 `#loading` 插槽绕开，说明该缺省骨架已实际废弃。

### 5.4 文案与内容位置 `[实测]`

- **`01/02/03/04` 编号被误用**：agent 编辑页出现 5 次（导航 4 + 内容区重复 1），
  但 4 个面板都带绿色 ✓ 且可任意顺序点击——**它不是顺序流程**，编号是误导。
- **全大写英文标签滥用**：`HYPERREAL` `ENTERPRISE` `WORKSPACE` `BUILD RESOURCES`
  `SYSTEM NOMINAL` `API CONFIG` `SEQUENTIAL` `PARALLEL` `LLM_ROUTING` `VALID`。
  其中 `SYSTEM NOMINAL` 是航天术语，对制造业控制台是错位的科幻感；
  `SEQUENTIAL` / `LLM_ROUTING` 是代码 enum 直接怼给用户看。
- **开发者术语外泄**：「服务端数字 ID 绑定」「仅提交当前接口支持字段」「后端持久化」。
- **假数据**：`components/module-sidebar/index.vue:46-50` 页脚 `14:32` 写死。
- **空态刷屏**：「暂无会话」在 chat 侧栏重复 10 次；
  且 `session-sidebar/index.vue:328,380` 未判断 `state.sessionsLoading`
  （该标志存在于 `stores/console.ts:360`），加载中的一秒会先显示「暂无会话」再突然冒出列表。
- **文本截断**：顶栏 `xianglei.736@gmail.com` 84<95、侧栏 `...的个人空间` 181<186、
  分页 `20条/页` 38<43、对话标题 162<282——同一身份在两处截断方式不同。

### 5.5 功能缺失与不一致 `[静态，独立复核]`

- `workflows/builder/index.vue` 全文 `onPublish` / `保存并启用` / `保存草稿` **零命中**，
  仅 `:189` 单个「保存」；而 `agent-builder:71,99` 与 `team-builder:157,189,320-321`
  都有完整实现——**「保存并启用」能力缺失 3/4**。
- 保存按钮高度三种值：`40px` / `34px` / `36px`。
- `departments/list:1`、`groups/list:1`、`people/list:1` 的 `@import` 与本地 `.page` 同名，
  靠「同优先级后定义者胜」侥幸生效——把 import 挪到文件末尾就会反灌破坏布局。
- `teams/list` 是唯一没有错误态渲染的 list 页（`UAlert` 零命中），
  根因是 `useTeamList` 未暴露 `loadingError`，数据源为纯内存 store——**唯一未接后端的模块**。
- `plans/shared:10` 声明了 `container-type: inline-size` 但全文零 `@container`。
- 死代码 `min-width`：`agents/shared:330`(1080) / `:772`(1078) / `:563`(800)、
  `plans/shared:355`(960)、`workflows/shared:355`(960)、`:322`——均无 `.vue` 引用，
  且同表 1080 与 1078 自相矛盾。

## 六、实测未复现的推断（**不要按这些改**）

以下两条来自静态推断，实测推翻，已从缺陷清单撤下：

1. ~~markdown 表格被 `overflow: hidden` 裁掉右侧列~~
   实测：12 列表格 + 300 字符不可折行单元格，`scrollWidth === clientWidth`，**零裁切**。
   （`index.css:475-490` 的 `.md table` 确实设了 `overflow: hidden`，
   但表格在当前内容下未触发溢出。）

2. ~~`.md a` 缺 `overflow-wrap` 导致长 URL 撑破容器~~
   实测：400px 容器内放入长 URL，未溢出——`word-break: break-word` 已经兜住。

## 七、需要纠正的历史判断

1. 「全站最大字号 15px」——那是 agents 列表页**单页**实测值。
   全站实际是 8px–42px，缺陷在**分布**（61% 集中在 8–11px），不在极值。

2. 子 agent 曾判定亮色主题「按下去就坏 / 是半成品」。**实测推翻**：
   切换后 `data-theme=light`、`body` 背景 `rgb(245,246,247)`、文字 `rgb(17,19,21)`，
   页面完全可用；对比度低于 4.5:1 的仅 5 处，其中 4 处是审查脚本对半透明背景未做
   合成运算导致的误报。

   亮色下的真问题是**品牌强调色色相偏移**：
   `#2dd4bf`（青绿，Tailwind teal-400）→ `#0f766e`（墨绿，teal-700），
   同一个「保存并启用」按钮在两个主题下像两个品牌。开关 bug 在亮色下依旧存在。
