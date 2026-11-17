<script setup lang="ts">
import { ref } from 'vue'
import type { ChatModelOption } from '@/interfaces/settings/models/model'

defineOptions({ name: 'ChatModelMenu' })
defineProps<{
  items: ChatModelOption[]
  selected: string | null
  defaultLabel: string
  disabled: boolean
  back?: boolean
}>()
const emit = defineEmits<{
  select: [value: string]
  close: []
  back: []
}>()
const backButton = ref<{ $el?: HTMLElement } | null>(null)
const firstOption = ref<{ $el?: HTMLElement } | null>(null)

function focusInitial(): void {
  ;(backButton.value?.$el ?? firstOption.value?.$el)?.focus()
}

defineExpose({ focusInitial })
</script>

<template>
  <section :class="$style.menu" aria-label="选择对话模型">
    <div :class="$style.header">
      <UButton v-if="back" ref="backButton" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="返回思考强度" @click="emit('back')" />
      <h3 :class="$style.title">选择模型</h3>
      <UButton :class="$style.close" icon="i-lucide-x" color="neutral" variant="ghost" aria-label="关闭模型选择" @click="emit('close')" />
    </div>
    <div :class="$style.list">
      <UButton ref="firstOption" :class="$style.option" color="neutral" variant="ghost" :disabled="disabled"
        :aria-pressed="selected === null" @click="emit('select', '__default__')">
        <span :class="$style.copy"><span>{{ defaultLabel }}</span><span :class="$style.description">自动使用当前场景配置的模型</span></span>
        <UIcon v-if="selected === null" name="i-lucide-check" :class="$style.check" />
      </UButton>
      <p :class="$style.groupLabel">可用模型</p>
      <UButton v-for="item in items" :key="item.provider_id" :class="$style.option"
        color="neutral" variant="ghost" :disabled="disabled" :aria-pressed="selected === item.provider_id"
        @click="emit('select', item.provider_id)">
        <span :class="$style.copy"><span>{{ item.display_name }}</span><span :class="$style.description">{{ item.model_name }}</span></span>
        <UIcon v-if="selected === item.provider_id" name="i-lucide-check" :class="$style.check" />
      </UButton>
      <p v-if="!items.length" :class="$style.description">暂无可切换模型，可前往设置添加模型服务。</p>
    </div>
  </section>
</template>

<style module src="./index.module.css"></style>
