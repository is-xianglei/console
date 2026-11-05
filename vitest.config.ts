import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 单元测试独立于应用构建配置，避免加载 Nuxt UI 和开发期代码生成插件。
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
})
