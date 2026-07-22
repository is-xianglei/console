import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const DEFAULT_WIDTH = 356
const MIN_RUNTIME_WIDTH = 320
const MIN_CONVERSATION_WIDTH = 390
const RESIZER_WIDTH = 10
const MIN_SPLIT_WIDTH = MIN_RUNTIME_WIDTH + MIN_CONVERSATION_WIDTH + RESIZER_WIDTH
const STORAGE_KEY = 'hyperreal-runtime-pane-width'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function useRuntimePaneResize() {
  const workArea = ref<HTMLElement | null>(null)
  const workAreaWidth = ref(0)
  const requestedWidth = ref(DEFAULT_WIDTH)
  const resizing = ref(false)
  let resizeObserver: ResizeObserver | null = null
  let dragStartX = 0
  let dragStartWidth = DEFAULT_WIDTH

  const splitAvailable = computed(() =>
    !(workAreaWidth.value > 0 && workAreaWidth.value < MIN_SPLIT_WIDTH),
  )
  const runtimeMinWidth = computed(() => MIN_RUNTIME_WIDTH)
  const runtimeMaxWidth = computed(() => {
    const available = workAreaWidth.value - MIN_CONVERSATION_WIDTH - RESIZER_WIDTH
    return Math.max(MIN_RUNTIME_WIDTH, Math.min(720, available))
  })
  const runtimePaneWidth = computed(() => clamp(
    requestedWidth.value,
    runtimeMinWidth.value,
    runtimeMaxWidth.value,
  ))
  const splitStyle = computed(() => ({ '--runtime-pane-width': `${runtimePaneWidth.value}px` }))

  function persistWidth() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(requestedWidth.value)))
    } catch {
      // 受限 WebView 中仍保留当前页面会话内的宽度。
    }
  }

  function resizeFromPointer(event: PointerEvent) {
    requestedWidth.value = clamp(
      dragStartWidth + dragStartX - event.clientX,
      runtimeMinWidth.value,
      runtimeMaxWidth.value,
    )
  }

  function stopResize() {
    if (!resizing.value) return
    resizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', resizeFromPointer)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    persistWidth()
  }

  function startResize(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    resizing.value = true
    dragStartX = event.clientX
    dragStartWidth = runtimePaneWidth.value
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', resizeFromPointer)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  function resetWidth() {
    requestedWidth.value = DEFAULT_WIDTH
    persistWidth()
  }

  function resizeWithKeyboard(event: KeyboardEvent) {
    let next = runtimePaneWidth.value
    const step = event.shiftKey ? 48 : 16
    if (event.key === 'ArrowLeft') next += step
    else if (event.key === 'ArrowRight') next -= step
    else if (event.key === 'Home') next = runtimeMinWidth.value
    else if (event.key === 'End') next = runtimeMaxWidth.value
    else if (event.key === 'Enter') next = DEFAULT_WIDTH
    else return
    event.preventDefault()
    requestedWidth.value = clamp(next, runtimeMinWidth.value, runtimeMaxWidth.value)
    persistWidth()
  }

  onMounted(() => {
    try {
      const storedWidth = Number(localStorage.getItem(STORAGE_KEY))
      if (Number.isFinite(storedWidth) && storedWidth > 0) requestedWidth.value = storedWidth
    } catch {
      // 使用默认宽度。
    }
    resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) workAreaWidth.value = entry.contentRect.width
    })
    if (workArea.value) resizeObserver.observe(workArea.value)
  })

  onBeforeUnmount(() => {
    stopResize()
    resizeObserver?.disconnect()
  })

  return {
    workArea,
    resizing,
    splitAvailable,
    runtimeMinWidth,
    runtimeMaxWidth,
    runtimePaneWidth,
    splitStyle,
    startResize,
    stopResize,
    resetWidth,
    resizeWithKeyboard,
  }
}
