import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ui from '@nuxt/ui/vue-plugin'
import router from './routes'
// 本地 MiSans：按 unicode-range 分片加载，保留常规、中等和粗体字重。
import './assets/fonts/misans/MiSans-Regular.min.css'
import './assets/fonts/misans/MiSans-Medium.min.css'
import './assets/fonts/misans/MiSans-Bold.min.css'
// 使用本地构建依赖，兼容现有的 `icon icon-*` 类名。
import 'lucide-static/font/lucide.css'
// Vue Flow 基础样式必须排在项目样式之前，否则组件里的 CSS Modules 覆盖不掉它的默认值。
import '@vue-flow/core/dist/style.css'
import './assets/styles/index.css'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia()).use(router).use(ui).mount('#app')
