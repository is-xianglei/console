# 阶段 5：登录注册、个人资料、设置与应用中心补齐

## 背景与目标

这组页面不在资源 CRUD 主线上，但审计发现它们在"错误提示可行动""表单校验触发""删除后果文案""假数据"四个维度上有明显缺口：登录错误吞掉后端消息、apps 页把 mock 当真实数据渲染、点击应用并未真正进入应用，这些直接影响用户信任。本阶段不依赖阶段 0，可与之并行。

目标：

1. 认证请求把后端错误透传到界面，按场景给出可行动文案并定位到字段。
2. 注册 / 密码表单补齐确认密码与"失焦 + 提交"校验。
3. apps 页与 chat 工作台真正打通（`openApp`），mock 数据显式标注并预留数据源切换点。
4. profile / settings 的弹窗脏检查、删除后果文案、错误载体统一。

## 范围

- `src/http/index.ts` 认证请求错误解析与网络重试；`src/stores/auth.ts` refresh 重试。
- login / register 页面与 `src/routes/index.ts` 的 `safeRedirect` 复用。
- apps 页、`AppTile` 模型、seed 数据标注、`openApp` 接线。
- profile 各面板与弹窗、settings 页、`src/stores/permissions.ts`。
- `src/components/error-boundary`。

## 非目标

- 不改后端返回结构，只解析已有的 `message` / `detail` / `code`。
- 不做密码强度计 UI，仅补最低强度规则与文案。
- 不实现 apps 的后端列表接口，只预留取数函数。
- 不重做 workspace 删除流程（已有 slug 强确认）。

## 依赖与前置

- 无硬依赖，可与阶段 0 并行。
- 若阶段 0 的 `focusFirstError` 已就绪，login / register 的字段聚焦直接复用；否则本阶段内实现最小版本（`nextTick` + `focus()`）。

## 需求清单

### A. 认证与 HTTP 层

1. **后端错误透传**
   - 现象：`src/http/index.ts:96-98` `authRequest` 非 2xx 只抛 `HTTP ${status}`，吞掉响应体的 message / detail / code。
   - 要求：`ApiError.message` 优先取 body 的 `message` 或 `detail`，`code` 取 body 的 `code`；body 非 JSON 时回落到 `HTTP ${status}`。
   - 改法：非 ok 分支 `try { const b = await resp.json(); msg = b?.message ?? b?.detail ?? msg; code = b?.code ?? code } catch {}` 后再 `throw new ApiError(msg, code, resp.status)`。
2. **分场景文案**
   - 现象：login / register 把 `HTTP 401`、`HTTP 429`、网络错误显示为同一句。
   - 要求：401 →"邮箱或密码错误"；429 →"请求过于频繁，请稍后再试"；status 0 →"网络连接失败，请检查网络"；其它显示后端 message。
   - 改法：映射表放 `src/http` 或 `src/utils` 共用，login / register 的 catch 按 `ApiError.status` 取文案。
3. **网络抖动重试**
   - 现象：`src/http/index.ts:43-45,83-86` fetch 失败直接抛 `NETWORK_ERROR`；`src/stores/auth.ts:133-143` refresh 一次失败即 `invalidateAuth(true)` 踢回登录页。
   - 要求：仅对 status 0（网络错误）重试一次（退避 ≤ 1s）；401 / 403 不重试；refresh 复用同一策略。
   - 改法：fetch 层包 `withRetry(fn, { retries: 1, when: (e) => e.status === 0 })`，只用于无副作用的请求（登录、刷新 token、GET）。

### B. login / register 页面

4. **错误定位到字段**
   - 现象：`src/routes/login/Page.vue:99`、`src/routes/register/Page.vue:129` 错误只在 `UAlert`，焦点停在提交按钮，用户不知道改哪个字段。
   - 要求：401 时把错误落到 `password` 字段的 `UFormField error` 并聚焦；其它错误保留全局 `UAlert`。
   - 改法：`await nextTick()` 后聚焦对应 `UInput`，或调用阶段 0 的 `focusFirstError(formRef)`。
5. **注册确认密码与失焦校验**
   - 现象：`src/routes/register/Page.vue:20-31,86` 无 `confirmPassword` 字段，`UForm` 未设 `validate-on`。
   - 要求：新增确认密码字段；`validate()` 增加"两次密码一致"规则；`:validate-on="['blur','submit']"`。
