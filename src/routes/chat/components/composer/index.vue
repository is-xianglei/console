<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { SelectItem } from '@nuxt/ui'
import { useAgentsStore } from '@/stores/agents'
import { useAuthStore } from '@/stores/auth'
import { useConsoleStore } from '@/stores/console'
import { useWorkflowsStore } from '@/stores/workflows'
import { WORKFLOW_MODE_LABEL } from '@/constants/workflow'
import { useSkillsStore } from '@/stores/skills'
import ChatModelControls from '../model-controls/index.vue'

defineOptions({ name: 'ChatComposer' })

/** 占位实现：后端暂无「增强提示词」接口，默认 mock 仅作本地演示；
 *  接入真实接口时由父组件传入 onEnhance（只需 resolve 出增强后的文本）。 */
async function mockEnhance(prompt: string, signal?: AbortSignal): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return `请帮我完成以下任务：${prompt}。要求：明确目标与范围，补充必要的上下文与约束，说明期望的输出格式与语气；若关键信息缺失，请先提出澄清问题。`
}

// defineProps 的默认值会被提升到 setup 外，无法引用局部的 mockEnhance，
// 因此这里不设默认值，改在调用处回退。
const props = defineProps<{
  onEnhance?: (prompt: string, signal?: AbortSignal) => Promise<string>
}>()

const escapeHtml = (str: string) =>
  str.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

type Phase = 'idle' | 'enhancing' | 'enhanced'
/** 附件为前端占位：后端 SendMessageRequest 尚无附件字段，文件仅本地暂存展示，发送时不会上传。 */
interface AttachmentDraft {
  id: number
  name: string
  kind: 'image' | 'file'
}

const consoleStore = useConsoleStore()
const agentsStore = useAgentsStore()
const workflowsStore = useWorkflowsStore()
const authStore = useAuthStore()
const skillsStore = useSkillsStore()
const { state, dispatch, stopExecution, setNewSessionAgent, setNewSessionWorkflow } = consoleStore

/** 单个下拉同时承载两种运行目标，用前缀区分；后端二者互斥（同时传 409）。 */
const DEFAULT_TARGET = 'default'
const AGENT_PREFIX = 'agent:'
const WORKFLOW_PREFIX = 'workflow:'
const selectedTarget = ref(DEFAULT_TARGET)
const activeSession = computed(() => state.sessions.find((session) => session.id === state.activeSessionId))
const persistedSession = computed(() => /^\d+$/.test(state.activeSessionId))
const readOnlySession = computed(() => activeSession.value?.readOnly === true)

const targetItems = computed<SelectItem[]>(() => {
  const items: SelectItem[] = [{ value: DEFAULT_TARGET, label: '平台默认 Agent' }]
  const agents = agentsStore.state.items
  if (agents.length) {
    items.push({ type: 'label', label: '我的 Agent' })
    for (const agent of agents) {
      items.push({
        value: `${AGENT_PREFIX}${agent.id}`,
        label: agent.is_enabled ? agent.name : `${agent.name}（已停用）`,
        disabled: !agent.is_enabled,
      })
    }
  }
  const workflows = workflowsStore.state.items
  if (workflows.length) {
    items.push({ type: 'separator' }, { type: 'label', label: 'Workflow' })
    for (const workflow of workflows) {
      items.push({
        value: `${WORKFLOW_PREFIX}${workflow.id}`,
        label: `${workflow.name} · ${WORKFLOW_MODE_LABEL[workflow.mode]}${workflow.is_enabled ? '' : '（已停用）'}`,
        disabled: !workflow.is_enabled,
      })
    }
  }
  return items
})

const planSelected = computed(() => selectedTarget.value.startsWith(WORKFLOW_PREFIX))

