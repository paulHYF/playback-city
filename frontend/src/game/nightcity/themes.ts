// 地宫主题模版：一套主题 = 贴图（程序绘制，64px 像素风）+ 灯光雾 + 灯具 + 粒子 + 怪物涂装 + 叫法 + 音乐调式。
// 引擎 engine.js 按 game.world.theme 取用；后台闯关配置用 THEMES 做选择与贴图预览。
// 新增主题：在这里加一项，并同步 backend/app/pipeline/schema.py 的 Theme 枚举与提示词 prompts/common.md。

type Paint = (g: CanvasRenderingContext2D, s: number, r: () => number) => void
type Scene = 'course' | 'commerce'

export interface Theme {
  name: string
  desc: string
  wall: Paint
  floor: Paint
  ceil: Paint
  panel: Paint // 嵌在墙上的装饰（窗棂、铁栅、符纸、线索板……）
  column: number | null // 殿室四角立柱颜色，null 不立柱
  fog: [number, number] // 雾色、浓度
  ambient: [number, number]
  hand: number // 随身灯颜色
  lamp: { kind: 'lantern' | 'torch' | 'bulb' | 'pearl' | 'candle'; color: number; body?: number; flicker?: number }
  particles: { color: number; count: number; size: number; vel: [number, number, number]; additive?: boolean } | null
  // 氛围摆件（props.js）：floor 摆在殿室边缘与墙角，wall 挂在左右墙面；只做氛围，不参与玩法。colors 用低饱和色，别抢玩法物件的眼
  props: { floor: string[]; wall: string[]; colors: { wood: number; metal: number; stone: number; cloth: number; accent: number; paper: number } }
  beast: { body: number; accent: number; eye: number; aura: number }
  words: { beast: string; boss: Record<Scene, string>; npc: string; portal: string; enter: string; strike: string }
  music: { scale: number[]; tempo: number; drum: 'temple' | 'heavy' | 'tick' | 'festive' | 'none' }
}

// ───────── 绘制小工具 ─────────
const rgb = (c: number[], d = 0) => `rgb(${c[0] + d},${c[1] + d},${c[2] + d})`
const vary = (r: () => number, n: number) => Math.floor(r() * n)

function bricks(g: CanvasRenderingContext2D, s: number, r: () => number, o: { mortar: string; base: number[]; v: number; rows: number; cols: number; y0?: number; y1?: number }) {
  const y0 = o.y0 ?? 0, y1 = o.y1 ?? s, h = (y1 - y0) / o.rows, w = s / o.cols
  g.fillStyle = o.mortar
  g.fillRect(0, y0, s, y1 - y0)
  for (let row = 0; row < o.rows; row++) for (let c = -1; c <= o.cols; c++) {
    g.fillStyle = rgb(o.base, vary(r, o.v))
    g.fillRect(c * w + (row % 2 ? w / 2 : 0) + 1, y0 + row * h + 1, w - 2, h - 2)
  }
}
function planks(g: CanvasRenderingContext2D, s: number, r: () => number, o: { base: number[]; v: number; n: number; gap: string; vertical?: boolean }) {
  const w = s / o.n
  g.fillStyle = o.gap
  g.fillRect(0, 0, s, s)
  for (let k = 0; k < o.n; k++) {
    g.fillStyle = rgb(o.base, vary(r, o.v))
    if (o.vertical) g.fillRect(k * w + 1, 0, w - 1, s)
    else g.fillRect(0, k * w + 1, s, w - 1)
    g.fillStyle = 'rgba(0,0,0,0.18)'
    for (let j = 0; j < 3; j++) { const p = vary(r, s); if (o.vertical) g.fillRect(k * w + 2 + vary(r, w - 4), p, 1, 6); else g.fillRect(p, k * w + 2 + vary(r, w - 4), 6, 1) }
  }
}
function speckle(g: CanvasRenderingContext2D, s: number, r: () => number, color: string, n: number, size = 1) {
  g.fillStyle = color
  for (let k = 0; k < n; k++) g.fillRect(vary(r, s), vary(r, s), size, size)
}
function frame(g: CanvasRenderingContext2D, s: number, color: string, w = 4) {
  g.fillStyle = color
  g.fillRect(0, 0, s, w); g.fillRect(0, s - w, s, w); g.fillRect(0, 0, w, s); g.fillRect(s - w, 0, w, s)
}
const solid = (color: string): Paint => (g, s) => { g.fillStyle = color; g.fillRect(0, 0, s, s) }

