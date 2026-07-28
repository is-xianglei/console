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
          placeholder="向 Agent 描述任务,回车派发…"
          @keydown="onKey"
        />
        <div :class="$style['composer-bar']">
          <div :class="$style['bar-tools']">
            <UButton color="neutral" variant="outline" square :class="$style['tool-btn']" title="添加附件(占位)" disabled>
              <i class="icon icon-plus"></i>
            </UButton>
            <UButton color="neutral" variant="outline" :class="$style['model-chip']" title="切换模型(占位)" disabled>
              <i class="icon icon-hexagon"></i>
              <span>Fable-5</span>
            </UButton>
          </div>
          <div :class="$style['bar-actions']">
            <span :class="$style['bar-hint']">
              <kbd>Enter</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · 实时派发右栏
            </span>
            <UButton square :class="$style['run-btn']" :loading="state.busy" :disabled="!text.trim()" aria-label="发送消息" @click="send">
              <i class="icon icon-arrow-up"></i>
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>
