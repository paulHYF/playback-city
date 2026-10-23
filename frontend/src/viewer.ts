// 观众身份与闯关上报：浏览器首次进入向后端领一个观众 id 存 localStorage；事件攒批发送，关页时 sendBeacon 补发。
import { api } from '@/api'
import type { Viewer } from '@/types/city'

const KEY = 'pc.viewer'

function load(): Viewer | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

function save(v: Viewer) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // 隐私模式等写不进去：本次会话照常可玩，只是下次会换一个 id
  }
}

export async function ensureViewer(): Promise<Viewer> {
  const cached = load()
  if (cached) {
    const v = await api.viewer(cached.id).catch(() => null) // 库被清过就重新领
    if (v) return v
  }
  const v = await api.createViewer()
  save(v)
  return v
}

/** 回放播放器里看过的区间不属于某一局，单独上报；用 sendBeacon 保证离开页面时也能发出。 */
export function reportWatch(viewerId: string, replayId: string, source: string, ranges: number[][]) {
  navigator.sendBeacon(`/api/viewers/${viewerId}/watch`, JSON.stringify({ replayId, source, ranges }))
}

export interface TrackEvent {
  type: string
  room?: number | null
  ref?: string
  correct?: boolean
  choice?: string
  source_time?: number
  extra?: Record<string, unknown>
  ts?: number
}

/** 一局闯关的上报器：runId 拿到之前的事件先排队；5 条或 5 秒一发。 */
export class RunTracker {
  private queue: TrackEvent[] = []
  private runId: string | null = null
  private timer: number | undefined
  private finished = false

  constructor(viewerId: string, replayId: string) {
    api.startRun(viewerId, replayId).then(r => {
      this.runId = r.id
      this.flush()
    }).catch(() => {})
    addEventListener('pagehide', this.beacon)
  }

  track(e: TrackEvent) {
    if (this.finished) return
    this.queue.push({ ...e, ts: Date.now() })
    if (this.queue.length >= 5) this.flush()
    else if (this.timer === undefined) this.timer = window.setTimeout(() => this.flush(), 5000)
  }

  flush() {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.runId || !this.queue.length) return Promise.resolve()
    const batch = this.queue.splice(0)
    return fetch(`/api/runs/${this.runId}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) })
      .then(() => undefined)
      .catch(() => { this.queue.unshift(...batch) })
  }

  async finish(result: string, stats: { points: number; roomsDone: number; lamps: number }) {
    if (this.finished) return
    this.finished = true
    removeEventListener('pagehide', this.beacon)
    for (let i = 0; i < 20 && !this.runId; i++) await new Promise(r => setTimeout(r, 150))
    if (!this.runId) return
    await this.flush()
    await api.finishRun(this.runId, { result, ...stats }).catch(() => {})
  }

  private beacon = () => {
    if (this.runId && this.queue.length) navigator.sendBeacon(`/api/runs/${this.runId}/events`, JSON.stringify(this.queue.splice(0)))
  }
}
