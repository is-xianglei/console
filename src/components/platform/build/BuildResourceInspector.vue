<script setup lang="ts">
import type { ResourcePage, ResourceRow, ResourceStatus } from '../../../data/platformCatalog'

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
</script>

<template>
  <aside class="br-inspector" :class="{ open: row }" aria-label="资源详情">
    <template v-if="row">
      <header class="br-inspector-head">
        <span class="br-detail-icon"><i :class="`icon icon-${page.icon}`"></i></span>
        <div><small class="mono">{{ row.id }}</small><h2>{{ row.name }}</h2></div>
        <button class="br-icon-button br-inspector-close" aria-label="关闭详情" @click="emit('close')"><i class="icon icon-x"></i></button>
      </header>
      <div class="br-inspector-body">
        <div class="br-detail-status">
          <span class="br-status" :class="row.status"><span class="dot" :class="row.status"></span>{{ statusLabel[row.status] }}</span>
          <select :value="row.status" aria-label="更新资源状态" @change="emit('status', row.id, ($event.target as HTMLSelectElement).value as ResourceStatus)">
            <option value="nominal">设为正常</option><option value="warning">标记关注</option><option value="idle">停用</option><option value="error">标记异常</option>
          </select>
        </div>
        <p class="br-detail-description">{{ row.description }}</p>
        <section class="br-detail-section">
          <h3>基础信息</h3>
          <dl>
            <div><dt>负责人</dt><dd>{{ row.owner }}</dd></div>
            <div v-for="(column, index) in page.columns" :key="column"><dt>{{ column }}</dt><dd>{{ row.values[index] }}</dd></div>
          </dl>
        </section>
        <section class="br-detail-section">
          <h3>标签</h3>
          <div class="br-tags"><span v-for="tag in row.tags" :key="tag">{{ tag }}</span></div>
        </section>
        <section class="br-detail-section">
          <h3>最近变更</h3>
          <div class="br-activity"><span class="dot nominal"></span><p><strong>配置已同步</strong><small>今天 14:31 · system</small></p></div>
          <div class="br-activity"><span class="dot idle"></span><p><strong>资源已创建</strong><small>2026-07-18 · {{ row.owner }}</small></p></div>
        </section>
      </div>
      <footer class="br-inspector-actions">
        <button class="br-secondary-button" @click="emit('duplicate', row)"><i class="icon icon-copy"></i>复制</button>
        <button class="br-primary-button" @click="emit('edit', row)"><i class="icon icon-pencil"></i>编辑配置</button>
      </footer>
    </template>
    <div v-else class="br-detail-empty">
      <span class="br-empty-icon"><i class="icon icon-mouse-pointer-click"></i></span>
      <strong>选择一项资源</strong><p>查看配置、状态和最近变更。</p>
    </div>
  </aside>
</template>
