<script setup lang="ts">
import { computed } from 'vue'
import { useSkillsStore } from '@/stores/skills'
import { renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'SkillDetailPanel' })

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

const resources = computed(() => state.skillDetail?.resources ?? [])

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
  <section :class="$style['sk-detail-pane']">
    <div v-if="!state.selectedSkillName" :class="$style['sk-detail-empty']">
      <svg :class="$style['sk-hex']" viewBox="0 0 20 22" fill="none">
        <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
      </svg>
      <span :class="$style['sk-empty-hint']">选择左侧技能查看详情</span>
    </div>

    <div v-else-if="state.skillDetailLoading" :class="$style['sk-detail-empty']">
      <i
        class="icon icon-loader-circle"
        :class="[$style['sk-loading'], $style.spinning]"
      ></i>
      <span :class="$style['sk-empty-hint']">加载详情…</span>
    </div>

    <div v-else-if="state.skillDetail" :class="$style['sk-detail-scroll']">
      <div :class="$style['sk-detail-inner']">
        <header :class="$style['sk-detail-head']">
          <div :class="$style['sk-detail-title-row']">
            <h2 class="mono" :class="$style['sk-detail-name']">{{ state.skillDetail.name }}</h2>
            <span v-if="state.skillDetail.version" class="mono" :class="$style['sk-ver']">
              v{{ state.skillDetail.version }}
            </span>
          </div>
          <p :class="$style['sk-detail-desc']">{{ state.skillDetail.description }}</p>
        </header>

        <div :class="$style['sk-meta-grid']">
          <div :class="$style['sk-meta']">
            <span :class="$style['sk-meta-k']">作用域</span>
            <span class="mono" :class="$style['sk-meta-v']">{{ state.skillDetail.scope }}</span>
          </div>
          <div :class="$style['sk-meta']">
            <span :class="$style['sk-meta-k']">工作区 ID</span>
            <span class="mono" :class="$style['sk-meta-v']">{{ state.skillDetail.workspace_id }}</span>
          </div>
          <div :class="$style['sk-meta']">
            <span :class="$style['sk-meta-k']">创建时间</span>
            <span class="mono" :class="$style['sk-meta-v']">{{ formatTime(state.skillDetail.created_at) }}</span>
          </div>
          <div :class="$style['sk-meta']">
            <span :class="$style['sk-meta-k']">更新时间</span>
            <span class="mono" :class="$style['sk-meta-v']">{{ formatTime(state.skillDetail.updated_at) }}</span>
          </div>
        </div>

        <section v-if="frontmatterRows.length" :class="$style['sk-section']">
          <div :class="$style['sk-section-title']">FRONTMATTER</div>
          <div :class="$style['sk-fm']">
            <div v-for="row in frontmatterRows" :key="row.key" :class="$style['sk-fm-row']">
              <span class="mono" :class="$style['sk-fm-k']">{{ row.key }}</span>
              <span class="mono" :class="$style['sk-fm-v']">{{ row.value }}</span>
            </div>
          </div>
        </section>

        <section v-if="resources.length" :class="$style['sk-section']">
          <div :class="$style['sk-section-title']">
            资源清单 <span class="mono" :class="$style['sk-count']">{{ resources.length }}</span>
          </div>
          <div :class="$style['sk-cli']">
            <div class="mono" :class="$style['sk-cli-head']">┌─ [ RESOURCES ] ─────────────────────</div>
            <div
              v-for="resource in resources"
              :key="resource.relative_path"
              class="mono"
              :class="$style['sk-cli-row']"
            >
              <span :class="$style['sk-cli-bar']">│</span>
              <i class="icon icon-file-text"></i>
              <span :class="$style['sk-cli-path']">{{ resource.relative_path }}</span>
              <span :class="$style['sk-cli-size']">{{ formatBytes(resource.size) }}</span>
            </div>
            <div class="mono" :class="$style['sk-cli-foot']">└──────────────────────────────────────</div>
          </div>
        </section>

        <section :class="$style['sk-section']">
          <div :class="$style['sk-section-title']">SKILL.md</div>
          <div v-if="bodyHtml" class="md" :class="$style['sk-body']" v-html="bodyHtml"></div>
          <div v-else :class="$style['sk-empty']">(正文为空)</div>
        </section>
      </div>
    </div>

    <div v-else :class="$style['sk-detail-empty']">
      <i class="icon icon-triangle-alert" :class="$style['sk-loading']"></i>
      <span :class="$style['sk-empty-hint']">详情加载失败</span>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
