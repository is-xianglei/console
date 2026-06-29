import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 字体:Inter(西文,400/500/700)+ MiSans(中文,unicode-range 按需加载分块)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import './assets/fonts/misans/MiSans-Regular.min.css'
import './assets/fonts/misans/MiSans-Medium.min.css'
import './assets/fonts/misans/MiSans-Bold.min.css'
// highlight.js 代码高亮主题(暗色)
import 'highlight.js/styles/github-dark.css'
import './styles/index.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
