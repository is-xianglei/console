import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 第三方样式先导入,自家全局样式放最后,确保对 vue-stream-markdown 的主题桥接能覆盖其默认变量
import 'katex/dist/katex.min.css'
import 'vue-stream-markdown/index.css'
import 'vue-stream-markdown/theme.css'
import './styles/index.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
