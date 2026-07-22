import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
// 本地 MiSans：按 unicode-range 分片加载，保留常规、中等和粗体字重。
import './assets/fonts/misans/MiSans-Regular.min.css'
import './assets/fonts/misans/MiSans-Medium.min.css'
import './assets/fonts/misans/MiSans-Bold.min.css'
// 使用本地构建依赖，兼容现有的 `icon icon-*` 类名。
import 'lucide-static/font/lucide.css'
// highlight.js 代码高亮主题(暗色)
import 'highlight.js/styles/github-dark.css'
import './styles/index.css'
import App from './App.vue'

createApp(App).use(createPinia()).use(router).mount('#app')
