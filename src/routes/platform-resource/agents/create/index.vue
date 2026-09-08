<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AgentBuilder from '@/routes/platform-resource/components/agent-builder/index.vue'
import { useAgentEditor } from '@/hooks/useAgentEditor'

defineOptions({ name: 'AgentResourceCreate' })

const route = useRoute()
const editor = useAgentEditor()

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
  <AgentBuilder
    :agent="editor.draft.value"
    :mode="'create'"
    :issues="editor.issues.value"
    :skills="editor.skills.value"
    :tools="editor.tools.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="editor.goToList"
    @save="editor.saveDraft"
  />
</template>
