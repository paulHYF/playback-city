// 频道（城）、回放、观众端城数据、大盘，与 backend app/routers/* 返回一致
import type { Faq, Room, Scene, World } from './game'
export type { Scene }

export type GameStatus = 'none' | 'fetching' | 'analyzing' | 'ready' | 'failed'

export interface ChannelSummary {
  channel_id: string
  name: string
  publisher: string
  cover_img: string
  scene: Scene
  city_status: 'none' | 'generating' | 'ready' | 'failed'
  imported_at: number
  city_name: string | null // 生成整城后的城名 / 城志，没生成过为 null
  city_intro: string | null
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
  game_edited_at: number | null // 后台人工调整过 game.json 的时间，重新生成时清空
  updated_at: number
  running: boolean
}

export type BuildingKind = 'pavilion' | 'hall' | 'shop' | 'tower'

export interface City {
  name: string
  intro: string
  streets: { name: string; replays: string[] }[]
  buildings: { replay: string; name: string; plaque: string; kind: BuildingKind; blurb: string }[]
  npcs: { replay: string; name: string; line: string }[]
}

export interface ChannelDetail extends Omit<ChannelSummary, 'replays' | 'ready'> {
  watch_url: string
  city_json: City | null
  city_error: string
  city_edited_at: number | null // 后台人工调整过城数据的时间，重新生成整城时清空
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
  /** 直播播放器参数：账号 uid、频道号、按环境下发的 domainInfo */
  player: { uid: string; channelId: string; domainInfo: Record<string, string> }
  replays: CityReplay[]
}

export interface Viewer {
  id: string
  nickname: string
}

