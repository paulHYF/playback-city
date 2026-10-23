// 演示视频录屏：每个镜头单独录一段，出问题只重录那一段。
//   node demo/record.mjs [id...]     录画面 → out/clips/<id>.mp4（不传 id 即全部；需先跑 build.py tts）
//   node demo/record.mjs subs [id...] 渲染字幕 PNG → out/subs/<id>/NN.png
// 需要 Node 18+、前后端已启动（http://localhost:5173）。Playwright 复用 $POLYV_TEST_KNOWLEDGE/scripts/playwright-env.mjs。
// 每段都新开页面、先把场景摆好（进地宫、跳到目标殿室）再开录；所有段共用一位演示观众（out/state.json）。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const BASE = process.env.DEMO_BASE || 'http://localhost:5173'
const W = 1920, H = 1080
const COURSE = '8655755', COMMERCE = '8655744'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const { getChromium } = await import(process.env.POLYV_TEST_KNOWLEDGE + '/scripts/playwright-env.mjs')
const chromium = await getChromium()
const SCRIPT = JSON.parse(fs.readFileSync(path.join(HERE, 'script.json'), 'utf8'))

// ═════════════ 录制器：CDP 截屏流按时间戳落帧，可分段快进，结束时合成 30fps mp4 ═════════════
class Recorder {
  constructor(page, cdp, id) { Object.assign(this, { page, cdp, id, frames: [], speeds: [], dir: path.join(OUT, 'frames', id) }) }
  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true })
    this.cdp.on('Page.screencastFrame', f => {
      if (this.stopped) return
      const t = Date.now(), file = path.join(this.dir, String(this.frames.length).padStart(6, '0') + '.jpg')
      fs.writeFileSync(file, Buffer.from(f.data, 'base64')); this.frames.push({ file, t })
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    this.t0 = Date.now(); this.speeds = [{ t: this.t0, k: 1 }]
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
    await this.page.evaluate(() => window.__demo && window.__demo.nudge()) // 静止页面也先出一帧
  }
  /** 从这一刻起按 k 倍速压缩（k=1 恢复正常），画面右上角挂快进角标 */
  async speed(k, badge = k > 3) { this.speeds.push({ t: Date.now(), k }); await this.page.evaluate(k => window.__demo.ff(k), badge ? k : 1).catch(() => {}) }
  /** 暂停：这段时间不计入成片（换页、重载时用） */
  async pause() { this.speeds.push({ t: Date.now(), k: 1e9 }) }
  async resume() { this.speeds.push({ t: Date.now(), k: 1 }) }
  /** 真实时间 → 成片时间 */
  comp(t) { let s = 0; this.speeds.forEach((x, i) => { const end = i + 1 < this.speeds.length ? this.speeds[i + 1].t : Infinity; if (t > x.t) s += (Math.min(t, end) - x.t) / x.k }); return s / 1000 }
  elapsed() { return this.comp(Date.now()) }
  /** 成片时长补到 sec 秒（旁白长度），画面不动也照样计时 */
  async holdUntil(sec) { const left = sec - this.elapsed(); if (left > 0) await sleep(left * 1000 * this.speeds[this.speeds.length - 1].k) }
  async stop() {
    const tEnd = Date.now(); this.stopped = true; await this.cdp.send('Page.stopScreencast')
    if (!this.frames.length) throw new Error(this.id + '：没录到画面')
    const lines = ['ffconcat version 1.0']
    // 长时间静止的帧拆成 1/30 秒一条：concat 读长时长的单张图片会把总时长算长（静态卡片页尤其明显）
    this.frames.forEach((f, i) => { const next = i + 1 < this.frames.length ? this.frames[i + 1].t : tEnd; let d = Math.max(0.001, this.comp(next) - this.comp(f.t)); while (d > 0.0001) { const step = Math.min(d, 1 / 30); lines.push(`file '${f.file}'`, `duration ${step.toFixed(5)}`); d -= step } })
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`)
    const list = path.join(this.dir, 'list.ffconcat'); fs.writeFileSync(list, lines.join('\n'))
    fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true })
    const dst = path.join(OUT, 'clips', this.id + '.mp4')
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${W}:${H},fps=30`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', dst])
    fs.rmSync(this.dir, { recursive: true, force: true })
    return { dst, seconds: this.comp(tEnd) }
  }
}

