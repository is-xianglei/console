import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { fileURLToPath, URL } from 'node:url'

function lucideWoff2Only(): Plugin {
  return {
    name: 'lucide-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.split('?')[0].replaceAll('\\', '/')
      if (!normalizedId.endsWith('/lucide-static/font/lucide.css')) return null

      return code.replace(
        /@font-face\s*\{[\s\S]*?\}/,
        `@font-face {
  font-family: 'lucide';
  src: url('./lucide.woff2') format('woff2');
  font-display: block;
}`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    lucideWoff2Only(),
    vue(),
    ui({
      colorMode: false,
      theme: {
        defaultVariants: {
          size: 'sm',
        },
      },
      ui: {
        colors: {
          primary: 'hyper',
          secondary: 'hyper',
          neutral: 'zinc',
        },
      },
    }),
  ],
  server: {
    proxy: {
      // 前后端统一 /api 前缀，无需 rewrite；SSE 默认透传不缓冲
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
