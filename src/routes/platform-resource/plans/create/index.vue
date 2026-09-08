<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import PlanBuilder from '../../components/plan-builder/index.vue'
import { usePlanEditor } from '@/hooks/usePlanEditor'

defineOptions({ name: 'PlanResourceCreate' })

const route = useRoute()
const editor = usePlanEditor()

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
  <PlanBuilder
    :plan="editor.draft.value"
    :mode="'create'"
    :issues="editor.issues.value"
    :agents="editor.agents.value"
    :saving="editor.saving.value"
    :error="editor.error.value"
    @close="editor.goToList"
    @save="editor.saveDraft"
    @publish="editor.publish"
  />
</template>