// ═════════════ 页面里的演示辅助层：假鼠标、转场黑场、快进角标 ═════════════
const OVERLAY = () => {
  const boot = () => {
    if (document.getElementById('__cur')) return
    const css = document.createElement('style')
    css.textContent = `#__cur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;transition:transform .08s}
      #__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}#__cur.dn{transform:scale(.82)}
      .__rip{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #e3c88f;z-index:2147483646;pointer-events:none;animation:__rip .5s ease-out forwards}
      @keyframes __rip{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.4)}}
      #__fade{position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity .28s}
      #__ff{position:fixed;right:36px;top:220px;z-index:2147483645;pointer-events:none;font:600 26px "PingFang SC",sans-serif;color:#fff;background:rgba(163,49,42,.88);padding:8px 16px;border-radius:6px;display:none}
      body:has(#player:not([hidden])) #leave{visibility:hidden}
      #__tag{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:2147483645;pointer-events:none;font:400 64px "Ma Shan Zheng","STKaiti",serif;color:#f3dfae;text-shadow:0 2px 18px rgba(0,0,0,.9);letter-spacing:.2em;display:none}
      #__nudge{position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483640;pointer-events:none}`
    document.head.appendChild(css)
    const cur = document.createElement('div'); cur.id = '__cur'; cur.style.display = 'none'
    cur.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18 L12.5 28 L16.5 26 L12 16.5 L21 16.5 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    const fade = document.createElement('div'); fade.id = '__fade'
    const ff = document.createElement('div'); ff.id = '__ff'
    const nudge = document.createElement('div'); nudge.id = '__nudge'
    const tag = document.createElement('div'); tag.id = '__tag'
    document.body.append(cur, fade, ff, tag, nudge)
    addEventListener('mousemove', e => { cur.style.display = ''; cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px' }, true)
    addEventListener('mousedown', e => { cur.classList.add('dn'); const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600) }, true)
    addEventListener('mouseup', () => cur.classList.remove('dn'), true)
    window.__demo = {
      fade: on => { fade.style.opacity = on ? 1 : 0 },
      ff: k => { ff.style.display = k > 1 ? 'block' : 'none'; ff.textContent = '▶▶ 快进 ×' + k },
      hideCursor: () => { cur.style.display = 'none' },
      tag: t => { tag.style.display = t ? 'block' : 'none'; tag.textContent = t || '' },
      nudge: () => { nudge.style.background = nudge.style.background ? '' : 'rgba(0,0,0,.01)' }
    }
  }
  if (document.body) boot(); else addEventListener('DOMContentLoaded', boot)
}

// ═════════════ 操作工具 ═════════════
let mouse = { x: W / 2, y: H / 2 }
async function moveTo(page, x, y, ms = 520) {
  const n = Math.max(8, Math.round(ms / 16)), x0 = mouse.x, y0 = mouse.y
  for (let i = 1; i <= n; i++) { const k = i / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await sleep(16) }
  mouse = { x, y }
}
async function box(loc) { await loc.waitFor({ state: 'visible', timeout: 15000 }); await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
async function hover(page, loc, wait = 500) { const p = await box(loc); await moveTo(page, p.x, p.y); await sleep(wait) }
async function click(page, loc, wait = 400) { const p = await box(loc); await moveTo(page, p.x, p.y); await sleep(180); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(wait) }
async function typeSlow(page, text, cps = 9) { for (const ch of text) { await page.keyboard.type(ch); await sleep(1000 / cps) } }
/** 平滑滚动页面里最主要的滚动容器 */
async function scroll(page, dy, ms = 1800) {
  await page.evaluate(async ([dy, ms]) => {
    const cands = [document.scrollingElement, ...document.querySelectorAll('main, section, div')].filter(el => el && el.scrollHeight - el.clientHeight > 40 && getComputedStyle(el).overflowY !== 'hidden' && (el === document.scrollingElement || /auto|scroll/.test(getComputedStyle(el).overflowY)))
    const el = cands.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]; if (!el) return
    const from = el.scrollTop, to = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, from + dy)), t0 = performance.now()
    await new Promise(r => { const f = now => { const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; el.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(f) : r() }; requestAnimationFrame(f) })
  }, [dy, ms])
}
/** 平滑滚到含某段文字的标题处（标题停在视口上方 top 像素） */
async function scrollToText(page, text, ms = 1600, top = 90) {
  await page.evaluate(async ([text, ms, top]) => {
    const el = [...document.querySelectorAll('h2, h3, h4')].find(h => h.textContent.includes(text)); if (!el) return
    let box = el.parentElement; while (box && !(box.scrollHeight - box.clientHeight > 40 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
    box = box || document.scrollingElement
    const from = box.scrollTop, to = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, from + el.getBoundingClientRect().top - (box === document.scrollingElement ? 0 : box.getBoundingClientRect().top) - top)), t0 = performance.now()
    await new Promise(r => { const f = now => { const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; box.scrollTop = from + (to - from) * e; k < 1 ? requestAnimationFrame(f) : r() }; requestAnimationFrame(f) })
  }, [text, ms, top])
}
const pc = (page, fn, arg) => page.evaluate(fn, arg)

