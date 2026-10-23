// 频道（城）、回放、观众端城数据、大盘，与 backend app/routers/* 返回一致
import type { Faq, Room, Scene, World } from './game'

export type GameStatus = 'none' | 'fetching' | 'analyzing' | 'ready' | 'failed'

export interface ChannelSummary {
  channel_id: string
  name: string
  publisher: string
  cover_img: string
  scene: Scene
  city_status: 'none' | 'generating' | 'ready' | 'failed'
  imported_at: number
  replays: number
  ready: number | null
}

export interface Replay {
  id: string
  channel_id: string
  video_id: string
  title: string
  duration_s: number
  start_time: string
  cover: string
  url: string
  mp4: string
  session_id: string
  sort_no: number
  subtitle_ready: number
  game_status: GameStatus
  game_error: string
  updated_at: number
  running: boolean
}

export interface City {
  name: string
  intro: string
  streets: { name: string; replays: string[] }[]
  buildings: { replay: string; name: string; plaque: string; kind: 'pavilion' | 'hall' | 'shop' | 'tower'; blurb: string }[]
  npcs: { replay: string; name: string; line: string }[]
}

export interface ChannelDetail extends Omit<ChannelSummary, 'replays' | 'ready'> {
  watch_url: string
  city_json: City | null
  city_error: string
  replays: Replay[]
  cityRunning: boolean
}

export interface CityReplay {
  id: string
  no: number
  title: string
  duration: number
  cover: string
  video: string
  mp4: string
  state: 'open' | 'locked'
  views: number
  game: null | {
    scene: Scene
    rooms: Room[]
    boss_room: number
    faq: Faq[]
    pairs: { a: string; b: string; diff: string; source_time: number }[]
    world: World | null
    title: string
    host: string
    duration: number
    traces: Record<string, { question: string; total: number; wrong: number; samples: [string, string][] }>
    subs: { t: number; text: string }[]
  }
}

export interface CityData {
  channel: { id: string; name: string; publisher: string; scene: Scene; cover: string }
  city: City
  replays: CityReplay[]
}

export interface Viewer {
  id: string
  nickname: string
}

export interface Progress {
  replays: Record<string, { replay_id: string; runs: number; cleared_at: number | null; best_points: number }>
  points: number
}

export interface DashboardBuilding {
  id: string
  no: number
  title: string
  ready: boolean
  players: number
  runs: number
  cleared: number
  clearRate: number
  failRate: number
  hotRoom: { index: number; title: string; failRate: number } | null
  revives: number
}

export interface Dashboard {
  channel: { id: string; name: string; scene: Scene; city: City | null }
  kpi: { viewers: number; runs: number; cleared: number; clearRate: number; avgDuration: number; revives: number }
  buildings: DashboardBuilding[]
  timeline: { ts: number; replay: string; viewer: string }[]
}

export interface ReplayDashboard {
  id: string
  title: string
  duration: number
  rooms: { index: number; title: string; start: number; end: number; failRate: number; answered: number; cardFailRate: number }[]
  bossRoom: number | null
  funnel: { room: number | null; title: string; reached: number }[]
  topWrong: { id: string; room: number; keyword: string; question: string; answer: string; wrong: number; total: number; sourceTime: number; choices: { text: string; count: number }[] }[]
  reviveHeat: { t: number; seconds: number }[]
  viewers: { nickname: string; result: string; points: number; roomsDone: number; wrong: number; revives: number; duration: number; startedAt: number }[]
}