6. **safeRedirect 复用**
   - 现象：`src/routes/index.ts:233-237` 已有 `safeRedirect`，`login/Page.vue:28-39`、`register/Page.vue:33-44` 各自内联一份等价逻辑，且返回形态不一致。
   - 要求：只保留 `routes/index.ts` 一份并 `export`，login / register import 复用；返回类型统一为路径字符串或 `null`。

### C. apps 页与应用模型

7. **打通 openApp**
   - 现象：`src/routes/apps/Page.vue:13-25` 点击卡片只 `launchApp('@name ')`；`src/stores/console.ts:730-732` `launchApp` 仅 dispatch，不设 `activeAppId`、不切工作台模式；真正绑定应用的是 `openApp`（`console.ts:599-616`），apps 页从未调用。
   - 要求：点击卡片先 `openApp(id)` 再 `launchApp(prompt)`；`launchApp` 返回 false（忙碌）时 toast 说明"当前会话正在生成，请稍后"。
   - 改法：统一 `AppTile.tag` 与 `WorkbenchApp.id` 命名（建议都用 `id`），apps 页据此调用；全局搜索 `tag` 引用一并改。
8. **mock 数据标注与取数切换点**
   - 现象：`src/constants/seed.ts:4-23` 硬编码 `APPS` / `FEATURED_APP` 被 `apps/Page.vue:4` 直接渲染为真实应用，无来源标注。
   - 要求：seed 顶部注释标注"mock 数据，待 apps 接口就绪后替换"；apps 页改为通过统一取数函数（如 `getApps()`）获取，当前实现返回 seed；保留 `UEmpty` 兜底（`Page.vue:120`）。
9. **应用级启用 / 权限**
   - 现象：`src/interfaces/app/model.ts:5-13` `AppTile` 无 `enabled` / `permission`；卡片只 `:disabled="state.busy"`（`apps/Page.vue:75,85,108`）。
   - 要求：新增 `enabled?: boolean`、`permission?: { code: string; label: string }`；未启用 / 无权限置灰并显示原因副文案，与"忙碌"禁用分开表达。

### D. profile

10. **弹窗脏检查**
    - 现象：`profile/components/workspace-editor-modal/index.vue:128-130,199` 与 `workspace-accept-modal/index.vue:39,65` 取消 / 关闭 / 点遮罩不检查未保存修改，静默丢失。
    - 要求：表单有改动时关闭先确认"放弃未保存的修改？"；两处策略一致。
    - 改法：按 `mode` 保存初始快照，`dirty = JSON.stringify(form) !== snapshot`；`updateOpen` 与取消按钮统一走 `requestClose()`。
11. **删除 / 移除后果文案**
    - 现象：`workspace-delete-modal/index.vue:39-49` 只写"业务数据可能一并失效"；`workspace-member-panel/index.vue:42-46` 移除成员无后果说明。
    - 要求：删除工作区写实——"该工作区的成员关系、全部会话、Agent 与相关数据将被永久移除，无法恢复"，warning 步同时显示 display_name 与 slug；移除成员补"该成员将立即失去当前工作区访问权限"。
12. **错误载体统一**
    - 现象：`workspace-panel/index.vue:65-68` toast + `UAlert` 双提示；`workspace-member-panel/index.vue:160-167` 仅 `UAlert`。
    - 要求：约定——破坏性 / 阻断操作（删除、切换工作区、移除成员）用 toast；表单提交类（创建、保存、邀请、改角色）用 inline `UAlert`；同一页面内一致。
13. **密码校验**
    - 现象：`password-panel/index.vue:19-21` 仅 `length < 6`；全库无 `validate-on`。
    - 要求：新密码至少 8 位且同时含字母与数字；`:validate-on="['blur','submit']"`；`profile-info-panel`、`workspace-editor-modal` 同步补 `validate-on`。

### E. settings

14. **真实错误信息**
    - 现象：`src/routes/settings/Page.vue:156-157` 一律"请稍后重试"；`src/stores/permissions.ts:39,66` `catch` 吞错。
    - 要求：store 的 catch 返回 `errorMessage(error, fallback)`（对齐 `src/stores/workspaces.ts:39` 模式），页面 toast 展示真实 message。
15. **删除规则带对象名**
    - 现象：`src/routes/settings/Page.vue:161-171` 删除权限规则弹窗无对象名、无后果细节。
    - 要求：description 改为"将删除规则「tool_name」，该工具将恢复平台默认权限策略"。

### F. error-boundary

