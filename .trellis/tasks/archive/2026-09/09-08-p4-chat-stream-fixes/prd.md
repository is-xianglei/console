# 阶段 4：chat 工作台流式与会话缺陷修复

> 父任务：`09-08-console-crud-refactor`｜优先级 P0｜独立于阶段 0，可与其并行

## 背景与目标

全站审计里 chat 工作台是唯一存在"真 bug"的模块：`selectSession` 切换会话时不中止正在进行的 SSE 流，旧流事件继续写进新会话的 `tasks / graphNodes / workflowProgress`，`busy` 卡住直到旧流自然结束；此外没有任何"停止生成"入口。围绕这条主线，工作台还有一批"看起来能用、实际是假的"体验（假操作面板、种子会话掩盖后端故障）和缺失的错误反馈。

本阶段目标：
1. 把流的生命周期收敛到一个 `stopActiveStream()` 上，切会话、重置、用户主动停止三条路径全部复用它。
2. 去掉所有假成功与假数据兜底，失败必须可见、可重试。
3. 补齐会话列表与操作的元信息和反馈，使 chat 侧的删除 / 归档 / 派发与其余模块的反馈标准一致。

## 范围

- `src/stores/console.ts` 的流控制、会话选择、归档、派发、消息加载逻辑。
- `src/routes/chat/components/` 下 composer、session-sidebar、app-runtime-panel、tool-call-card、interaction-card 的对应交互。
- `src/App.vue` 首屏加载与失败兜底；`src/components/app-shell` 的快捷键。
- `src/stores/console.test.ts` 新增用例。

## 非目标

- 不重构 SSE 事件协议、`buildReducer` 的事件归约逻辑与 `src/http/console.ts` 的 `streamPost`。
- 不改后端接口；`count / time` 若后端未提供则前端按消息推导。
- 不把 chat 改造成 CRUD 列表形态（不套 FilterPanel / ListCard）。
- 不实现 AppRuntimePanel 背后的真实业务能力（创建操作单、提交审批等），只处理"假成功"。

## 依赖与前置

- 无硬依赖，可与阶段 0 并行。
- 与阶段 5 的 `apps` 页共享 `openApp` 路由化（E2）的结论：本阶段先定义 URL 形态，阶段 5 直接复用。
- 进入前先跑一次 `vitest run src/stores/console.test.ts`，确认现有用例基线为绿。

## 需求清单

### A. 流控制（必须最先做）

**A1. 切会话不中止旧流（关键 bug）**
- 现象：`src/stores/console.ts:508-521` `selectSession` 只重置 `tasks / agents / workflowProgress` 后调 `loadMessages`，既不 `dataGeneration += 1` 也不调用 `activeStreamAbort`；而 `streamHandlers`（`:873-907`）只用闭包里的 `generation === dataGeneration` 过滤事件。旧流的 `onEvent` 校验通过，reducer 继续把事件写进切换后的 `state`，`busy` 直到旧流 `onDone` 才复位。
- 要求：切换会话瞬间旧流失效，新会话不出现旧流的任何任务 / 节点 / 进度，`busy` 立即为 false。
- 改法：在 store 内新增
  `function stopActiveStream() { dataGeneration += 1; activeStreamAbort?.(); activeStreamAbort = null; state.busy = false }`，
  `selectSession`、`openApp`（`:599-616`，同样重置会话）、`newSession`、`resetConsole`（`:467-470` 现有三行改为调用它）统一在重置状态前调用。顺序必须是先 `dataGeneration += 1` 再 `abort()`，保证 abort 触发的 `onError` 被 generation 校验挡住，不会把"用户主动中止"渲染成连接错误块。

**A2. 没有"停止生成"入口**
- 现象：`activeStreamAbort` 只在 `resetConsole`（`:469`）被调用；`dispatch`（`:965`）赋值后用户无法主动终止。
- 要求：生成期间 composer 的发送按钮变为"停止"（图标 + aria-label），点击后 1 秒内停止，已生成的回答块保留并停止流式光标。
- 改法：store 暴露 `stopGeneration()`：调 `stopActiveStream()` 后把当前 AI 消息里 `kind === 'answer'` 的块 `streaming = false`，并追加一条 `kind: 'tool', tag: 'STOPPED', fn: '已停止生成', done: true` 的状态块（不是 ERROR）。composer 在 `state.busy` 时渲染停止键，输入框有焦点时 `Esc` 也触发。

