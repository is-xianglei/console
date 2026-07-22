<script setup lang="ts">
import { computed } from 'vue'
import type { ResourcePage, ResourceRow, ResourceStatus } from '../../../data/platformCatalog'
import type { ResourceFormMode } from './useBuildResourceManager'

const props = defineProps<{ page: ResourcePage; mode: ResourceFormMode; draft: ResourceRow }>()
const emit = defineEmits<{ close: []; save: [] }>()

const title = computed(() => props.mode === 'edit' ? `编辑 ${props.page.title}` : props.mode === 'duplicate' ? `复制 ${props.page.title}` : props.page.action)
const tagsText = computed({
  get: () => props.draft.tags.join(', '),
  set: (value: string) => { props.draft.tags = value.split(',') },
})
</script>

<template>
  <div class="br-overlay" @click.self="emit('close')">
    <form class="br-form-drawer" role="dialog" aria-modal="true" :aria-labelledby="'br-form-title'" @submit.prevent="emit('save')">
      <header>
        <div><small>资源配置</small><h2 id="br-form-title">{{ title }}</h2><p>配置会先保存到当前工作区，发布前仍可继续调整。</p></div>
        <button type="button" class="br-icon-button" aria-label="关闭表单" @click="emit('close')"><i class="icon icon-x"></i></button>
      </header>
      <div class="br-form-body">
        <section class="br-form-section">
          <h3>基本信息</h3>
          <label><span>名称 <b>*</b></span><input v-model="draft.name" required autofocus :placeholder="`输入${page.title}名称`" /></label>
          <div class="br-form-grid">
            <label><span>负责人</span><select v-model="draft.owner"><option>AI 平台组</option><option>设备工程部</option><option>质量工程部</option><option>计划运营部</option><option>基础设施组</option><option>数据平台组</option></select></label>
            <label><span>状态</span><select v-model="draft.status"><option value="nominal">正常</option><option value="warning">需关注</option><option value="idle">未启用</option><option value="error">异常</option></select></label>
          </div>
          <label><span>描述</span><textarea v-model="draft.description" rows="3" placeholder="说明用途、边界和关键职责"></textarea></label>
        </section>
        <section class="br-form-section">
          <h3>{{ page.title }} 配置</h3>
          <div class="br-form-grid">
            <label v-for="(column, index) in page.columns" :key="column"><span>{{ column }}</span><input v-model="draft.values[index]" :placeholder="`填写${column}`" /></label>
          </div>
        </section>
        <section class="br-form-section">
          <h3>治理信息</h3>
          <label><span>标签</span><input v-model="tagsText" placeholder="使用英文逗号分隔，例如 PRODUCTION, SIGNED" /><small>标签用于搜索、分组和策略匹配。</small></label>
          <label class="br-toggle-row"><span><strong>保存后可用</strong><small>关闭后资源将以未启用状态保存。</small></span><input :checked="draft.status !== 'idle'" type="checkbox" @change="draft.status = ($event.target as HTMLInputElement).checked ? 'nominal' : 'idle' as ResourceStatus" /><i></i></label>
        </section>
      </div>
      <footer><button type="button" class="br-secondary-button" @click="emit('close')">取消</button><button class="br-primary-button" :disabled="!draft.name.trim()"><i class="icon icon-save"></i>{{ mode === 'edit' ? '保存修改' : '创建资源' }}</button></footer>
    </form>
  </div>
</template>