watch(
  () => [
    state.activeSessionId,
    activeSession.value?.agentId,
    activeSession.value?.workflowId,
    state.newSessionAgentId,
    state.newSessionWorkflowId,
  ] as const,
  () => {
    // Workflow 优先：绑定编排的会话不再有 agentId，回显必须先看 Workflow
    const workflowId = activeSession.value?.workflowId ?? state.newSessionWorkflowId
    if (workflowId != null) {
      selectedTarget.value = `${WORKFLOW_PREFIX}${workflowId}`
      return
    }
    const agentId = activeSession.value?.agentId ?? state.newSessionAgentId
    selectedTarget.value = agentId != null ? `${AGENT_PREFIX}${agentId}` : DEFAULT_TARGET
  },
  { immediate: true },
)

watch(selectedTarget, (value) => {
  if (value.startsWith(WORKFLOW_PREFIX)) {
    setNewSessionWorkflow(Number(value.slice(WORKFLOW_PREFIX.length)))
    return
  }
  if (value.startsWith(PLAN_PREFIX)) {
    setNewSessionPlan(Number(value.slice(PLAN_PREFIX.length)))
    return
  }
  setNewSessionAgent(value === DEFAULT_TARGET ? null : Number(value.slice(AGENT_PREFIX.length)))
})

watch(
  () => authStore.currentWorkspaceId,
  (workspaceId) => {
    if (!workspaceId) return
    void agentsStore.loadAgents()
    void workflowsStore.loadWorkflows()
    // 斜杠命令面板依赖工作区的 skill 列表
    void skillsStore.loadSkills()
  },
  { immediate: true },
)

// ===== contentEditable 编辑器状态 =====
const value = ref('')
const phase = ref<Phase>('idle')
const menuOpen = ref(false)
const skillsOpen = ref(false)
const attachments = ref<AttachmentDraft[]>([])
// 正在播放退出动画、等待移除的附件 chip id
const exitingAtt = ref<number[]>([])

// 增强 pill 的挂载/退出：有文字时进场，退出时先播放动画；切到 spinner 时立即替换
const pillMounted = ref(false)
const pillExiting = ref(false)
let pillTimer: ReturnType<typeof setTimeout> | null = null

const slashOpen = ref(false)
const slashQuery = ref('')
const slashIndex = ref(0)
const slashKeyboard = ref(false)
let lastSlashQuery = ''
let ignoreHover = false

const editor = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const plusWrap = ref<HTMLElement | null>(null)
const fileRef = ref<HTMLInputElement | null>(null)
let preEnhanceHTML = ''
let pendingHTML: string | null = null
// enhance/revert 内容交换前记录的框体高度，供 FLIP 动画从旧高过渡到新高
let flipFrom: number | null = null
let savedRange: Range | null = null
let abort: AbortController | null = null
let nextAttachmentId = 1

const hasText = computed(() => value.value.trim().length > 0)
const enhancing = computed(() => phase.value === 'enhancing')
const sendActive = computed(() => hasText.value && !enhancing.value && !state.busy && !state.chatSelectionSaving && !readOnlySession.value)
const showPill = computed(() => hasText.value && !enhancing.value)
/** 技能菜单与斜杠命令只列出已启用的 skill（停用的 agent 运行时不可用）。 */
const enabledSkills = computed(() => skillsStore.state.skills.filter((sk) => sk.is_enabled))
/** 斜杠命令的数据源：真实 skills store，按名称与描述做包含匹配。 */
const slashResults = computed(() => {
  const q = slashQuery.value.toLowerCase()
  return enabledSkills.value.filter(
    (sk) => sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q),
  )
})

watch(
  showPill,
  (show) => {
    if (show) {
      pillMounted.value = true
      pillExiting.value = false
      if (pillTimer) {
        clearTimeout(pillTimer)
        pillTimer = null
      }
      return
    }
    if (!pillMounted.value) return
    if (enhancing.value) {
      pillMounted.value = false
      pillExiting.value = false
      return
    }
    pillExiting.value = true
    if (pillTimer) clearTimeout(pillTimer)
    pillTimer = setTimeout(() => {
      pillMounted.value = false
      pillExiting.value = false
      pillTimer = null
    }, 200)
  },
  { immediate: true },
)

// ===== 选区与编辑器同步 =====
/** 聚焦编辑器并把光标落到内容最末尾。 */
function focusEnd() {
  const el = editor.value
  if (!el) return
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  savedRange = range.cloneRange()
}