// ───── 游戏：按键、寻路、转场 ─────
async function key(page, k, hold = 70) { await page.keyboard.down(k); await sleep(hold); await page.keyboard.up(k); await sleep(250) }
async function turnTo(page, d) { const s = await pc(page, () => window.__pc.state() ? window.__pc.state().dir : null); const diff = (d - s + 4) % 4; if (diff === 1) await key(page, 'ArrowRight'); else if (diff === 3) await key(page, 'ArrowLeft'); else if (diff === 2) { await key(page, 'ArrowRight'); await key(page, 'ArrowRight') } }
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]
/** 地宫里按网格 BFS 走到目标：可踩的（灯、残片）走上去，其余走到它跟前并面对它 */
async function walkTo(page, id, { maxSteps = 60 } = {}) {
  for (let tries = 0; tries < 4; tries++) {
    const { L, s } = await pc(page, () => { const S = window.__pc.state(); return { L: window.__pc.layout(), s: { px: S.px, py: S.py, dir: S.dir, gone: S.gone } } })
    const tgt = L.entities.find(e => e.id === id); if (!tgt) throw new Error('没有物件 ' + id)
    const blocked = new Set(L.entities.filter(e => !e.pass && !s.gone.includes(e.id) && e.id !== id).map(e => e.x + ',' + e.y))
    const free = (x, y) => L.grid[y] && L.grid[y][x] === 1 && !blocked.has(x + ',' + y) && !(x === tgt.x && y === tgt.y && !tgt.pass)
    const goal = (x, y) => tgt.pass ? (x === tgt.x && y === tgt.y) : Math.abs(x - tgt.x) + Math.abs(y - tgt.y) === 1
    const prev = new Map([[s.px + ',' + s.py, null]]), q = [[s.px, s.py]]; let end = null
    while (q.length) { const [x, y] = q.shift(); if (goal(x, y)) { end = [x, y]; break } for (const [dx, dy] of DIRS) { const k = (x + dx) + ',' + (y + dy); if (!prev.has(k) && free(x + dx, y + dy)) { prev.set(k, [x, y]); q.push([x + dx, y + dy]) } } }
    if (!end) throw new Error('走不到 ' + id)
    const pathT = []; for (let c = end; c; c = prev.get(c[0] + ',' + c[1])) pathT.unshift(c)
    let ok = true
    for (let i = 1; i < pathT.length && i <= maxSteps; i++) {
      const [x0, y0] = pathT[i - 1], [x1, y1] = pathT[i], d = DIRS.findIndex(([dx, dy]) => dx === x1 - x0 && dy === y1 - y0)
      await turnTo(page, d); await key(page, 'ArrowUp')
      const p = await pc(page, () => { const S = window.__pc.state(); return [S.px, S.py] })
      if (p[0] !== x1 || p[1] !== y1) { ok = false; break } // 被怪挡住等，重新规划
    }
    if (!ok) { await sleep(400); continue }
    if (!tgt.pass) { const p = pathT[pathT.length - 1]; await turnTo(page, DIRS.findIndex(([dx, dy]) => dx === tgt.x - p[0] && dy === tgt.y - p[1])) }
    return
  }
  throw new Error('反复被挡，走不到 ' + id)
}
/** 黑场转场里瞬移，跳过不必要的走路 */
async function cut(page, fn, arg) { await pc(page, () => window.__demo.fade(true)); await sleep(320); await pc(page, fn, arg); await sleep(200); await pc(page, () => window.__demo.fade(false)); await sleep(350) }
const modalOpen = page => pc(page, () => !document.getElementById('modal').hidden)
async function waitModal(page, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await modalOpen(page)) return; await sleep(100) } throw new Error('弹窗没出现') }
/** 等回放播放器真正出画面（SDK 加载 + 拉流要几秒） */
async function waitVideo(page, ms = 15000) { await page.waitForFunction(() => [...document.querySelectorAll('video')].some(v => v.currentTime > 0.8 && v.videoWidth > 0), null, { timeout: ms, polling: 200 }).catch(() => console.log('  [回放没在 15 秒内出画面]')) }
const dlg = (page, sel) => page.locator('#dialog ' + sel)

