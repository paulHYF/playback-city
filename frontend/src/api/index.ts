import type { Game, Scene } from '@/types/game'
import type { ChannelDetail, ChannelSummary, CityData, Dashboard, Progress, Replay, ReplayDashboard, Viewer } from '@/types/city'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `${resp.status} ${resp.statusText}`)
  return body as T
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export interface RawStatus {
  files: string[]
  errors: Record<string, string>
}

export const api = {
  health: () => request<{ ok: boolean; polyv: string; polyvReady: boolean; llmReady: boolean }>('/api/health'),
  // 后台
  channels: () => request<ChannelSummary[]>('/api/channels'),
  channel: (cid: string) => request<ChannelDetail>(`/api/channels/${cid}`),
  importChannel: (channelId: string, scene: Scene) =>
    post<{ channelId: string; replays: number; playbacks: number; recordFiles: number }>('/api/channels/import', { channelId, scene }),
  generateCity: (cid: string) => post<{ accepted: boolean }>(`/api/channels/${cid}/city/generate`),
  createOutline: (cid: string, rid: string) => post<unknown>(`/api/channels/${cid}/replays/${rid}/outline`),
  replay: (rid: string) => request<Replay>(`/api/replays/${rid}`),
  replayGame: (rid: string) => request<Game>(`/api/replays/${rid}/game`),
  raw: (rid: string) => request<RawStatus>(`/api/replays/${rid}/raw`),
  generateReplay: (rid: string) => post<{ accepted: boolean }>(`/api/replays/${rid}/generate`),
  // 观众端
  city: (cid: string) => request<CityData>(`/api/city/${cid}`),
  createViewer: () => post<Viewer>('/api/viewers'),
  viewer: (vid: string) => request<Viewer>(`/api/viewers/${vid}`),
  progress: (vid: string, cid: string) => request<Progress>(`/api/viewers/${vid}/progress?channelId=${cid}`),
  startRun: (viewerId: string, replayId: string) => post<{ id: string }>('/api/runs', { viewerId, replayId }),
  finishRun: (runId: string, body: { result: string; points: number; roomsDone: number; lamps: number }) =>
    post<{ ok: boolean }>(`/api/runs/${runId}/finish`, body),
  // 大盘
  dashboard: (cid: string) => request<Dashboard>(`/api/dashboard/${cid}`),
  replayDashboard: (cid: string, rid: string) => request<ReplayDashboard>(`/api/dashboard/${cid}/replays/${rid}`)
}
