<script setup lang="ts">
import { computed } from 'vue'
import { useSkillsStore } from '../../stores/skills'
import { renderMarkdown } from '../../utils/markdown'

const { state } = useSkillsStore()

// renderMarkdown 使用 markdown-it 的 html:false，技能正文不能注入原始 HTML。
const bodyHtml = computed(() =>
  state.skillDetail ? renderMarkdown(state.skillDetail.body) : '',
)

const frontmatterRows = computed(() => {
  const frontmatter = state.skillDetail?.frontmatter
  if (!frontmatter) return [] as { key: string; value: string }[]
  return Object.entries(frontmatter).map(([key, value]) => ({
    key,
    value:
      value === null || value === undefined
        ? '—'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
  }))
})

const statusLabel: Record<string, string> = {
  enabled: '已启用',
  disabled: '已禁用',
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <section class="sk-detail-pane">
    <div v-if="!state.selectedSkillName" class="sk-detail-empty">
      <svg class="sk-hex" viewBox="0 0 20 22" fill="none">
        <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
      </svg>
      <span class="sk-empty-hint">选择左侧技能查看详情</span>
    </div>

    <div v-else-if="state.skillDetailLoading" class="sk-detail-empty">
      <i class="icon icon-loader-circle spinning sk-loading"></i>
      <span class="sk-empty-hint">加载详情…</span>
    </div>

    <div v-else-if="state.skillDetail" class="sk-detail-scroll">
      <div class="sk-detail-inner">
        <header class="sk-detail-head">
          <div class="sk-detail-title-row">
            <h2 class="sk-detail-name mono">{{ state.skillDetail.name }}</h2>
            <span v-if="state.skillDetail.version" class="sk-ver mono">
              v{{ state.skillDetail.version }}
            </span>
            <span class="sk-badge" :class="state.skillDetail.status">
              {{ statusLabel[state.skillDetail.status] ?? state.skillDetail.status }}
            </span>
          </div>
          <p class="sk-detail-desc">{{ state.skillDetail.description }}</p>
        </header>

        <div class="sk-meta-grid">
          <div class="sk-meta">
            <span class="sk-meta-k">作用域</span>
            <span class="sk-meta-v mono">{{ state.skillDetail.scope }}</span>
          </div>
          <div class="sk-meta">
            <span class="sk-meta-k">状态</span>
            <span class="sk-meta-v mono">{{ state.skillDetail.status }}</span>
          </div>
          <div class="sk-meta">
            <span class="sk-meta-k">创建时间</span>
            <span class="sk-meta-v mono">{{ formatTime(state.skillDetail.created_at) }}</span>
          </div>
          <div class="sk-meta">
            <span class="sk-meta-k">更新时间</span>
            <span class="sk-meta-v mono">{{ formatTime(state.skillDetail.updated_at) }}</span>
          </div>
        </div>

        <section v-if="frontmatterRows.length" class="sk-section">
          <div class="sk-section-title">FRONTMATTER</div>
          <div class="sk-fm">
            <div v-for="row in frontmatterRows" :key="row.key" class="sk-fm-row">
              <span class="sk-fm-k mono">{{ row.key }}</span>
              <span class="sk-fm-v mono">{{ row.value }}</span>
            </div>
          </div>
        </section>

        <section v-if="state.skillDetail.resources.length" class="sk-section">
          <div class="sk-section-title">
            资源清单 <span class="sk-count mono">{{ state.skillDetail.resources.length }}</span>
          </div>
          <div class="sk-cli">
            <div class="sk-cli-head mono">┌─ [ RESOURCES ] ─────────────────────</div>
            <div
              v-for="resource in state.skillDetail.resources"
              :key="resource.relative_path"
              class="sk-cli-row mono"
            >
              <span class="sk-cli-bar">│</span>
              <i class="icon icon-file-text"></i>
              <span class="sk-cli-path">{{ resource.relative_path }}</span>
              <span class="sk-cli-size">{{ formatBytes(resource.size) }}</span>
            </div>
            <div class="sk-cli-foot mono">└──────────────────────────────────────</div>
          </div>
        </section>

        <section class="sk-section">
          <div class="sk-section-title">SKILL.md</div>
          <div v-if="bodyHtml" class="md sk-body" v-html="bodyHtml"></div>
          <div v-else class="sk-empty">(正文为空)</div>
        </section>
      </div>
    </div>

    <div v-else class="sk-detail-empty">
      <i class="icon icon-triangle-alert sk-loading"></i>
      <span class="sk-empty-hint">详情加载失败</span>
    </div>
  </section>
</template>

<style scoped src="./SkillDetailPanel.css"></style>
