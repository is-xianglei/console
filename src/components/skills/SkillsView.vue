<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConsoleStore } from '../../stores/console'
import { renderMarkdown } from '../../utils/markdown'

const { state, loadSkills, selectSkill, uploadSkill, removeSkill } = useConsoleStore()

// ===== 交互态(瞬时,不入 store) =====
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploadError = ref('')
const confirmDeleteName = ref<string | null>(null)

/** 详情正文渲染为 HTML(markdown-it,已内置 XSS 防护:html:false) */
const bodyHtml = computed(() =>
  state.skillDetail ? renderMarkdown(state.skillDetail.body) : '',
)

/** frontmatter 展开为可展示的键值对:标量原样,对象/数组转紧凑 JSON */
const frontmatterRows = computed(() => {
  const fm = state.skillDetail?.frontmatter
  if (!fm) return [] as { key: string; value: string }[]
  return Object.entries(fm).map(([key, v]) => ({
    key,
    value:
      v === null || v === undefined
        ? '—'
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v),
  }))
})

const statusLabel: Record<string, string> = {
  enabled: '已启用',
  disabled: '已禁用',
}

/** 字节数格式化为人类可读(B / KB / MB) */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** ISO 时间戳 → YYYY-MM-DD HH:mm(本地时区,等宽展示) */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ===== 上传 =====
function pickFile() {
  if (state.skillUploading) return
  uploadError.value = ''
  fileInput.value?.click()
}
async function handleFile(file: File | undefined) {
  if (!file) return
  uploadError.value = ''
  const err = await uploadSkill(file)
  if (err) uploadError.value = err
}
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  handleFile(input.files?.[0])
  input.value = '' // 允许重复选择同一文件再次触发
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  handleFile(e.dataTransfer?.files?.[0])
}

// ===== 选择 / 删除 =====
function onSelect(name: string) {
  if (state.selectedSkillName === name) return
  confirmDeleteName.value = null
  selectSkill(name)
}
function askDelete(name: string) {
  confirmDeleteName.value = name
}
function cancelDelete() {
  confirmDeleteName.value = null
}
async function doDelete(name: string) {
  await removeSkill(name)
  confirmDeleteName.value = null
}

onMounted(() => {
  loadSkills()
})
</script>

