# 父任务执行计划

> 父任务本身不 `task.py start`。按下面的门禁逐个启动子任务，每个子任务在自己目录内走 Trellis 的 Plan → Execute → Finish。

## 1. 阶段顺序与门禁

| 阶段 | 进入条件 | 退出条件（归档前必须满足） |
|---|---|---|
| p0 `09-08-p0-list-foundation` | 无 | `useListUrlState/useDirtyGuard/usePermissions/useEditorFeedback` + `FilterPanel/ListCard/TimeCell/RowActions` + `ResourceTable/ResourcePagination` 新 API 合入且有单测；**groups 列表已迁移为样板页**；旧调用未被破坏 |
| p5 `09-08-p5-auth-profile-apps` | 无（可与 p0 并行） | `authRequest` 透传后端错误；注册确认密码 + `validate-on`；apps 接 `openApp` 并标注数据源；profile 弹窗脏检查；settings 删规则带对象名 |
| p1 `09-08-p1-organization-tree-table` | **p0 已归档** | people 左树右表、departments 树形表格、groups 标准列表上线；删除依赖拦截程序化；people 无 200 截断 |
| p2 `09-08-p2-build-lists` | **p0 已归档** | agents/workflows/plans 列表套用共享层与 URL 状态；编辑页 404 空态、删除回退、详情 Tab、校验聚焦、NaN 守卫、乐观启停 |
| p3 `09-08-p3-memories-skills` | **p0 已归档** | memories 空态分型/删除文案/回退/URL 状态/tooltip；skills **标准 CRUD 化**（列表 + `/skills/:name` 详情 + 上传新建 + 编辑 + 删除 + 分页） |
| 集成评审（父任务） | p0、p1、p2、p3、p5 全部归档 | `prd.md` 跨子任务验收全部勾选；spec 回写完成；`task.py list` 显示 `[5/5 done]`；（`09-08-p4-chat-stream-fixes` 已移出本期，不纳入） |

并行关系：p0 ∥ p5；p0 归档后 p1 ∥ p2 ∥ p3。单人推荐顺序：**p0 → p1 → p2 → p3 → p5**。
硬约束：p0 归档前，任何子任务不得修改 `src/components/resource/`；p5 全程不碰该目录。

## 2. 每阶段的 Trellis 操作

```bash
# ① 启动子任务（status: planning → in_progress；在 Claude Code 会话内执行会自动成为当前会话的活动任务）
T=.trellis/tasks/09-08-p0-list-foundation
python3 ./.trellis/scripts/task.py start $T

# ② 子任务 Phase 1：读 $T/prd.md；p0/p1/p2 建议补 $T/design.md 与 $T/implement.md，p3/p5 可 PRD-only

# ③ 配置子代理上下文（每个子任务都要做一次；只放 spec / research / 设计文档，不放代码路径）
P=.trellis/tasks/09-08-console-crud-refactor
python3 ./.trellis/scripts/task.py add-context $T implement $P/design.md "共享层技术设计"
python3 ./.trellis/scripts/task.py add-context $T implement $P/research/audit-findings.md "审计差距清单"
python3 ./.trellis/scripts/task.py add-context $T implement $P/research/ruoyi-layout-reference.md "若依布局参照"
python3 ./.trellis/scripts/task.py add-context $T implement .trellis/spec/frontend/index.md "前端规范索引"
python3 ./.trellis/scripts/task.py add-context $T check $P/design.md "按设计复核"
python3 ./.trellis/scripts/task.py add-context $T check .trellis/spec/frontend/quality-guidelines.md "质量检查"
python3 ./.trellis/scripts/task.py validate $T

# ④ 子任务 Phase 2：派发 trellis-implement 子代理（只写代码，不 commit）→ 派发 trellis-check 子代理（对照 PRD/design 复核并自修）
# ⑤ 跑第 3 节检查清单；页面级用 `run` 技能起 `npm run dev` 目测布局与交互
# ⑥ 收尾：/trellis:finish-work（归档 + 写 journal），再回父任务 prd.md 勾选对应验收项
python3 ./.trellis/scripts/task.py list            # 父任务显示 [n/6 done]
```

子任务内部再拆分时，用 `python3 ./.trellis/scripts/task.py create "<标题>" --slug <slug> --parent $T` 建孙任务，不要在父任务层再加同级阶段。

## 3. 全局检查清单（每个子任务归档前全绿；脚本名取自 `package.json`）

- [ ] `npm run build` —— 实际执行 `vue-tsc -b && vite build`，类型检查与构建。
- [ ] `npm run lint` —— 实际执行 `eslint . --max-warnings=0`，零警告。
- [ ] `npm run test` —— 实际执行 `vitest run`，含本阶段新增单测；现有 `src/hooks/use*Editor.test.ts` 不得回退。（`src/stores/console.test.ts` 属 chat 工作台，本期不触碰。）
- [ ] `grep -rnE "confirm\(|alert\(" src/` 无命中。
- [ ] `grep -rn "items-per-page=\"0\"" src/routes` 在 p1/p2/p3 归档后无命中（p0 阶段允许残留）。
- [ ] 手测：目标列表页刷新不丢查询条件；复制 URL 到新标签页同视图。
- [ ] 手测：保存后 toast + 回列表 + 高亮 2 秒后 `highlight` 消失；删除后回退 + toast。
- [ ] 手测：表格加载骨架屏；操作列固定右侧；图标 tooltip；批量按钮随勾选数启用/禁用并有原因提示。
- [ ] 无新增 `console.log`；CSS Module 命名与同目录 `index.module.css` 风格一致；新组件放 `src/components/resource/<name>/index.vue` 并在 `index.ts` 导出。

## 4. 提交策略