**A3. 收尾逻辑幂等**
- 现象：`onError / onDone`（`:885-905`）各自复位 `busy` 与 `activeStreamAbort`，与 A1 的复位路径重叠。
- 要求：任何顺序下（先 stop 后 done、先 done 后 stop）`busy` 与 `activeStreamAbort` 最终状态一致，且旧流收尾不会清掉新流的 abort 句柄。
- 改法：`onError / onDone` 里的复位保持"仅当 `generation === dataGeneration`"守卫；`stopActiveStream` 置空句柄后由新一轮 `dispatch` 重新赋值。为两种顺序各写一个单测。

### B. 可信度（假操作 / 假数据）

**B1. AppRuntimePanel 假操作、假数据**
- 现象：`src/routes/chat/components/app-runtime-panel/index.vue:52-53,65,129-138` 的"创建操作单 / 提交审批 / 独立打开"点击只 `toast.add` 提示成功，不发任何请求；面板内容来自 `src/constants/app-registry.ts` 的静态数据。
- 要求：不允许"假成功"。未接入后端能力的按钮要么不渲染，要么 `disabled` 并用 `UTooltip` 标注"即将上线"；静态演示数据在面板顶部以 `UBadge` 标明"演示数据"。
- 改法：给 `WorkbenchApp` 的动作定义增加 `enabled: boolean` 与 `handler?: () => Promise<boolean>`，面板按 `enabled` 决定渲染 / 禁用；删除所有无 handler 的成功 toast。

**B2. 种子会话掩盖后端故障**
- 现象：`src/App.vue:35` 在 `loadSessions` 返回 false 时调用 `seedConversation`（`console.ts:1076-1108`），把 `SESSIONS` 与一段写死的对话塞进 state，用户看不出后端已失败。
- 要求：后端失败时显示错误态（`UAlert` + "重试"），种子数据只在显式开关（`import.meta.env.VITE_CONSOLE_MOCK === 'true'`）下播种，且页面顶部常驻"演示模式"横幅。
- 改法：新增 `state.sessionsError: string | null`，`loadSessions` 的 catch 分支（`:383-385`）写入错误信息；session-sidebar 在 `sessionsError` 非空时渲染错误态与重试（重试即 `loadSessions(route.params.sessionId)`）；`seedConversation` 仅在 mock 开关下由 `App.vue` 调用。

### C. 错误处理与重试

**C1. 流式错误无重试**
- 现象：`console.ts:885-896` `onError` 只追加一个 `ERROR` 工具块；`tool-call-card/index.vue:14-24` 渲染它但没有任何动作。
- 要求：错误块带"重试"按钮，点击后用同一条用户消息重新派发，不产生重复的用户气泡。
- 改法：错误块增加 `retry?: { text: string; options }` 载荷；store 新增 `retryLast()`：移除失败的 AI 消息与其对应的用户消息，再用记录的 `text / options` 调用 `dispatch`。

**C2. 消息加载失败无重试**
- 现象：`console.ts:434-437` `loadMessages` 的 history 拒绝时清空消息、置 `health = 'error'` 后返回，没有重试入口。
- 要求：消息区显示"加载失败 + 重试"，重试仅重新拉取当前会话。
- 改法：新增 `state.messagesError`，消息区空态按 `messagesError` 区分"暂无消息"与"加载失败"；重试按钮调用 `loadMessages(state.activeSessionId)`。

**C3. dispatch 静默失败**
- 现象：`console.ts:915` `dispatch` 在 `busy` 或空内容时直接 `return false`；`composer/index.vue:558` 与 `interaction-card/index.vue:59-62` 拿到 false 后无任何提示。
- 要求：用户能知道为什么没发出去。
- 改法：保留 boolean 签名，新增 `state.lastDispatchError: 'busy' | 'empty' | 'no-session' | null`，`dispatch` 失败时写入；composer / interaction-card 收到 false 后按该值 `toast.add`；`launchApp`（`:730-732`）同步适配。

### D. 会话列表与元信息

**D1. 会话列表无消息数与时间**
- 现象：`session-sidebar/index.vue:361,378` 有 `count / time` 的展示位，但 `count` 在 `console.ts:85 / 527 / 837` 始终为 0，`time` 只在新建时写"刚刚"。
- 要求：每行显示相对时间（hover 显示绝对时间）与消息数；后端有字段则映射，没有则由消息列表推导并在发送后自增。
- 改法：`mapSession` 补 `updated_at → time`、`message_count → count` 的映射（字段名以 `src/interfaces/console/api.ts` 为准）；`dispatch` 成功后 `activeSession.count += 2`、`time = now()`。

