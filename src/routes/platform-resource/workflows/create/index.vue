<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import WorkflowBuilder from '../builder/index.vue'
import { useWorkflowEditor } from '@/hooks/useWorkflowEditor'

defineOptions({ name: 'WorkflowResourceCreate' })

const route = useRoute()
const editor = useWorkflowEditor()

const duplicateId = computed(() => {
  const value = Number(route.query.duplicate)
  return Number.isFinite(value) && value > 0 ? value : undefined
})

watch(
  () => [route.fullPath, duplicateId.value] as const,
  () => { void editor.openCreate(duplicateId.value) },
  { immediate: true },
)
</script>

<template>
  <WorkflowBuilder
    :workflow="editor.draft.value"
    :mode="'create'"
    :issues="editor.issues.value"
    :agents="editor.agents.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="editor.goToList"
    @save="editor.saveDraft"
  />
</template>
