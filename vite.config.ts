import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
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
    // 仅 dev（vite serve）生效，build 时插件 apply 返回 false 不参与构建；
    // 官方要求放在框架插件之前。编辑器靠扫描运行中的进程自动识别（多个 IDE 同时运行时按内置顺序挑），
    // 要固定用某个编辑器，在本地 .env.local 写 CODE_EDITOR=<可执行文件绝对路径>；写编码名只在该 IDE 运行时优先
    codeInspectorPlugin({
      bundler: 'vite',
    }),
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
        // Nuxt UI badge 的 size.xs 是 text-[8px]/3，sm 是 text-[10px]/3——两档都低于
        // 「承载中文 ≥11px」的下限（见 index.css 字号 token 注释：状态徽章属于
        //  --fs-sm 12px 档）。全站 28 处状态徽章都显式写 size="xs"，逐处改成 md 会
        // 连带把 px-1 py-0.5 rounded-sm 变成 px-2 py-1 rounded-md，改掉列表密度；
        // 这里只覆盖字号，紧凑内距与圆角保持原样。
        badge: {
          variants: {
            size: {
              xs: { base: 'text-[12px]/4' },
            },
          },
        },
        // UCard 默认是页面底色 + ring 描边；全站卡片统一成面板底色 + 1px 边框 + 8px 圆角，
        // header/body/footer 之间的分隔线用同一边框色。各处只按需调内边距。
        card: {
          variants: {
            variant: {
              outline: { root: 'bg-(--bg-panel) ring-0 border border-(--border) divide-(--border)' },
            },
          },
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
