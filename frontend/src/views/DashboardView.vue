<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'
// @ts-expect-error 3D 模块是 JS，没有类型声明
import { createSkyline, heatColor } from '@/game/skyline/skyline.js'
import type { Dashboard, ReplayDashboard } from '@/types/city'
import { fmt } from '@/utils'

const props = defineProps<{ cid: string }>()
const dash = ref<Dashboard>()
const details = ref<Record<string, ReplayDashboard>>({})
const active = ref('')
const pickedRoom = ref<number | null>(null)
const error = ref('')
const canvas = ref<HTMLCanvasElement>()
const tip = ref<{ x: number; y: number; text: string } | null>(null)
let sky: { setLit(id: string, n: number): void; dispose(): void } | undefined

const cur = computed(() => details.value[active.value])
const pct = (v: number) => `${Math.round(v * 100)}%`
const unit = computed(() => (dash.value?.channel.scene === 'commerce' ? '场' : '讲'))
const buildingName = (rid: string, fallback: string) => dash.value?.channel.city?.buildings.find(b => b.replay === rid)?.name || fallback
const maxReached = computed(() => Math.max(1, ...(cur.value?.funnel.map(f => f.reached) || [1])))
const heatMax = computed(() => Math.max(1, ...(cur.value?.reviveHeat.map(h => h.seconds) || [1])))

// 时间轴：按真实通关时间逐窗点亮通关楼
const t0 = computed(() => dash.value?.timeline[0]?.ts || 0)
const t1 = computed(() => dash.value?.timeline.at(-1)?.ts || 0)
const cursor = ref(1)
const cursorTs = computed(() => t0.value + (t1.value - t0.value) * cursor.value)
let playTimer: number | undefined
const playing = ref(false)

function applyCursor() {
  if (!dash.value || !sky) return
  for (const b of dash.value.buildings) {
    sky.setLit(`gate:${b.id}`, dash.value.timeline.filter(e => e.replay === b.id && e.ts <= cursorTs.value).length)
  }
}

function play() {
  if (playing.value) { stop(); return }
  playing.value = true
  cursor.value = 0
  playTimer = window.setInterval(() => {
    cursor.value = Math.min(1, cursor.value + 0.01)
    applyCursor()
    if (cursor.value >= 1) stop()
  }, 60)
}
function stop() {
  playing.value = false
  clearInterval(playTimer)
}

