<script setup lang="ts">
import { ref } from 'vue'
import type { ChatModelOption } from '@/interfaces/settings/models/model'

defineOptions({ name: 'ChatModelMenu' })
defineProps<{
  items: ChatModelOption[]
  selected: string | null
  defaultLabel: string
  /** 跟随默认时实际落到的模型。 */
  defaultDescription?: string
  disabled: boolean
}>()
const emit = defineEmits<{
  select: [value: string]
  back: []
}>()
const list = ref<HTMLElement | null>(null)

/** 进入列表时把焦点放在当前选中的模型上。 */
function focusInitial(): void {
  const target = list.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? list.value?.querySelector<HTMLElement>('button')
  target?.focus()
}

defineExpose({ focusInitial })
</script>

<template>
  <section :class="$style.menu" aria-label="选择对话模型">
    <header :class="$style.header">
      <UButton icon="i-lucide-chevron-left" size="xs" color="neutral" variant="ghost" aria-label="返回思考强度" @click="emit('back')" />
      <h3 :class="$style.title">选择模型</h3>
    </header>
    <div ref="list" :class="$style.list">
      <UButton :class="$style.option" color="neutral" variant="ghost" :disabled="disabled"
        :aria-pressed="selected === null" @click="emit('select', '__default__')">
        <span :class="$style.copy">
          <span :class="$style.name">{{ defaultLabel }}</span>
          <span v-if="defaultDescription" :class="$style.description">{{ defaultDescription }}</span>
        </span>
        <UIcon v-if="selected === null" name="i-lucide-check" :class="$style.check" />
      </UButton>
      <UButton v-for="item in items" :key="item.provider_id" :class="$style.option" :title="item.model_name"
        color="neutral" variant="ghost" :disabled="disabled" :aria-pressed="selected === item.provider_id"
        @click="emit('select', item.provider_id)">
        <span :class="$style.name">{{ item.display_name || item.model_name }}</span>
        <UIcon v-if="selected === item.provider_id" name="i-lucide-check" :class="$style.check" />
      </UButton>
      <UEmpty v-if="!items.length" variant="naked" size="xs" description="暂无可切换模型，可前往设置添加模型服务。" />
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
