<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConsoleStore } from '../../stores/console'
import type { PermissionBehavior } from '../../api/types'

const { state, loadPermissionRules, savePermissionRule, removePermissionRule } = useConsoleStore()

// 新增规则表单
const newTool = ref('')
const newBehavior = ref<PermissionBehavior>('ask')
const saving = ref(false)
const confirmDeleteId = ref<number | null>(null)

/** 只展示全局规则(会话级规则在对话里通过"始终允许"产生,不在此集中管理) */
const globalRules = computed(() => state.permissionRules.filter((r) => r.scope === 'global'))

const behaviorLabel: Record<string, string> = {
  allow: '放行',
  ask: '需审批',
  deny: '拒绝',
}

async function addRule() {
  const tool = newTool.value.trim()
  if (!tool || saving.value) return
  saving.value = true
  const ok = await savePermissionRule({ scope: 'global', tool_name: tool, behavior: newBehavior.value })
  saving.value = false
  if (ok) {
    newTool.value = ''
    newBehavior.value = 'ask'
  }
}

function askDelete(id: number) {
  confirmDeleteId.value = id
}
function cancelDelete() {
  confirmDeleteId.value = null
}
async function doDelete(id: number) {
  await removePermissionRule(id)
  confirmDeleteId.value = null
}

onMounted(() => {
  loadPermissionRules('global')
})
</script>

<template>
  <main class="settings">
    <div class="set-scroll">
      <div class="set-inner">
        <header class="set-head">
          <div>
            <h1 class="set-title">设置 · 工具权限</h1>
            <p class="set-sub">
              配置哪些工具在执行前需要审批。<strong>需审批</strong>的工具会在对话中弹出批准/拒绝卡片;
              <strong>拒绝</strong>的工具直接被阻止;<strong>放行</strong>的工具静默执行。
            </p>
          </div>
        </header>

        <!-- 新增规则 -->
        <section class="set-card">
          <div class="set-card-title">添加全局规则</div>
          <div class="set-form">
            <input
              v-model="newTool"
              class="set-input mono"
              placeholder="工具名,如 Bash"
              @keydown.enter="addRule"
            />
            <div class="set-seg">
              <button
                v-for="opt in (['allow', 'ask', 'deny'] as PermissionBehavior[])"
                :key="opt"
                class="set-seg-btn"
                :class="{ active: newBehavior === opt, [opt]: true }"
                @click="newBehavior = opt"
              >
                {{ behaviorLabel[opt] }}
              </button>
            </div>
            <button class="set-add" :disabled="!newTool.trim() || saving" @click="addRule">
              <i class="icon icon-plus"></i> 添加
            </button>
          </div>
        </section>

        <!-- 规则列表 -->
        <section class="set-card">
          <div class="set-card-title">
            全局规则
            <span class="set-count mono">{{ globalRules.length }}</span>
          </div>

          <div v-if="state.permissionRulesLoading" class="set-empty">加载中…</div>
          <div v-else-if="!globalRules.length" class="set-empty">
            暂无全局规则。危险工具(如 Bash)默认即需审批。
          </div>
          <ul v-else class="set-list">
            <li v-for="r in globalRules" :key="r.id" class="set-row">
              <span class="set-tool mono">{{ r.tool_name }}</span>
              <span class="set-badge" :class="r.behavior">{{ behaviorLabel[r.behavior] ?? r.behavior }}</span>
              <span v-if="r.source === 'always_allow'" class="set-source">始终允许</span>
              <span class="set-spacer"></span>
              <template v-if="confirmDeleteId === r.id">
                <button class="set-mini danger" @click="doDelete(r.id)">
                  <i class="icon icon-check"></i> 确认
                </button>
                <button class="set-mini" @click="cancelDelete">
                  <i class="icon icon-x"></i> 取消
                </button>
              </template>
              <button v-else class="set-mini" title="删除规则" @click="askDelete(r.id)">
                <i class="icon icon-trash-2"></i>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.settings {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-deep);
}
.set-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px 0;
}
.set-inner {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.set-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.set-title {
  font-family: var(--font-ui);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}
.set-sub {
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-muted);
}
.set-sub strong {
  color: var(--text-secondary);
  font-weight: 600;
}
.set-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  padding: 16px;
}
.set-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 14px;
}
.set-count {
  font-size: 10px;
  color: var(--text-dim);
  background: var(--bg-surface);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.set-form {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.set-input {
  flex: 1;
  min-width: 160px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 12px;
}
.set-input:focus {
  outline: none;
  border-color: var(--accent-agent);
}
.set-seg {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.set-seg-btn {
  padding: 8px 14px;
  background: var(--bg-surface);
  border: none;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.set-seg-btn:not(:last-child) {
  border-right: 1px solid var(--border);
}
.set-seg-btn.active.allow {
  background: rgba(52, 211, 153, 0.15);
  color: var(--status-success);
}
.set-seg-btn.active.ask {
  background: rgba(251, 191, 36, 0.15);
  color: var(--status-warning);
}
.set-seg-btn.active.deny {
  background: rgba(248, 113, 113, 0.15);
  color: var(--status-error);
}
.set-add {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: var(--radius-control);
  border: 1px solid var(--accent-agent);
  background: var(--accent-agent-dim);
  color: var(--accent-agent);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.set-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.set-add i {
  font-size: 13px;
}
.set-empty {
  font-size: 11px;
  color: var(--text-dim);
  padding: 8px 0;
}
.set-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
}
.set-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
}
.set-tool {
  font-size: 12px;
  color: var(--text-primary);
}
.set-badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.set-badge.allow {
  color: var(--status-success);
  background: rgba(52, 211, 153, 0.12);
}
.set-badge.ask {
  color: var(--status-warning);
  background: rgba(251, 191, 36, 0.12);
}
.set-badge.deny {
  color: var(--status-error);
  background: rgba(248, 113, 113, 0.12);
}
.set-source {
  font-size: 9px;
  color: var(--text-dim);
}
.set-spacer {
  flex: 1;
}
.set-mini {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-size: 10px;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.set-mini:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
}
.set-mini.danger:hover {
  color: var(--status-error);
  border-color: var(--status-error);
}
.set-mini i {
  font-size: 12px;
}
</style>
