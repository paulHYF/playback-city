<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
// @ts-expect-error 引擎是原型搬来的 JS 模块，没有类型声明
import { mount } from '@/game/nightcity/engine.js'
import { ensureViewer, reportWatch, RunTracker } from '@/viewer'

const props = defineProps<{ cid: string }>()
const router = useRouter()
const root = ref<HTMLElement>()
const state = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
const message = ref('')
let engine: { dispose(): void } | undefined
let tracker: RunTracker | null = null

onMounted(async () => {
  try {
    const viewer = await ensureViewer()
    const [data, progress] = await Promise.all([api.city(props.cid), api.progress(viewer.id, props.cid)])
    if (!data.replays.some(r => r.state === 'open')) {
      state.value = 'empty'
      message.value = `「${data.city.name}」还没有生成好的讲次，先去后台生成一讲。`
      return
    }
    state.value = 'ready'
    document.title = `${data.city.name} · 回放不夜城`
    engine = mount(root.value!, { ...data, player: { ...data.player, viewerId: viewer.id, nickname: viewer.nickname }, progress, viewer }, {
      onEnterPalace: (r: { id: string }, opt?: { resume?: { runId: string } | null }) => {
        tracker = new RunTracker(viewer.id, r.id, opt?.resume?.runId)
      },
      onState: (snap: Record<string, unknown>) => tracker?.saveState(snap),
      track: (type: string, p: Record<string, unknown>) => tracker?.track({ type, ...p }),
      onWatched: (replayId: string, source: string, ranges: number[][]) => reportWatch(viewer.id, replayId, source, ranges),
      onFinish: (result: string, stats: { points: number; roomsDone: number; lamps: number }) => {
        tracker?.finish(result, stats)
        tracker = null
      },
      onExit: () => router.push({ path: '/', query: { from: props.cid } }),
      openHandout: (rid: string) => window.open(router.resolve(`/handout/${rid}`).href, '_blank')
    })
  } catch (e) {
    state.value = 'error'
    message.value = (e as Error).message
  }
})

onBeforeUnmount(() => {
  tracker?.flush()
  engine?.dispose()
})
</script>

<template>
  <div ref="root" class="nc">
    <div id="screen" tabindex="0" aria-label="回放不夜城：第一人称 3D 场景"><canvas id="cv"></canvas></div>
    <div class="vignette"></div>
    <div id="flash"></div>
    <div class="watch" id="watch"><div class="plate" id="plate">子时</div><div class="meta" id="watchMeta"></div></div>
    <div id="where">回放广场</div>
    <button type="button" id="leave" class="btn dark" title="回到城防舆图首页">⇠ 出城 · 回首页</button>
    <div class="paper bound" id="dossier"></div>
    <div class="paper bound" id="quest" hidden></div>
    <canvas id="mm" width="92" height="76" aria-hidden="true"></canvas>
    <div id="ahead" hidden></div>
    <div id="foe" hidden></div>
    <div id="toast" hidden></div>
    <div class="hint" id="hint"></div>
    <div id="fade"><span id="fadeText"></span></div>
    <div id="modal" hidden><div class="paper bound" id="dialog" role="dialog" aria-modal="true"></div></div>
    <div id="player" hidden>
      <div class="main"><div class="ttl" id="pTtl"></div><h3 id="pName"></h3><div id="video"></div><div class="range" id="pRange"></div>
        <div class="btns"><button class="btn dark" id="pClose" type="button">收起卷宗，回到城中（Esc）</button></div></div>
      <div class="paper bound side" id="pSide"></div>
    </div>
    <div class="pad" aria-label="触屏方向键">
      <button type="button" data-act="left" aria-label="左转">↺</button>
      <button type="button" data-act="fwd" aria-label="前进">▲</button>
      <button type="button" data-act="right" aria-label="右转">↻</button>
      <button type="button" data-act="sl" aria-label="左移">◀</button>
      <button type="button" data-act="back" aria-label="后退">▼</button>
      <button type="button" data-act="sr" aria-label="右移">▶</button>
    </div>
    <button type="button" class="strike" data-act="strike" aria-label="举灯">灯</button>
    <div v-if="state !== 'ready'" class="boot">
      <p v-if="state === 'loading'" class="brush">掌 灯 中</p>
      <template v-else>
        <p class="msg">{{ message }}</p>
        <RouterLink to="/" class="btn dark">回城门</RouterLink>
      </template>
    </div>
  </div>