**D2. 删除会话弹窗无对象名**
- 现象：`session-sidebar/index.vue:435-444` 的 `UModal` 标题为固定文案。
- 要求：标题写明 `删除「{title}」？`，描述说明"消息不可恢复"。
- 改法：把待删 session 传入模板，与 build / organization 模块的删除弹窗文案格式对齐。

**D3. 归档后跳回首条会话**
- 现象：`console.ts:684-693` `archiveSessionAction` 成功后 `await loadSessions()`，`loadSessions:369` 无 preferred 时选 `sessions[0]`。
- 要求：归档后停留在被归档项的相邻会话（下一条，没有则上一条），并 toast "已归档"。
- 改法：归档前记录相邻会话 id，`loadSessions(neighborId)` 传入 preferred；找不到时才回退首条。删除会话走同一规则。

### E. 状态保留与路由

**E1. 切会话 / 刷新丢失任务与执行图**
- 现象：`console.ts:512-518` 切会话即清空 `tasks / workflowProgress`，`App.vue:27-47` 刷新后只恢复消息；本轮派发的 `graphNodes` 无法回看。
- 要求：切回会话能看到该会话最近一轮的任务条与执行图；刷新后至少能从消息里的工具块重建任务列表。
- 改法：新增 `runtimeBySession: Map<string, { tasks; graphNodes; workflowProgress; agents }>`，`stopActiveStream` 前快照当前会话，`selectSession` 命中缓存则恢复；刷新场景在 `loadMessages` 后由 `blocks` 中 `kind: 'tool'` 的 `done` 状态重建 `tasks`。

**E2. openApp 不写路由**
- 现象：`console.ts:599-616` 只改 `activeAppId / workbenchMode`，URL 不变，刷新后回到普通对话。
- 要求：应用态可通过 URL 恢复与分享。
- 改法：路由形态 `/chat/:sessionId?app=<appId>`；`openApp` 由页面层包装为 `router.replace`，`App.vue` 初始化时读取 `app` query 调用 `openApp`。阶段 5 的 apps 页复用该入口。

**E3. 会话切换快捷键（可选）**
- 现象：`app-shell/index.vue:124-132` 只有 ⌘K 与 Esc。
- 要求：`⌘/Ctrl + ↑ / ↓` 按侧栏顺序切换上一条 / 下一条会话，输入框有焦点且正在输入法组合时不抢占。
- 改法：在 app-shell 的 keydown 里增加分支，调用 `selectSession(neighborId)`。

**E4. 已落库会话禁止改绑 agent**
- 现象：`composer/index.vue:868` 对后端会话禁用 agent 选择，这与 `dispatch`（`console.ts:941-958`）"仅新会话可传 agent / plan / workflow"的后端约束一致，属于产品规则。
- 要求：保留禁用，但要说明原因。
- 改法：禁用项包 `UTooltip`："已开始的会话不能更换执行对象，请新建会话"。

## 保持不变（已符合项）

- `composer/index.vue:431-434` Enter 发送、Shift+Enter 换行。
- 消息区 `aria-busy` 随 `state.busy` 变化。
- 删除会话使用 `UModal` 确认，全站无原生 `confirm()`。
- composer 中不可用的 agent / plan / workflow 项 `disabled` 且带原因文案。
- `loadSessions / loadMessages / shareSessionAction` 已用 `dataGeneration` 做竞态保护，本阶段只是把同一机制扩展到 SSE 流。

## 验收标准

- [ ] 在会话 A 生成中切到会话 B：B 的 `tasks / graphNodes / workflowProgress` 不出现 A 的事件，`state.busy` 在切换后同步为 false，A 的流在网络层被 abort。
- [ ] 生成中 composer 显示停止键；点击后 1 秒内 `busy = false`，已生成的回答块保留、`streaming = false`，且不出现"连接错误"块。
- [ ] 先 stop 再收到 done、先 done 再 stop 两种顺序下，`busy` 与 `activeStreamAbort` 状态一致；新一轮 dispatch 的 abort 句柄不会被旧流收尾清掉。
- [ ] AppRuntimePanel 中没有任何点击后只弹成功 toast 而不执行动作的按钮；未接入能力的按钮禁用并有"即将上线"提示；演示数据有可见标记。
- [ ] 后端 `getSessionList` 返回 500 时，侧栏显示错误态与"重试"，不出现种子会话；仅在 `VITE_CONSOLE_MOCK=true` 时播种并显示"演示模式"横幅。
- [ ] 流式连接错误块带"重试"，点击后重新派发同一内容且用户气泡不重复。
- [ ] 消息加载失败显示"加载失败 + 重试"，与"暂无消息"空态可区分。
- [ ] busy 状态下再次发送，composer 出现说明原因的 toast，而不是无响应。
- [ ] 会话列表每行显示相对时间（hover 绝对时间）与消息数，发送一轮后数值变化。
- [ ] 删除会话弹窗标题含会话标题；归档 / 删除后停留在相邻会话并有 toast。
- [ ] 切回有过派发的会话，任务条与执行图恢复；刷新后任务列表可由消息重建。
- [ ] `/chat/:sessionId?app=<id>` 直接打开时进入分屏应用态。
- [ ] `src/stores/console.test.ts` 新增用例：`selectSession` 中止旧流、`stopGeneration`、收尾幂等、`archiveSessionAction` 选相邻会话、`dispatch` 失败原因；`vitest run` 全绿。

