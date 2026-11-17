# 模型服务与对话选项

## 功能范围

设置页的模型服务与对话页模型选项已接入 AgentOS 后端。范围限于当前适配器支持的 OpenAI 兼容、OpenAI、DeepSeek、智谱、MiniMax、硅基流动、Moonshot、Qwen 兼容、Anthropic 原生及音频转写协议；不会在前端额外宣称未实现的云平台或原生协议可用。API Key 只在编辑表单输入，不回显服务端掩码；留空表示不修改已有密钥。

设置页通过真实 API 管理模型服务、角色指派、个人默认模型和模型能力探测。对话页读取当前工作区的模型能力，并提供标准／极速模式、模型和思考强度选择。

主要接口统一使用 `/api` 前缀及现有认证机制：

- `/api/models/providers`、`/{id}`、`/{id}/test`：列表、增删改及连通测试。
- `/api/models/provider-schemas`、`/api/models/roles`：可用协议及角色指派。
- `/api/models/preferences`、`/api/models/capabilities`：个人默认偏好及当前模型能力。
- `/api/models/providers/detect-context`、`detect-reasoning`：上下文与思考档位元数据探测。

## 会话与默认偏好

会话配置使用以下字段保存，并随会话读取和后续消息发送：

- `model_provider_id`：会话选择的模型服务；`null` 表示普通对话跟随个人默认模型，工作流跟随工作流角色模型。
- `mode_slug`：`standard` 或 `turbo`。
- `thinking_effort`：`fast` 或服务端声明支持的思考档位。

更改模型、模式或强度会 PATCH 当前会话。显式选择模型时还会更新当前用户的个人默认模型偏好；普通新会话按该偏好初始化。工作流选择“跟随工作流角色模型”不会清空个人默认模型。会话配置在服务端持久化，个人默认模型属于用户偏好。

会话响应中的 `model_provider_id` 是后端解析后的实际模型，只有 `metadata.model_provider_override=true` 才表示显式选择。前端恢复时保留这一区别，跟随角色时发送 `null`，避免无意冻结角色模型；工作流能力按 `workflow_provider_id` 解析，旧后端缺失该字段时兼容回退主默认模型。能力自动归一保存失败不会立即循环重试，成功重载模型能力或有效配置变化后可重试。

## 模式与思考策略

标准模式保留完整工具能力。极速模式当前没有检索工具，只能根据当前对话上下文快速作答，不会执行代码或读写文件；信息不足时应说明限制，不应声称执行了外部检索。

极速模式需要当前模型能力接口明确返回 `turbo_supported: true`。OpenAI 思考协议只有显式设置 `extra_config.fast_reasoning_effort` 为 `none` 才声明支持极速，即向上游发送关闭思考的参数。其他协议按各自适配器的显式关闭行为判断，不通过模型名称推断。能力未知时前端禁用极速。切换到不支持极速的模型时，会回到标准模式并恢复标准强度。工作流仅支持标准模式，模型与思考强度仍可调整。

若标准模式选择 `fast`，但能力返回 `fast_behavior: "model_default"`，该档位遵循模型上游默认思考行为，并不表示已显式关闭思考；界面会显示提示。

标准思考强度在浏览器 `localStorage` 中按用户、工作区和会话隔离，用于刷新后恢复以及退出极速模式时还原。它不会跨设备同步；当前会话实际模式、模型和强度仍以服务端保存值为准。

## 能力探测

上下文窗口与思考档位探测读取上游模型元数据，不通过试探性生成请求来猜测能力。未获得明确元数据时保留现有配置、不覆盖档位；探测结果只回填表单，由管理员检查后保存。上游接受测试请求不等于它实际支持或遵循该参数。

## 启用后端 API

当前本机数据库已由 `0026_permission_workspace_scope` 升级到 **0027**（revision 为 `0027_model_service_options`，迁移文件为 `alembic/versions/0027_model_service_and_session_options.py`）。这次升级修复了 `/api/models/roles` 和 `/api/models/providers` 查询 `model_providers` 缺表的问题；设置页重试后已成功加载角色及供应商列表。环境部署时仍应在目标数据库备份后显式执行迁移：

```sh
cd /Users/xianglei/Documents/develop/code/python/AgentOS
uv run alembic upgrade 0027_model_service_options
# 若目标环境运行的是包含新 API 代码的旧进程，迁移后按其进程管理方式重启后端
```

浏览器功能验收使用隔离 PostgreSQL schema 和本机独立服务 `8811/8812/5511`。本次错误修复另将本机 `.env` 指向的 `public` schema 从 0026 升级到 0027；未重启原有 `8000` 后端或 `5173` 前端。以上部署命令供后续部署者对目标环境执行；不要依赖应用启动时自动迁移。

## 验证记录

2026 年 11 月 1 日前端验证已通过：Vitest **53 个文件、501 个测试**全部通过；`npm run build` 成功；`npm run lint` 成功且无警告。后端在隔离 PostgreSQL schema `codex_model_review_b28869aae44a` 完成 Alembic `0026 → 0027 → 0026 → 0027` 往返，真实 PostgreSQL 定向集成 11 项通过，全量 **552 项通过，0 失败、0 跳过**。未运行 ruff（环境未安装）。

浏览器联调使用正常注册的临时账号和本机模拟 OpenAI 兼容上游完成：设置页新增服务、元数据探测、连通性测试、角色指派、个人默认模型和留空密钥编辑界面通过；普通会话标准模式向上游发送选择的 `low` 强度和 24 个工具，极速模式关闭思考且没有工具。刷新后会话配置恢复。主模型 A（`low/high`，默认 `high`，支持极速）与 Workflow 角色模型 B（仅 `medium`，默认 `medium`，不支持极速）配置不同后，工作流跟随 B、只显示 `medium` 并锁定标准模式；显式选 A 后恢复跟随角色，发送仍使用 B/`medium`，个人默认保持 A。最终会话元数据为 `model_provider_override=false`。回复由本机模拟上游生成，不代表真实第三方供应商实测。按授权清理本次隔离联调 schema 与临时数据。

清理结果：已删除本次隔离 schema `codex_model_review_b28869aae44a`，并通过全新数据库连接确认该 schema 不存在、`public` 仍存在；临时账号及联调数据随 schema 一并移除。已关闭本次 `127.0.0.1:5511/8811/8812` 验收服务，并确认原有 `8000/5173` 服务仍在监听。
