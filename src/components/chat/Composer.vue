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
  e.style.height = Math.min(e.scrollHeight, 180) + 'px'
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
          rows="1"
          placeholder="向 Agent 描述任务,回车派发…"
          @input="grow"
          @keydown="onKey"
        ></textarea>
        <div class="composer-bar">
          <div class="bar-tools">
            <button class="tool-btn" type="button" title="添加附件(占位)" disabled>
              <i class="icon icon-plus"></i>
            </button>
            <button class="model-chip" type="button" title="切换模型(占位)" disabled>
              <i class="icon icon-hexagon"></i>
              <span>Fable-5</span>
            </button>
          </div>
          <div class="bar-actions">
            <span class="bar-hint">
              <kbd>Enter</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · 实时派发右栏
            </span>
            <button class="run-btn" :disabled="state.busy || !text.trim()" @click="send">
              <i class="icon icon-arrow-up"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<!-- PLACEHOLDER_COMPOSER_STYLE -->
<style scoped>
.composer {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-deep);
  padding: 14px 40px 18px;
}
.composer-inner {
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
}
.composer-box {
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 14px);
  padding: 10px 12px 8px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.composer-box:focus-within {
  border-color: var(--accent-agent);
  box-shadow: 0 0 0 3px var(--accent-agent-dim);
}
.composer-input {
  width: 100%;
  background: transparent;
  border: none;
  resize: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  min-height: 26px;
  max-height: 180px;
  outline: none;
  display: block;
  padding: 4px 4px 2px;
}
.composer-input:focus,
.composer-input:focus-visible {
  outline: none;
  box-shadow: none;
}
.composer-input::placeholder {
  color: var(--text-dim);
}
/* PLACEHOLDER_COMPOSER_STYLE2 */
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  padding: 2px 2px 0;
}
.bar-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tool-btn {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-pill);
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.tool-btn:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong, var(--text-dim));
  background: var(--bg-surface);
}
.tool-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.tool-btn i {
  font-size: 14px;
}
.model-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.model-chip:hover:not(:disabled) {
  color: var(--text-secondary);
  background: var(--bg-surface);
}
.model-chip:disabled {
  cursor: default;
}
.model-chip i {
  font-size: 11px;
  color: var(--accent-agent);
}
/* PLACEHOLDER_COMPOSER_STYLE3 */
.bar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bar-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-data);
  font-size: 9px;
  color: var(--text-dim);
  white-space: nowrap;
}
.bar-hint kbd {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  font-family: var(--font-data);
  font-size: 9px;
}
.run-btn {
  width: 34px;
  height: 34px;
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
  box-shadow: 0 0 18px var(--accent-agent-glow);
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
@media (max-width: 720px) {
  .bar-hint {
    display: none;
  }
}
</style>

