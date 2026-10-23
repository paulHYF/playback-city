// game.json 结构，与 backend/app/pipeline/schema.py 保持一致
export type Scene = 'course' | 'commerce'

export interface Item {
  id: string
  keyword: string
  question: string
  code: string
  options: string[] // [0] 为正确答案，展示时打乱
  explain: string
  source_time: number
  source_quote: string
}

export interface Room {
  title: string
  start: number
  end: number
  summary: string
  keywords: string[]
  watched_ratio: number
  fail_rate: number
  items: Item[]
}

export interface Faq {
  room: number
  count: number
  question: string
  answer: string
  source_time: number
  samples: [string, string, string][]
}

// world：AI 生成的闯关配置（需求文档 8.3），与 schema.py 的 World 一致
export type Mechanic = 'chest_quiz' | 'twin_doors' | 'order_steps' | 'code_fill' | 'calc'

/** 引擎实现档位；当前档位未实现的机制在前端降级为 chest_quiz */
export const MECHANIC_LEVEL: Record<Mechanic, 'P0' | 'P1' | 'P2'> = {
  chest_quiz: 'P0', twin_doors: 'P1', order_steps: 'P1', code_fill: 'P2', calc: 'P2'
}

export interface WorldRoom {
  room: number
  name: string
  layout: 'hall' | 'corridor' | 'courtyard' | 'stall_row'
  mood: 'lit' | 'dim' | 'misty'
  mechanic: Mechanic
  door?: { item: string } // 门题：本房 items 里的题目 id，答对开门
  reward?: string // 开门得到的道具 id
  requires?: string // 进入本房需要持有的道具 id（由更早的殿室给出）
  twin_doors?: { prompt: string; left: string; right: string; answer: 'left' | 'right'; explain: string; source_time: number }
  order_steps?: { prompt: string; steps: string[]; source_time: number } // steps 为正确顺序，展示时打乱
  code_fill?: { prompt: string; code: string; options: string[]; explain: string; source_time: number } // code 含 ___，options[0] 正确
  calc?: { prompt: string; answer: string; explain: string; source_time: number }
}

export interface World {
  theme: 'song_palace' | 'night_market'
  name: string
  intro: string
  palette: { wall: string; accent: string; fog: number }
  rooms: WorldRoom[]
  boss: { archetype: 'tomb_beast' | 'haggler'; name: string; weakness: string; taunt: string; points: number; reward?: string } // 落在 game.boss_room
  items: { id: string; name: string; desc: string; use: string }[] // 道具
  clock: { real_minutes: number } // 一夜十二时辰折合的真实分钟数
  npcs: { archetype: 'scholar_ghost' | 'shop_clerk'; room: number; faq: number; line: string }[]
}

export interface Game {
  version: number
  scene: Scene
  replay: { channelId: string; fileId: string; title: string; duration: number; host: string }
  rooms: Room[]
  boss_room: number
  faq: Faq[]
  pairs: { a: string; b: string; diff: string; source_time: number }[]
  handout: { title: string; markdown: string }
  skin: 'dungeon' | 'market'
  world?: World
}
