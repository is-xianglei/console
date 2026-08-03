<script setup lang="ts">
import { ref } from 'vue'
import { useConsoleStore } from '@/stores/console'

defineOptions({ name: 'ChatComposer' })

const { state, dispatch } = useConsoleStore()
const text = ref('')
async function send() {
  const v = text.value
  if (!v.trim() || state.busy) return
  text.value = ''
  dispatch(v)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div :class="$style['composer']">
    <div :class="$style['composer-inner']">
      <div :class="$style['composer-box']">
        <UTextarea
          v-model="text"
          :class="$style['composer-input']"
          :rows="1"
          autoresize
          :maxrows="6"
          variant="none"
          aria-label="描述任务或提出问题"
          placeholder="描述任务或提出问题…"
          @keydown="onKey"
        />
        <div :class="$style['composer-bar']">
          <div :class="$style['bar-tools']">
            <span :class="$style['model-chip']" aria-label="当前模型 Fable-5">
              <UIcon name="i-lucide-hexagon" aria-hidden="true" />
              <span>Fable-5</span>
            </span>
          </div>
          <div :class="$style['bar-actions']">
            <UButton
              icon="i-lucide-arrow-up"
              square
              :class="$style['run-btn']"
              :loading="state.busy"
              :disabled="!text.trim()"
              aria-label="发送消息"
              @click="send"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