async function openCity(page, cid) {
  await page.goto(BASE + '/city/' + cid)
  await page.waitForFunction(() => window.__pc, null, { timeout: 30000 })
  await page.evaluate(() => document.fonts && document.fonts.ready)
  await sleep(2500)
  await pc(page, () => { window.__pc.setTod('night'); window.__pc.music.init() })
  await sleep(600)
}
async function enterPalace(page) {
  await pc(page, () => window.__pc.enterPalace({ fresh: true }))
  await page.waitForFunction(() => window.__pc.state() && document.getElementById('fade') && !document.getElementById('fade').classList.contains('on'), null, { timeout: 15000 })
  await sleep(1200)
  if (await modalOpen(page)) { await page.keyboard.press('Escape'); await sleep(300) }
}
/** 地宫配乐：Web Audio 主输出录成 webm，合成时垫在旁白下面 */
async function musicStart(page) { await pc(page, () => { const st = window.__pc.music.capture(); if (!st) return; const mr = new MediaRecorder(st, { mimeType: 'audio/webm' }), parts = []; mr.ondataavailable = e => parts.push(e.data); mr.start(500); window.__mr = { mr, parts } }) }
async function musicStop(page, id) {
  const b64 = await pc(page, () => new Promise(r => { const m = window.__mr; if (!m) return r(null); m.mr.onstop = async () => { const buf = new Uint8Array(await new Blob(m.parts, { type: 'audio/webm' }).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); r(btoa(s)) }; m.mr.stop() })).catch(() => null)
  if (b64) fs.writeFileSync(path.join(OUT, 'clips', id + '.music.webm'), Buffer.from(b64, 'base64'))
}
const ridOf = async (page, cid) => (await (await page.request.get(BASE + '/api/channels/' + cid)).json()).replays.find(r => r.game_status === 'ready').id

// ═════════════ 镜头：setup 摆场景（不录），act 是录进去的操作 ═════════════
const card = c => ({ card: true, setup: async page => { await page.goto('file://' + path.join(HERE, 'cards.html') + '?c=' + c + '&_=' + Date.now()); await page.evaluate(() => document.fonts.ready); await sleep(200) }, act: async () => {} })
/** 开录前把这些殿室的巡夜怪识破清走，免得它挡路、扑人打断演示 */
async function clearPatrols(page, rooms) {
  for (const r of rooms) {
    const has = await pc(page, id => window.__pc.entities().some(x => x.startsWith(id + ':')), 'patrol' + r); if (!has) continue
    await pc(page, id => window.__pc.unmask(id), 'patrol' + r); await waitModal(page)
    await page.locator('#dialog .slip[data-ok="1"]').click(); await sleep(200); await page.keyboard.press('Escape'); await sleep(200)
  }
}
const doneUpTo = (page, n) => pc(page, n => { for (let i = 0; i < n; i++) window.__pc.done(i) }, n)

