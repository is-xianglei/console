<script setup lang="ts">
import { ref } from 'vue'
import { useSkillsStore } from '../../stores/skills'

const { state, loadSkills, selectSkill, uploadSkill, removeSkill } = useSkillsStore()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploadError = ref('')
const confirmDeleteName = ref<string | null>(null)

const statusLabel: Record<string, string> = {
  enabled: '已启用',
  disabled: '已禁用',
}

function pickFile() {
  if (state.skillUploading) return
  uploadError.value = ''
  fileInput.value?.click()
}

async function handleFile(file: File | undefined) {
  if (!file) return
  uploadError.value = ''
  const error = await uploadSkill(file)
  if (error) uploadError.value = error
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  void handleFile(input.files?.[0])
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragOver.value = false
  void handleFile(event.dataTransfer?.files?.[0])
}

function onSelect(name: string) {
  if (state.selectedSkillName === name) return
  confirmDeleteName.value = null
  void selectSkill(name)
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
</script>

<template>
  <section class="sk-list-pane">
    <header class="sk-head">
      <div class="sk-head-main">
        <i class="icon icon-sparkles"></i>
        <h1 class="sk-title">技能库</h1>
        <span class="sk-count mono">{{ state.skills.length }}</span>
      </div>
      <button
        type="button"
        class="sk-refresh"
        title="刷新列表"
        :disabled="state.skillsLoading"
        @click="loadSkills"
      >
        <i class="icon icon-refresh-cw" :class="{ spinning: state.skillsLoading }"></i>
      </button>
    </header>

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

    <div class="sk-list-scroll">
      <div v-if="state.skillsLoading" class="sk-empty">加载中…</div>
      <div v-else-if="!state.skills.length" class="sk-empty">
        <i class="icon icon-inbox"></i>
        <span>暂无技能。上传一个 zip 包以开始。</span>
      </div>
      <ul v-else class="sk-list">
        <li
          v-for="skill in state.skills"
          :key="skill.id"
          class="sk-row"
          :class="{ active: skill.name === state.selectedSkillName }"
        >
          <button
            type="button"
            class="sk-row-select"
            :aria-label="`查看技能 ${skill.name}`"
            :aria-pressed="skill.name === state.selectedSkillName"
            @click="onSelect(skill.name)"
          >
            <i class="icon icon-puzzle sk-row-glyph"></i>
            <span class="sk-row-main">
              <span class="sk-row-name mono">{{ skill.name }}</span>
              <span class="sk-row-desc">{{ skill.description }}</span>
            </span>
            <span v-if="skill.version" class="sk-ver mono">v{{ skill.version }}</span>
            <span
              class="sk-status"
              :class="skill.status"
              :title="statusLabel[skill.status] ?? skill.status"
            >
              <span class="dot" :class="skill.status === 'enabled' ? 'nominal' : 'idle'"></span>
            </span>
          </button>
          <div class="sk-row-actions">
            <template v-if="confirmDeleteName === skill.name">
              <button type="button" class="sk-mini danger" title="确认删除" @click="doDelete(skill.name)">
                <i class="icon icon-check"></i>
              </button>
              <button type="button" class="sk-mini" title="取消" @click="cancelDelete">
                <i class="icon icon-x"></i>
              </button>
            </template>
            <button v-else type="button" class="sk-mini" title="删除技能" @click="askDelete(skill.name)">
              <i class="icon icon-trash-2"></i>
            </button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped src="./SkillListPanel.css"></style>
