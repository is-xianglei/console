<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConsoleStore } from '../../stores/console'
import { useStickToBottom } from '../../composables/useStickToBottom'
import ThinkingBlock from './ThinkingBlock.vue'
import ToolCallCard from './ToolCallCard.vue'
import ApprovalCard from './ApprovalCard.vue'
import AnswerBlock from './AnswerBlock.vue'
import TaskBar from './TaskBar.vue'
import Composer from './Composer.vue'

const { state } = useConsoleStore()
const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)

const activeSession = computed(() =>
  state.sessions.find((s) => s.id === state.activeSessionId),
)

// 内容高度变化时自动吸底(覆盖流式文本累加、新增块等所有情况);
// 用户上滚查看历史时暂停跟随,滚回底部自动恢复
useStickToBottom(scroller, inner)
</script>

<template>
  <main class="center">
    <div class="conv-head">
      <span class="conv-title">{{ activeSession?.title ?? '新会话' }}</span>
      <span class="conv-id mono">#{{ activeSession?.id ?? '—' }}</span>
      <div class="conv-model">
        <span class="dot think"></span> Fable-5 · MYTHOS
      </div>
    </div>

    <div ref="scroller" class="conv-scroll">
      <div ref="inner" class="conv-inner">
        <div
          v-for="m in state.messages"
          :key="m.id"
          class="msg"
          :class="m.role === 'user' ? 'msg-user' : 'msg-ai'"
        >
          <!-- 用户消息 -->
          <template v-if="m.role === 'user'">
            <div class="bubble-user">{{ m.text }}</div>
            <div class="msg-byline">
              <span class="byline-time mono">{{ m.time }}</span>
            </div>
          </template>

          <!-- AI 消息:blocks 为空且非当前流式占位时不渲染(兜底,避免只有标题的空行) -->
          <template v-else-if="m.blocks?.length || state.busy">
            <div class="msg-byline">
              <span class="byline-ic ai"><i class="icon icon-hexagon"></i></span>
              <span class="byline-name">Hyperreal Agent</span>
              <span class="byline-time mono">{{ m.time }}</span>
            </div>
            <div class="ai-blocks">
              <template v-for="(b, i) in m.blocks" :key="i">
                <ThinkingBlock
                  v-if="b.kind === 'think'"
                  :text="b.text"
                  :duration="b.duration"
                  :collapsed="b.collapsed"
                />
                <ToolCallCard
                  v-else-if="b.kind === 'tool'"
                  :tag="b.tag"
                  :fn="b.fn"
                  :body="b.body"
                  :done="b.done"
                />
                <ApprovalCard
                  v-else-if="b.kind === 'approval'"
                  :request-id="b.requestId"
                  :tool-name="b.toolName"
                  :tool-input="b.toolInput"
                  :reason="b.reason"
                  :status="b.status"
                />
                <AnswerBlock
                  v-else-if="b.kind === 'answer'"
                  :text="b.text"
                  :streaming="b.streaming"
                />
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>

    <TaskBar />
    <Composer />
  </main>
</template>

<style scoped>
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-deep);
}
.conv-head {
  height: 42px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
}
.conv-title {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.conv-id {
  font-size: 10px;
  color: var(--text-dim);
}
.conv-model {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 3px 9px;
  border-radius: var(--radius-pill);
}
.conv-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0 12px;
}
.conv-inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0 40px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
/* PLACEHOLDER_CHATSTYLE2 */
.msg {
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: entry-appear 250ms var(--ease-out);
}
.msg-user {
  align-items: flex-end;
}
.ai-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bubble-user {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-sm);
  padding: 11px 14px;
  max-width: 80%;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.55;
}
.msg-byline {
  display: flex;
  align-items: center;
  gap: 7px;
}
.byline-ic {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.byline-ic.ai {
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
}
.byline-ic i {
  font-size: 12px;
}
.byline-name {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.byline-time {
  font-size: 9px;
  color: var(--text-dim);
  margin-left: auto;
}
</style>