16. **兜底出口**
    - 现象：`src/components/error-boundary/index.vue:13-15,21-28` 只有整页 reload 一个动作。
    - 要求：增加"返回首页"（`router.replace('/chat')`）作为第二动作；reload 保留给静态资源加载失败。

## 保持不变（已符合项）

- 登录 / 注册 loading 防重复提交、Enter 提交（`login/Page.vue:17,42,101`、`register/Page.vue:19,47,131`）。
- `safeRedirect` 拒绝 `//` 开头与回调到登录 / 注册页。
- token 失效统一处理（`src/App.vue:98-106`）。
- workspace 删除需输入 slug 确认（`workspace-delete-modal/index.vue:17-33,77-85`）。
- `src/stores/workspaces.ts:34-72` generation 竞态保护。
- `workspace-member-panel/index.vue:90-102` `canRemove` / `canChangeRole` 拦截自删与删 owner。
## 验收标准

- [ ] 后端返回 `{ detail: "密码错误" }` + 401 时，登录页显示"邮箱或密码错误"且焦点落在密码框；429 显示限流文案；断网显示网络文案；其它状态码显示后端 message。
- [ ] 后端返回非 JSON 错误页时，界面显示 `HTTP <status>` 而非白屏或未捕获异常。
- [ ] 注册页两次密码不一致时，失焦即在确认密码字段下方提示，提交被阻止。
- [ ] 全库仅有一处 `safeRedirect` 实现，login / register 通过 import 复用。
- [ ] apps 页点击卡片后 `state.activeAppId` 为该应用 id，工作台切到对应视图；会话忙碌时出现提示 toast 且无静默失败。
- [ ] `seed.ts` 顶部有 mock 标注；apps 页通过统一取数函数渲染，替换数据源无需改页面。
- [ ] 设置 `enabled: false` 或缺权限的应用卡片置灰并显示原因，与忙碌禁用文案不同。
- [ ] workspace 编辑 / 接受弹窗改动后点取消或遮罩出现确认；未改动时直接关闭。
- [ ] workspace 删除 warning 步文案包含"永久移除"与工作区名 + slug；移除成员弹窗包含访问权限后果。
- [ ] profile 页内：删除 / 切换 / 移除失败走 toast，创建 / 保存 / 邀请失败走 inline `UAlert`。
- [ ] 新密码 `abcdefgh` 被拒（无数字），`abc12345` 通过；失焦即校验。
- [ ] settings 删除规则弹窗包含 tool_name；后端失败时 toast 显示真实 message 而非"请稍后重试"。
- [ ] error-boundary 出现"返回首页"按钮并可导航到 `/chat`。
- [ ] `vitest run` 通过；新增 `authRequest` 错误解析（JSON / 非 JSON）与 `withRetry`（status 0 重试一次、401 不重试）单测。

## 风险与注意事项

- `authRequest` 解析 body 前先判断 `content-type`，HTML 错误页解析失败要回落，不能让解析异常覆盖原始状态码。
- 网络重试只能套在无副作用的请求上（登录、refresh、GET）；普通 POST 不要套用，避免重复提交。
- `AppTile.tag` → `id` 重命名会影响 `src/constants/seed.ts` 与 `app-registry.ts`，需全局搜索引用后再改。
- Nuxt UI 4.10 `UForm` 的 `validate-on` 取值与 `UFormField error` 用法以 `node_modules/@nuxt/ui` 类型定义为准。
- 阶段 4（chat）会改 `console.ts` 的流控制，`openApp` 接线时注意与其合并冲突。

## 涉及文件

- `src/http/index.ts`
- `src/stores/auth.ts`
- `src/routes/index.ts`
- `src/routes/login/Page.vue`
- `src/routes/register/Page.vue`
- `src/routes/apps/Page.vue`
- `src/constants/seed.ts`
- `src/interfaces/app/model.ts`
- `src/stores/console.ts`（仅 `openApp` / `launchApp` 接线）
- `src/routes/profile/components/workspace-editor-modal/index.vue`
- `src/routes/profile/components/workspace-accept-modal/index.vue`
- `src/routes/profile/components/workspace-delete-modal/index.vue`
- `src/routes/profile/components/workspace-member-panel/index.vue`
- `src/routes/profile/components/workspace-panel/index.vue`
- `src/routes/profile/components/password-panel/index.vue`
- `src/routes/profile/components/profile-info-panel/index.vue`
- `src/routes/settings/Page.vue`
- `src/stores/permissions.ts`
- `src/components/error-boundary/index.vue`
