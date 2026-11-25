<script setup lang="ts">
import type { ResourcePage, ResourceRow, ResourceStatus } from '@/interfaces/platform/model'

defineOptions({ name: 'BuildResourceInspector' })

defineProps<{ page: ResourcePage; row: ResourceRow | null }>()
const emit = defineEmits<{
  close: []
  edit: [row: ResourceRow]
  duplicate: [row: ResourceRow]
  status: [id: string, status: ResourceStatus]
}>()

const statusLabel: Record<ResourceStatus, string> = {
  nominal: '正常运行',
  warning: '需要关注',
  error: '连接异常',
  idle: '尚未启用',
}
const statusItems = [
  { value: 'nominal', label: '设为正常' },
  { value: 'warning', label: '标记关注' },
  { value: 'idle', label: '停用' },
  { value: 'error', label: '标记异常' },
]

function statusColor(status: ResourceStatus) {
  return { nominal: 'success', warning: 'warning', error: 'error', idle: 'neutral' }[status] as 'success' | 'warning' | 'error' | 'neutral'
}

function onStatusChange(id: string, value: string | number | boolean | Record<string, unknown> | null) {
  if (typeof value === 'string') emit('status', id, value as ResourceStatus)
}
</script>

<template>
  <aside :class="[$style['br-inspector'], { [$style.open]: row }]" aria-label="资源详情">
    <template v-if="row">
      <header :class="$style['br-inspector-head']">
        <span :class="$style['br-detail-icon']"><UIcon :name="`i-lucide-${page.icon}`" /></span>
        <div><small class="mono">{{ row.id }}</small><h2>{{ row.name }}</h2></div>
        <UTooltip text="关闭详情"><UButton icon="i-lucide-x" color="neutral" variant="ghost" square :class="$style['br-inspector-close']" aria-label="关闭详情" @click="emit('close')" /></UTooltip>
      </header>

      <div :class="$style['br-inspector-body']">
        <div :class="$style['br-detail-status']">
          <UBadge :color="statusColor(row.status)" variant="subtle" size="xs"><UChip as="span" standalone size="xs" :ui="{ base: `dot ${row.status}` }" />{{ statusLabel[row.status] }}</UBadge>
          <USelect :model-value="row.status" :items="statusItems" aria-label="更新资源状态" @update:model-value="onStatusChange(row.id, $event)" />
        </div>
        <p :class="$style['br-detail-description']">{{ row.description }}</p>

        <section :class="$style['br-detail-section']">
          <h3>基础信息</h3>
          <div :class="$style['br-meta-list']">
            <div><span>负责人</span><strong>{{ row.owner }}</strong></div>
            <div v-for="(column, index) in page.columns" :key="column"><span>{{ column }}</span><strong>{{ row.values[index] }}</strong></div>
          </div>
        </section>

        <section :class="$style['br-detail-section']">
          <h3>标签</h3>
          <div :class="$style['br-tags']"><UBadge v-for="tag in row.tags" :key="tag" :label="tag" color="neutral" variant="outline" size="xs" /></div>
        </section>

        <section :class="$style['br-detail-section']">
          <h3>最近变更</h3>
          <div :class="$style['br-activity']"><UChip as="span" standalone size="xs" :ui="{ base: 'dot nominal' }" /><p><strong>配置已同步</strong><small>今天 14:31 · system</small></p></div>
          <div :class="$style['br-activity']"><UChip as="span" standalone size="xs" :ui="{ base: 'dot idle' }" /><p><strong>资源已创建</strong><small>2026-07-18 · {{ row.owner }}</small></p></div>
        </section>
      </div>

      <footer :class="$style['br-inspector-actions']">
        <UButton label="复制" icon="i-lucide-copy" color="neutral" variant="outline" @click="emit('duplicate', row)" />
        <UButton label="编辑配置" icon="i-lucide-pencil" @click="emit('edit', row)" />
      </footer>
    </template>

    <UEmpty v-else icon="i-lucide-mouse-pointer-click" title="选择一项资源" description="查看配置、状态和最近变更。" variant="naked" :class="$style['br-detail-empty']" />
  </aside>
</template>

<style module src="./index.module.css"></style>