function syncFromEditor() {
  const el = editor.value
  if (!el) return
  value.value = el.textContent ?? ''
  // 给行首 pill 打 data-start（前面只有空白文本节点）以去掉左边距——
  // :first-child 看不见前导文本节点，只能在 JS 里判断
  el.querySelectorAll<HTMLElement>('.skill-pill').forEach((pill) => {
    let atStart = true
    for (let n = pill.previousSibling; n; n = n.previousSibling) {
      if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() === '') continue
      atStart = false
      break
    }
    pill.toggleAttribute('data-start', atStart)
  })
}

function saveSelection() {
  const sel = window.getSelection()
  if (sel && sel.rangeCount && editor.value && editor.value.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange()
  }
}

function closeSlash() {
  slashOpen.value = false
  slashQuery.value = ''
  slashIndex.value = 0
  slashKeyboard.value = false
  lastSlashQuery = ''
  ignoreHover = false
}

// ===== 技能 pill（skill 唯一标识用 name）=====
/** contenteditable=false 是 pill 原子性删除的关键：光标退格会整体删除节点。 */
function buildPill(name: string) {
  const el = document.createElement('span')
  el.className = 'skill-pill'
  el.setAttribute('contenteditable', 'false')
  el.dataset.skill = name
  el.innerHTML =
    '<span class="skill-pill-label">/' + escapeHtml(name) + '</span>' +
    '<button type="button" class="skill-pill-x" data-remove="1" aria-label="移除 ' +
    escapeHtml(name) + '"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
  return el
}

/** 用 pill 覆盖给定选区：删内容 → 插节点 → 补 NBSP 分隔符 → 光标移到 NBSP 后。 */
function insertPillOverRange(range: Range, name: string) {
  if (!editor.value) return
  range.deleteContents()
  const pill = buildPill(name)
  range.insertNode(pill)
  const space = document.createTextNode('\u00A0')
  pill.after(space)
  const after = document.createRange()
  after.setStartAfter(space)
  after.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(after)
  editor.value.focus()
  savedRange = after.cloneRange()
  syncFromEditor()
}

function addSkillFromMenu(name: string) {
  const el = editor.value
  if (!el) return
  const sel = window.getSelection()
  let range: Range | null = null
  if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0).cloneRange()
  } else if (savedRange && el.contains(savedRange.startContainer)) {
    range = savedRange.cloneRange()
  }
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
  }
  insertPillOverRange(range, name)
  menuOpen.value = false
}

// ===== 斜杠命令检测与应用 =====
/** 选中某个 skill：连同触发它的 `/xxx` 文本一起替换为 pill。 */
function applySlash(name: string) {
  const el = editor.value
  const sel = window.getSelection()
  if (!el || !sel || !sel.rangeCount) return closeSlash()
  const caret = sel.getRangeAt(0)
  let range = caret.cloneRange()
  const node = caret.startContainer
  if (node.nodeType === Node.TEXT_NODE && el.contains(node)) {
    const before = (node.textContent ?? '').slice(0, caret.startOffset)
    const m = before.match(/\/([^\s/]*)$/)
    if (m) {
      range = document.createRange()
      range.setStart(node, caret.startOffset - m[0].length)
      range.setEnd(node, caret.startOffset)
    }
  }
  insertPillOverRange(range, name)
  closeSlash()
}

/** 光标位于「行首或空白后的 /query」时打开面板。 */
function detectSlash() {
  const el = editor.value
  const sel = window.getSelection()
  if (!el || !sel || !sel.rangeCount || !sel.isCollapsed) return closeSlash()
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return closeSlash()
  const before = (node.textContent ?? '').slice(0, range.startOffset)
  const m = before.match(/(?:^|\s)\/([^\s/]*)$/)
  if (!m) return closeSlash()
  const q = m[1]
  if (q !== lastSlashQuery) {
    lastSlashQuery = q
    slashIndex.value = 0
  }
  slashQuery.value = q
  slashOpen.value = true
}