- 每个子任务归档前按功能分批 commit，例如 p0 拆为「组合函数」「布局组件」「表格与分页」「groups 样板迁移」四个 commit；commit message 沿用仓库现有风格。
- 父任务集成评审后单独一个 commit 提交 `.trellis/` 任务文档与 spec 回写。
- **不 push**。分支由用户决定：默认在 `main` 工作；若要开分支，先 `python3 ./.trellis/scripts/task.py set-branch $T task/<slug>` 记录再 `git switch -c`。
- 提交前 `git status` 确认 `.trellis/.runtime/`、`.trellis/.developer`、`.trellis/workspace/*/journal-*.md` 等运行时文件未被带入（`.trellis/.gitignore` 已排除大部分，journal 走 `merge=union`）。
- 注意工作区当前已有大量未提交改动（`git status` 见 `src/` 多处 M/D/??）；本次改造的 commit 要与之隔离，先让用户确认现有改动的去向。

## 5. spec 回写（p0 归档后立即做，后续子任务只补充）

用 `trellis-update-spec` 技能写入以下三处，并把 `.trellis/spec/frontend/index.md` 的 Status 列从 "To fill" 改为已填：

- `.trellis/spec/frontend/component-guidelines.md`：列表页三段式骨架（固定高 + 内部滚动的类名约定）；`FilterPanel/ListCard/ResourceTable/ResourcePagination/TimeCell/RowActions` 用法与禁忌（操作列 id 必须 `actions`、图标必配 tooltip、≥4 个操作收下拉、状态按后果选 `USwitch`/`UBadge`、树表不分页、删除弹窗标题带对象名）。
- `.trellis/spec/frontend/state-management.md`：`useListUrlState` 是列表查询状态的唯一来源，组件不得直接 `useRoute` 读列表 query；store 只存当前页 + total；`useEditorFeedback` 的 afterSave/afterDelete 闭环；`usePermissions` 是权限判断的唯一入口。
- `.trellis/spec/frontend/quality-guidelines.md`：禁止原生 `confirm/alert`；禁止"点击只弹 toast 不执行"的假按钮；禁止用假数据掩盖后端失败；禁止新增 `items-per-page="0"`；请求必须走 `loadRequest` 计数防竞态；表单校验失败必须聚焦首错字段。

顺手归档 `00-bootstrap-guidelines`（`python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines`），其目标已被本次回写覆盖。

## 6. 已知决策点（开工前向用户确认）

| 决策 | 默认方案 | 影响阶段 |
|---|---|---|
| skills 形态 | 标准 CRUD 化（列表 + `/skills/:name` 详情 + 上传新建 + 编辑 + 删除 + 分页），用户已确认 | p3 |
| apps 数据源 | 后端无应用列表接口时保留 `constants/seed.ts`，加 mock 标注与"演示数据"徽章，卡片点击改走 `openApp` | p5 |
| 权限模型 | 后端未提供前 `usePermissions` 默认放行 + 集中已知硬规则 | p0 |
| 现有未提交改动的去向 | 先由用户 commit 或 stash，再开始 p0 | 全部 |
| people 页左树窄屏形态 | `< 1200px` 改抽屉 | p1 |
| chat 工作台 | **本期不动**（用户明确排除），已从 p4 移出并记入 `prd.md`"后续事项" | 无 |

## 7. p0 的建议实现顺序（它是门禁，先把顺序定死）

1. `src/hooks/useListUrlState.ts` + 单测（不依赖任何组件，先立规则）。
2. `src/hooks/useDirtyGuard.ts`、`src/hooks/useEditorFeedback.ts`、`src/hooks/usePermissions.ts` + 单测；`usePermissions` 先迁入 `usePeopleManager.ts:87-89,140-143` 与 `workspace-member-panel:90-102` 的规则。3. `src/components/resource/time-cell`、`row-actions`（纯展示，可独立验证）。
4. `src/components/resource/table` 升级：先补现有调用的渲染测试锁行为，再加 `selectable / pinActions / #loading / getSubRows / highlightId / #empty` 分型。
5. `src/components/resource/pagination` 真分页，保留旧分支 + dev 警告。
6. `src/components/resource/filter-panel`、`list-card`；更新 `src/components/resource/index.ts` 导出。
7. **样板迁移：groups 列表**（`src/routes/platform-resource/organization/groups/list/index.vue` + `useGroupManager.ts` + `stores/groups.ts` 分页化 + `useGroupEditor.ts` 接 `afterSave`），作为 p1/p2/p3 照抄的模板。
8. 全局检查清单全绿 → 分四批 commit → spec 回写 → `/trellis:finish-work`。

每一步完成即可单独 commit；第 4 步是最大风险点（多处复用），务必先写测试再改。

## 8. 集成评审步骤（p0、p1、p2、p3、p5 全部归档后）

1. `python3 ./.trellis/scripts/task.py list` 确认父任务 `[5/5 done]`，`list-archive 2026-09` 能看到五个子任务。（`09-08-p4-chat-stream-fixes` 已移出本期，不计入。）
2. 逐条走 `prd.md` 的"跨子任务验收标准"，在浏览器里实际操作 8 个列表页（agents/workflows/plans/departments/groups/people/memories/skills）+ 各资源新建/编辑/删除。
3. 跑一遍第 3 节检查清单；再跑 `grep -rn "useRoute" src/routes/**/list` 确认列表页组件没有绕过 `useListUrlState` 直接读 query。
4. 用 `trellis-check` 技能做一次全量质量核查（spec 一致性、跨层、复用）。
5. 补 `prd.md` 勾选、`implement.md` 结果记录，提交 `.trellis/` 文档 commit；父任务 `/trellis:finish-work` 归档。
6. 遗留项（接口缺口、chat 工作台、skills/apps 决策后的后续）另建新任务，不塞回本任务。
