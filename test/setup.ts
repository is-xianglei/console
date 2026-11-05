import { beforeEach } from 'vitest'

// 使用内存存储，避免 Node 版本和宿主机 localStorage 状态影响测试。
const values = new Map<string, string>()
const storage = {
  get length() {
    return values.size
  },
  clear() {
    values.clear()
  },
  getItem(key: string) {
    return values.get(String(key)) ?? null
  },
  key(index: number) {
    return [...values.keys()][index] ?? null
  },
  removeItem(key: string) {
    values.delete(String(key))
  },
  setItem(key: string, value: string) {
    values.set(String(key), String(value))
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: storage,
})

beforeEach(() => {
  values.clear()
})