const fmtTs = (ts: number) => (ts ? new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

function showTip(e: MouseEvent, text: string) {
  tip.value = { x: e.clientX + 12, y: e.clientY + 12, text }
}

onMounted(async () => {
  try {
    dash.value = await api.dashboard(props.cid)
    const ready = dash.value.buildings.filter(b => b.ready)
    const ds = await Promise.all(ready.map(b => api.replayDashboard(props.cid, b.id)))
    details.value = Object.fromEntries(ds.map(d => [d.id, d]))
    active.value = ready[0]?.id || ''
    document.title = `${dash.value.channel.city?.name || dash.value.channel.name} · 讲师大盘`
    const districts = ready.map((b, i) => {
      const d = ds[i]
      const towers = d.rooms.map(rm => {
        const reached = d.funnel[rm.index]?.reached || 0
        return {
          id: `room:${b.id}:${rm.index}`, replay: b.id, room: rm.index, kind: 'room',
          label: `${rm.index + 1} · ${pct(rm.failRate)}`, windows: reached, lit: Math.round(reached * (1 - rm.failRate)),
          heat: rm.failRate, beacon: rm.failRate > 0.5
        }
      })
      towers.push({ id: `gate:${b.id}`, replay: b.id, room: null, kind: 'gate', label: `通关 ${b.cleared}`, windows: b.players, lit: b.cleared, heat: 0, beacon: false } as never)
      return { id: b.id, label: `第${b.no}${unit.value} · ${buildingName(b.id, b.title.slice(0, 10))}`, towers }
    })
    if (districts.length && canvas.value) {
      sky = createSkyline(canvas.value, { districts }, {
        onPick: (t: { replay: string; room: number | null }) => { active.value = t.replay; pickedRoom.value = t.room }
      })
    }
  } catch (e) {
    error.value = (e as Error).message
  }
})

onBeforeUnmount(() => {
  stop()
  sky?.dispose()
})
</script>

<template>
  <main class="dash">
    <header>
      <div>
        <RouterLink to="/" class="muted back">← 回放不夜城</RouterLink>
        <h1 class="brush">{{ dash?.channel.city?.name || dash?.channel.name || '讲师助教大盘' }}</h1>
        <p class="muted">讲师助教大盘 · 频道 {{ cid }}</p>
      </div>
      <RouterLink :to="`/city/${cid}`" class="btn">进城看看</RouterLink>
    </header>
    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="dash" class="kpis" aria-label="核心指标">
      <div class="kpi"><b>{{ dash.kpi.viewers }}</b><span>闯关观众</span></div>
      <div class="kpi"><b>{{ dash.kpi.runs }}</b><span>闯关局数</span></div>
      <div class="kpi"><b>{{ pct(dash.kpi.clearRate) }}</b><span>通关率</span></div>
      <div class="kpi"><b>{{ fmt(dash.kpi.avgDuration) }}</b><span>平均每局用时</span></div>
      <div class="kpi"><b>{{ dash.kpi.revives }}</b><span>复活回看次数</span></div>
    </section>

    <section v-if="dash" class="grid">
      <div class="stage">
        <canvas ref="canvas" aria-label="立体点亮城：每座楼是一间殿室，窗是到过的观众，亮窗是过关的观众" />
        <div class="legend">
          <span><i class="win lit" />亮窗 = 一位过关的观众</span>
          <span><i class="win" />暗窗 = 到过没过</span>
          <span class="ramp">错误率 <i v-for="v in [0, 0.2, 0.4, 0.6, 0.8, 1]" :key="v" :style="{ background: heatColor(v) }" /> 低 → 高</span>
          <span><i class="beacon" />信标 = 卡点（错误率 &gt; 50%）</span>
        </div>
        <div v-if="dash.timeline.length" class="timeline">
          <button type="button" class="btn" @click="play">{{ playing ? '暂停' : '▶ 回放点亮过程' }}</button>
          <input v-model.number="cursor" type="range" min="0" max="1" step="0.01" aria-label="时间轴" @input="applyCursor" />
          <span class="muted mono">{{ fmtTs(cursorTs) }}</span>
        </div>
        <p class="muted tip-line">拖动旋转，滚轮缩放，点一座楼看这间殿室的详情。</p>
      </div>

      <aside v-if="cur" class="panel">
        <nav v-if="Object.keys(details).length > 1" class="tabs">
          <button v-for="b in dash.buildings.filter(x => x.ready)" :key="b.id" type="button" :class="{ on: b.id === active }" @click="active = b.id; pickedRoom = null">
            第{{ b.no }}{{ unit }}
          </button>
        </nav>
        <h2>{{ buildingName(cur.id, cur.title) }}</h2>
        <p class="muted small">{{ cur.title }} · {{ fmt(cur.duration) }}</p>

        <div v-if="pickedRoom !== null && cur.rooms[pickedRoom]" class="room-card">
          <h3>第 {{ pickedRoom + 1 }} 室 · {{ cur.rooms[pickedRoom].title }}<span v-if="pickedRoom === cur.bossRoom" class="boss">Boss</span></h3>
          <p>闯关错误率 <b>{{ pct(cur.rooms[pickedRoom].failRate) }}</b> · 直播答题卡错误率 {{ pct(cur.rooms[pickedRoom].cardFailRate) }} · 回放 {{ fmt(cur.rooms[pickedRoom].start) }}–{{ fmt(cur.rooms[pickedRoom].end) }}</p>
          <ul>
            <li v-for="w in cur.topWrong.filter(x => x.room === pickedRoom)" :key="w.id">
              {{ w.question }} — {{ w.wrong }}/{{ w.total }} 答错，最常选「{{ w.choices[0]?.text }}」
            </li>
          </ul>
          <button type="button" class="link" @click="pickedRoom = null">收起</button>
        </div>

        <h4>殿室漏斗 · 到达人数</h4>
        <div class="bars">
          <div v-for="f in cur.funnel" :key="String(f.room)" class="bar-row" :class="{ on: f.room === pickedRoom }"
               @mousemove="showTip($event, `${f.title}：${f.reached} 局到达`)" @mouseleave="tip = null" @click="pickedRoom = f.room">
            <span class="name">{{ f.room === null ? '通关' : `${f.room + 1} · ${f.title}` }}</span>
            <span class="track"><i :style="{ width: `${(f.reached / maxReached) * 100}%` }" /></span>
            <span class="val mono">{{ f.reached }}</span>
          </div>
        </div>

        <h4>各室错误率</h4>
        <div class="bars">
          <div v-for="r in cur.rooms" :key="r.index" class="bar-row" :class="{ on: r.index === pickedRoom }"
               @mousemove="showTip($event, `${r.title}：闯关 ${r.answered} 次作答，错误率 ${pct(r.failRate)}`)" @mouseleave="tip = null" @click="pickedRoom = r.index">
            <span class="name">{{ r.index + 1 }} · {{ r.title }}<em v-if="r.index === cur.bossRoom"> Boss</em></span>
            <span class="track"><i :style="{ width: `${r.failRate * 100}%`, background: heatColor(r.failRate) }" /></span>
            <span class="val mono">{{ pct(r.failRate) }}</span>
          </div>
        </div>

        <h4>复活回看热度 · 大家在补看回放的哪里</h4>
        <div class="heatband" role="img" :aria-label="`复活回看共 ${cur.reviveHeat.reduce((a, h) => a + h.seconds, 0)} 秒`">
          <i v-for="h in cur.reviveHeat" :key="h.t" :style="{ left: `${(h.t / cur.duration) * 100}%`, width: `${(30 / cur.duration) * 100}%`, opacity: 0.25 + 0.75 * (h.seconds / heatMax) }"
             @mousemove="showTip($event, `回放 ${fmt(h.t)}–${fmt(h.t + 30)}：累计回看 ${h.seconds} 秒`)" @mouseleave="tip = null" />
          <b v-for="r in cur.rooms" :key="r.index" class="tick" :style="{ left: `${(r.start / cur.duration) * 100}%` }" />
        </div>
        <div class="axis muted mono"><span>00:00</span><span>{{ fmt(cur.duration) }}</span></div>

        <h4>错题榜 · 学员把它当成了什么</h4>
        <ol class="wrong">
          <li v-for="w in cur.topWrong" :key="w.id">
            <p><b>{{ w.keyword }}</b> · {{ w.question }} <span class="muted">{{ w.wrong }}/{{ w.total }} 答错 · 回放 {{ fmt(w.sourceTime) }}</span></p>
            <p class="small">正确：{{ w.answer }}</p>
            <p class="small muted">误选：<span v-for="c in w.choices" :key="c.text" class="chip">{{ c.text }} ×{{ c.count }}</span></p>
          </li>
        </ol>

        <h4>观众</h4>
        <table>
          <thead><tr><th>昵称</th><th>结果</th><th>积分</th><th>答错</th><th>回看</th><th>用时</th></tr></thead>
          <tbody>
            <tr v-for="v in cur.viewers" :key="v.nickname + v.startedAt">
              <td>{{ v.nickname }}</td>
              <td>{{ { cleared: '通关', dawn: '天亮', abandoned: '弃局', playing: '进行中' }[v.result] || v.result }}</td>
              <td class="mono">{{ v.points }}</td><td class="mono">{{ v.wrong }}</td><td class="mono">{{ v.revives }}</td><td class="mono">{{ fmt(v.duration) }}</td>
            </tr>
          </tbody>
        </table>
      </aside>
      <aside v-else class="panel muted">这座城还没有生成好的讲次，或还没有观众来闯关。</aside>
    </section>
    <div v-if="tip" class="tooltip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">{{ tip.text }}</div>
  </main>
</template>

<style scoped>
.dash { max-width: 1440px; margin: 0 auto; padding: 20px 16px 48px; }
header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
h1 { font-size: 40px; margin: 4px 0 0; }
header p { margin: 4px 0 0; font-size: 13px; }
.back { font-size: 13px; text-decoration: none; }
.btn { padding: 7px 14px; border: 1px solid var(--gold); border-radius: 3px; text-decoration: none; color: var(--gold-2); background: transparent; font: inherit; font-size: 14px; cursor: pointer; }
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 20px 0 16px; }
.kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; display: grid; gap: 4px; }
.kpi b { font-size: 28px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.kpi span { font-size: 12px; color: var(--muted); }
.grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(340px, 1fr); gap: 16px; align-items: start; }
.stage { background: #0c131c; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; position: sticky; top: 12px; }
canvas { width: 100%; height: 560px; display: block; cursor: grab; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 10px 14px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.win { width: 10px; height: 12px; background: #15181b; border: 1px solid #3a3f44; display: inline-block; }
.win.lit { background: #ffd08a; border-color: #ffd08a; }
.ramp i { width: 14px; height: 10px; display: inline-block; }
.beacon { width: 10px; height: 10px; border-radius: 50%; background: #ff5a3c; display: inline-block; }
.timeline { display: flex; align-items: center; gap: 12px; padding: 0 14px 10px; }
.timeline input { flex: 1; accent-color: var(--gold); }
.tip-line { font-size: 12px; padding: 0 14px 12px; margin: 0; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 16px 18px; min-width: 0; }
.panel h2 { font-family: var(--serif); font-size: 20px; margin: 0; }
.panel h4 { font-size: 13px; color: var(--gold); letter-spacing: 0.1em; margin: 20px 0 8px; font-weight: 500; }
.small { font-size: 12px; }
.tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.tabs button { font: inherit; font-size: 13px; padding: 4px 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 3px; cursor: pointer; }
.tabs button.on { border-color: var(--gold); color: var(--gold-2); }
.room-card { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--gold); border-radius: 4px; background: var(--panel-2); font-size: 13px; }
.room-card h3 { margin: 0 0 6px; font-size: 15px; font-family: var(--serif); }
.room-card ul { margin: 6px 0; padding-left: 18px; line-height: 1.7; }
.boss, .bar-row em { color: var(--cinnabar); font-style: normal; font-size: 12px; margin-left: 6px; }
.link { background: none; border: 0; color: var(--gold-2); font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
.bars { display: grid; gap: 6px; }
.bar-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 44px; gap: 8px; align-items: center; font-size: 12px; cursor: pointer; padding: 2px 0; }
.bar-row.on .name { color: var(--gold-2); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.track { height: 10px; background: var(--panel-2); border-radius: 0 4px 4px 0; }
.track i { display: block; height: 100%; background: #c9743a; border-radius: 0 4px 4px 0; min-width: 2px; }
.val { text-align: right; color: var(--muted); }
.heatband { position: relative; height: 22px; background: var(--panel-2); border-radius: 2px; }
.heatband i { position: absolute; top: 0; bottom: 0; background: #e3893a; cursor: default; }
.heatband .tick { position: absolute; top: -3px; bottom: -3px; width: 1px; background: var(--muted); opacity: 0.6; }
.axis { display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; }
.wrong { padding-left: 18px; margin: 0; display: grid; gap: 10px; }
.wrong p { margin: 0; font-size: 13px; line-height: 1.6; }
.chip { display: inline-block; border: 1px solid var(--line); border-radius: 10px; padding: 0 8px; margin: 2px 4px 0 0; color: var(--text); }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: 500; }
.tooltip { position: fixed; z-index: 100; pointer-events: none; background: var(--panel-2); border: 1px solid var(--gold); color: var(--text); font-size: 12px; padding: 6px 10px; border-radius: 3px; max-width: 320px; }
.error { color: var(--cinnabar); }
@media (max-width: 960px) { .grid { grid-template-columns: 1fr; } .stage { position: static; } canvas { height: 380px; } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
