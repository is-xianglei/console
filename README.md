# Hyperreal Console

基于 Vue 3、TypeScript、Vite、Pinia、Vue Router、Nuxt UI 与 Tailwind CSS 4 构建的制造业智能体控制台。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址由 Vite 输出。开发环境将 `/api` 请求代理到 `http://127.0.0.1:8000`。

## 质量检查

```bash
npm run lint
npm run build
```

`build` 会先执行 Vue 与 TypeScript 类型检查，再生成生产构建。

## 目录约定

```text
src/
├── assets/       # 字体、图片与全局主题资源
├── components/   # 跨页面复用组件
├── constants/    # 业务常量与静态配置
├── hooks/        # Vue 组合式函数
├── http/         # HTTP 与 SSE 请求封装
├── interfaces/   # 领域模型与接口 DTO
├── routes/       # 路由配置、页面与页面专属组件
├── stores/       # Pinia 业务状态
├── utils/        # 无状态通用工具
├── App.vue       # 应用根组件
└── main.ts       # 应用入口
```

详细开发规范见 [`.agents/rules`](./.agents/rules/README.md)。
