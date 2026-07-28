<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSkillsStore } from '@/stores/skills'

defineOptions({ name: 'SkillListPanel' })

const { state, loadSkills, selectSkill, uploadSkill, removeSkill } = useSkillsStore()
const emit = defineEmits<{ selected: [name: string] }>()

const uploadError = ref('')
const uploadFile = ref<File | null>(null)
const pendingDeleteName = ref<string | null>(null)

const statusLabel: Record<string, string> = {
  enabled: '已启用',
  disabled: '已禁用',
}

async function handleFile(file: File | undefined) {
  if (!file) return
  uploadError.value = ''
  const error = await uploadSkill(file)
  if (error) uploadError.value = error
}

watch(uploadFile, async (file) => {
  if (!file) return
  await handleFile(file)
  uploadFile.value = null
})

function onSelect(name: string) {
  if (state.selectedSkillName !== name) void selectSkill(name)
  emit('selected', name)
}

function onRefresh() {
  void loadSkills()
}

function onDeleteRequest(name: string) {
  pendingDeleteName.value = name
}

function onDeleteCancel() {
  pendingDeleteName.value = null
}

function onModalOpenUpdate(open: boolean) {
  if (!open) onDeleteCancel()
}

async function onDeleteConfirm() {
  if (!pendingDeleteName.value) return
  const name = pendingDeleteName.value
  await removeSkill(name)
  pendingDeleteName.value = null
}
</script>

<template>
  <section :class="$style['sk-list-pane']">
    <header :class="$style['sk-head']">
      <div :class="$style['sk-head-main']">
        <UIcon name="i-lucide-sparkles" :class="$style['sk-head-icon']" />
        <h1 :class="$style['sk-title']">技能库</h1>
        <span class="mono" :class="$style['sk-count']">{{ state.skills.length }}</span>
      </div>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        square
        :class="$style['sk-refresh']"
        aria-label="刷新列表"
        :disabled="state.skillsLoading"
        :loading="state.skillsLoading"
        @click="onRefresh"
      />
    </header>

    <UFileUpload
      v-model="uploadFile"
      :class="$style['sk-drop']"
      accept=".zip"
      variant="area"
      layout="list"
      :preview="false"
      :disabled="state.skillUploading"
      :icon="state.skillUploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
      :label="state.skillUploading ? '上传中…' : '上传技能包'"
      description="拖拽或点击 · zip ≤ 8MB"
      :ui="{ base: 'min-h-24 rounded-md' }"
    />
    <UAlert v-if="uploadError" :class="$style['sk-upload-err']" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="uploadError" />

    <div :class="$style['sk-list-scroll']">
      <div v-if="state.skillsLoading" :class="$style['sk-empty']">加载中…</div>
      <div v-else-if="!state.skills.length" :class="$style['sk-empty']">
        <UIcon name="i-lucide-inbox" :class="$style['sk-empty-icon']" />
        <span>暂无技能。上传一个 zip 包以开始。</span>
      </div>
      <ul v-else :class="$style['sk-list']">
        <li
          v-for="skill in state.skills"
          :key="skill.id"
          :class="[
            $style['sk-row'],
            { [$style.active]: skill.name === state.selectedSkillName },
          ]"
        >
          <UButton
            color="neutral"
            variant="ghost"
            block
            :class="$style['sk-row-select']"
            :ui="{ base: 'justify-start' }"
            :aria-label="`查看技能 ${skill.name}`"
            :aria-pressed="skill.name === state.selectedSkillName"
            @click="onSelect(skill.name)"
          >
            <UIcon name="i-lucide-puzzle" :class="$style['sk-row-glyph']" />
            <span :class="$style['sk-row-main']">
              <span class="mono" :class="$style['sk-row-name']">{{ skill.name }}</span>
              <span :class="$style['sk-row-desc']">{{ skill.description }}</span>
            </span>
            <span v-if="skill.version" class="mono" :class="$style['sk-ver']">v{{ skill.version }}</span>
            <span
              :class="$style['sk-status']"
              :title="statusLabel[skill.status] ?? skill.status"
            >
              <span class="dot" :class="skill.status === 'enabled' ? 'nominal' : 'idle'"></span>
            </span>
          </UButton>
          <div :class="$style['sk-row-actions']">
            <UTooltip text="删除技能">
              <UButton
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                square
                :class="$style['sk-mini']"
                aria-label="删除技能"
                @click="onDeleteRequest(skill.name)"
              />
            </UTooltip>
          </div>
        </li>
      </ul>
    </div>

    <UModal
      :open="pendingDeleteName !== null"
      title="删除技能"
      description="删除后需要重新上传技能包才能恢复。"
      @update:open="onModalOpenUpdate"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="取消" @click="onDeleteCancel" />
        <UButton color="error" label="确认删除" @click="onDeleteConfirm" />
      </template>
    </UModal>
  </section>
</template>

<style module src="./index.module.css"></style>
