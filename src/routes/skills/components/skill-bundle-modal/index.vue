<script setup lang="ts">
import { computed, ref, useCssModule, watch } from 'vue'
import type { SkillValidateResult } from '@/interfaces/skill/api'
import type { SkillResponse } from '@/interfaces/skill/model'
import { useSkillsStore } from '@/stores/skills'

defineOptions({ name: 'SkillBundleModal' })

/** 与后端上限一致：8 MiB。 */
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024

const props = defineProps<{
  /** 传入时为覆盖模式（PUT /bundle），否则为新建（POST /upload）。 */
  target?: SkillResponse | null
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ uploaded: [skill: SkillResponse] }>()

const styles = useCssModule()
const skillsStore = useSkillsStore()

const file = ref<File | null>(null)
const checking = ref(false)
const result = ref<SkillValidateResult | null>(null)
/** 预检之外的错误：文件类型/大小、预检 400、上传失败（409 等）。 */
const error = ref('')
let checkRequest = 0

const overwriting = computed(() => Boolean(props.target))
const uploading = computed(() => skillsStore.state.skillUploading)
const nameMismatch = computed(() => Boolean(
  props.target && result.value?.ok && result.value.name !== props.target.name,
))
const canUpload = computed(() => Boolean(
  file.value && result.value?.ok && !nameMismatch.value && !checking.value && !uploading.value,
))

function resetState() {
  checkRequest += 1
  file.value = null
  checking.value = false
  result.value = null
  error.value = ''
}

/** 选中文件后先做本地类型/大小检查，再自动调预检；只采纳最后一次选择的结果。 */
watch(file, async (next) => {
  const request = ++checkRequest
  result.value = null
  error.value = ''
  checking.value = false
  if (!next) return
  if (!next.name.toLowerCase().endsWith('.zip')) {
    error.value = '只支持 .zip 文件'
    return
  }
  if (next.size > MAX_BUNDLE_BYTES) {
    error.value = '文件不能超过 8 MB'
    return
  }
  checking.value = true
  const checked = await skillsStore.validateBundle(next)
  if (request !== checkRequest) return
  checking.value = false
  result.value = checked.result
  error.value = checked.error ?? ''
})

watch(open, (value) => {
  if (!value) resetState()
})

async function onUpload() {
  if (!file.value || !canUpload.value) return
  error.value = ''
  const uploaded = props.target
    ? await skillsStore.replaceBundle(props.target.id, file.value)
    : await skillsStore.uploadBundle(file.value)
  if (!uploaded.skill) {
    error.value = uploaded.error?.message ?? '上传失败'
    return
  }
  open.value = false
  emit('uploaded', uploaded.skill)
}

function onOpenUpdate(value: boolean) {
  // 上传中不允许关闭，避免结果丢失。
  if (!value && uploading.value) return
  open.value = value
}
</script>

<template>
  <UModal
    :open="open"
    :title="overwriting ? `上传覆盖「${target?.name}」` : '上传技能包'"
    :dismissible="!uploading"
    @update:open="onOpenUpdate"
  >
    <template #body>
      <div :class="styles.body">
        <UFileUpload
          v-model="file"
          accept=".zip"
          variant="area"
          layout="list"
          :preview="false"
          :disabled="uploading"
          label="拖拽或点击选择 zip"
          description="≤ 8 MB"
          :class="styles.drop"
        />

        <div v-if="checking" :class="styles.status" role="status">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          <span>预检中…</span>
        </div>
        <div v-else-if="result?.ok && !nameMismatch" :class="[styles.status, styles.ok]" role="status">
          <UIcon name="i-lucide-circle-check" :class="styles.statusIcon" />
          <span :class="styles.statusCopy">
            <strong class="mono">{{ result.name }}</strong>
            <small>{{ result.description }}</small>
          </span>
        </div>
        <div v-else-if="result?.ok && nameMismatch" :class="[styles.status, styles.fail]" role="alert">
          <UIcon name="i-lucide-circle-x" :class="styles.statusIcon" />
          <span>技能包名称为「{{ result.name }}」，与目标「{{ target?.name }}」不一致</span>
        </div>
        <div v-else-if="result && !result.ok" :class="[styles.status, styles.fail]" role="alert">
          <UIcon name="i-lucide-circle-x" :class="styles.statusIcon" />
          <span>{{ result.errors[0] ?? '技能包不符合要求' }}</span>
        </div>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" role="alert" />
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" label="取消" :disabled="uploading" @click="onOpenUpdate(false)" />
      <UButton color="primary" icon="i-lucide-upload" label="上传" :loading="uploading" :disabled="!canUpload" @click="onUpload" />
    </template>
  </UModal>
</template>

<style module src="./index.module.css"></style>
