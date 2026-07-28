<script setup lang="ts">
import { computed } from 'vue'
import type { FormError } from '@nuxt/ui'
import type { ResourceFormMode } from '@/hooks/useBuildResourceManager'
import type { ResourcePage, ResourceRow } from '@/interfaces/platform/model'

defineOptions({ name: 'BuildResourceFormDrawer' })

const props = defineProps<{ page: ResourcePage; mode: ResourceFormMode; draft: ResourceRow }>()
const emit = defineEmits<{ close: []; save: [] }>()

const title = computed(() => props.mode === 'edit' ? `编辑 ${props.page.title}` : props.mode === 'duplicate' ? `复制 ${props.page.title}` : props.page.action)
const saveLabel = computed(() => props.mode === 'edit' ? '保存修改' : '创建资源')
const ownerItems = ['AI 平台组', '设备工程部', '质量工程部', '计划运营部', '基础设施组', '数据平台组']
const statusItems = [
  { value: 'nominal', label: '正常' },
  { value: 'warning', label: '需关注' },
  { value: 'idle', label: '未启用' },
  { value: 'error', label: '异常' },
]
const tagsText = computed({
  get: () => props.draft.tags.join(', '),
  set: (value: string) => { props.draft.tags = value.split(',') },
})
const available = computed({
  get: () => props.draft.status !== 'idle',
  set: (value: boolean) => { props.draft.status = value ? 'nominal' : 'idle' },
})

function validateDraft(state: Partial<ResourceRow>): FormError[] {
  return state.name?.trim() ? [] : [{ name: 'name', message: `请输入${props.page.title}名称` }]
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <USlideover
    :open="true"
    :close="false"
    :ui="{ content: 'br-form-slideover', overlay: 'br-form-overlay', header: 'br-form-header', body: 'br-form-body-shell', footer: 'br-form-footer' }"
    @update:open="onOpenChange"
  >
    <template #header="{ close }">
      <div :class="$style['br-drawer-title']"><small>资源配置</small><h2>{{ title }}</h2><p>配置会先保存到当前工作区，发布前仍可继续调整。</p></div>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" square aria-label="关闭表单" @click="close" />
    </template>

    <template #body>
      <UForm id="br-resource-form" :class="$style['br-drawer-form']" :state="draft" :validate="validateDraft" @submit="emit('save')">
        <section :class="$style['br-form-section']">
          <h3>基本信息</h3>
          <UFormField label="名称" name="name" required><UInput v-model="draft.name" autofocus :placeholder="`输入${page.title}名称`" /></UFormField>
          <div :class="$style['br-form-grid']">
            <UFormField label="负责人" name="owner"><USelect v-model="draft.owner" :items="ownerItems" /></UFormField>
            <UFormField label="状态" name="status"><USelect v-model="draft.status" :items="statusItems" /></UFormField>
          </div>
          <UFormField label="描述" name="description"><UTextarea v-model="draft.description" :rows="3" autoresize :maxrows="6" placeholder="说明用途、边界和关键职责" /></UFormField>
        </section>

        <section :class="$style['br-form-section']">
          <h3>{{ page.title }} 配置</h3>
          <div :class="$style['br-form-grid']">
            <UFormField v-for="(column, index) in page.columns" :key="column" :label="column" :name="`values.${index}`"><UInput v-model="draft.values[index]" :placeholder="`填写${column}`" /></UFormField>
          </div>
        </section>

        <section :class="$style['br-form-section']">
          <h3>治理信息</h3>
          <UFormField label="标签" help="标签用于搜索、分组和策略匹配。"><UInput v-model="tagsText" placeholder="使用英文逗号分隔，例如 PRODUCTION, SIGNED" /></UFormField>
          <div :class="$style['br-toggle-row']"><span><strong>保存后可用</strong><small>关闭后资源将以未启用状态保存。</small></span><USwitch v-model="available" aria-label="保存后可用" /></div>
        </section>
      </UForm>
    </template>

    <template #footer>
      <UButton label="取消" color="neutral" variant="outline" @click="emit('close')" />
      <UButton :label="saveLabel" icon="i-lucide-save" type="submit" form="br-resource-form" :disabled="!draft.name.trim()" />
    </template>
  </USlideover>
</template>

<style module src="./index.module.css"></style>
