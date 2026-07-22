<script setup lang="ts">
import type { ResourcePage, ResourceRow } from '../../../data/platformCatalog'

defineProps<{
  page: ResourcePage
  rows: ResourceRow[]
  selectedId: string
  selectedIds: Set<string>
  allSelected: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  toggle: [id: string]
  toggleAll: []
  edit: [row: ResourceRow]
  duplicate: [row: ResourceRow]
  delete: [row: ResourceRow]
  reset: []
}>()
</script>

<template>
  <div class="br-table-scroll">
    <table class="br-table">
      <thead>
        <tr>
          <th class="br-check-col">
            <button class="br-icon-button br-check" :aria-label="allSelected ? '取消选择本页' : '选择本页'" :aria-pressed="allSelected" @click="emit('toggleAll')">
              <i :class="`icon icon-${allSelected ? 'square-check-big' : 'square'}`"></i>
            </button>
          </th>
          <th class="br-name-col">名称</th>
          <th>状态</th>
          <th v-for="column in page.columns" :key="column">{{ column }}</th>
          <th>负责人</th>
          <th class="br-actions-col"><span class="sr-only">操作</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          :class="{ active: selectedId === row.id }"
          @click="emit('select', row.id)"
        >
          <td class="br-check-col">
            <button class="br-icon-button br-check" :aria-label="selectedIds.has(row.id) ? `取消选择 ${row.name}` : `选择 ${row.name}`" :aria-pressed="selectedIds.has(row.id)" @click.stop="emit('toggle', row.id)">
              <i :class="`icon icon-${selectedIds.has(row.id) ? 'square-check-big' : 'square'}`"></i>
            </button>
          </td>
          <td>
            <button class="br-resource-name" @click.stop="emit('select', row.id)">
              <span class="br-resource-icon"><i :class="`icon icon-${page.icon}`"></i></span>
              <span><strong>{{ row.name }}</strong><small class="mono">{{ row.id }}</small></span>
            </button>
          </td>
          <td><span class="br-status" :class="row.status"><span class="dot" :class="row.status"></span>{{ { nominal: '正常', warning: '需关注', error: '异常', idle: '未启用' }[row.status] }}</span></td>
          <td v-for="(value, index) in row.values" :key="index"><span class="br-cell-value">{{ value }}</span></td>
          <td><span class="br-owner">{{ row.owner }}</span></td>
          <td class="br-actions-col">
            <div class="br-row-actions">
              <button class="br-icon-button" :aria-label="`编辑 ${row.name}`" title="编辑" @click.stop="emit('edit', row)"><i class="icon icon-pencil"></i></button>
              <button class="br-icon-button" :aria-label="`复制 ${row.name}`" title="复制" @click.stop="emit('duplicate', row)"><i class="icon icon-copy"></i></button>
              <button class="br-icon-button danger" :aria-label="`删除 ${row.name}`" title="删除" @click.stop="emit('delete', row)"><i class="icon icon-trash-2"></i></button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!rows.length" class="br-empty" role="status">
      <span class="br-empty-icon"><i class="icon icon-search-x"></i></span>
      <strong>没有符合条件的资源</strong>
      <p>调整关键词或筛选条件后再试。</p>
      <button class="br-text-button" @click="emit('reset')">清除全部筛选</button>
    </div>
  </div>
</template>