const SCENES = {
  '01-title': card('title'), '02-pain': card('pain'), '02-scenes': card('scenes'), '18-value': card('value'), '19-end': card('end'),

  '03-home': {
    zoom: true,
    setup: async page => { await page.goto(BASE + '/'); await page.evaluate(() => document.fonts.ready); await sleep(2500) },
    act: async page => {
      await sleep(800)
      await click(page, page.locator('g.city', { hasText: '不夜容器城' }), 2400)
      await click(page, page.locator('g.city', { hasText: '不夜货郎城' }), 2200)
      await hover(page, page.locator('button.go'), 800)
    }
  },

  '04-import': {
    zoom: true,
    setup: async page => { await page.goto(BASE + '/admin/channels'); await sleep(2000) },
    act: async page => {
      await sleep(500)
      await click(page, page.getByPlaceholder('如 8655755'), 200); await typeSlow(page, '8655755', 12); await sleep(300)
      await hover(page, page.getByRole('button', { name: '导入', exact: true }), 1400)
      await hover(page, page.locator('tr', { hasText: '不夜城培训' }).locator('td').nth(1), 1000)
      await hover(page, page.locator('tr', { hasText: '不夜城营销' }).locator('td').nth(1), 1000)
      await hover(page, page.locator('tr', { hasText: '不夜城培训' }).getByText('已生成'), 900)
    }
  },

  '05-config': {
    zoom: true,
    setup: async page => { const rid = await ridOf(page, COURSE); await page.goto(BASE + '/admin/replays/' + rid); await sleep(2000) },
    act: async page => {
      await sleep(600)
      await hover(page, page.getByText(/7 间殿室/).first(), 1000)
      await click(page, page.getByText('列表基础、len、索引与负索引').first(), 1600)
      await scroll(page, 380, 1500); await sleep(1500)
      await click(page, page.getByRole('tab', { name: /高频问题/ }), 2200)
    }
  },

  '05b-theme': {
    zoom: true,
    setup: async page => { const rid = await ridOf(page, COURSE); await page.goto(BASE + '/admin/replays/' + rid); await sleep(1500); await page.getByRole('tab', { name: /闯关配置/ }).click(); await sleep(1200) },
    act: async page => {
      await sleep(500)
      await scrollToText(page, '地宫主题', 1200, 70); await sleep(300)
      for (const n of ['宋风地宫', '夜市', '东海龙宫', '敦煌石窟']) await hover(page, page.locator('button.theme', { hasText: n }), 650)
      await scrollToText(page, '殿室关卡', 1500, 70); await sleep(1600)
      await scrollToText(page, 'Boss', 1200, 70); await sleep(1400)
      await scrollToText(page, '地宫主题', 1000, 70)
      await click(page, page.locator('button.theme', { hasText: '敦煌石窟' }), 1400) // 切主题即进入编辑，保存才生效
      await scrollToText(page, '殿室关卡', 1400, 70); await sleep(1500)
      await click(page, page.getByRole('button', { name: '取消', exact: true }), 700)
      const ok = page.locator('.el-message-box__btns .el-button--primary'); if (await ok.count()) await click(page, ok, 800)
    }
  },

  '05c-themes': {
    music: true,
    setup: async page => {
      await page.route('**/api/city/' + COURSE, async route => { const res = await route.fetch(), d = await res.json(); if (themeNow) d.replays.forEach(r => { if (r.game && r.game.world) r.game.world.theme = themeNow }); await route.fulfill({ response: res, json: d }) })
      themeNow = 'tomb'; await openCity(page, COURSE); await enterPalace(page); await clearPatrols(page, [0]); await pc(page, () => { document.getElementById('toast').hidden = true })
    },
    act: async page => {
      const list = [['tomb', '古 墓'], ['night_market', '夜 市'], ['escape', '密 室 逃 脱'], ['dragon', '东 海 龙 宫'], ['dunhuang', '敦 煌 石 窟'], ['festival', '元 宵 灯 会']]
      for (const [i, [k, name]] of list.entries()) {
        if (i) { // 换主题：重载页面重新进地宫，这段不计入成片
          await rec.pause(); themeNow = k; await openCity(page, COURSE); await page.evaluate(OVERLAY); await enterPalace(page); await clearPatrols(page, [0])
          await pc(page, () => { document.getElementById('toast').hidden = true }); await sleep(300); await rec.resume()
        }
        await pc(page, t => window.__demo.tag(t), name); await sleep(700); await key(page, 'ArrowRight'); await sleep(500); await pc(page, () => window.__demo.tag(''))
      }
    }
  },

  '07-plaza': {
    music: true,
    setup: async page => { await openCity(page, COURSE) },
    act: async page => {
      await sleep(900); await key(page, 'ArrowUp')
      await cut(page, () => window.__pc.standBefore('crier0'))
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(2200); await page.keyboard.press('Escape')
      const rid = await ridOf(page, COURSE)
      await cut(page, id => window.__pc.standBefore('hall' + id), rid); await sleep(500)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(2000)
    }
  },

  '08-room1': {
    music: true,
    setup: async page => { await openCity(page, COURSE); const rid = await ridOf(page, COURSE); await pc(page, id => window.__pc.standBefore('hall' + id), rid); await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(600) },
    act: async page => {
      await sleep(500)
      await click(page, dlg(page, (await dlg(page, '#fresh').count()) ? '#fresh' : '#enter'), 200); await pc(page, () => window.__demo.hideCursor())
      await page.waitForFunction(() => window.__pc.state(), null, { timeout: 15000 })
      await rec.speed(50); await clearPatrols(page, [0]); await pc(page, () => { document.getElementById('toast').hidden = true }); await rec.speed(1)
      await sleep(1800)
      await rec.speed(2.5); await walkTo(page, 'lamp00'); await rec.speed(1); await sleep(900)
    }
  },

  '09-chest-wrong': {
    music: true,
    setup: async page => { await openCity(page, COURSE); await enterPalace(page); await doneUpTo(page, 1); await clearPatrols(page, [0, 1]); await pc(page, () => window.__pc.standBefore('chest1')); await sleep(1500) },
    act: async page => {
      await sleep(600)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(1600)
      await click(page, dlg(page, '.slip[data-ok="0"]').first(), 200)
      await page.waitForSelector('#sealPlay', { timeout: 10000 }); await waitVideo(page); await sleep(1200)
      await rec.speed(10)
      await page.waitForFunction(() => { const b = document.getElementById('sealOk'); return b && !b.disabled }, null, { timeout: 120000, polling: 300 })
      await rec.speed(1); await sleep(300)
      await click(page, dlg(page, '#sealOk'), 500)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(900)
      await click(page, dlg(page, '.slip[data-ok="1"]'), 2600)
    }
  },

  '12-boss': {
    music: true,
    setup: async page => { await openCity(page, COURSE); await enterPalace(page); await doneUpTo(page, 4); await clearPatrols(page, [0]); await pc(page, () => window.__pc.standBefore('boss')); await sleep(600); await key(page, 'ArrowDown'); await key(page, 'ArrowDown'); await sleep(1200); await pc(page, () => { document.getElementById('toast').hidden = true }) },
    act: async page => {
      await sleep(1400); await key(page, 'ArrowUp'); await key(page, 'ArrowUp'); await sleep(200)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(2400)
      await click(page, dlg(page, '#go'), 500); await rec.speed(4, true)
      for (let k = 0; k < 3; k++) { // 辨惑：按 Boss 这句话的真假选
        await page.waitForSelector('#dialog .slip[data-v]', { timeout: 8000 })
        const truth = await pc(page, k => window.__pc.state().boss.plan.judge[k].truth, k)
        await sleep(600); await click(page, dlg(page, `.slip[data-v="${truth ? 1 : 0}"]`), 900); await click(page, dlg(page, '#go'), 300)
      }
      await stagger(page)
      for (let k = 0; k < 2; k++) { await page.waitForSelector('#dialog .slip[data-ok="1"]', { timeout: 8000 }); await sleep(700); await click(page, dlg(page, '.slip[data-ok="1"]'), 700) }
      await stagger(page)
      // 破阵：按碎片在原话里的位置依次点，混进来的那片跳过
      await page.waitForSelector('#dialog .chip', { timeout: 8000 }); await sleep(1000)
      const order = await pc(page, () => { const q = window.__pc.state().boss.plan.quote.source_quote.replace(/[「」"]/g, ''); return [...document.querySelectorAll('#dialog .chip')].map(b => ({ i: b.dataset.i, at: q.indexOf(b.textContent) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at).map(x => x.i) })
      for (const i of order) await click(page, dlg(page, `.chip[data-i="${i}"]`), 250)
      await page.waitForFunction(() => /散 了/.test(document.querySelector('#dialog h4')?.textContent || ''), null, { timeout: 8000 }); await rec.speed(1); await sleep(2400)
    }
  },

  '13-result': {
    music: true,
    setup: async page => {
      await openCity(page, COURSE); await enterPalace(page); await doneUpTo(page, 7)
      await pc(page, async cid => { // 错题卷：塞两道本讲的题，演示复习计划
        const d = await (await fetch('/api/city/' + cid)).json(), g = d.replays.find(r => r.state === 'open').game, S = window.__pc.state()
        S.wrong.push(g.rooms[3].items[0], g.rooms[4].items[1]); S.broken.push(...g.rooms[1].items, ...g.rooms[4].items); window.__pc.give('page')
      }, COURSE)
      await pc(page, () => window.__pc.standBefore('portal')); await sleep(1800)
    },
    act: async page => {
      await sleep(700)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(3000)
      await hover(page, dlg(page, 'button[data-t]').first(), 1200); await hover(page, dlg(page, 'button[data-t]').nth(1), 1000)
    }
  },

  '14-shop': {
    music: true,
    setup: async page => { await openCity(page, COMMERCE); await pc(page, () => window.__pc.standBefore('shop1')); await sleep(1200) },
    act: async page => {
      await sleep(600)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(2000)
      await click(page, dlg(page, '[data-k="0"]'), 2000)
      await click(page, dlg(page, '#explain'), 200); await waitVideo(page); await sleep(2200)
      await page.keyboard.press('Escape'); await sleep(300)
    }
  },

  '15-market': {
    music: true,
    setup: async page => { await openCity(page, COMMERCE); await enterPalace(page) },
    act: async page => {
      await sleep(1000)
      const room = await pc(page, () => window.__pc.task().indexOf('calc'))
      await cut(page, r => { for (let i = 0; i < r; i++) window.__pc.done(i); window.__pc.standBefore('calc' + r) }, room); await sleep(500)
      await pc(page, () => window.__pc.interactAhead()); await waitModal(page); await sleep(1800)
      const ans = await pc(page, async ([cid, r]) => { const d = await (await fetch('/api/city/' + cid)).json(); const w = d.replays.find(x => x.state === 'open').game.world; const a = String(w.rooms.find(x => x.room === r).calc.answer); return (a.match(/-?\d+(?:\.\d+)?/g) || [a]).pop() }, [COMMERCE, room])
      await typeSlow(page, ans, 6); await sleep(400)
      await click(page, dlg(page, '#go'), 2200)
    }
  },

  '16-dashboard': {
    zoom: true,
    setup: async page => { await page.goto(BASE + '/dashboard/' + COURSE); await sleep(3500) },
    act: async page => {
      await sleep(900)
      const play = page.getByRole('button', { name: /回放点亮过程/ }); if (await play.count()) await click(page, play, 2200)
      await hover(page, page.getByText('殿室漏斗').first(), 700)
      await scroll(page, 520, 1600); await sleep(900)
      await scroll(page, 600, 1600); await sleep(1100)
    }
  },

  '17-report': {
    zoom: true,
    setup: async page => { await page.goto(BASE + '/admin/channels/' + COURSE + '/report'); await sleep(2500) },
    act: async page => {
      await sleep(1200)
      await scrollToText(page, '培训维度', 1400, 60); await hover(page, page.getByText('诊断发现').first(), 1200)
      await hover(page, page.getByText('改进建议').first(), 800)
      await scrollToText(page, '复盘 · AI 深度点评', 1600, 60); await sleep(1200)
      await scrollToText(page, '关键时刻复盘', 1400, 60); await sleep(1500)
      await scrollToText(page, '在线人数', 1600, 60); await sleep(1800)
      await scrollToText(page, '重点回顾段', 1400, 60); await sleep(1800)
      await rec.pause(); await page.goto(BASE + '/admin/channels/' + COURSE + '/report/scroll'); await page.evaluate(OVERLAY); await sleep(2500); await rec.resume()
      await sleep(1600); await hover(page, page.getByRole('button', { name: /横排阅读/ }), 800)
      await rec.pause(); await page.goto(BASE + '/admin/channels/' + COMMERCE + '/report'); await page.evaluate(OVERLAY); await sleep(2500); await rec.resume()
      await sleep(600); await hover(page, page.getByText('营销维度').first(), 1600); await hover(page, page.getByText('购买意向信号').first(), 1200); await hover(page, page.getByText('卖点认知度').first(), 1200)
    }
  }
}

async function stagger(page) { // 破势：Boss 扑过来，转向它、空格攻击，直到进入下一步
  await page.waitForFunction(() => document.getElementById('modal').hidden, null, { timeout: 8000 })
  const back = rec.speeds[rec.speeds.length - 1].k; await rec.speed(Math.max(3, back), true)
  const t = Date.now(), step0 = await pc(page, () => window.__pc.state().boss.step)
  while (Date.now() - t < 40000) {
    const s = await pc(page, () => { const S = window.__pc.state(); if (!S.boss) return null; const e = S.boss.e; return { step: S.boss.step, px: S.px, py: S.py, dir: S.dir, bx: e.x, by: e.y, modal: !document.getElementById('modal').hidden } })
    if (!s || s.step !== step0 || s.modal) break
    const dx = s.bx - s.px, dy = s.by - s.py
    if (Math.abs(dx) + Math.abs(dy) === 1) { const d = DIRS.findIndex(([a, b]) => a === dx && b === dy); if (d !== s.dir) await turnTo(page, d); await page.keyboard.press(' '); await sleep(380) }
    else await sleep(150)
  }
  await rec.speed(back)
}

// ═════════════ 字幕 PNG ═════════════
async function renderSubs(browser, ids) {
  const table = JSON.parse(fs.readFileSync(path.join(OUT, 'tts.json'), 'utf8'))
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage()
  for (const s of SCRIPT.scenes.filter(s => !ids.length || ids.includes(s.id))) {
    const dir = path.join(OUT, 'subs', s.id); fs.mkdirSync(dir, { recursive: true })
    for (const [i, r] of table[s.id].lines.entries()) {
      const esc = r.text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
      await page.setContent(`<html><body style="margin:0;width:${W}px;height:${H}px;background:transparent;display:flex;align-items:flex-end;justify-content:center">
        <div style="margin-bottom:96px;max-width:1500px;padding:12px 30px;background:rgba(10,12,16,.72);border-radius:8px;color:#fff;font:500 40px/1.45 'PingFang SC','Hiragino Sans GB',sans-serif;letter-spacing:.04em;text-align:center;text-shadow:0 2px 4px rgba(0,0,0,.6)">${esc}</div></body></html>`)
      await page.screenshot({ path: path.join(dir, String(i).padStart(2, '0') + '.png'), omitBackground: true })
    }
    console.log('字幕', s.id)
  }
}

// ═════════════ 主流程 ═════════════
let rec = null, themeNow = null
const args = process.argv.slice(2)
// 用本机 Google Chrome（临时配置目录）：Playwright 自带的 Chromium 不带 H.264，回放视频会是黑屏
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] })
if (args[0] === 'subs') { await renderSubs(browser, args.slice(1)); await browser.close(); process.exit(0) }
const table = JSON.parse(fs.readFileSync(path.join(OUT, 'tts.json'), 'utf8'))
const stateFile = path.join(OUT, 'state.json')
const ids = args.length ? args : SCRIPT.scenes.map(s => s.id)
const failed = []
for (const id of ids) {
  const sc = SCENES[id]; if (!sc) { console.log('跳过未知镜头', id); continue }
  // 成片都是 1920×1080：后台类页面按 1280×720×1.5 录（字号放大 1.5 倍），游戏按 1440×810×4/3 录（弹窗放大，又不至于挤到按钮重叠）
  const [vp, dpr] = sc.zoom ? [{ width: 1280, height: 720 }, 1.5] : sc.music ? [{ width: 1440, height: 810 }, 4 / 3] : [{ width: W, height: H }, 1]
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, storageState: fs.existsSync(stateFile) ? stateFile : undefined })
  await ctx.addInitScript(OVERLAY)
  const page = await ctx.newPage(); mouse = { x: vp.width * 0.62, y: vp.height * 0.6 }
  page.on('pageerror', e => console.log('  [页面报错]', e.message))
  try {
    await sc.setup(page)
    await page.evaluate(OVERLAY); if (!sc.card) await page.mouse.move(mouse.x, mouse.y)
    if (sc.music) await musicStart(page)
    rec = new Recorder(page, await ctx.newCDPSession(page), id)
    await rec.start(); await sc.act(page); await rec.holdUntil(table[id].total)
    const r = await rec.stop()
    if (sc.music) await musicStop(page, id)
    if (sc.music) { page.on('dialog', d => d.accept()); await page.evaluate(() => document.getElementById('leave').click()).catch(() => {}); await sleep(800) } // 按弃局结算，下段不会「续夜巡」
    console.log(`${id}: 画面 ${r.seconds.toFixed(1)}s / 旁白 ${table[id].total}s`)
    await ctx.storageState({ path: stateFile })
  } catch (e) {
    failed.push(id); console.log(`${id}: 失败 ——`, e.message)
    await page.screenshot({ path: path.join(OUT, 'fail-' + id + '.png') }).catch(() => {})
  }
  await ctx.close()
}
await browser.close()
if (failed.length) { console.log('失败的镜头：', failed.join(' '), '（单独重录：node demo/record.mjs ' + failed.join(' ') + '）'); process.exit(1) }