// ───────── 主题 ─────────
export const THEMES: Record<string, Theme> = {
  song_palace: {
    name: '宋风地宫', desc: '青砖朱柱、窗棂灯笼，克制的夜巡古风（课程默认）',
    wall: (g, s, r) => { g.fillStyle = '#231812'; g.fillRect(0, 0, s, 8); g.fillStyle = '#b8975a'; g.fillRect(0, 7, s, 1); bricks(g, s, r, { mortar: '#26292c', base: [54, 57, 61], v: 14, rows: 6, cols: 4, y0: 8, y1: 50 }); g.fillStyle = '#5c5a52'; g.fillRect(0, 50, s, 14); g.fillStyle = '#6d6a60'; g.fillRect(0, 50, s, 2) },
    floor: (g, s, r) => { g.fillStyle = '#1b1a17'; g.fillRect(0, 0, s, s); for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = rgb([56, 53, 48], vary(r, 10)); g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30) } },
    ceil: (g, s) => { g.fillStyle = '#120d0b'; g.fillRect(0, 0, s, s); g.fillStyle = '#2a1d16'; g.fillRect(0, s / 2 - 2, s, 4); g.fillRect(s / 2 - 2, 0, 4, s); g.fillStyle = '#b8975a'; g.fillRect(s / 2 - 1, s / 2 - 1, 2, 2) },
    panel: (g, s) => { const gr = g.createRadialGradient(32, 30, 4, 32, 32, 40); gr.addColorStop(0, '#ffe2a8'); gr.addColorStop(1, '#c08848'); g.fillStyle = gr; g.fillRect(0, 0, s, s); frame(g, s, '#3a2418'); for (let k = 12; k < 60; k += 10) { g.fillRect(k, 4, 2, 56); g.fillRect(4, k, 56, 2) } },
    column: 0x7a2a20, fog: [0x07090c, 0.16], ambient: [0x4a5056, 0.55], hand: 0xffb36b,
    lamp: { kind: 'lantern', color: 0xffa860, body: 0xd9772f },
    particles: { color: 0xd8c8a0, count: 160, size: 0.025, vel: [0.02, -0.03, 0.01] },
    props: { floor: ['ding', 'jar', 'table', 'screen', 'bonsai'], wall: ['scroll_hang', 'banner'], colors: { wood: 0x3a2618, metal: 0x5a5236, stone: 0x6a6458, cloth: 0x7a5a3a, accent: 0x8d7445, paper: 0xc8bca0 } },
    beast: { body: 0x23201e, accent: 0x7a2a20, eye: 0xff5a36, aura: 0xa3312a },
    words: { beast: '墨妖', boss: { course: '众惑', commerce: '刁客' }, npc: '书生灯影', portal: '月洞门', enter: '入 密 室', strike: '举灯' },
    music: { scale: [220, 261.6, 293.7, 329.6, 392, 440], tempo: 1.5, drum: 'temple' }
  },
  night_market: {
    name: '夜市', desc: '木铺板墙、招幌红灯，热闹的市井夜色（带货默认）',
    wall: (g, s, r) => { planks(g, s, r, { base: [74, 48, 30], v: 14, n: 6, gap: '#2a1810', vertical: true }); g.fillStyle = '#7a2a20'; g.fillRect(0, 8, s, 8); g.fillStyle = '#d8a050'; g.fillRect(0, 8, s, 1); g.fillRect(0, 15, s, 1) },
    floor: (g, s, r) => { g.fillStyle = '#2a2622'; g.fillRect(0, 0, s, s); for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) { g.fillStyle = rgb([74, 68, 60], vary(r, 12)); g.fillRect(x * 32 + (y % 2 ? 16 : 0) + 1, y * 16 + 1, 30, 14) } },
    ceil: (g, s, r) => { solid('#140c08')(g, s, r); g.fillStyle = '#3a2418'; g.fillRect(0, 30, s, 4); for (let k = 4; k < s; k += 10) { g.fillStyle = ['#ffb050', '#ff6a3a', '#ffe08a'][k % 3]; g.fillRect(k, 34 + (k % 4), 2, 2) } },
    panel: (g, s) => { g.fillStyle = '#7a1e18'; g.fillRect(8, 2, 48, 60); g.fillStyle = '#d8a050'; g.fillRect(8, 2, 48, 3); g.fillRect(8, 59, 48, 3); g.fillStyle = '#f0d8a0'; for (let k = 0; k < 3; k++) g.fillRect(26, 12 + k * 16, 12, 10) },
    column: 0x5a2a18, fog: [0x120a08, 0.12], ambient: [0x6a4a3a, 0.68], hand: 0xffc080,
    lamp: { kind: 'lantern', color: 0xff7a4a, body: 0xc8382a },
    particles: { color: 0xffb060, count: 120, size: 0.02, vel: [0, 0.05, 0], additive: true },
    props: { floor: ['basket', 'wine', 'crate', 'barrel', 'table'], wall: ['banner', 'shelf_wall'], colors: { wood: 0x5a3a22, metal: 0x4a4038, stone: 0x6a5040, cloth: 0x7a2a20, accent: 0xa8823a, paper: 0xc8b890 } },
    beast: { body: 0x2a2030, accent: 0xb8862a, eye: 0xffd040, aura: 0xd88a2a },
    words: { beast: '砍价鬼', boss: { course: '刁客', commerce: '刁客' }, npc: '店小二', portal: '夜市牌坊', enter: '逛 夜 市', strike: '举灯' },
    music: { scale: [261.6, 293.7, 329.6, 392, 440, 523.3], tempo: 0.9, drum: 'festive' }
  },
  tomb: {
    name: '盗墓 · 古墓', desc: '青苔墓砖、长明绿火、符纸残壁，阴森压抑',
    wall: (g, s, r) => { bricks(g, s, r, { mortar: '#141a16', base: [52, 60, 54], v: 12, rows: 4, cols: 2 }); speckle(g, s, r, 'rgba(70,110,60,0.55)', 90, 2); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 52, s, 12) },
    floor: (g, s, r) => { solid('#1e1c16')(g, s, r); speckle(g, s, r, '#2c2a22', 220, 2); g.fillStyle = '#0c0b08'; for (let k = 0; k < 4; k++) { let x = vary(r, s), y = vary(r, s); for (let j = 0; j < 10; j++) { g.fillRect(x, y, 1, 1); x += vary(r, 3) - 1; y += 1 } } },
    ceil: (g, s, r) => { bricks(g, s, r, { mortar: '#0b0d0b', base: [30, 34, 30], v: 8, rows: 3, cols: 2 }) },
    panel: (g, s) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, s, s); g.fillStyle = '#d8c060'; g.fillRect(20, 0, 24, 64); g.strokeStyle = '#a3201a'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 6); for (let y = 6; y < 58; y += 6) g.lineTo(y % 12 ? 26 : 38, y + 3); g.stroke(); g.fillStyle = '#a3201a'; g.fillRect(27, 50, 10, 8) },
    column: null, fog: [0x050a08, 0.2], ambient: [0x2e3d36, 0.5], hand: 0xd8d0a0,
    lamp: { kind: 'candle', color: 0x6dffa8, body: 0x3a3a2a, flicker: 0.25 },
    particles: { color: 0x7dffb0, count: 70, size: 0.035, vel: [0.01, 0.025, 0.01], additive: true },
    props: { floor: ['figure', 'jar', 'ding', 'coffin', 'candles'], wall: ['chains', 'scroll_hang'], colors: { wood: 0x2e2a20, metal: 0x3a4a38, stone: 0x5a5a4e, cloth: 0x4a3a2a, accent: 0x6a6a3a, paper: 0xa89a70 } },
    beast: { body: 0x2b3a2e, accent: 0x5a6a2a, eye: 0x7dffb0, aura: 0x2aff8a },
    words: { beast: '墓魇', boss: { course: '镇墓兽', commerce: '墓主' }, npc: '守陵人', portal: '墓道出口', enter: '下 古 墓', strike: '举灯' },
    music: { scale: [196, 207.7, 261.6, 277.2, 311.1, 392], tempo: 1.9, drum: 'heavy' }
  },
  dungeon: {
    name: '地牢', desc: '粗石牢墙、铁栅火把、潮湿石地，压迫的囚笼感',
    wall: (g, s, r) => { bricks(g, s, r, { mortar: '#16130f', base: [64, 60, 54], v: 22, rows: 3, cols: 2 }); speckle(g, s, r, 'rgba(0,0,0,0.35)', 160, 2); g.fillStyle = '#3a2a1a'; g.fillRect(0, 60, s, 4) },
    floor: (g, s, r) => { bricks(g, s, r, { mortar: '#121010', base: [44, 42, 40], v: 14, rows: 4, cols: 3 }); g.fillStyle = 'rgba(80,110,140,0.25)'; g.beginPath(); g.ellipse(40, 44, 12, 5, 0, 0, 7); g.fill() },
    ceil: (g, s, r) => { planks(g, s, r, { base: [40, 28, 18], v: 8, n: 4, gap: '#0a0705' }) },
    panel: (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = 'rgba(5,4,3,0.85)'; g.fillRect(6, 6, 52, 52); g.fillStyle = '#4a4a4e'; for (let x = 10; x < 58; x += 9) g.fillRect(x, 4, 3, 56); g.fillRect(4, 18, 56, 3); g.fillRect(4, 44, 56, 3) },
    column: 0x2a2a2e, fog: [0x0a0807, 0.18], ambient: [0x4a4038, 0.5], hand: 0xffa860,
    lamp: { kind: 'torch', color: 0xff8a3a, flicker: 0.3 },
    particles: { color: 0xff9a40, count: 90, size: 0.025, vel: [0, 0.07, 0], additive: true },
    props: { floor: ['barrel', 'crate', 'hay', 'cage', 'brazier'], wall: ['chains', 'shelf_wall'], colors: { wood: 0x3a2a1a, metal: 0x3a3a3e, stone: 0x5a5650, cloth: 0x4a3a2a, accent: 0x6a4a2a, paper: 0x9a8a6a } },
    beast: { body: 0x2a2a2e, accent: 0x8a3a1a, eye: 0xffb030, aura: 0xc85a1a },
    words: { beast: '狱卒', boss: { course: '典狱长', commerce: '典狱长' }, npc: '老囚', portal: '牢门', enter: '入 地 牢', strike: '挥火把' },
    music: { scale: [146.8, 174.6, 196, 220, 261.6], tempo: 1.7, drum: 'heavy' }
  },
  escape: {
    name: '密室逃脱', desc: '暗纹壁纸、护墙板、台灯线索板，悬疑解谜感',
    wall: (g, s, r) => { planks(g, s, r, { base: [70, 44, 28], v: 8, n: 4, gap: '#2a1a10', vertical: true }); g.fillStyle = '#1c3a3e'; g.fillRect(0, 0, s, 44); g.fillStyle = 'rgba(200,180,120,0.2)'; for (let y = 6; y < 44; y += 12) for (let x = (y / 6) % 2 ? 8 : 0; x < s; x += 16) { g.fillRect(x + 5, y, 6, 2); g.fillRect(x + 7, y - 2, 2, 6) } g.fillStyle = '#c8a050'; g.fillRect(0, 44, s, 2) },
    floor: (g, s, r) => { g.fillStyle = '#2a1a10'; g.fillRect(0, 0, s, s); for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { g.fillStyle = rgb([96, 62, 36], vary(r, 16)); const hor = (x + y) % 2; g.fillRect(x * 16 + 1, y * 8 + 1, hor ? 14 : 14, 6) } },
    ceil: (g, s) => { g.fillStyle = '#d8d4c8'; g.fillRect(0, 0, s, s); g.fillStyle = '#aaa69a'; g.fillRect(0, 31, s, 2); g.fillRect(31, 0, 2, s) },
    panel: (g, s, r) => { g.fillStyle = '#8a6a3a'; g.fillRect(0, 0, s, s); g.fillStyle = '#b8945a'; g.fillRect(3, 3, 58, 58); const pins: number[][] = []; for (let k = 0; k < 5; k++) { const x = 6 + vary(r, 40), y = 6 + vary(r, 40); g.fillStyle = k % 2 ? '#f0ead8' : '#e8d8a0'; g.fillRect(x, y, 14, 12); pins.push([x + 7, y + 2]) } g.strokeStyle = '#c0201a'; g.lineWidth = 1; g.beginPath(); pins.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke() },
    column: null, fog: [0x0b0d10, 0.1], ambient: [0x5a6070, 0.72], hand: 0xfff0c8,
    lamp: { kind: 'bulb', color: 0xffd890 },
    particles: { color: 0xe8e0d0, count: 80, size: 0.015, vel: [0.01, -0.01, 0.01] },
    props: { floor: ['safe', 'clock', 'globe', 'trunk', 'table'], wall: ['frame', 'wallclock'], colors: { wood: 0x4a2e1c, metal: 0x3a4048, stone: 0x6a6a6a, cloth: 0x2a4a50, accent: 0x9a7a3a, paper: 0xd8d0b8 } },
    beast: { body: 0x1e2228, accent: 0x2f6f8f, eye: 0x4ad8ff, aura: 0x2a9fd8 },
    words: { beast: '黑衣看守', boss: { course: '幕后主谋', commerce: '幕后主谋' }, npc: '侦探助手', portal: '逃生门', enter: '进 密 室', strike: '手电照' },
    music: { scale: [220, 233.1, 261.6, 293.7, 329.6, 349.2], tempo: 1.2, drum: 'tick' }
  },
  haunted: {
    name: '鬼屋', desc: '斑驳红墙、破窗纸、昏红灯笼，诡谲惊悚（不血腥）',
    wall: (g, s, r) => { planks(g, s, r, { base: [46, 30, 28], v: 10, n: 5, gap: '#140a0a', vertical: true }); g.fillStyle = 'rgba(120,20,20,0.35)'; g.fillRect(0, 0, s, 30); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(200,190,170,0.5)'; g.fillRect(vary(r, s), vary(r, 30), 4 + vary(r, 6), 2 + vary(r, 4)) } },
    floor: (g, s, r) => { planks(g, s, r, { base: [42, 32, 26], v: 10, n: 6, gap: '#0c0806' }); speckle(g, s, r, 'rgba(0,0,0,0.5)', 60, 2) },
    ceil: (g, s, r) => { solid('#0c0808')(g, s, r); g.strokeStyle = 'rgba(200,200,190,0.35)'; g.lineWidth = 1; g.beginPath(); for (let k = 0; k < 6; k++) { g.moveTo(0, 0); g.lineTo(64, k * 12) } for (let k = 1; k < 5; k++) { g.moveTo(k * 12, 0); g.quadraticCurveTo(k * 10, k * 10, 0, k * 12) } g.stroke() },
    panel: (g, s, r) => { g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, s, s); frame(g, s, '#2a1610', 5); g.fillStyle = '#2a1610'; g.fillRect(30, 0, 4, s); g.fillRect(0, 30, s, 4); g.fillStyle = '#0a0606'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(10 + vary(r, 44), 10 + vary(r, 44), 5 + vary(r, 6), 4 + vary(r, 5), 0, 0, 7); g.fill() } g.fillStyle = 'rgba(160,20,20,0.5)'; g.fillRect(40, 40, 10, 12) },
    column: 0x3a1010, fog: [0x0a0506, 0.2], ambient: [0x3a2a30, 0.45], hand: 0xe8d0b0,
    lamp: { kind: 'lantern', color: 0xff3b3b, body: 0x8a1010, flicker: 0.45 },
    particles: { color: 0x8aa89a, count: 30, size: 0.03, vel: [0.03, 0.01, -0.02], additive: true }, // 幽魂光点：暗青灰、稀疏
    props: { floor: ['chair', 'candles', 'umbrella', 'trunk', 'jar'], wall: ['mirror', 'banner'], colors: { wood: 0x2e221e, metal: 0x3a3434, stone: 0x5a5250, cloth: 0x6a1e1e, accent: 0x5a2a2a, paper: 0xc8c0b0 } },
    beast: { body: 0xd8d0c0, accent: 0x9a1a1a, eye: 0xff2020, aura: 0x8a1010 },
    words: { beast: '纸人', boss: { course: '红衣厉鬼', commerce: '红衣厉鬼' }, npc: '老更夫', portal: '后门', enter: '入 鬼 屋', strike: '举灯' },
    music: { scale: [196, 207.7, 233.1, 277.2, 293.7], tempo: 2.1, drum: 'none' }
  },
  festival: {
    name: '佳节闯关', desc: '红墙金边、满堂彩灯、飘落红纸，喜庆元宵灯会',
    wall: (g, s, r) => { g.fillStyle = '#9a2a1e'; g.fillRect(0, 0, s, s); speckle(g, s, r, 'rgba(0,0,0,0.12)', 80, 2); g.fillStyle = '#e0b040'; g.fillRect(0, 6, s, 3); g.fillRect(0, 54, s, 3); g.fillStyle = '#f0d070'; for (let x = 4; x < s; x += 16) { g.fillRect(x, 26, 8, 8); g.fillStyle = '#9a2a1e'; g.fillRect(x + 2, 28, 4, 4); g.fillStyle = '#f0d070' } },
    floor: (g, s, r) => { g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, s, s); for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = rgb([128, 112, 92], vary(r, 12)); g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30) } g.fillStyle = '#a3201a'; g.fillRect(20, 0, 24, s); g.fillStyle = '#e0b040'; g.fillRect(20, 0, 2, s); g.fillRect(42, 0, 2, s) },
    ceil: (g, s) => { g.fillStyle = '#5a1810'; g.fillRect(0, 0, s, s); const c = ['#ff5a3a', '#ffd050', '#ff8a3a', '#e83a5a']; for (let k = 0; k < 8; k++) { g.fillStyle = c[k % 4]; g.beginPath(); g.ellipse(4 + k * 8, 20 + (k % 2) * 20, 3, 4, 0, 0, 7); g.fill() } },
    panel: (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#c8281e'; g.beginPath(); g.moveTo(32, 2); g.lineTo(62, 32); g.lineTo(32, 62); g.lineTo(2, 32); g.closePath(); g.fill(); g.strokeStyle = '#f0c040'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#f0c040'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('福', 32, 34) },
    column: 0xb8282a, fog: [0x1a0a0a, 0.08], ambient: [0x8a5a4a, 0.85], hand: 0xffd8a0,
    lamp: { kind: 'lantern', color: 0xff5a3a, body: 0xe8281e },
    particles: { color: 0xff4a3a, count: 140, size: 0.035, vel: [0.02, -0.06, 0.01] },
    props: { floor: ['lantern_floor', 'giftbox', 'drum', 'basket', 'wine'], wall: ['firecrackers', 'banner'], colors: { wood: 0x5a2a18, metal: 0x8a6a3a, stone: 0x7a6a5a, cloth: 0xa8281e, accent: 0xc8a040, paper: 0xe8d8b0 } },
    beast: { body: 0x8a1a1a, accent: 0xd8a030, eye: 0xffe070, aura: 0xffb040 },
    words: { beast: '年兽', boss: { course: '年兽王', commerce: '年兽王' }, npc: '灯谜先生', portal: '花灯门', enter: '闹 元 宵', strike: '放爆竹' },
    music: { scale: [293.7, 329.6, 392, 440, 493.9, 587.3], tempo: 0.55, drum: 'festive' }
  },
  library: {
    name: '藏经阁', desc: '满墙书架、悬挂卷轴、暖黄烛光，静谧的书院',
    wall: (g, s, r) => { g.fillStyle = '#2a1a10'; g.fillRect(0, 0, s, s); const book = ['#6a2a20', '#2a4a5a', '#5a5a2a', '#3a2a4a', '#8a6a3a', '#2a4a32']; for (let row = 0; row < 3; row++) { let x = 2; while (x < s - 2) { const w = 3 + vary(r, 4), h = 14 + vary(r, 5); g.fillStyle = book[vary(r, book.length)]; g.fillRect(x, row * 21 + 20 - h, w, h); g.fillStyle = 'rgba(232,200,120,0.5)'; g.fillRect(x, row * 21 + 20 - h + 3, w, 1); x += w + 1 } g.fillStyle = '#4a2e1a'; g.fillRect(0, row * 21 + 20, s, 2) } },
    floor: (g, s, r) => { planks(g, s, r, { base: [92, 62, 38], v: 12, n: 4, gap: '#2a1a10' }) },
    ceil: (g, s) => { g.fillStyle = '#2a1a10'; g.fillRect(0, 0, s, s); g.fillStyle = '#4a2e1a'; for (let k = 0; k < s; k += 16) { g.fillRect(k, 0, 3, s); g.fillRect(0, k, s, 3) } g.fillStyle = '#b8975a'; for (let x = 8; x < s; x += 16) for (let y = 8; y < s; y += 16) g.fillRect(x - 1, y - 1, 3, 3) },
    panel: (g, s) => { g.fillStyle = '#e8dcc0'; g.fillRect(12, 4, 40, 56); g.fillStyle = '#5a3a20'; g.fillRect(8, 2, 48, 4); g.fillRect(8, 58, 48, 4); g.fillStyle = '#2b2219'; for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) g.fillRect(20 + k * 10, 12 + j * 11, 5, 7); g.fillStyle = '#a3312a'; g.fillRect(40, 50, 6, 6) },
    column: 0x4a2e1a, fog: [0x0c0a08, 0.12], ambient: [0x5a4a3a, 0.65], hand: 0xffd090,
    lamp: { kind: 'candle', color: 0xffd28a, body: 0xe8dcc0 },
    particles: { color: 0xffe0a0, count: 140, size: 0.02, vel: [0.01, -0.015, 0.01], additive: true },
    props: { floor: ['books', 'shelf', 'scrolls', 'table', 'incense'], wall: ['scroll_hang', 'shelf_wall'], colors: { wood: 0x4a2e1a, metal: 0x6a5a3a, stone: 0x6a6052, cloth: 0x4a3a2a, accent: 0x8d7445, paper: 0xd8ccb0 } },
    beast: { body: 0x5a5a60, accent: 0x8a7a5a, eye: 0xffd060, aura: 0xc8a050 },
    words: { beast: '蠹鱼精', boss: { course: '万卷书魔', commerce: '账本精' }, npc: '守阁先生', portal: '阁门', enter: '登 藏 经 阁', strike: '举烛' },
    music: { scale: [261.6, 293.7, 329.6, 392, 440], tempo: 1.6, drum: 'temple' }
  },
  mohist: {
    name: '墨家机关城', desc: '铜板铆钉、齿轮管道、蒸汽机括，适合理工与编程课',
    wall: (g, s, r) => { g.fillStyle = '#3a2a18'; g.fillRect(0, 0, s, s); for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = rgb([110, 78, 44], vary(r, 16)); g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); g.fillStyle = '#d8b070'; [[4, 4], [27, 4], [4, 27], [27, 27]].forEach(([a, b]) => g.fillRect(x * 32 + a, y * 32 + b, 2, 2)) } g.fillStyle = 'rgba(40,120,100,0.35)'; speckle(g, s, r, 'rgba(60,140,110,0.35)', 40, 2) },
    floor: (g, s) => { g.fillStyle = '#1a1612'; g.fillRect(0, 0, s, s); g.fillStyle = '#4a3e30'; for (let k = 0; k < s; k += 8) { g.fillRect(k, 0, 2, s); g.fillRect(0, k, s, 2) } },
    ceil: (g, s) => { g.fillStyle = '#14100c'; g.fillRect(0, 0, s, s); g.fillStyle = '#6a5038'; g.fillRect(0, 14, s, 6); g.fillRect(0, 42, s, 6); g.fillStyle = '#8a6a48'; g.fillRect(0, 14, s, 1); g.fillRect(0, 42, s, 1) },
    panel: (g, s) => { g.clearRect(0, 0, s, s); const gear = (cx: number, cy: number, R: number, n: number) => { g.fillStyle = '#b8862a'; g.beginPath(); for (let k = 0; k < n * 2; k++) { const a = (k / (n * 2)) * Math.PI * 2, rr = k % 2 ? R : R * 0.78; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) } g.closePath(); g.fill(); g.fillStyle = '#3a2a18'; g.beginPath(); g.arc(cx, cy, R * 0.3, 0, 7); g.fill() }; gear(26, 30, 22, 10); gear(50, 50, 12, 8) },
    column: 0x6a4a2a, fog: [0x0a0a08, 0.14], ambient: [0x5a5040, 0.62], hand: 0xffd090,
    lamp: { kind: 'bulb', color: 0xffb050 },
    particles: { color: 0xe8e8e0, count: 90, size: 0.045, vel: [0.01, 0.06, 0] },
    props: { floor: ['gears', 'pipes', 'puppet', 'crate', 'barrel'], wall: ['gear_wall', 'shelf_wall'], colors: { wood: 0x4a3420, metal: 0x7a5a32, stone: 0x5a5448, cloth: 0x3a3a34, accent: 0x9a7a3a, paper: 0xb8a888 } },
    beast: { body: 0x6a4a2a, accent: 0x3a3a3a, eye: 0x40d0ff, aura: 0x40a0ff },
    words: { beast: '机关偶', boss: { course: '机关巨兽', commerce: '机关巨兽' }, npc: '墨者', portal: '机关闸门', enter: '入 机 关 城', strike: '敲机括' },
    music: { scale: [220, 246.9, 277.2, 329.6, 370], tempo: 1.0, drum: 'tick' }
  },
  dragon: {
    name: '东海龙宫', desc: '珊瑚贝壁、水纹光影、夜明珠与气泡，奇幻水下',
    wall: (g, s, r) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#0e3a4a'); gr.addColorStop(1, '#0a2a36'); g.fillStyle = gr; g.fillRect(0, 0, s, s); for (let k = 0; k < 14; k++) { g.fillStyle = ['#e86a5a', '#f0a07a', '#d8e8e0', '#7ad8c8'][k % 4]; g.beginPath(); g.ellipse(vary(r, s), 40 + vary(r, 24), 2 + vary(r, 4), 3 + vary(r, 8), 0, 0, 7); g.fill() } speckle(g, s, r, 'rgba(200,240,255,0.35)', 40, 1) },
    floor: (g, s, r) => { solid('#8a7a58')(g, s, r); speckle(g, s, r, '#a8966e', 200, 1); speckle(g, s, r, '#6a5a40', 120, 1); g.fillStyle = '#e8dcc8'; g.beginPath(); g.ellipse(44, 20, 4, 3, 0.4, 0, 7); g.fill() },
    ceil: (g, s, r) => { solid('#06222c')(g, s, r); g.strokeStyle = 'rgba(140,220,240,0.35)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { g.beginPath(); let x = vary(r, s), y = 0; g.moveTo(x, y); while (y < s) { x += vary(r, 9) - 4; y += 6; g.lineTo(x, y) } g.stroke() } },
    panel: (g, s) => { g.clearRect(0, 0, s, s); g.fillStyle = '#c8a050'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); const gr = g.createRadialGradient(28, 26, 2, 32, 32, 24); gr.addColorStop(0, '#9ff0ff'); gr.addColorStop(1, '#0a4a6a'); g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 23, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; [[24, 22, 3], [36, 30, 2], [30, 40, 2]].forEach(([x, y, rr]) => { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill() }) },
    column: 0xc85a4a, fog: [0x03141c, 0.14], ambient: [0x2a6a7a, 0.72], hand: 0xbfe8ff,
    lamp: { kind: 'pearl', color: 0x9fe8ff },
    particles: { color: 0xc8f0ff, count: 150, size: 0.035, vel: [0, 0.12, 0], additive: true },
    props: { floor: ['coral', 'seaweed', 'shell', 'chest', 'jar'], wall: ['starfish', 'net'], colors: { wood: 0x4a3a2a, metal: 0x5a7a7a, stone: 0x6a7a7a, cloth: 0x4a6a6a, accent: 0xa8904a, paper: 0xd8d0c8 } },
    beast: { body: 0xb84a2a, accent: 0xe8a060, eye: 0xffff80, aura: 0x3ad8ff },
    words: { beast: '虾兵', boss: { course: '镇海蛟龙', commerce: '蟹将军' }, npc: '龟丞相', portal: '水晶门', enter: '下 龙 宫', strike: '举珠' },
    music: { scale: [261.6, 311.1, 349.2, 392, 466.2, 523.3], tempo: 1.3, drum: 'none' }
  },
  dunhuang: {
    name: '敦煌石窟', desc: '赭石壁画、青绿飞天、藻井风沙，温暖古意',
    wall: (g, s, r) => { g.fillStyle = '#a8784a'; g.fillRect(0, 0, s, s); speckle(g, s, r, 'rgba(90,60,30,0.35)', 160, 2); g.fillStyle = '#2a5a8a'; g.fillRect(0, 4, s, 4); g.fillStyle = '#3a8a6a'; g.fillRect(0, 8, s, 2); g.fillStyle = '#8a2a1a'; g.fillRect(0, 54, s, 6); for (let x = 2; x < s; x += 10) { g.fillStyle = '#e8d0a0'; g.beginPath(); g.arc(x + 3, 30, 3, 0, 7); g.fill(); g.fillStyle = '#3a8a6a'; g.fillRect(x, 34, 6, 10) } },
    floor: (g, s, r) => { solid('#8a6a44')(g, s, r); speckle(g, s, r, '#a07e54', 240, 1); g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, 31, s, 2); g.fillRect(31, 0, 2, s) },
    ceil: (g, s) => { g.fillStyle = '#2a4a6a'; g.fillRect(0, 0, s, s); g.fillStyle = '#c8a060'; g.fillRect(8, 8, 48, 48); g.fillStyle = '#3a8a6a'; g.fillRect(16, 16, 32, 32); g.fillStyle = '#e8d0a0'; g.beginPath(); g.arc(32, 32, 9, 0, 7); g.fill(); g.fillStyle = '#8a2a1a'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill() },
    panel: (g, s) => { g.fillStyle = '#c89a62'; g.fillRect(0, 0, s, s); frame(g, s, '#8a2a1a', 3); g.strokeStyle = '#2a6a8a'; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 44); g.bezierCurveTo(20, 20, 40, 52, 58, 18); g.stroke(); g.strokeStyle = '#3a8a6a'; g.beginPath(); g.moveTo(6, 52); g.bezierCurveTo(24, 34, 44, 60, 58, 30); g.stroke(); g.fillStyle = '#e8d0a0'; g.beginPath(); g.arc(30, 30, 5, 0, 7); g.fill(); g.fillStyle = '#8a2a1a'; g.fillRect(26, 34, 8, 12) },
    column: 0x8a2a1a, fog: [0x1a120a, 0.12], ambient: [0x7a5a3a, 0.72], hand: 0xffd090,
    lamp: { kind: 'candle', color: 0xffc070, body: 0xa8784a },
    particles: { color: 0xd8b078, count: 160, size: 0.02, vel: [0.14, -0.005, 0.03] },
    props: { floor: ['lotus', 'scrolls', 'jar', 'sand', 'figure'], wall: ['scroll_hang', 'banner'], colors: { wood: 0x5a3a22, metal: 0x6a5a3a, stone: 0x9a7a52, cloth: 0x3a6a6a, accent: 0xa8823a, paper: 0xd8c0a0 } },
    beast: { body: 0x8a6a40, accent: 0x3a6a8a, eye: 0xffe0a0, aura: 0xd8a050 },
    words: { beast: '风沙魔', boss: { course: '千面魔', commerce: '沙海商魔' }, npc: '画工', portal: '窟门', enter: '入 石 窟', strike: '举灯' },
    music: { scale: [220, 246.9, 293.7, 329.6, 370, 440], tempo: 1.4, drum: 'temple' }
  }
}

export const DEFAULT_THEME: Record<Scene, string> = { course: 'song_palace', commerce: 'night_market' }

/** 按 world.theme 取主题；没配或不认识时按场景给默认 */
export function themeOf(key: string | undefined | null, scene: Scene): Theme {
  return THEMES[key || ''] || THEMES[DEFAULT_THEME[scene]]
}

/** 后台预览用：把某一张贴图画到 canvas 上（同一随机种子，和游戏里一致） */
export function paintPreview(canvas: HTMLCanvasElement, paint: Paint, seed = 7) {
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')!
  let a = seed
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  paint(g, 64, r)
}
