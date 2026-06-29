<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useConsoleStore } from '../../stores/console'

const { state, dispatch } = useConsoleStore()
const text = ref('')
const ta = ref<HTMLTextAreaElement | null>(null)

function grow() {
  const e = ta.value
  if (!e) return
  e.style.height = 'auto'
  e.style.height = Math.min(e.scrollHeight, 200) + 'px'
}
async function send() {
  const v = text.value
  if (!v.trim() || state.busy) return
  text.value = ''
  await nextTick()
  grow()
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
  <div class="composer">
    <div class="composer-inner">
      <div class="composer-box">
        <textarea
          ref="ta"
          v-model="text"
          class="composer-input"
          rows="2"
          placeholder="向 Agent 描述任务,回车派发…"
          @input="grow"
          @keydown="onKey"
        ></textarea>
        <button class="run-btn" :disabled="state.busy || !text.trim()" @click="send">
          <i class="icon icon-arrow-up"></i>
        </button>
      </div>
      <div class="composer-hint">
        <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行 · 子代理将实时派发至右栏
      </div>
    </div>
  </div>
</template>

<style scoped>
.composer {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-deep);
  padding: 16px 40px 18px;
}
.composer-inner {
  width: 100%;
}
.composer-box {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.composer-box:focus-within {
  border-color: var(--accent-agent);
  box-shadow: 0 0 0 2px var(--accent-agent-dim);
}
.composer-input {
  flex: 1;
  width: 100%;
  background: transparent;
  border: none;
  resize: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  min-height: 48px;
  max-height: 200px;
  outline: none;
  display: block;
}
/* 聚焦反馈交给外层 .composer-box(:focus-within),
   抑制全局 :focus-visible 给 textarea 自身加的发光描边圈,避免"框中框" */
.composer-input:focus,
.composer-input:focus-visible {
  outline: none;
  box-shadow: none;
}
.composer-input::placeholder {
  color: var(--text-dim);
}
.run-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  background: var(--accent-agent);
  color: var(--bg-deep);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--dur-fast) var(--ease-out);
}
.run-btn:hover:not(:disabled) {
  background: var(--accent-agent-hover);
  box-shadow: 0 0 20px var(--accent-agent-glow);
  transform: scale(1.05);
}
.run-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.run-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.run-btn i {
  font-size: 15px;
}
.composer-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-family: var(--font-data);
  font-size: 9px;
  color: var(--text-dim);
}
kbd {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-family: var(--font-data);
  font-size: 9px;
}
</style>