function onEditorInput() {
  syncFromEditor()
  if (phase.value === 'enhanced') phase.value = 'idle'
  detectSlash()
}

// ===== 斜杠面板键盘导航（键盘与鼠标 hover 互斥）=====
function moveSlash(delta: number) {
  const results = slashResults.value
  if (!results.length) return
  ignoreHover = true
  slashKeyboard.value = true
  slashIndex.value = (slashIndex.value + delta + results.length * 10) % results.length
}

function onSlashMouseEnter(i: number) {
  if (ignoreHover) return
  slashIndex.value = i
}

function onSlashMouseMove() {
  ignoreHover = false
  slashKeyboard.value = false
}

function onEditorKeydown(e: KeyboardEvent) {
  const results = slashResults.value
  // 面板打开时这些键交给 window 捕获层处理，编辑器内只拦截默认行为
  if (
    slashOpen.value &&
    results.length &&
    (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape')
  ) {
    e.preventDefault()
    return
  }
  // Enter 发送 / Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

/** 面板打开期间在 window 捕获阶段接管导航键。
 *  注意：Vue 的 watch 回调返回值会被忽略（不同于 React useEffect），
 *  清理必须走 onCleanup，否则监听器泄漏、永不移除。 */
function onSlashWindowKey(e: KeyboardEvent) {
  const results = slashResults.value
  if (!slashOpen.value || !results.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    moveSlash(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    moveSlash(-1)
    return
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    e.stopPropagation()
    const target = results[slashIndex.value] ?? results[0]
    applySlash(target.name)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeSlash()
  }
}

watch(slashOpen, (open, _prev, onCleanup) => {
  if (!open) return
  window.addEventListener('keydown', onSlashWindowKey, true)
  onCleanup(() => window.removeEventListener('keydown', onSlashWindowKey, true))
})

// 过滤结果变短时把高亮索引拉回合法区间
watch(slashResults, (results) => {
  if (slashOpen.value && results.length && slashIndex.value >= results.length) {
    slashIndex.value = 0
  }
})

// ===== pill 点删动画：锁宽 → reflow → 过渡收窄 → 连同 NBSP 一起移除 =====
function onEditorClick(e: MouseEvent) {
  const remove = (e.target as HTMLElement).closest('[data-remove]')
  if (remove) {
    e.preventDefault()
    const pill = remove.closest<HTMLElement>('[data-skill]')
    if (pill) {
      // pill 后面补的 NBSP 分隔符要一并删除，否则残留空格会累积、推移后续 pill
      const sep = pill.nextSibling
      // 宽度/边距/内边距与淡出同步塌缩，后续文本平滑滑入而不是跳变
      const w = pill.getBoundingClientRect().width
      pill.style.maxWidth = `${w}px`
      pill.style.overflow = 'hidden'
      pill.style.whiteSpace = 'nowrap'
      void pill.offsetWidth
      pill.style.transition =
        'opacity 180ms cubic-bezier(0.22,1,0.36,1), transform 180ms cubic-bezier(0.22,1,0.36,1), filter 180ms cubic-bezier(0.22,1,0.36,1), max-width 180ms cubic-bezier(0.22,1,0.36,1), margin 180ms cubic-bezier(0.22,1,0.36,1), padding 180ms cubic-bezier(0.22,1,0.36,1)'
      pill.setAttribute('data-exit', '')
      pill.style.maxWidth = '0px'
      pill.style.marginLeft = '0px'
      pill.style.marginRight = '0px'
      pill.style.paddingLeft = '0px'
      pill.style.paddingRight = '0px'
      let done = false
      const finish = () => {
        if (done) return
        done = true
        if (sep && sep.nodeType === Node.TEXT_NODE && sep.textContent?.startsWith('\u00A0')) {
          const rest = sep.textContent.slice(1)
          if (rest) sep.textContent = rest
          else sep.parentNode?.removeChild(sep)
        }
        pill.remove()
        syncFromEditor()
        editor.value?.focus()
      }
      // transitionend 可能因元素隐藏等原因不触发，220ms 定时器兜底
      pill.addEventListener('transitionend', finish, { once: true })
      setTimeout(finish, 220)
    }
    return
  }
  saveSelection()
}

// ===== 增强提示词（占位：默认走本地 mock，见文件头部注释）=====
async function enhance() {
  if (!hasText.value || enhancing.value) return
  preEnhanceHTML = editor.value?.innerHTML ?? ''
  phase.value = 'enhancing'
  const ac = new AbortController()
  abort = ac
  try {
    const result = await (props.onEnhance ?? mockEnhance)(value.value, ac.signal)
    if (ac.signal.aborted) return
    pendingHTML = escapeHtml(result)
    flipFrom = frame.value?.offsetHeight ?? null
    phase.value = 'enhanced'
  } catch {
    if (ac.signal.aborted) return
    pendingHTML = preEnhanceHTML
    phase.value = 'idle'
  }
}

function revert() {
  abort?.abort()
  pendingHTML = preEnhanceHTML
  flipFrom = frame.value?.offsetHeight ?? null
  phase.value = 'idle'
}

// ===== 发送：走真实业务派发 =====
function send() {
  if (!sendActive.value) return
  // dispatch 返回 false（内容为空或 busy）时不清空输入，保留用户已输入内容
  if (!dispatch(value.value)) return
  // 注意：附件为占位实现，后端 SendMessageRequest 无附件字段，发送时直接丢弃本地暂存文件
  if (editor.value) editor.value.innerHTML = ''
  value.value = ''
  phase.value = 'idle'
  attachments.value = []
  exitingAtt.value = []
  closeSlash()
  nextTick(() => editor.value?.focus())
}

// enhance/revert 后编辑器重新可编辑——把 pending HTML 写回（增强文本或含 pill 的原文），
// 并用 FLIP 把框体从旧高过渡到新高，避免内容替换时高度跳变
watch(phase, async () => {
  if (enhancing.value || pendingHTML === null) return
  await nextTick()
  if (!editor.value) return
  editor.value.innerHTML = pendingHTML
  pendingHTML = null
  syncFromEditor()
  requestAnimationFrame(focusEnd)

  const el = frame.value
  const from = flipFrom
  flipFrom = null
  if (!el || from === null) return
  const to = el.offsetHeight
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || from === to) return
  el.style.height = from + 'px'
  el.style.overflow = 'hidden'
  void el.offsetHeight // 强制 reflow，让起始高度先被提交
  el.style.transition = 'height 200ms cubic-bezier(0.22, 1, 0.36, 1)'
  el.style.height = to + 'px'
  let done = false
  const finish = () => {
    if (done) return
    done = true
    el.style.transition = ''
    el.style.height = ''
    el.style.overflow = ''
    el.removeEventListener('transitionend', finish)
  }
  el.addEventListener('transitionend', finish)
  setTimeout(finish, 260)
})

// ===== 附件（占位：仅本地暂存展示，不会上传，见 AttachmentDraft 注释）=====
function openPicker(kind: AttachmentDraft['kind']) {
  const input = fileRef.value
  if (!input) return
  input.accept = kind === 'image' ? 'image/*' : ''
  input.value = ''
  input.dataset.kind = kind
  input.click()
  menuOpen.value = false
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  const fallback = (input.dataset.kind as AttachmentDraft['kind']) ?? 'file'
  attachments.value = [
    ...attachments.value,
    ...files.map((f) => ({
      id: nextAttachmentId++,
      name: f.name,
      kind: f.type.startsWith('image/') ? ('image' as const) : fallback,
    })),
  ]
  input.value = ''
  nextTick(() => editor.value?.focus())
}

function removeAttachment(id: number) {
  // 与技能 pill 相同的淡出/缩放退出动画，播完再真正移除
  if (!exitingAtt.value.includes(id)) exitingAtt.value = [...exitingAtt.value, id]
  window.setTimeout(() => {
    attachments.value = attachments.value.filter((a) => a.id !== id)
    exitingAtt.value = exitingAtt.value.filter((x) => x !== id)
  }, 200)
}

// ===== + 菜单：打开期间挂 document 级监听，关闭/卸载时清理 =====
function onDocDown(e: PointerEvent) {
  if (menuOpen.value && plusWrap.value && !plusWrap.value.contains(e.target as Node))
    menuOpen.value = false
}

function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onDocDown)
    document.addEventListener('keydown', onDocKey)
  } else {
    skillsOpen.value = false
    document.removeEventListener('pointerdown', onDocDown)
    document.removeEventListener('keydown', onDocKey)
  }
})