</template>

<style>
.nc { --paper: #e8dcc0; --paper-2: #d9c8a2; --paper-line: rgba(90, 64, 34, 0.16);
    --ochre: #8a5a2c; --gold: #b8975a; --gold-dim: #8d7445; --lamp: #e3893a; --seal: #a3312a;
    --text-ink: #2b2219; --text-mute: #6e6250;
    --serif: 'Noto Serif SC', 'Songti SC', 'STSong', serif; --brush: 'Ma Shan Zheng', 'STKaiti', serif; }
.nc * { box-sizing: border-box; }
.nc { position: fixed; inset: 0; z-index: 10; margin: 0; background: #08090b; color: var(--paper); font-family: var(--serif); overflow: hidden; }
.nc [hidden] { display: none !important; }
.nc #screen { position: fixed; inset: 0; outline: none; }
.nc #cv { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.nc .vignette { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.5)); }
.nc .paper { background: repeating-linear-gradient(180deg, transparent 0 27px, var(--paper-line) 27px 28px), linear-gradient(180deg, var(--paper), var(--paper-2)); color: var(--text-ink); border-radius: 2px; box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 40px rgba(120, 86, 40, 0.18); position: relative; }
.nc .paper.bound { padding-left: 30px; }
.nc .paper.bound::before { content: ''; position: absolute; left: 10px; top: 14px; bottom: 14px; width: 2px; background: repeating-linear-gradient(180deg, var(--ochre) 0 6px, transparent 6px 22px); opacity: 0.7; }
.nc .paper h4 { margin: 0 0 6px; font-size: 13px; letter-spacing: 0.35em; color: var(--ochre); font-weight: 600; }
.nc .seal { position: absolute; font-family: var(--brush); color: var(--seal); border: 2px solid var(--seal); border-radius: 3px; padding: 2px 5px; font-size: 16px; line-height: 1.05; transform: rotate(-8deg); opacity: 0.85; writing-mode: vertical-rl; pointer-events: none; }
.nc .watch { position: fixed; left: 20px; top: 18px; display: flex; gap: 12px; align-items: center; pointer-events: none; }
.nc .watch .plate { writing-mode: vertical-rl; font-family: var(--brush); font-size: 30px; letter-spacing: 0.15em; color: #f0dfb6; background: linear-gradient(90deg, #3a2516, #26170e); padding: 12px 8px; border: 1px solid var(--gold-dim); box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
.nc .watch .meta { font-size: 13px; line-height: 1.75; color: #d8c9a6; text-shadow: 0 1px 4px #000; }
.nc .watch .meta b { color: var(--lamp); font-weight: 600; }
.nc .watch.day .plate { background: linear-gradient(90deg, #e8dcc0, #d9c8a2); color: #2b2219; border-color: var(--ochre); }
.nc .watch.day .meta { color: #2b2219; text-shadow: 0 1px 2px rgba(255,255,255,0.4); }
.nc #dossier { position: fixed; right: 18px; top: 16px; width: 256px; padding: 14px 16px 12px 30px; }
.nc .row { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; line-height: 28px; gap: 8px; }
.nc .row b { font-size: 17px; }
.nc .lamps { display: flex; gap: 5px; }
.nc .lamps i { width: 11px; height: 15px; border-radius: 5px 5px 4px 4px; background: radial-gradient(circle at 50% 40%, #ffd08a, var(--lamp) 60%, #9a4a16); box-shadow: 0 0 8px rgba(227,137,58,0.7); }
.nc .lamps i.off { background: #4a4038; box-shadow: none; }
.nc .slots { display: flex; gap: 6px; margin: 4px 0 6px; flex-wrap: wrap; }
.nc .slot { min-width: 44px; height: 44px; padding: 0 4px; border: 1px solid rgba(110, 82, 46, 0.45); border-radius: 2px; display: grid; place-items: center; font-size: 11px; color: var(--text-mute); background: rgba(255,255,255,0.18); text-align: center; line-height: 1.2; }
.nc .slot.has { color: var(--text-ink); border-color: var(--ochre); background: rgba(227,137,58,0.14); font-weight: 600; }
.nc .task { font-size: 13px; line-height: 1.6; color: var(--text-ink); border-top: 1px dashed rgba(110,82,46,0.4); padding-top: 6px; margin-top: 4px; }
.nc .task b { color: var(--seal); }
.nc .tiny { font-size: 12px; color: var(--text-mute); line-height: 1.6; }
.nc .btn { font: inherit; font-size: 13px; padding: 6px 12px; border: 1px solid var(--ochre); color: var(--text-ink); background: rgba(227,137,58,0.12); border-radius: 2px; cursor: pointer; }
.nc .btn:hover:not(:disabled) { background: rgba(227,137,58,0.28); }
.nc .btn:disabled { opacity: 0.45; cursor: not-allowed; }
.nc .btn.red { background: var(--seal); border-color: var(--seal); color: #f6ecd6; }
.nc .btn.dark { color: #f0dfb6; border-color: var(--gold-dim); background: rgba(13,15,19,0.6); }
.nc .btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.nc #mm { position: fixed; right: 18px; bottom: 18px; width: 150px; image-rendering: pixelated; border: 1px solid rgba(184, 151, 90, 0.5); background: rgba(8, 10, 12, 0.65); }
.nc #leave { position: fixed; left: 20px; bottom: 44px; z-index: 35; font-family: var(--brush); font-size: 18px; letter-spacing: 0.1em; padding: 6px 14px; }
@media (pointer: coarse) { .nc #leave { bottom: auto; top: 140px; } }
.nc #where { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); font-family: var(--brush); font-size: 26px; color: #e3d3a8; text-shadow: 0 2px 8px #000; pointer-events: none; letter-spacing: 0.15em; white-space: nowrap; }
.nc #ahead { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); font-size: 14px; color: #f0dfb6; background: rgba(13, 15, 19, 0.78); border: 1px solid rgba(184, 151, 90, 0.5); padding: 6px 14px; border-radius: 2px; pointer-events: none; white-space: nowrap; }
.nc #toast { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); font-size: 14px; color: #f0dfb6; background: rgba(13, 15, 19, 0.88); border: 1px solid var(--gold); padding: 6px 16px; border-radius: 2px; pointer-events: none; z-index: 40; }
.nc .hint { position: fixed; left: 20px; bottom: 16px; font-size: 12px; color: rgba(232, 220, 192, 0.75); text-shadow: 0 1px 3px #000; pointer-events: none; }
.nc kbd { font-family: ui-monospace, monospace; font-size: 11px; border: 1px solid rgba(232,220,192,0.4); border-radius: 3px; padding: 0 4px; }
.nc #fade { position: fixed; inset: 0; background: #05070a; opacity: 0; pointer-events: none; transition: opacity 0.45s; display: grid; place-items: center; z-index: 30; }
.nc #fade.on { opacity: 1; }
.nc #fade span { font-family: var(--brush); font-size: 54px; color: var(--gold); letter-spacing: 0.4em; }
.nc #flash { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 30%, rgba(163, 49, 42, 0.65)); opacity: 0; transition: opacity 0.5s; z-index: 5; }
.nc #flash.on { opacity: 1; transition: none; }
.nc #modal { position: fixed; inset: 0; background: rgba(4, 5, 7, 0.62); display: grid; place-items: center; z-index: 20; padding: 16px; }
.nc #dialog { width: min(680px, 100%); max-height: 90vh; overflow-y: auto; padding: 22px 26px 22px 40px; }
.nc #dialog h2 { margin: 2px 0 10px; font-family: var(--brush); font-weight: 400; font-size: 32px; color: #6b2a20; }
.nc #dialog .q { font-size: 18px; font-weight: 600; line-height: 1.6; margin: 6px 0 8px; }
.nc #dialog pre { margin: 6px 0 10px; font: 13px/1.6 ui-monospace, Menlo, monospace; background: rgba(43,34,25,0.08); padding: 8px 10px; border-left: 3px solid var(--ochre); white-space: pre-wrap; }
.nc .slips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0 4px; }
.nc .slip { font: inherit; text-align: left; padding: 10px 12px; background: linear-gradient(90deg,#c9a76a,#e3c88f,#c9a76a); color: #2b2219; border: 1px solid #8d6a3a; border-radius: 3px 3px 10px 10px; cursor: pointer; font-size: 14px; line-height: 1.5; box-shadow: 0 4px 10px rgba(0,0,0,0.25); }
.nc .slip:hover:not(:disabled) { transform: translateY(-2px); }
.nc .slip small { display: block; font-size: 11px; color: #6e5230; }
.nc .slip:disabled { background: #b8a888; opacity: 0.55; cursor: not-allowed; }
.nc .slip.good { outline: 3px solid var(--lamp); }
.nc .quote { border-top: 1px dashed rgba(110,82,46,0.5); margin-top: 12px; padding-top: 10px; font-size: 14px; line-height: 1.75; }
.nc .quote .k { color: var(--ochre); letter-spacing: 0.2em; font-size: 12px; }
.nc .trace { font-size: 13px; color: #7a2a20; line-height: 1.7; margin-top: 6px; }
.nc .bar { height: 6px; background: rgba(43,34,25,0.15); margin: 8px 0; }
.nc .bar i { display: block; height: 100%; background: var(--seal); transition: width 0.2s linear; }
.nc .clip { width: 100%; aspect-ratio: 16/9; position: relative; overflow: hidden; background: #000; border: 1px solid rgba(110,82,46,0.6); display: block; }
.nc .hits { max-height: 220px; overflow-y: auto; margin: 8px 0; border: 1px solid rgba(110,82,46,0.3); }
.nc .hit { display: flex; gap: 10px; padding: 6px 10px; font-size: 14px; cursor: pointer; border-bottom: 1px dashed rgba(110,82,46,0.25); }
.nc .hit:hover, .nc .hit.on { background: rgba(227,137,58,0.18); }
.nc .hit time { color: var(--ochre); font-family: ui-monospace, monospace; font-size: 12px; padding-top: 2px; }
.nc .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.nc .chip { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid var(--ochre); border-radius: 12px; background: transparent; color: var(--text-ink); cursor: pointer; }
.nc input.search { font: inherit; width: 100%; padding: 8px 10px; border: 1px solid var(--ochre); background: rgba(255,255,255,0.4); border-radius: 2px; }
.nc .seq { min-height: 44px; padding: 8px; border: 1px dashed var(--ochre); font-size: 16px; line-height: 1.6; margin: 8px 0; }
.nc .shop { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.nc .shop img { width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid rgba(110,82,46,0.5); background: #2a1d14; }
.nc .price { font-size: 30px; font-weight: 900; color: var(--seal); }
.nc .say { font-size: 15px; line-height: 1.8; }
.nc #quest { position: fixed; left: 20px; top: 128px; width: 264px; padding: 10px 14px 10px 30px; z-index: 11; }
.nc #quest .q-head { display: flex; justify-content: space-between; align-items: baseline; cursor: pointer; user-select: none; font-size: 14px; }
.nc #quest .q-head b { color: var(--seal); font-family: var(--brush); font-weight: 400; font-size: 18px; letter-spacing: 0.08em; }
.nc #quest .q-head span { font-size: 12px; color: var(--ochre); }
.nc #quest .q-steps { margin: 6px 0 4px; padding-left: 18px; font-size: 13px; line-height: 1.7; color: var(--text-ink); }
.nc #quest .q-steps li.done { color: var(--text-mute); text-decoration: line-through; }
.nc #quest .q-steps li.on { color: var(--seal); font-weight: 600; }
.nc #quest .q-where { font-size: 13px; color: var(--text-ink); border-top: 1px dashed rgba(110,82,46,0.4); padding-top: 5px; }
.nc #quest .q-where b { color: var(--seal); }
.nc #quest .q-tip { font-size: 12px; color: var(--text-mute); line-height: 1.6; margin-top: 3px; }
@media (max-width: 720px) { .nc #quest { top: auto; bottom: 230px; width: 220px; } }
.nc #foe { position: fixed; left: 50%; top: 104px; transform: translateX(-50%); min-width: 260px; max-width: min(520px, 92vw); padding: 6px 14px 8px; background: rgba(13, 15, 19, 0.82); border: 1px solid rgba(163, 49, 42, 0.7); border-radius: 2px; color: #f0dfb6; font-size: 14px; text-align: center; pointer-events: none; z-index: 12; }
.nc #foe b { color: #ffd2c6; font-family: var(--brush); font-weight: 400; font-size: 18px; letter-spacing: 0.1em; }
.nc .foe-bar { height: 6px; margin: 5px 0 3px; background: rgba(232, 220, 192, 0.18); }
.nc .foe-bar i { display: block; height: 100%; background: linear-gradient(90deg, #a3312a, #e3893a); transition: width 0.25s; }
.nc .foe-bar.boss { height: 9px; }
.nc .foe-tip { font-size: 12px; color: #c8b890; }
.nc .foe-warn { font-size: 13px; color: #ffb070; font-weight: 600; animation: nc-blink 0.5s steps(2) infinite; }
@keyframes nc-blink { 50% { opacity: 0.35; } }
.nc .foe-card { border-left: 3px solid var(--seal); padding: 6px 10px; margin: 8px 0; background: rgba(163, 49, 42, 0.07); font-size: 14px; line-height: 1.6; }
.nc .claim { font-size: 17px; font-family: var(--brush); color: #6b2a20; margin: 10px 0 4px; padding: 8px 12px; border: 1px dashed var(--seal); }
.nc .boss-hp { height: 10px; background: rgba(43, 34, 25, 0.15); margin: 6px 0 4px; }
.nc .boss-hp i { display: block; height: 100%; background: linear-gradient(90deg, #6b2a20, #a3312a); }
.nc .boss-steps { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; margin-bottom: 4px; }
.nc .boss-steps span { padding: 1px 8px; border: 1px solid rgba(110, 82, 46, 0.4); border-radius: 10px; color: var(--text-mute); }
.nc .boss-steps span.on { border-color: var(--seal); color: var(--seal); font-weight: 600; }
.nc .boss-steps span.done { text-decoration: line-through; opacity: 0.6; }
.nc .boss-plan { margin: 10px 0; font-size: 14px; line-height: 1.9; }
.nc .boss-plan b { color: var(--seal); font-family: var(--brush); font-weight: 400; margin-right: 6px; }
.nc .chip.bad { border-color: var(--seal); background: rgba(163, 49, 42, 0.2); }
.nc .chip:disabled { opacity: 0.35; }
@media (max-width: 640px) { .nc .shop { grid-template-columns: 1fr; }
.nc .slips { grid-template-columns: 1fr; }
.nc #dossier { width: 210px; } }
.nc #player { position: fixed; inset: 0; background: rgba(4,5,7,0.88); z-index: 25; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; padding: 28px; }
.nc #player .main { display: flex; flex-direction: column; min-width: 0; }
.nc #player .ttl { font-size: 13px; color: #a99d86; letter-spacing: 0.3em; }
.nc #player h3 { margin: 2px 0 12px; font-family: var(--brush); font-weight: 400; font-size: 34px; color: #e3d3a8; }
.nc #player #video { width: 100%; aspect-ratio: 16 / 9; max-height: 72vh; background: #000; border: 1px solid #6e5a37; }
.nc #player .range { font-size: 13px; color: var(--lamp); margin-top: 8px; }
.nc #player .side { padding: 16px 16px 16px 30px; overflow-y: auto; }
.nc #player .ch { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; line-height: 28px; cursor: pointer; }
.nc #player .ch:hover { color: var(--seal); }
@media (max-width: 860px) { .nc #player { grid-template-columns: 1fr; }
.nc #player .side { max-height: 30vh; } }
.nc .pad { position: fixed; left: 16px; bottom: 44px; display: none; grid-template-columns: repeat(3, 52px); gap: 6px; z-index: 15; }
.nc .pad button, .nc .strike { font: inherit; font-size: 20px; height: 52px; border: 1px solid rgba(184, 151, 90, 0.6); background: rgba(13, 15, 19, 0.6); color: #f0dfb6; border-radius: 4px; touch-action: none; user-select: none; }
.nc .strike { position: fixed; right: 18px; bottom: 120px; width: 64px; height: 64px; border-radius: 50%; font-family: var(--brush); font-size: 26px; display: none; z-index: 15; }
@media (pointer: coarse) { .nc .pad { display: grid; } .nc .strike { display: block; } .nc .hint { display: none; } }
.nc .boot { position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center; background: #08090b; z-index: 50; padding: 16px; }
.nc .boot .brush { font-size: 40px; letter-spacing: 0.4em; color: var(--gold); }
.nc .boot .msg { font-size: 16px; color: #d8c9a6; max-width: 480px; }
.nc .boot .btn { justify-self: center; text-decoration: none; }
</style>
