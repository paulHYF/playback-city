// 后台调整游戏配置用的中文标签与默认值，枚举与 backend/app/pipeline/schema.py、city.py 一致
import type { Game, Mechanic, World, WorldRoom } from '@/types/game'
import type { BuildingKind } from '@/types/city'
import { THEMES } from '@/game/nightcity/themes'

export const LAYOUT: Record<WorldRoom['layout'], string> = { hall: '大殿', corridor: '长廊', courtyard: '庭院', stall_row: '摊铺街' }
export const MOOD: Record<WorldRoom['mood'], string> = { lit: '灯火通明', dim: '昏暗', misty: '墨雾' }
export const MECHANIC: Record<Mechanic, string> = {
  chest_quiz: '卷宗匣答题', twin_doors: '双门辨析', order_steps: '机关排序', code_fill: '补全咒文', calc: '算账关',
  lamps: '拾灯', evidence: '寻证', sort: '找同类', assemble: '拼原话', beasts: '破惑（打怪）'
}
export const MECHANIC_DESC: Record<Mechanic, string> = {
  chest_quiz: '打开卷宗匣，依次答对本房的题（用本房题目，不用另配）',
  twin_doors: '石碑写辨析，两扇门各刻一种说法，走进对的门',
  order_steps: '机关台上按正确顺序点出步骤，错两次被反噬',
  code_fill: '符文碑上的代码缺一处，选出正确填法',
  calc: '账台前输入计算结果，可错一次',
  lamps: '找齐散落在墙边的三盏灯（不用另配）',
  evidence: '在回放字幕里搜到先生说这件事的原话（不用另配）',
  sort: '把关键词竹签送进对应段落的木匣（不用另配）',
  assemble: '找残片，按顺序拼回先生原话（不用另配）',
  beasts: '击退代表易错点的怪，再识破它的惑（不用另配）'
}
/** 未配置时引擎的默认轮换顺序，生成默认配置也按这个排，保持节奏有变化 */
const ROTATION: Mechanic[] = ['lamps', 'evidence', 'chest_quiz', 'sort', 'assemble', 'beasts']
export const THEME = Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.name])) as Record<World['theme'], string>
export const BOSS_ARCHETYPE: Record<World['boss']['archetype'], string> = { tomb_beast: '众惑（课程）', haggler: '刁客（带货）' }
export const NPC_ARCHETYPE: Record<World['npcs'][number]['archetype'], string> = { scholar_ghost: '书生灯影', shop_clerk: '店铺伙计' }
export const BUILDING_KIND: Record<BuildingKind, string> = { pavilion: '楼阁', hall: '殿', shop: '店铺', tower: '塔' }

/** 深拷贝：编辑在草稿上进行，保存成功才替换 */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** 某机制的空白配置；切换机制时换上，并去掉其他机制的配置（服务端要求只留同名一份） */
export function mechanicPayload(m: Mechanic, sourceTime: number): Partial<WorldRoom> {
  switch (m) {
    case 'twin_doors': return { twin_doors: { prompt: '', left: '', right: '', answer: 'left', explain: '', source_time: sourceTime } }
    case 'order_steps': return { order_steps: { prompt: '', steps: ['', '', ''], source_time: sourceTime } }
    case 'code_fill': return { code_fill: { prompt: '', code: '___', options: ['', '', '', ''], explain: '', source_time: sourceTime } }
    case 'calc': return { calc: { prompt: '', answer: '', explain: '', source_time: sourceTime } }
    default: return {}
  }
}

export function setMechanic(wr: WorldRoom, m: Mechanic, sourceTime: number) {
  delete wr.twin_doors
  delete wr.order_steps
  delete wr.code_fill
  delete wr.calc
  Object.assign(wr, { mechanic: m }, mechanicPayload(m, sourceTime))
}

export function defaultWorldRoom(g: Game, i: number): WorldRoom {
  const r = g.rooms[i]
  return { room: i, name: r.title.slice(0, 8), layout: g.skin === 'market' ? 'stall_row' : 'hall', mood: r.watched_ratio < 0.5 ? 'misty' : 'lit', mechanic: ROTATION[i % ROTATION.length] }
}

/** AI 没产出 world（或校验没过被去掉）时，后台从这份起点开始配 */
export function defaultWorld(g: Game): World {
  const market = g.skin === 'market'
  return {
    theme: market ? 'night_market' : 'song_palace',
    name: g.replay.title.slice(0, 12),
    intro: '',
    palette: { wall: '#2a3036', accent: '#c9a45c', fog: 0.16 },
    rooms: g.rooms.map((_, i) => defaultWorldRoom(g, i)),
    boss: { archetype: market ? 'haggler' : 'tomb_beast', name: market ? '刁客' : '众惑', weakness: g.rooms[g.boss_room]?.keywords[0] || '', taunt: '', points: 100 },
    items: [],
    npcs: [],
    clock: { real_minutes: 6 }
  }
}

/** 新题 id：与已有 id 不重复 */
export function newItemId(g: Game, room: number) {
  const ids = new Set(g.rooms.flatMap(r => r.items.map(it => it.id)))
  let n = g.rooms[room].items.length + 1
  while (ids.has(`q${room + 1}${n}`)) n++
  return `q${room + 1}${n}`
}
