<script setup lang="ts">
// 城防舆图：观众出城后看到的天下。一个频道一座城，按建城先后由驿道串起；城里一方街坊 = 一讲可闯的回放。
// 城的状态按当前观众的闯关进度：未至（墨线）· 在攻（灯火）· 已克（朱旗 + 克字印）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { ChannelSummary, Progress, Viewer } from '@/types/city'
import { SCENE_NAME } from '@/utils'
import { ensureViewer } from '@/viewer'

type CityState = 'new' | 'on' | 'won'
interface Node {
  c: ChannelSummary
  name: string
  short: string
  unit: string
  total: number
  started: number
  cleared: number
  points: number
  state: CityState
  x: number
  y: number
  r: number
}

const route = useRoute()
const router = useRouter()
const cities = ref<ChannelSummary[]>([])
const progress = ref<Record<string, Progress>>({})
const viewer = ref<Viewer | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const portrait = ref(false)
const sel = ref('')

/** 按频道号取一个稳定的 0~1 伪随机数，城的位置、驿道弯向每次进来都一样。 */
function hash(s: string, salt: number) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const STATE_NAME: Record<CityState, string> = { new: '未至', on: '在攻', won: '已克' }

const view = computed(() => (portrait.value ? { w: 420, h: 230 + Math.max(1, cities.value.length) * 210 } : { w: 1200, h: 720 }))

const nodes = computed<Node[]>(() => {
  const list = cities.value, n = list.length, { w: W, h: H } = view.value
  const cols = n <= 4 ? n : Math.min(5, Math.ceil(n / 2)), rows = Math.ceil(n / Math.max(1, cols))
  const left = 120, right = 360, top = 190, bottom = 150 // 右侧留给城志卷宗
  const cw = (W - left - right) / Math.max(1, cols), ch = (H - top - bottom) / Math.max(1, rows)
  return list.map((c, i) => {
    const p = progress.value[c.channel_id]?.replays ?? {}
    const runs = Object.values(p)
    const total = c.ready ?? 0
    const cleared = Math.min(total, runs.filter(r => r.cleared_at).length)
    const started = Math.min(total, runs.filter(r => r.runs > 0).length)
    const name = c.city_name || c.name
    let x: number, y: number
    if (portrait.value) {
      x = W * (i % 2 ? 0.66 : 0.34)
      y = 250 + i * 210
    } else {
      const row = Math.floor(i / cols), col = row % 2 ? cols - 1 - (i % cols) : i % cols // 蛇形，驿道不回头交叉
      x = left + cw * (col + 0.5) + (hash(c.channel_id, 1) - 0.5) * cw * 0.3
      y = top + ch * (row + 0.5) + (rows === 1 ? (i % 2 ? -1 : 1) * ch * 0.2 : (hash(c.channel_id, 2) - 0.5) * ch * 0.3)
    }
    return {
      c, name, total, started, cleared, x, y,
      short: name.length > 8 ? name.slice(0, 8) + '…' : name,
      unit: c.scene === 'commerce' ? '场' : '讲',
      points: progress.value[c.channel_id]?.points ?? 0,
      state: total && cleared >= total ? 'won' : started ? 'on' : 'new',
      r: (portrait.value ? 30 : 36) + Math.min(total, 6) * 4
    }
  })
})