export interface Progress {
  replays: Record<string, { replay_id: string; runs: number; cleared_at: number | null; best_points: number }>
  points: number
  /** 刷新前没打完的那一局，进城可接着打；没有则为 null */
  active: { runId: string; replayId: string; state: Record<string, unknown> } | null
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

export interface RawFile {
  name: string
  label: string
  size: number
  mtime: number
  count: number | null
}

export interface RawOverview {
  import: { files: RawFile[] }
  replays: { id: string; title: string; sort_no: number; game_status: GameStatus; files: RawFile[]; errors: Record<string, string> }[]
}

export type Level = 'good' | 'fair' | 'poor' | 'none'

export interface Indicator {
  key: string
  name: string
  value: number | null
  display: string
  score: number | null
  level: Level
  weight: number
  tip: string
}

export interface ReportDimension {
  score: number | null
  indicators: Indicator[]
  findings: string[]
  actions: string[]
}

export interface ReplayQuality {
  id: string
  no: number
  title: string
  duration: number
  gameReady: boolean
  hasRaw: boolean
  /** false：只有旧的按观众汇总观看记录，直播与回放没拆开 */
  viewSplit: boolean
  live: {
    viewers: number
    plays: number
    avgWatch: number
    completion: number | null
    buckets: number[]
    /** 每分钟在线人数 */
    online: number[]
    peak: number
    drop: { minute: number; lost: number; room: string | null } | null
  }
  vod: {
    viewers: number
    plays: number
    avgWatch: number
    completion: number | null
    buckets: number[]
    repeat: number
    fromLive: number
    vodOnly: number
    liveShort: number
    makeup: number
    /** 首次看回放距直播：当天 / 1–3 天 / 4–7 天 / 7 天后 */
    age: number[]
  }
  review: {
    bin: number
    heat: number[]
    seconds: number[]
    ranges: number
    reviewers: number
    sources: Record<string, number>
    segments: { from: number; to: number; viewers: number; seconds: number; room: string | null; reasons: string[] }[]
  }
  chat: {
    messages: number
    speakers: number
    speakRate: number | null
    perMinute: number | null
    questions: number
    intent: number
    confused: number
    heat: number[]
    peak: { minute: number; count: number; room: string | null } | null
    topics: Record<Scene, Record<string, number>>
  }
  asks: number
  quiz: {
    cards: { title: string; total: number; correct: number; correctRate: number | null; offset: number | null; room: string | null }[]
    count: number
    answers: number
    participation: number | null
    correctRate: number | null
  }
  questionnaire: {
    count: number
    submitters: number
    rate: number | null
    satisfaction: number | null
    questions: { name: string; type: string; answers: number; options: { key: string; count: number }[] }[]
  }
  rooms: { title: string; start: number; end: number; failRate: number; items: number; keywords: string[] }[]
  hardRooms: { title: string; start: number; end: number; failRate: number }[]
  faq: { question: string; count: number; sourceTime: number }[]
  faqTotal: number
}

/** AI 复盘点评：按频道场景只取主视角（课程 → 教学效果，带货 → 营销转化），写给讲师 / 主播本人 */
export interface AiReview {
  version: number
  scene: Scene
  generatedAt: number
  verdict: string
  summary: string
  strengths: { point: string; evidence: string }[]
  diagnosis: { title: string; evidence: string; cause: string; impact: string; confidence: 'high' | 'low' }[]
  moments: { no: number; time: string; what: string; advice: string }[] // 关键时刻：对着回放逐段复盘
  plan: { stage: string; action: string; metric: string; priority: 'P0' | 'P1' | 'P2' }[]
  checklist: string[] // 下一场开播前自检
  questions: string[] // 留给讲师 / 主播的复盘问题
  dataGaps: string[]
}

export interface QualityReport {
  channel: { id: string; name: string; scene: Scene; publisher: string; city: string | null }
  generatedAt: number
  summary: {
    replays: number
    analyzed: number
    duration: number
    viewers: number
    messages: number
    speakers: number
    completion: number | null
    viewSplit: boolean
    vodViewers: number
    vodCompletion: number | null
    vodRepeat: number
    vodOnly: number
    vodReach: number | null
    makeupRate: number | null
    reviewers: number
    reviewRanges: number
    speakRate: number | null
    perMinute: number | null
    intentRate: number | null
    quizCount: number
    quizAnswers: number
    quizPart: number | null
    quizCorrect: number | null
    qnRate: number | null
    satisfaction: number | null
    faqTotal: number
    topics: Record<Scene, Record<string, number>>
    play: Dashboard['kpi']
  }
  dimensions: { training: ReportDimension; marketing: ReportDimension }
  replays: ReplayQuality[]
  ai: AiReview | null
  aiStale: boolean // 存在旧版或场景不符的点评，需重新生成
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
  viewers: { id: string; runId: string; nickname: string; result: string; points: number; roomsDone: number; wrong: number; revives: number; duration: number; startedAt: number }[]
}

export interface PlayViewerRow {
  id: string
  nickname: string
  first_seen: number
  last_seen: number
  runs: number
  cleared: number
  playing: number
  points: number
  last_run: number
}

export interface PlayEvent {
  type: string
  room: number | null
  ref: string
  correct: number | null
  choice: string
  sourceTime: number | null
  ts: number
  extra: Record<string, unknown>
}

export interface PlayRunDetail {
  id: string
  replay_id: string
  replay_title: string
  sort_no: number
  started_at: number
  ended_at: number | null
  result: string
  rooms_done: number
  lamps_left: number
  points: number
  correct_cnt: number
  wrong_cnt: number
  revive_cnt: number
  duration_s: number
  events: PlayEvent[]
}

export interface PlayViewerDetail {
  viewer: { id: string; nickname: string; first_seen: number; last_seen: number }
  runs: PlayRunDetail[]
}

/** 质量报告竹简版：大模型把报告数据写成的复盘文章 */
export interface ReportArticle {
  version: number
  scene: Scene
  generatedAt: number
  channel: { name: string; city: string | null; publisher: string }
  title: string
  preface: string
  sections: { heading: string; paragraphs: string[] }[]
  closing: string
}