## 风险与注意事项

- `stopActiveStream` 必须先 `dataGeneration += 1` 再 `abort()`：abort 触发的 `onError` 若先于 generation 递增执行，会把用户主动停止渲染成"连接错误"。
- `onDone / onError` 的 `busy = false` 与 `stopActiveStream` 的复位重叠，务必保持"仅当 generation 匹配才复位"的守卫，否则旧流收尾会误清新流句柄。
- `runtimeBySession` 缓存要在 `resetConsole` 时清空，避免切换工作区后泄漏旧数据；只保留最近 10 个会话。
- `dispatch` 保持 boolean 签名 + `lastDispatchError`，避免同时改动 `launchApp`、interaction-card 等所有调用方的返回值处理。
- 种子数据开关默认关闭；本地无后端开发时需显式设置 `VITE_CONSOLE_MOCK=true`。

## 涉及文件

- `src/stores/console.ts`（stopActiveStream / stopGeneration / retryLast / runtimeBySession / sessionsError / messagesError / lastDispatchError / 归档相邻选择）
- `src/stores/console.test.ts`
- `src/App.vue`（首屏失败态、mock 开关、`app` query 恢复）
- `src/routes/chat/Page.vue`、`src/routes/chat/components/composer/index.vue`（停止键、失败 toast、禁用原因 tooltip）
- `src/routes/chat/components/session-sidebar/index.vue`（错误态与重试、count/time、删除弹窗文案）
- `src/routes/chat/components/app-runtime-panel/index.vue`、`src/constants/app-registry.ts`（动作 enabled / 演示数据标记）
- `src/routes/chat/components/tool-call-card/index.vue`、`src/routes/chat/components/interaction-card/index.vue`（重试按钮、失败反馈）
- `src/components/app-shell/index.vue`（会话切换快捷键）
- `src/routes/index.ts`（`app` query 约定）
- `src/constants/seed.ts`（种子数据仅 mock 下使用）

## 目标形态 ASCII 草图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 工作台头部（会话标题 · 模型 · 操作）                          [⌘K 搜索] [Esc]  │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ 会话侧栏       │  消息流区（可滚动，Enter 发送 / Shift+Enter 换行）              │
│ + 新建会话     │  ┌ 你 ────────────────────────────┐                            │
│  会话1  (3)   │  │ 生成一个 agent 列表页            │                            │
│  会话2  (12)  │  └─────────────────────────────────┘                            │
│  会话3  (0)   │  ┌ 助手 ──────────────────────────┐                            │
│ ⌘↑/⌘↓ 切换    │  │ ● 正在生成…    [■ 停止生成]      │ ← 流式时发送键变为停止键      │
│  删除时显示    │  └─────────────────────────────────┘                            │
│  「删除 会话2?」│ ┌ 输入框（aria-busy）────────────────────────── [发送/停止] ─┐  │
│  归档后选中相邻  │ └──────────────────────────────────────────────────────────┘ │
└───────────────┴──────────────────────────────────────────────────────────────┘
  切换会话 → 先 stopActiveStream()（旧流中止，busy 复位），再 loadMessages
  会话卡片显示消息条数 + 相对时间；loadMessages 失败 → 错误气泡带 [重试]
```

**改动点在图中的位置**：
- 侧栏会话卡片上加 `(消息条数)` 与相对时间（现在恒 0 / 无时间）。
- 流式进行中，底部输入框右侧的「发送」变成「■ 停止生成」；点击调用 `stopGeneration()`，1s 内终止且保留已生成片段。
- 切换会话时先中止旧流，避免旧 SSE 事件写进新会话的 `tasks/graphNodes/progress`。
- `loadMessages` / SSE 错误 → 在对应气泡底部给 `[重试]`。
- 删除弹窗文案带对象名（`删除 会话2？`）；归档成功后自动选中相邻会话。
- 左下 `AppRuntimePanel`：未实现的动作不再假成功，改为禁用并标注「即将上线」。