onBeforeUnmount(() => {
  abort?.abort()
  if (pillTimer) clearTimeout(pillTimer)
  document.removeEventListener('pointerdown', onDocDown)
  document.removeEventListener('keydown', onDocKey)
  // 斜杠面板的 window 监听由 watch 的 onCleanup 负责，这里兜底再清一次
  window.removeEventListener('keydown', onSlashWindowKey, true)
})
</script>

<template>
  <div :class="$style.composer">
    <div :class="$style['composer-inner']">
      <input ref="fileRef" type="file" multiple hidden @change="onFiles" />
      <div ref="frame" :class="$style.frame" :data-enhancing="enhancing || undefined">
        <div v-if="attachments.length" :class="$style.chips">
          <span
            v-for="att in attachments"
            :key="att.id"
            :class="$style.chip"
            :data-exit="exitingAtt.includes(att.id) || undefined"
          >
            <span :class="$style['chip-icon']">
              <UIcon :name="att.kind === 'image' ? 'i-lucide-image' : 'i-lucide-paperclip'" />
            </span>
            <span :class="$style['chip-name']">{{ att.name }}</span>
            <button
              type="button"
              :class="$style['chip-remove']"
              :aria-label="'移除 ' + att.name"
              @click="removeAttachment(att.id)"
            >
              <UIcon name="i-lucide-x" />
            </button>
          </span>
          <!-- 占位提示：明确告知用户附件不会真正上传 -->
          <span :class="$style['chips-note']">附件功能待后端支持，发送时不会上传</span>
        </div>

        <div :class="$style['editor-wrap']">
          <div v-if="enhancing" :class="$style['enhancing-text']" aria-live="polite">
            {{ value }}
          </div>
          <div
            v-else
            ref="editor"
            :class="$style.field"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            aria-label="描述任务或提出问题"
            :data-empty="!hasText || undefined"
            data-placeholder="描述任务或提出问题…"
            @input="onEditorInput"
            @keydown="onEditorKeydown"
            @keyup="saveSelection"
            @mouseup="saveSelection"
            @blur="saveSelection"
            @click="onEditorClick"
          ></div>

          <div
            v-if="slashOpen && !enhancing"
            :class="$style['slash-menu']"
            role="listbox"
            aria-label="技能"
            :data-keyboard="slashKeyboard || undefined"
            @mousemove="onSlashMouseMove"
          >
            <div :class="$style['slash-label']">技能</div>
            <template v-if="slashResults.length">
              <button
                v-for="(sk, i) in slashResults"
                :key="sk.id"
                type="button"
                role="option"
                :aria-selected="i === slashIndex"
                :class="[$style['menu-item'], i === slashIndex ? $style['menu-item-active'] : '']"
                @mousedown.prevent
                @mouseenter="onSlashMouseEnter(i)"
                @click="applySlash(sk.name)"
              >
                <span :class="$style['menu-name']">{{ sk.name }}</span>
                <span v-if="sk.description" :class="$style['menu-desc']">{{ sk.description }}</span>
              </button>
            </template>
            <div v-else :class="$style['slash-empty']">没有匹配的技能</div>
          </div>
        </div>

        <div :class="$style.row">
          <div ref="plusWrap" :class="$style['plus-wrap']">
            <button
              type="button"
              :class="[$style['icon-btn'], $style.plus]"
              :data-open="menuOpen || undefined"
              aria-label="添加附件或技能"
              :aria-expanded="menuOpen"
              @click="menuOpen = !menuOpen"
            >
              <span :class="$style['plus-icon']"><UIcon name="i-lucide-plus" /></span>
            </button>

            <div v-if="menuOpen" :class="$style.menu" role="menu">
              <!-- 附件为占位实现：title 提示用户文件不会真正上传 -->
              <button type="button" role="menuitem" :class="$style['menu-item']" title="附件功能待后端支持，发送时不会上传" @click="openPicker('image')">
                <span :class="$style['menu-icon']"><UIcon name="i-lucide-image" /></span>
                <span :class="$style['menu-name']">图片</span>
              </button>
              <button type="button" role="menuitem" :class="$style['menu-item']" title="附件功能待后端支持，发送时不会上传" @click="openPicker('file')">
                <span :class="$style['menu-icon']"><UIcon name="i-lucide-paperclip" /></span>
                <span :class="$style['menu-name']">文件</span>
              </button>
              <div :class="$style['menu-divider']"></div>
              <div
                :class="$style['menu-sub']"
                @mouseenter="skillsOpen = true"
                @mouseleave="skillsOpen = false"
              >
                <button
                  type="button"
                  role="menuitem"
                  :class="$style['menu-item']"
                  aria-haspopup="menu"
                  :aria-expanded="skillsOpen"
                  @click="skillsOpen = true"
                >
                  <span :class="$style['menu-icon']"><UIcon name="i-lucide-book-open" /></span>
                  <span :class="$style['menu-name']">技能</span>
                  <span :class="$style['menu-chevron']"><UIcon name="i-lucide-chevron-right" /></span>
                </button>
                <div v-if="skillsOpen" :class="$style['menu-flyout']" role="menu">
                  <button
                    v-for="sk in enabledSkills"
                    :key="sk.id"
                    type="button"
                    role="menuitem"
                    :class="$style['menu-item']"
                    @click="addSkillFromMenu(sk.name)"
                  >
                    <span :class="$style['menu-name']">{{ sk.name }}</span>
                  </button>
                  <div v-if="!enabledSkills.length" :class="$style['slash-empty']">
                    {{ skillsStore.state.skillsLoading ? '加载中…' : '暂无已启用的技能' }}
                  </div>
                </div>
              </div>
              <div :class="$style['menu-divider']"></div>
            </div>
          </div>

          <!-- Agent/Workflow 下拉，融入工具栏左侧 -->
          <USelect v-model="selectedTarget" :class="$style['agent-select']" :items="targetItems" :icon="planSelected ? 'i-lucide-workflow' : 'i-lucide-bot'" value-key="value" label-key="label" :disabled="persistedSession || state.busy || readOnlySession" :loading="agentsStore.state.loading || workflowsStore.state.loading" aria-label="选择新会话的 Agent 或 Workflow" />

          <div :class="$style.right">
            <span v-if="enhancing" :class="[$style['icon-btn'], $style['spinner-btn']]" aria-label="正在增强提示词">
              <UIcon name="i-lucide-loader-circle" :class="$style.spinner" />
            </span>
            <button
              v-else-if="pillMounted"
              type="button"
              :class="[$style.pill, pillExiting ? $style['pill-exit'] : '']"
              :title="phase === 'enhanced' ? '恢复增强前的原文' : '演示行为：本地 mock 增强，后端接口待接入'"
              @click="phase === 'enhanced' ? revert() : enhance()"
            >
              <!-- 文案包一层 span：::before 底色不透明，未定位的裸文本节点会被它盖住 -->
              <span>{{ phase === 'enhanced' ? '撤销增强' : '增强提示词' }}</span>
            </button>
            <ChatModelControls />
            <button
              type="button"
              :class="[$style['icon-btn'], $style.send, sendActive ? $style['send-active'] : '']"
              :aria-label="state.busy ? '停止执行' : '发送消息'"
              :disabled="state.busy ? readOnlySession : !sendActive"
              @click="state.busy ? stopExecution() : send()"
            >
              <UIcon v-if="state.busy" name="i-lucide-square" />
              <UIcon v-else name="i-lucide-arrow-up" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./index.module.css"></style>

