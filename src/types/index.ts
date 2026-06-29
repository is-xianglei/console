// ===== Hyperreal Agent Console · 类型契约 =====
// 注意:tsconfig 开启 erasableSyntaxOnly,禁用 enum,统一用 union 类型 + const 字面量。

/** 子代理 / 思考点的状态 */
export type RunStatus = 'queued' | 'think' | 'run' | 'done' | 'error'

/** 底部任务条的任务状态 */
export type TaskState = 'queued' | 'active' | 'done' | 'error'

/** 会话列表项 */
export interface Session {
  id: string
  title: string
  time: string
  count: number
  badge?: string
}

/** 主内容区视图 */
export type MainView = 'chat' | 'apps'

/** 应用中心条目 */
export interface AppTile {
  name: string
  tag: string
  icon: string
  color: string
  /** 一句话描述,显示在应用列表行 */
  desc: string
  /** 所属分类 */
  category: string
}

/** CLI 工具调用标签 */
export type CliTag = 'START' | 'THINK' | 'TOOL' | 'SPAWN' | 'RESULT' | 'ERROR' | 'WARN' | 'DONE'

/** 子代理事件流中的单条记录 */
export type StreamEvent =
  | { kind: 'think'; text: string }
  | { kind: 'answer'; text: string }
  | { kind: 'tool'; fn: string; body: string; done: boolean }

/** 右侧舰队中的子代理 */
export interface SubAgent {
  id: string
  pid: string
  name: string
  icon: string
  status: RunStatus
  progress: number
  stream: StreamEvent[]
}

/** 底部任务条中的任务 */
export interface Task {
  id: string
  name: string
  state: TaskState
}

/** 中间对话区的消息块 */
export type ChatBlock =
  | { kind: 'think'; text: string; duration: string; collapsed: boolean }
  | { kind: 'tool'; tag: CliTag; fn: string; body: string; done: boolean }
  | { kind: 'answer'; text: string; streaming: boolean }

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  time: string
  /** user 角色直接使用 text;ai 角色使用 blocks 流 */
  text?: string
  blocks?: ChatBlock[]
}

/** 派发子代理时使用的模板 */
export interface SubAgentTemplate {
  name: string
  icon: string
  think: string
  fn: string
  body: string
  answer: string
  task: string
}
