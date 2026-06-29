<script setup lang="ts">
import type { SubAgent } from '../../types'
import ToolCallCard from '../chat/ToolCallCard.vue'

defineProps<{ agent: SubAgent | null }>()

const statusLabel: Record<string, string> = {
  queued: '排队',
  think: '推理中',
  run: '执行中',
  done: '已完成',
  error: '失败',
}
</script>

<template>
  <div class="agent-detail">
    <!-- 空状态 -->
    <div v-if="!agent" class="detail-empty">
      <svg class="hx" viewBox="0 0 20 22" fill="none">
        <path d="M10 0L19.66 5.5V16.5L10 22L0.34 16.5V5.5L10 0Z" fill="currentColor" />
      </svg>
      <p>选中一个子代理以查看它的推理、回答与工具调用</p>
    </div>

    <template v-else>
      <div class="detail-head">
        <div class="detail-title-row">
          <span class="agent-ic"><i :class="`icon icon-${agent.icon}`"></i></span>
          <span class="detail-title">{{ agent.name }}</span>
        </div>
        <div class="detail-meta">
          <div class="detail-tile">
            <div class="detail-tile-l">PID</div>
            <div class="detail-tile-v">{{ agent.pid }}</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile-l">状态</div>
            <div class="detail-tile-v accent">{{ statusLabel[agent.status] }}</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile-l">进度</div>
            <div class="detail-tile-v">{{ agent.progress }}%</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile-l">事件</div>
            <div class="detail-tile-v">{{ agent.stream.length }}</div>
          </div>
        </div>
      </div>

      <div class="detail-stream">
        <div v-for="(s, i) in agent.stream" :key="i" class="stream-item">
          <template v-if="s.kind === 'tool'">
            <div class="stream-lbl tool"><i class="icon icon-terminal"></i>工具调用</div>
            <div class="stream-cli">
              <ToolCallCard
                :tag="s.done ? 'RESULT' : 'TOOL'"
                :fn="s.fn"
                :body="s.body"
                :done="s.done"
              />
            </div>
          </template>
          <template v-else-if="s.kind === 'think'">
            <div class="stream-lbl think"><i class="icon icon-brain"></i>推理</div>
            <div class="stream-txt think">{{ s.text }}</div>
          </template>
          <template v-else>
            <div class="stream-lbl answer"><i class="icon icon-message-circle"></i>回答</div>
            <div class="stream-txt">{{ s.text }}</div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.agent-detail {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.detail-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
}
.detail-empty .hx {
  width: 64px;
  height: 64px;
  color: var(--accent-agent);
  opacity: 0.2;
  animation: glow-breathe 3s ease-in-out infinite;
}
.detail-empty p {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-dim);
  max-width: 200px;
  line-height: 1.6;
}
.detail-head {
  padding: 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.detail-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.agent-ic {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
}
.agent-ic i {
  font-size: 13px;
}
.detail-title {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.detail-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.detail-tile {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  padding: 7px 9px;
}
.detail-tile-l {
  font-family: var(--font-data);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.detail-tile-v {
  font-family: var(--font-data);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 2px;
}
.detail-tile-v.accent {
  color: var(--accent-agent);
}
.detail-stream {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stream-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: entry-appear 200ms ease-out;
}
.stream-lbl {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.stream-lbl i {
  font-size: 12px;
}
.stream-lbl.think {
  color: var(--status-think);
}
.stream-lbl.answer {
  color: var(--accent-agent);
}
.stream-lbl.tool {
  color: var(--status-info);
}
.stream-txt {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding-left: 19px;
}
.stream-txt.think {
  font-style: italic;
}
.stream-cli {
  padding-left: 19px;
}
</style>