<template>
  <main class="skills-page">
    <!-- 左:列表 + 上传 -->
    <section class="sk-list-pane">
      <header class="sk-head">
        <div class="sk-head-main">
          <i class="icon icon-sparkles"></i>
          <h1 class="sk-title">技能库</h1>
          <span class="sk-count mono">{{ state.skills.length }}</span>
        </div>
        <button
          class="sk-refresh"
          title="刷新列表"
          :disabled="state.skillsLoading"
          @click="loadSkills"
        >
          <i class="icon icon-refresh-cw" :class="{ spinning: state.skillsLoading }"></i>
        </button>
      </header>

      <!-- 上传区(点击 / 拖拽) -->
      <div
        class="sk-drop"
        :class="{ over: dragOver, busy: state.skillUploading }"
        role="button"
        :tabindex="state.skillUploading ? -1 : 0"
        :aria-disabled="state.skillUploading"
        aria-label="上传技能包，支持 zip 文件，最大 8MB"
        @click="pickFile"
        @keydown.enter.self.prevent="pickFile"
        @keydown.space.self.prevent="pickFile"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <input ref="fileInput" type="file" accept=".zip" class="sk-file" @change="onFileChange" />
        <i
          class="icon"
          :class="state.skillUploading ? 'icon-loader-circle spinning' : 'icon-upload'"
        ></i>
        <span class="sk-drop-main">{{ state.skillUploading ? '上传中…' : '上传技能包' }}</span>
        <span class="sk-drop-sub mono">拖拽或点击 · zip ≤ 8MB</span>
      </div>
      <div v-if="uploadError" class="sk-upload-err">
        <i class="icon icon-triangle-alert"></i>
        <span>{{ uploadError }}</span>
      </div>

      <!-- 列表:loading / empty / list -->
      <div class="sk-list-scroll">
        <div v-if="state.skillsLoading" class="sk-empty">加载中…</div>
        <div v-else-if="!state.skills.length" class="sk-empty">
          <i class="icon icon-inbox"></i>
          <span>暂无技能。上传一个 zip 包以开始。</span>
        </div>
        <ul v-else class="sk-list">
          <li
            v-for="s in state.skills"
            :key="s.id"
            class="sk-row"
            role="button"
            tabindex="0"
            :aria-label="`查看技能 ${s.name}`"
            :aria-pressed="s.name === state.selectedSkillName"
            :class="{ active: s.name === state.selectedSkillName }"
            @click="onSelect(s.name)"
            @keydown.enter.self.prevent="onSelect(s.name)"
            @keydown.space.self.prevent="onSelect(s.name)"
          >
            <i class="icon icon-puzzle sk-row-glyph"></i>
            <div class="sk-row-main">
              <span class="sk-row-name mono">{{ s.name }}</span>
              <span class="sk-row-desc">{{ s.description }}</span>
            </div>
            <span v-if="s.version" class="sk-ver mono">v{{ s.version }}</span>
            <span
              class="sk-status"
              :class="s.status"
              :title="statusLabel[s.status] ?? s.status"
            >
              <span class="dot" :class="s.status === 'enabled' ? 'nominal' : 'idle'"></span>
            </span>
            <div class="sk-row-actions" @click.stop>
              <template v-if="confirmDeleteName === s.name">
                <button class="sk-mini danger" title="确认删除" @click="doDelete(s.name)">
                  <i class="icon icon-check"></i>
                </button>
                <button class="sk-mini" title="取消" @click="cancelDelete">
                  <i class="icon icon-x"></i>
                </button>
              </template>
              <button v-else class="sk-mini" title="删除技能" @click="askDelete(s.name)">
                <i class="icon icon-trash-2"></i>
              </button>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- 右:详情 -->
    <section class="sk-detail-pane">
      <!-- 空态:呼吸六边形 -->
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
          <!-- 头部 -->
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

          <!-- 元数据 -->
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

          <!-- frontmatter -->
          <section v-if="frontmatterRows.length" class="sk-section">
            <div class="sk-section-title">FRONTMATTER</div>
            <div class="sk-fm">
              <div v-for="row in frontmatterRows" :key="row.key" class="sk-fm-row">
                <span class="sk-fm-k mono">{{ row.key }}</span>
                <span class="sk-fm-v mono">{{ row.value }}</span>
              </div>
            </div>
          </section>

          <!-- 资源清单(CLI 卡片调性) -->
          <section v-if="state.skillDetail.resources.length" class="sk-section">
            <div class="sk-section-title">
              资源清单 <span class="sk-count mono">{{ state.skillDetail.resources.length }}</span>
            </div>
            <div class="sk-cli">
              <div class="sk-cli-head mono">┌─ [ RESOURCES ] ─────────────────────</div>
              <div
                v-for="r in state.skillDetail.resources"
                :key="r.relative_path"
                class="sk-cli-row mono"
              >
                <span class="sk-cli-bar">│</span>
                <i class="icon icon-file-text"></i>
                <span class="sk-cli-path">{{ r.relative_path }}</span>
                <span class="sk-cli-size">{{ formatBytes(r.size) }}</span>
              </div>
              <div class="sk-cli-foot mono">└──────────────────────────────────────</div>
            </div>
          </section>

          <!-- SKILL.md 正文 -->
          <section class="sk-section">
            <div class="sk-section-title">SKILL.md</div>
            <div v-if="bodyHtml" class="md sk-body" v-html="bodyHtml"></div>
            <div v-else class="sk-empty">(正文为空)</div>
          </section>
        </div>
      </div>

      <!-- 详情加载失败兜底 -->
      <div v-else class="sk-detail-empty">
        <i class="icon icon-triangle-alert sk-loading"></i>
        <span class="sk-empty-hint">详情加载失败</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.skills-page {
  flex: 1;
  display: flex;
  min-width: 0;
  background: var(--bg-deep);
}