/** 相邻两城之间一条弯曲的驿道，正中一座烽燧；两头都到过的路段点亮。 */
const roads = computed(() => nodes.value.slice(1).map((b, i) => {
  const a = nodes.value[i]
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
  const bend = (hash(a.c.channel_id + b.c.channel_id, 3) > 0.5 ? 1 : -1) * len * 0.18
  const cx = (a.x + b.x) / 2 - (dy / len) * bend, cy = (a.y + b.y) / 2 + (dx / len) * bend
  const at = (t: number) => [(1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x, (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y]
  const [bx, by] = at(0.5)
  return { key: a.c.channel_id + '-' + b.c.channel_id, d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, bx, by, lit: a.state !== 'new' && b.state !== 'new', samples: [0.2, 0.35, 0.5, 0.65, 0.8].map(at) }
}))

/** 山：在留白处按网格撒，离城和驿道远一点。 */
const mountains = computed(() => {
  const { w: W, h: H } = view.value, out: { x: number; y: number; s: number; key: string }[] = []
  const pts = roads.value.flatMap(r => r.samples)
  for (let y = 150; y < H - 90; y += 78) {
    for (let x = 70; x < W - 60; x += 92) {
      const key = `${x}-${y}`, jx = x + (hash(key, 4) - 0.5) * 50, jy = y + (hash(key, 5) - 0.5) * 36
      if (hash(key, 6) > 0.36) continue
      // 城身 + 城下题名都要让开
      if (nodes.value.some(n => Math.abs(n.x - jx) < n.r * 1.7 + 70 && jy > n.y - n.r * 2 - 30 && jy < n.y + n.r + 110)) continue
      if (pts.some(([px, py]) => Math.hypot(px - jx, py - jy) < 48)) continue
      out.push({ x: jx, y: jy, s: 0.7 + hash(key, 7) * 0.6, key })
    }
  }
  return out
})

const river = computed(() => {
  const { w: W, h: H } = view.value
  return portrait.value
    ? `M${W - 44} 130 C${W - 80} ${H * 0.3} ${W - 20} ${H * 0.5} ${W - 50} ${H * 0.7} S${W - 30} ${H - 120} ${W - 56} ${H - 30}`
    : `M0 ${H - 70} C${W * 0.2} ${H - 130} ${W * 0.35} ${H - 20} ${W * 0.55} ${H - 70} S${W * 0.85} ${H - 140} ${W} ${H - 110}`
})

const summary = computed(() => {
  const ns = nodes.value
  return { won: ns.filter(n => n.state === 'won').length, total: ns.length, points: ns.reduce((s, n) => s + n.points, 0) }
})
const current = computed(() => nodes.value.find(n => n.c.channel_id === sel.value))

// 城按正立面画在固定单位尺寸里（半宽 56，地平线 y = 30），整体按 n.r / 34 缩放。
/** 檐角起翘的屋顶：cx 居中，y 为檐口，w 半宽，h 高。 */
function roof(cx: number, y: number, w: number, h: number) {
  return `M${cx - w} ${y} Q${cx - w * 0.72} ${y - h * 0.3} ${cx - w * 0.6} ${y - h} L${cx + w * 0.6} ${y - h} ` +
    `Q${cx + w * 0.72} ${y - h * 0.3} ${cx + w} ${y} Q${cx} ${y - h * 0.35} ${cx - w} ${y} Z`
}

const MERLONS = Array.from({ length: 13 }, (_, i) => -51 + i * 8)
const HOUSE_X = [-34, 34, -22, 22, -44, 44, -12, 12]

/** 墙后露出的楼宇：一座 = 一讲可闯回放，左右对称从门楼两侧往外排。 */
function houses(n: Node) {
  return HOUSE_X.slice(0, Math.max(1, Math.min(n.total, HOUSE_X.length))).map((x, i) => ({
    x, tall: 14 + ((i * 7) % 3) * 4,
    cls: i < n.cleared ? 'won' : i < n.started ? 'on' : ''
  }))
}

function select(n: Node) {
  sel.value = n.c.channel_id
}

function enter(n: Node) {
  router.push(`/city/${n.c.channel_id}`)
}

const fit = () => { portrait.value = innerWidth < 700 || innerWidth / innerHeight < 0.9 }
onMounted(async () => {
  fit()
  addEventListener('resize', fit)
  document.title = '城防舆图 · 回放不夜城'
  try {
    cities.value = (await api.channels()).filter(c => c.ready).reverse() // 先建的城在驿道起点
  } catch (e) {
    state.value = 'error'
    error.value = `舆图取不到：${(e as Error).message}`
    return
  }
  state.value = 'ready'
  try {
    viewer.value = await ensureViewer()
    const list = await Promise.all(cities.value.map(c => api.progress(viewer.value!.id, c.channel_id).catch(() => null)))
    progress.value = Object.fromEntries(cities.value.flatMap((c, i) => (list[i] ? [[c.channel_id, list[i]!]] : [])))
  } catch {
    // 领不到观众身份也照常看图，只是没有攻克进度
  }
  const from = String(route.query.from || '')
  sel.value = (nodes.value.find(n => n.c.channel_id === from) ?? nodes.value.find(n => n.state !== 'won') ?? nodes.value[0])?.c.channel_id ?? ''
})
onBeforeUnmount(() => removeEventListener('resize', fit))
</script>

<template>
  <main class="atlas" :class="{ portrait }">
    <div class="sheet">
    <svg v-if="state === 'ready'" class="map" :viewBox="`0 0 ${view.w} ${view.h}`" role="group" aria-label="城防舆图：各座城与连通它们的驿道">
      <defs>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.32 0" />
        </filter>
        <radialGradient id="stain" cx="50%" cy="45%" r="75%">
          <stop offset="60%" stop-color="#000" stop-opacity="0" />
          <stop offset="100%" stop-color="#5a3a18" stop-opacity="0.38" />
        </radialGradient>
        <radialGradient id="lamp">
          <stop offset="0%" stop-color="#ffcf86" stop-opacity="0.65" />
          <stop offset="100%" stop-color="#e3893a" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 绢底 -->
      <rect class="silk" :width="view.w" :height="view.h" />
      <rect :width="view.w" :height="view.h" filter="url(#grain)" />
      <rect :width="view.w" :height="view.h" fill="url(#stain)" />
      <rect class="frame" x="14" y="14" :width="view.w - 28" :height="view.h - 28" />
      <rect class="frame thin" x="22" y="22" :width="view.w - 44" :height="view.h - 44" />

      <!-- 山水 -->
      <path class="river" :d="river" />
      <path class="river-in" :d="river" />
      <g v-for="m in mountains" :key="m.key" class="mount" :transform="`translate(${m.x} ${m.y}) scale(${m.s})`">
        <path d="M-30 0 Q-20 -22 -10 -30 Q-4 -18 2 -20 Q8 -38 16 -40 Q24 -22 32 0 Z" />
        <path class="hatch" d="M-12 -24 L-16 -6 M14 -34 L10 -10 M20 -28 L18 -8" />
      </g>

      <!-- 题签 -->
      <g class="title" :transform="portrait ? `translate(${view.w / 2} 72)` : 'translate(70 92)'" :text-anchor="portrait ? 'middle' : 'start'">
        <text class="t1">回放不夜城 · 城防舆图</text>
        <text class="t2" y="32">
          <template v-if="viewer">巡夜人 {{ viewer.nickname }} · 已克 {{ summary.won }} / {{ summary.total }} 城 · 铜钱 {{ summary.points }}</template>
          <template v-else>天下 {{ summary.total }} 城，待君巡夜</template>
        </text>
      </g>
      <g v-if="!portrait" class="compass" :transform="`translate(${view.w - 86} 92)`">
        <circle r="30" /><circle r="22" class="thin" />
        <path d="M0 -26 L6 0 L0 26 L-6 0 Z" />
        <text y="-36">北</text>
      </g>

      <!-- 驿道与烽燧 -->
      <g v-for="r in roads" :key="r.key">
        <path class="road" :class="{ lit: r.lit }" :d="r.d" />
        <g class="beacon" :class="{ lit: r.lit }" :transform="`translate(${r.bx} ${r.by})`">
          <path d="M-6 6 L-4 -8 L4 -8 L6 6 Z" />
          <path v-if="r.lit" class="fire" d="M0 -22 Q5 -14 0 -9 Q-5 -14 0 -22 Z" />
        </g>
      </g>

      <!-- 城 -->
      <g v-for="n in nodes" :key="n.c.channel_id" class="city" :class="[n.state, { sel: n.c.channel_id === sel }]"
        :transform="`translate(${n.x} ${n.y})`" role="button" tabindex="0"
        :aria-label="`${n.name}，${STATE_NAME[n.state]}，${n.total} ${n.unit}可闯，已破 ${n.cleared}`"
        @click="select(n)" @dblclick="enter(n)" @focus="select(n)" @keydown.enter.prevent="enter(n)">
        <g :transform="`scale(${n.r / 34})`">
          <rect class="hit" x="-64" y="-66" width="128" height="104" />
          <ellipse v-if="n.state !== 'new'" class="glow" cy="-6" rx="96" ry="76" fill="url(#lamp)" />
          <ellipse class="ring" cy="-10" rx="74" ry="58" />
          <ellipse class="shadow" cy="31" rx="70" ry="6" />
          <!-- 墙后楼宇 -->
          <g v-for="(h, i) in houses(n)" :key="i" class="house" :class="h.cls">
            <rect :x="h.x - 6" :y="-h.tall" width="12" :height="h.tall" />
            <rect class="win" :x="h.x - 2.5" :y="-h.tall + 4" width="5" height="5" />
            <path class="roof" :d="roof(h.x, -h.tall, 10, 6)" />
          </g>
          <!-- 城墙、雉堞、门洞 -->
          <rect v-for="x in MERLONS" :key="x" class="merlon" :x="x" y="-5" width="5" height="5" />
          <path class="wall" d="M-56 30 L56 30 L52 0 L-52 0 Z" />
          <path class="brick" d="M-54 10 L54 10 M-55 20 L55 20" />
          <path class="arch" d="M-8 30 L-8 19 A8 8 0 0 1 8 19 L8 30 Z" />
          <!-- 角楼 -->
          <g v-for="x in [-48, 48]" :key="'c' + x" class="tower">
            <rect class="body" :x="x - 6" y="-11" width="12" height="11" />
            <path class="roof" :d="roof(x, -10, 11, 7)" />
          </g>
          <!-- 门楼：台基 + 两层楼阁 -->
          <g class="tower gate">
            <rect class="base" x="-19" y="-7" width="38" height="7" />
            <rect class="body" x="-14" y="-19" width="28" height="12" />
            <path class="pillar" d="M-7 -19 L-7 -7 M0 -19 L0 -7 M7 -19 L7 -7" />
            <rect class="win" x="-5.5" y="-16" width="4" height="6" /><rect class="win" x="1.5" y="-16" width="4" height="6" />
            <path class="roof" :d="roof(0, -18, 25, 7)" />
            <rect class="body" x="-9" y="-32" width="18" height="8" />
            <path class="roof" :d="roof(0, -31, 17, 8)" />
            <path class="ridge" d="M-10 -39 L10 -39 M-11 -41 L-9 -38 M11 -41 L9 -38" />
          </g>
          <g v-if="n.state === 'won'" class="flag" transform="translate(0 -40)">
            <line y2="-24" />
            <path d="M0 -24 L22 -19 L0 -13 Z" />
          </g>
          <g v-if="n.state === 'won'" class="seal" transform="translate(66 -34) rotate(10)">
            <rect x="-14" y="-14" width="28" height="28" rx="2" />
            <text y="7">克</text>
          </g>
        </g>
        <text class="name" :y="(n.r / 34) * 32 + 34">{{ n.short }}</text>
        <text class="sub" :y="(n.r / 34) * 32 + 56">{{ STATE_NAME[n.state] }} · 破 {{ n.cleared }} / {{ n.total }} {{ n.unit }}</text>
      </g>

      <!-- 图例 -->
      <g class="legend" :transform="`translate(${portrait ? 40 : 60} ${view.h - (portrait ? 54 : 62)})`">
        <g><rect class="lg-wall" x="-8" y="-8" width="16" height="16" /><text x="16" y="5">未至</text></g>
        <g transform="translate(82 0)"><rect class="lg-wall on" x="-8" y="-8" width="16" height="16" /><text x="16" y="5">在攻</text></g>
        <g transform="translate(164 0)"><rect class="lg-wall won" x="-8" y="-8" width="16" height="16" /><text x="16" y="5">已克</text></g>
        <g v-if="!portrait" transform="translate(250 0)"><path class="road lit" d="M-10 0 L22 0" /><text x="30" y="5">驿道 · 两城皆至则通</text></g>
      </g>
    </svg>

    <!-- 城志卷宗 -->
    <aside v-if="current" class="dossier" aria-live="polite">
      <h4>城 志</h4>
      <h2>{{ current.name }}</h2>
      <p v-if="current.c.city_intro" class="intro">{{ current.c.city_intro }}</p>
      <div class="row"><span>出自直播间</span><b>{{ current.c.name }}</b></div>
      <div class="row"><span>{{ SCENE_NAME[current.c.scene] }}</span><b>{{ current.total }} {{ current.unit }}可闯</b></div>
      <div class="row"><span>已破</span><b>{{ current.cleared }} / {{ current.total }}</b></div>
      <div class="row"><span>铜钱</span><b>{{ current.points }}</b></div>
      <button class="go" type="button" @click="enter(current)">{{ current.state === 'new' ? '入 城' : current.state === 'won' ? '再 巡' : '续 攻' }} ⇢</button>
      <span v-if="current.state === 'won'" class="stamp">已克</span>
    </aside>
    </div>

    <div v-if="state === 'loading'" class="boot brush">展 卷 中</div>
    <div v-else-if="state === 'error'" class="boot"><p>{{ error }}</p></div>
    <div v-else-if="!nodes.length" class="boot"><p>舆图尚空，诸城未筑。改日再来巡夜。</p></div>
  </main>
</template>

<style scoped>
.atlas { --silk: #e4d5b2; --silk-2: #d4c095; --ink: #33261a; --ink-soft: rgba(51, 38, 26, 0.55); --ochre: #8a5a2c;
  --seal: #a3312a; --lamp: #e3893a; --gold: #b8975a; --water: #7f9a94;
  position: relative; min-height: 100vh; padding: 16px; background: #08090b; font-family: var(--serif); color: var(--ink);
  display: grid; place-items: center; }
.sheet { position: relative; width: min(100%, calc((100vh - 32px) * 5 / 3)); }
.portrait .sheet { width: min(100%, 560px); }
.map { display: block; width: 100%; height: auto; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); border-radius: 3px; }
.silk { fill: var(--silk); }
.frame { fill: none; stroke: var(--ochre); stroke-width: 3; }
.frame.thin { stroke-width: 1; }
.river { fill: none; stroke: rgba(127, 154, 148, 0.35); stroke-width: 26; stroke-linecap: round; }
.river-in { fill: none; stroke: rgba(51, 38, 26, 0.35); stroke-width: 1.2; stroke-dasharray: 14 10; }
.mount path { fill: rgba(92, 108, 92, 0.2); stroke: var(--ink-soft); stroke-width: 1.4; stroke-linejoin: round; }
.mount .hatch { fill: none; stroke-width: 1; }
.title .t1 { font-family: var(--brush); font-size: 40px; fill: var(--ink); letter-spacing: 0.06em; }
.title .t2 { font-size: 15px; fill: var(--ochre); }
.portrait .title .t1 { font-size: 30px; }
.portrait .title .t2 { font-size: 13px; }
.compass circle { fill: none; stroke: var(--ochre); stroke-width: 1.4; }
.compass circle.thin { stroke-width: 0.8; stroke-dasharray: 2 3; }
.compass path { fill: var(--seal); opacity: 0.85; }
.compass text { font-family: var(--brush); font-size: 22px; fill: var(--seal); text-anchor: middle; }

.road { fill: none; stroke: var(--ink-soft); stroke-width: 2.4; stroke-dasharray: 8 7; stroke-linecap: round; }
.road.lit { stroke: var(--seal); stroke-width: 3; animation: march 1.6s linear infinite; }
@keyframes march { to { stroke-dashoffset: -30; } }
.beacon path { fill: var(--silk-2); stroke: var(--ink); stroke-width: 1.4; }
.beacon .fire { fill: var(--lamp); stroke: none; animation: flicker 0.9s ease-in-out infinite alternate; transform-origin: 0 -9px; }
@keyframes flicker { from { transform: scaleY(0.8); opacity: 0.75; } to { transform: scaleY(1.15); opacity: 1; } }

.city { cursor: pointer; outline: none; }
.city .ring { fill: none; stroke: transparent; stroke-width: 1.5; stroke-dasharray: 6 6; }
.city.sel .ring, .city:focus-visible .ring { stroke: var(--seal); animation: march 3s linear infinite; }
.city .hit { fill: transparent; }
.city .shadow { fill: rgba(51, 38, 26, 0.16); }
.city .wall { fill: var(--silk-2); stroke: var(--ink); stroke-width: 1.6; stroke-linejoin: round; }
.city .brick { fill: none; stroke: rgba(51, 38, 26, 0.35); stroke-width: 0.8; stroke-dasharray: 6 3; }
.city .merlon { fill: var(--silk-2); stroke: var(--ink); stroke-width: 1.2; }
.city .arch { fill: var(--ink); }
.city .tower .body, .city .tower .base, .city .house rect { fill: var(--silk); stroke: var(--ink); stroke-width: 1.2; }
.city .tower .base { fill: var(--silk-2); }
.city .pillar, .city .ridge { fill: none; stroke: var(--ink); stroke-width: 1.2; }
.city .roof { fill: var(--ink); }
.city .win, .city .house .win { fill: var(--ink); stroke: none; }
.city.on .arch, .city.won .arch, .city.on .gate .win, .city.won .gate .win { fill: var(--lamp); }
.city .house.on .win { fill: var(--lamp); }
.city .house.won .roof { fill: var(--seal); }
.city .house.won .win { fill: var(--lamp); }
.city .flag line { stroke: var(--ink); stroke-width: 1.6; }
.city .flag path { fill: var(--seal); animation: wave 1.4s ease-in-out infinite alternate; transform-origin: 0 -19px; }
@keyframes wave { to { transform: skewY(-8deg) scaleX(0.9); } }
.city .seal rect { fill: none; stroke: var(--seal); stroke-width: 2.2; }
.city .seal text { font-family: var(--brush); font-size: 20px; fill: var(--seal); text-anchor: middle; }
.city .name { font-family: var(--brush); font-size: 26px; fill: var(--ink); text-anchor: middle; }
.city .sub { font-size: 13px; fill: var(--ochre); text-anchor: middle; }
.city .name, .city .sub { paint-order: stroke; stroke: var(--silk); stroke-width: 5px; stroke-linejoin: round; } /* 驿道从题名下穿过时让开 */
.city.new .wall, .city.new .merlon { fill: #cdbb93; }
.city.new .name { fill: rgba(51, 38, 26, 0.7); }
.city:hover .wall, .city:hover .merlon { fill: #e9d9b0; }

.legend text { font-size: 13px; fill: var(--ink); }
.lg-wall { fill: #cdbb93; stroke: var(--ink); stroke-width: 1.4; }
.lg-wall.on { fill: var(--lamp); }
.lg-wall.won { fill: var(--seal); stroke: var(--seal); }

.dossier { position: absolute; right: 3%; top: 50%; transform: translateY(-50%); width: clamp(220px, 24%, 300px); max-height: 86%; overflow-y: auto; padding: 18px 20px 18px 34px;
  background: repeating-linear-gradient(180deg, transparent 0 27px, rgba(90, 64, 34, 0.16) 27px 28px), linear-gradient(180deg, #e8dcc0, #d9c8a2);
  border-radius: 2px; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45), inset 0 0 40px rgba(120, 86, 40, 0.18); }
.dossier::before { content: ''; position: absolute; left: 12px; top: 14px; bottom: 14px; width: 2px;
  background: repeating-linear-gradient(180deg, var(--ochre) 0 6px, transparent 6px 22px); opacity: 0.7; }
.dossier h4 { margin: 0; font-size: 13px; letter-spacing: 0.35em; color: var(--ochre); font-weight: 600; }
.dossier h2 { margin: 4px 0 8px; font-family: var(--brush); font-weight: 400; font-size: 32px; color: #6b2a20; line-height: 1.2; }
.dossier .intro { margin: 0 0 8px; font-size: 13px; line-height: 1.75; color: #4a3c2c; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 14px; line-height: 28px; }
.row b { font-weight: 600; text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go { margin-top: 12px; width: 100%; font: inherit; font-family: var(--brush); font-size: 22px; letter-spacing: 0.2em; padding: 6px 0;
  color: #f6ecd6; background: var(--seal); border: 1px solid #7a2019; border-radius: 2px; cursor: pointer; }
.go:hover { background: #b83a31; }
.go:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.stamp { position: absolute; right: 14px; top: 14px; font-family: var(--brush); color: var(--seal); border: 2px solid var(--seal);
  border-radius: 3px; padding: 2px 5px; font-size: 18px; line-height: 1.05; writing-mode: vertical-rl; transform: rotate(-8deg); opacity: 0.85; }

.boot { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; color: #d8c9a6; font-size: 16px; padding: 16px; }
.boot.brush { font-size: 40px; letter-spacing: 0.4em; color: var(--gold); }

.portrait { place-items: start center; padding-bottom: 300px; }
.portrait .dossier { position: fixed; left: 16px; right: 16px; top: auto; bottom: 16px; width: auto; transform: none; max-height: 46vh; overflow-y: auto; }
.portrait .dossier .intro { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

@media (prefers-reduced-motion: reduce) {
  .road.lit, .beacon .fire, .city .flag path, .city.sel .ring { animation: none; }
}
</style>