/* ===== 左:列表 + 上传 ===== */
.sk-list-pane {
  width: clamp(300px, 26vw, 380px);
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sk-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.sk-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.sk-head-main > .icon {
  font-size: 15px;
  color: var(--accent-agent);
}
.sk-title {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}
.sk-count {
  font-size: 10px;
  color: var(--text-dim);
  background: var(--bg-surface);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.sk-refresh {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  background: transparent;
  border: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.sk-refresh:hover:not(:disabled) {
  background: var(--bg-surface);
  color: var(--text-secondary);
}
.sk-refresh:disabled {
  cursor: default;
}
.icon.spinning {
  animation: spin 0.8s linear infinite;
}

/* 上传区(点击 / 拖拽) */
.sk-drop {
  margin: 12px;
  padding: 18px 14px;
  border: 1px dashed var(--border-visible);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  text-align: center;
  transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast);
}
.sk-drop:hover {
  border-color: var(--accent-agent);
  background: var(--bg-elevated);
}
.sk-drop.over {
  border-color: var(--accent-agent);
  background: var(--accent-agent-dim);
  box-shadow: 0 0 16px var(--accent-agent-glow);
}
.sk-drop.busy {
  pointer-events: none;
  opacity: 0.7;
}
.sk-drop > .icon {
  font-size: 20px;
  color: var(--accent-agent);
}
.sk-file {
  display: none;
}
.sk-drop-main {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.sk-drop-sub {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.04em;
}
.sk-upload-err {
  margin: 0 12px 4px;
  padding: 8px 10px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: var(--radius-control);
  background: rgba(248, 113, 113, 0.1);
  color: var(--status-error);
  font-size: 11px;
  line-height: 1.5;
}
.sk-upload-err .icon {
  font-size: 13px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* 列表 */
.sk-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 12px;
}
.sk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: var(--text-dim);
  font-size: 11px;
  text-align: center;
}
.sk-empty .icon {
  font-size: 22px;
  opacity: 0.6;
}
.sk-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  list-style: none;
}
.sk-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  position: relative;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.sk-row:hover {
  background: var(--bg-surface);
}
.sk-row.active {
  background: var(--bg-surface);
  border-color: var(--border);
}
.sk-row.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 20px;
  background: var(--accent-agent);
  border-radius: 0 2px 2px 0;
}
.sk-row-glyph {
  font-size: 14px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.sk-row.active .sk-row-glyph {
  color: var(--accent-agent);
}
.sk-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sk-row-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sk-row.active .sk-row-name {
  color: var(--text-primary);
}
.sk-row-desc {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sk-ver {
  font-size: 9px;
  font-weight: 600;
  color: var(--accent-agent);
  background: var(--accent-agent-dim);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}
.sk-status {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.sk-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-fast);
}
.sk-row:hover .sk-row-actions,
.sk-row.active .sk-row-actions {
  opacity: 1;
}
.sk-mini {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.sk-mini:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}
.sk-mini.danger {
  color: var(--status-error);
}
.sk-mini.danger:hover {
  background: rgba(248, 113, 113, 0.16);
}
.sk-mini i {
  font-size: 13px;
}

/* ===== 右:详情 ===== */
.sk-detail-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
}
.sk-detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-dim);
}
.sk-hex {
  width: 44px;
  height: 48px;
  color: var(--accent-agent);
  opacity: 0.4;
  animation: glow-breathe 3s ease-in-out infinite;
}
.sk-empty-hint {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.sk-loading {
  font-size: 28px;
  color: var(--text-muted);
}
.sk-detail-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px 0;
}
.sk-detail-inner {
  max-width: 820px;
  margin: 0 auto;
  padding: 0 40px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.sk-detail-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sk-detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.sk-detail-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}
.sk-badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.sk-badge.enabled {
  color: var(--status-success);
  background: rgba(52, 211, 153, 0.12);
}
.sk-badge.disabled {
  color: var(--text-dim);
  background: var(--bg-surface);
}
.sk-detail-desc {
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.sk-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.sk-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}
.sk-meta-k {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.sk-meta-v {
  font-size: 12px;
  color: var(--text-primary);
}
.sk-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sk-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.sk-fm {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  overflow: hidden;
}
.sk-fm-row {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
}
.sk-fm-row:not(:last-child) {
  border-bottom: 1px solid var(--border-dim);
}
.sk-fm-k {
  flex-shrink: 0;
  width: 140px;
  font-size: 11px;
  color: var(--accent-agent);
}
.sk-fm-v {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-secondary);
  word-break: break-word;
}
.sk-cli {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.7;
  overflow-x: auto;
}
.sk-cli-head,
.sk-cli-foot {
  color: var(--accent-agent);
  white-space: nowrap;
}
.sk-cli-row {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
}
.sk-cli-bar {
  color: var(--accent-agent);
}
.sk-cli-row .icon {
  font-size: 12px;
  color: var(--text-dim);
}
.sk-cli-path {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sk-cli-size {
  color: var(--text-dim);
  flex-shrink: 0;
}
.sk-body {
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
}
</style>
