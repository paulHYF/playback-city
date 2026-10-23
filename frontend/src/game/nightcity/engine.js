// 回放不夜城 · 夜巡引擎（自 prototype/v5-夜巡.html 搬入，three r128，与原型观感一致）
// mount(root, data, hooks)：root 内需有 CityView.vue 提供的 DOM（#cv、#dossier、#modal…）；
// data = /api/city/:cid 的返回 + progress + viewer；hooks 负责上报与路由。
import * as THREE from 'three'
import { LiveVideo } from './liveplayer.js'

export function mount(root, D, hooks = {}) {
  const sceneKey = D.channel.scene, unit = sceneKey === 'course' ? '讲' : '场';
  const HALLS = D.replays; // 每讲回放一座楼阁
  let curReplay = HALLS.find(r => r.state === 'open') || HALLS[0];
  const cur = () => curReplay.game;
  const $ = s => root.querySelector(s);
  const ac = new AbortController(), sig = { signal: ac.signal };
  let running = true;
  const track = (type, p) => { if (hooks.track) hooks.track(type, p || {}); };
  const building = r => (D.city.buildings || []).find(b => b.replay === r.id);
  const cn = n => n < CN.length ? CN[n] : String(n);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const CN = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const shortTitle = t => t.split(/[：:、，,（(]/)[0].replace(/\s*\d+ml/, '').slice(0, 8);

  // ═════════════ 背景音乐：Web Audio 实时合成（古琴五声 + 低音铺底 + 更鼓） ═════════════
  const Music = (() => {
    let ctx, master, delay, mood = 'plaza', on = true, nextNote = 0, nextDrum = 0, timer, drone = [];
    const SCALES = { plaza: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3], day: [293.7, 329.6, 392, 440, 523.3, 587.3, 659.3], palace: [220, 261.6, 293.7, 329.6, 392, 440], boss: [196, 220, 261.6, 293.7, 311.1, 392] };
    const TEMPO = { plaza: 0.95, day: 0.6, palace: 1.5, boss: 0.32 };
    function init() {
      if (ctx) return; ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = on ? 0.2 : 0; master.connect(ctx.destination);
      delay = ctx.createDelay(); delay.delayTime.value = 0.34; const fb = ctx.createGain(); fb.gain.value = 0.33; const wet = ctx.createGain(); wet.gain.value = 0.35;
      delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
      [65.4, 98].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = i ? 'triangle' : 'sine'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 380; g.gain.value = 0; o.connect(lp); lp.connect(g); g.connect(master); o.start(); drone.push({ o, g }); });
      nextNote = nextDrum = ctx.currentTime + 0.2; timer = setInterval(tick, 90); setMood(mood);
    }
    function pluck(f, t, v) {
      [1, 2].forEach((m, k) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = k ? 'sine' : 'triangle'; o.frequency.setValueAtTime(f * m * 1.012, t); o.frequency.exponentialRampToValueAtTime(f * m, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * (k ? 0.25 : 1), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); o.connect(g); g.connect(master); g.connect(delay); o.start(t); o.stop(t + 1.9); });
    }
    function drum(t, v) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.28); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.5); }
    let walk = 2;
    function tick() {
      const s = SCALES[mood], tempo = TEMPO[mood];
      while (nextNote < ctx.currentTime + 0.3) {
        if (Math.random() > (mood === 'palace' ? 0.45 : 0.2)) { walk = Math.max(0, Math.min(s.length - 1, walk + Math.floor(Math.random() * 5) - 2)); pluck(s[walk] * (mood === 'boss' ? 0.5 : 1), nextNote, mood === 'boss' ? 0.16 : 0.12); }
        nextNote += tempo * (mood === 'boss' ? 1 : 0.6 + Math.random() * 0.8);
      }
      while (nextDrum < ctx.currentTime + 0.3) {
        if (mood === 'boss') { drum(nextDrum, 0.5); nextDrum += 0.64; }
        else if (mood === 'palace') { drum(nextDrum, 0.18); drum(nextDrum + 0.22, 0.12); nextDrum += 1.7; }
        else { [0, 0.9, 1.8].forEach(d => drum(nextDrum + d, 0.22)); nextDrum += 14; }
      }
    }
    function setMood(m) { mood = m; if (!ctx) return; const lvl = { plaza: 0.035, day: 0.02, palace: 0.07, boss: 0.09 }[m]; drone.forEach(d => d.g.gain.setTargetAtTime(lvl, ctx.currentTime, 0.8)); nextNote = Math.max(nextNote, ctx.currentTime); }
    function toggle() { on = !on; if (master) master.gain.setTargetAtTime(on ? 0.2 : 0, ctx.currentTime, 0.2); return on; }
    function stop() { clearInterval(timer); if (ctx) ctx.close(); ctx = null; }
    return { init, setMood, toggle, stop, get on() { return on; }, sfx: { hit: () => ctx && drum(ctx.currentTime, 0.7), good: () => ctx && [523.3, 659.3, 784].forEach((f, i) => pluck(f, ctx.currentTime + i * 0.09, 0.14)) } };
  })();

  // ═════════════ Three.js 基础 ═════════════
  const WALL_H = 1.3, EYE = 0.56;
  const cv = $('#cv'), screenEl = $('#screen');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false }); renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 16 / 10, 0.05, 90); camera.rotation.order = 'YXZ';
  function canvasTex(size, paint, repeat, h) { const c = document.createElement('canvas'); c.width = size; c.height = h || size; paint(c.getContext('2d'), size, h || size); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  const trnd = mulberry32(7);
  const wallTex = canvasTex(64, g => { g.fillStyle = '#231812'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#b8975a'; g.fillRect(0, 7, 64, 1); g.fillStyle = '#26292c'; g.fillRect(0, 8, 64, 42); for (let r = 0; r < 6; r++) for (let b = -1; b < 5; b++) { const x = b * 16 + (r % 2 ? 8 : 0), s = 56 + Math.floor(trnd() * 14); g.fillStyle = 'rgb(' + (s - 2) + ',' + (s + 1) + ',' + (s + 5) + ')'; g.fillRect(x + 1, 9 + r * 7, 14, 6); } g.fillStyle = '#5c5a52'; g.fillRect(0, 50, 64, 14); g.fillStyle = '#6d6a60'; g.fillRect(0, 50, 64, 2); });
  const cityWallTex = canvasTex(64, g => { g.fillStyle = '#2a2d30'; g.fillRect(0, 0, 64, 64); for (let r = 0; r < 9; r++) for (let b = -1; b < 5; b++) { const x = b * 16 + (r % 2 ? 8 : 0), s = 66 + Math.floor(trnd() * 16); g.fillStyle = 'rgb(' + (s - 4) + ',' + (s - 2) + ',' + (s + 2) + ')'; g.fillRect(x + 1, r * 7 + 1, 14, 6); } });
  const floorTex = canvasTex(64, g => { g.fillStyle = '#1b1a17'; g.fillRect(0, 0, 64, 64); for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const v = Math.floor(trnd() * 10); g.fillStyle = 'rgb(' + (56 + v) + ',' + (53 + v) + ',' + (48 + v) + ')'; g.fillRect(c * 32 + 1, r * 32 + 1, 30, 30); } });
  const plazaTex = canvasTex(64, g => { g.fillStyle = '#2a2622'; g.fillRect(0, 0, 64, 64); for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { const v = Math.floor(trnd() * 12); g.fillStyle = 'rgb(' + (74 + v) + ',' + (70 + v) + ',' + (64 + v) + ')'; g.fillRect(c * 32 + (r % 2 ? 16 : 0) + 1, r * 16 + 1, 30, 14); g.fillRect(c * 32 + (r % 2 ? 16 : 0) - 31, r * 16 + 1, 30, 14); } }, true);
  const ceilTex = canvasTex(32, g => { g.fillStyle = '#120d0b'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#2a1d16'; g.fillRect(0, 14, 32, 4); g.fillRect(14, 0, 4, 32); g.fillStyle = '#b8975a'; g.fillRect(15, 15, 2, 2); });
  const latticeTex = canvasTex(64, g => { const gr = g.createRadialGradient(32, 30, 4, 32, 32, 40); gr.addColorStop(0, '#ffe2a8'); gr.addColorStop(1, '#c08848'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3a2418'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64); for (let k = 12; k < 60; k += 10) { g.fillRect(k, 4, 2, 56); g.fillRect(4, k, 56, 2); } });
  const doorTex = (() => { const t = canvasTex(256, g => { g.fillStyle = '#3a2616'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#2a1a0f'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 256); g.fillStyle = '#1a100a'; g.fillRect(126, 0, 4, 256); g.fillStyle = '#b8975a'; [[40, 40], [216, 40], [40, 216], [216, 216], [108, 150], [148, 150]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }); }); t.magFilter = t.minFilter = THREE.LinearFilter; return t; })();
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const swirlTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.translate(64, 64); for (let k = 0; k < 5; k++) { g.rotate(Math.PI * 2 / 5); g.strokeStyle = 'rgba(240,228,200,0.75)'; g.lineWidth = 5; g.beginPath(); for (let a = 0; a < 5; a += 0.1) g.lineTo(Math.cos(a) * a * 11, Math.sin(a) * a * 11); g.stroke(); } return new THREE.CanvasTexture(c); })();
  const moonTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); let gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(239,230,204,0.35)'); gr.addColorStop(1, 'rgba(239,230,204,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); gr = g.createRadialGradient(118, 116, 4, 128, 128, 52); gr.addColorStop(0, '#fbf5e3'); gr.addColorStop(1, '#dccfae'); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 50, 0, 7); g.fill(); return new THREE.CanvasTexture(c); })();
  const mountainTex = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'); const layer = (base, amp, col, seed) => { const r = mulberry32(seed); const ph = [r() * 6, r() * 6, r() * 6]; g.fillStyle = col; g.beginPath(); g.moveTo(0, 256); for (let x = 0; x <= 1024; x += 8) { const t = x / 1024 * Math.PI * 2; const v = Math.sin(t * 2 + ph[0]) * 0.5 + Math.sin(t * 5 + ph[1]) * 0.3 + Math.sin(t * 11 + ph[2]) * 0.15; g.lineTo(x, base - amp * (0.55 + v * 0.5)); } g.lineTo(1024, 256); g.fill(); }; layer(150, 110, 'rgba(60,70,74,0.55)', 3); layer(190, 90, 'rgba(42,50,50,0.85)', 9); layer(228, 60, 'rgba(24,28,28,1)', 17); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })();
  const clothTex = (c1, c2) => canvasTex(64, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 8, 0, 8, 64); } });
  const M = {
    wall: new THREE.MeshLambertMaterial({ map: wallTex }), cityWall: new THREE.MeshLambertMaterial({ map: cityWallTex }), floor: new THREE.MeshLambertMaterial({ map: floorTex }), corridor: new THREE.MeshLambertMaterial({ map: floorTex, color: 0x8f8a80 }), ceil: new THREE.MeshLambertMaterial({ map: ceilTex }),
    stone: new THREE.MeshLambertMaterial({ color: 0x66645e }), stoneDark: new THREE.MeshLambertMaterial({ color: 0x4a4944 }), wood: new THREE.MeshLambertMaterial({ color: 0x2a1d16 }), cinna: new THREE.MeshLambertMaterial({ color: 0x7a2a20 }),
    gold: new THREE.MeshLambertMaterial({ color: 0xb8975a, emissive: 0x2a1c08 }), tile: new THREE.MeshLambertMaterial({ color: 0x2a2e31, flatShading: true }), lampOn: new THREE.MeshBasicMaterial({ color: 0xffc070 }),
    silk: new THREE.MeshBasicMaterial({ color: 0xd9772f }), silkOff: new THREE.MeshLambertMaterial({ color: 0x8a5a3a }), tassel: new THREE.MeshBasicMaterial({ color: 0xa3312a }), skin: new THREE.MeshLambertMaterial({ color: 0xd8c4a8 }), black: new THREE.MeshLambertMaterial({ color: 0x15171a }),
    paper: new THREE.MeshLambertMaterial({ color: 0xe8dcc0, emissive: 0x3a2c18, side: THREE.DoubleSide }), bamboo: new THREE.MeshLambertMaterial({ color: 0xc9a76a, emissive: 0x2a1c08 }),
    beast: new THREE.MeshLambertMaterial({ color: 0x23201e, flatShading: true }), beastRed: new THREE.MeshLambertMaterial({ color: 0x7a2a20, flatShading: true }), bone: new THREE.MeshLambertMaterial({ color: 0xd8ccb0 }), eye: new THREE.MeshBasicMaterial({ color: 0xff5a36 })
  };
  const labels = [];
  function labelTex(text, fg, bg, font) { const c = document.createElement('canvas'), g = c.getContext('2d'); const f = font || '500 40px "Noto Serif SC", "PingFang SC", serif'; g.font = f; const w = Math.ceil(g.measureText(text).width) + 36; c.width = w; c.height = 64; g.font = f; g.fillStyle = bg; g.fillRect(0, 0, w, 64); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return { t, aspect: w / 64 }; }
  function makeLabel(text, fg, bg, h, font) { const { t, aspect } = labelTex(text, fg, bg, font); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.userData = { text, fg, bg, h, font }; s.scale.set(h * aspect, h, 1); labels.push(s); return s; }
  function setLabel(s, text, fg, bg) { Object.assign(s.userData, { text, fg: fg || s.userData.fg, bg: bg || s.userData.bg }); const { t, aspect } = labelTex(s.userData.text, s.userData.fg, s.userData.bg, s.userData.font); if (s.material.map) s.material.map.dispose(); s.material.map = t; s.material.needsUpdate = true; s.scale.set(s.userData.h * aspect, s.userData.h, 1); }
  const vBanners = [];
  function vTex(text, bg, fg) { const c = document.createElement('canvas'); c.width = 64; c.height = 64 * text.length + 24; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = '#b8975a'; g.lineWidth = 3; g.strokeRect(4, 4, c.width - 8, c.height - 8); g.fillStyle = fg; g.font = '44px "Ma Shan Zheng", "STKaiti", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; [...text].forEach((ch, i) => g.fillText(ch, 32, 44 + i * 64)); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t; }
  function makeBanner(text, bg, fg, w) { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (64 * text.length + 24) / 64), new THREE.MeshLambertMaterial({ map: vTex(text, bg, fg), side: THREE.DoubleSide })); vBanners.push({ mesh, text, bg, fg }); return mesh; }
  const glowSprite = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(size, size, 1); return s; };
  const lanternMeshes = [];
  function addLantern(group, x, y, z, list, seed) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 10), M.silk); lamp.position.set(x, y, z); group.add(lamp); lanternMeshes.push(lamp);
    const cap = new THREE.CylinderGeometry(0.06, 0.095, 0.035, 10);
    const top = new THREE.Mesh(cap, M.gold); top.position.set(x, y + 0.115, z); group.add(top);
    const bot = new THREE.Mesh(cap, M.gold); bot.position.set(x, y - 0.115, z); bot.rotation.x = Math.PI; group.add(bot);
    const tassel = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.1, 0.014), M.tassel); tassel.position.set(x, y - 0.19, z); group.add(tassel);
    const flame = glowSprite(0xffa860, 0.5); flame.position.set(x, y, z); group.add(flame);
    list.push({ wx: x, wz: z, wy: y, seed: seed || 0, flame });
  }
  function figure(group, x, z, ry, color) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; group.add(g); const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.62, 10), new THREE.MeshLambertMaterial({ color })); robe.position.y = 0.31; g.add(robe); const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), M.skin); head.position.y = 0.72; g.add(head); const hat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), M.black); hat.position.y = 0.82; g.add(hat); const wings = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.025), M.black); wings.position.set(0, 0.8, -0.03); g.add(wings); return g; }

  // 墨妖：四足兽，双角、獠牙、鬃刺、尾，赤色眼缝；正面朝 +z
  function beastModel(scale, boss) {
    const root = new THREE.Group(), g = new THREE.Group(); root.add(g); g.scale.setScalar(scale);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M.beast); body.scale.set(1, 0.78, 1.35); body.position.y = 0.36; g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M.beastRed); belly.scale.set(1, 0.5, 1.2); belly.position.set(0, 0.27, 0.02); g.add(belly);
    const head = new THREE.Group(); head.position.set(0, 0.46, 0.3); g.add(head);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.22), M.beast); head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.14), M.beast); snout.position.set(0, -0.04, 0.16); head.add(snout);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.16), M.beastRed); jaw.position.set(0, -0.12, 0.14); head.add(jaw);
    [-1, 1].forEach(sx => {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 6), M.bone); tusk.position.set(sx * 0.07, -0.1, 0.22); tusk.rotation.x = Math.PI; head.add(tusk);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.24, 6), boss ? M.gold : M.bone); horn.position.set(sx * 0.1, 0.18, -0.02); horn.rotation.z = -sx * 0.5; horn.rotation.x = -0.4; head.add(horn);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.01), M.eye); eye.position.set(sx * 0.07, 0.03, 0.115); eye.rotation.z = sx * 0.25; head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.03), M.beastRed); brow.position.set(sx * 0.07, 0.07, 0.11); brow.rotation.z = sx * 0.35; head.add(brow);
    });
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), M.beastRed); sp.position.set(0, 0.55 - k * 0.015, 0.16 - k * 0.1); sp.rotation.x = -0.5; g.add(sp); }
    const legs = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.26, 6), M.beast); leg.position.set(sx * 0.14, 0.13, sz * 0.17); g.add(leg); legs.push(leg); const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 5), M.bone); claw.position.set(sx * 0.14, 0.02, sz * 0.17 + 0.05); claw.rotation.x = Math.PI / 2; g.add(claw); });
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.36, 6), M.beast); tail.position.set(0, 0.45, -0.38); tail.rotation.x = -1.0; g.add(tail);
    const aura = glowSprite(0xa3312a, boss ? 2.2 : 0.9); aura.position.y = 0.4 * scale; aura.material.opacity = 0.3; root.add(aura);
    return { root, g, head, jaw, legs, tail, aura, body };
  }

  // 灯光
  const ambient = new THREE.AmbientLight(0x4a5560, 0.62); scene.add(ambient);
  const sky = new THREE.DirectionalLight(0xa8bccf, 0); sky.position.set(-6, 10, -4); scene.add(sky);
  const hand = new THREE.PointLight(0xffb36b, 1.4, 6.5, 1.6); scene.add(hand);
  const pool = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffa860, 1.2, 4.4, 1.8); scene.add(l); return l; });
  const bossLight = new THREE.PointLight(0xc8442f, 0, 4.5, 1.8); scene.add(bossLight);

  // ═════════════ 昼夜 ═════════════
  const TOD = {
    day: { name: '日', bg: 0xb9c2c0, fog: 0.022, amb: [0xfff1dc, 1.05], sky: [0xfff4e0, 0.9], lamps: false, stars: false, moon: false, hand: 0, txt: '日中 · 市井正热', end: '宵禁' },
    dusk: { name: '暮', bg: 0x4a3a3e, fog: 0.035, amb: [0xd9a37a, 0.62], sky: [0xffa070, 0.45], lamps: true, stars: false, moon: false, hand: 0.5, txt: '华灯初上', end: '宵禁' },
    night: { name: '夜', bg: 0x0c131c, fog: 0.045, amb: [0x55657a, 0.55], sky: [0xa8bccf, 0.5], lamps: true, stars: true, moon: true, hand: 0.7, txt: '更夫巡夜 · 全城灯火', end: '天亮' },
    dawn: { name: '晓', bg: 0x6a7480, fog: 0.03, amb: [0xb8c4d0, 0.72], sky: [0xd8dde6, 0.5], lamps: true, stars: false, moon: false, hand: 0.3, txt: '拂晓 · 灯将熄', end: '天亮' }
  };
  const todOfHour = h => h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night';
  let todKey = todOfHour(new Date().getHours()), todManual = false;
  const shiOfHour = h => SHI[Math.floor(((h + 1) % 24) / 2)];

  // ═════════════ 地上：回放广场（课程城 / 带货城共用，楼阁按城切换） ═════════════
  const SLOTS = Math.max(4, HALLS.length);
  const SW = { name: 'surface', cols: Math.max(23, SLOTS * 5 + 3), rows: 19 };
  const CX = Math.floor(SW.cols / 2), HX0 = Math.floor((SW.cols - SLOTS * 5) / 2) + 1, HOFF = Math.floor((SLOTS - HALLS.length) / 2); // 讲次不足 4 座时居中，两侧补民居
  const U = { px: CX, py: 11, dir: 0 };
  function hall(group, cx, cz, w, d, tiers) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); group.add(g);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.22, d + 0.2), M.stone); plat.position.y = 0.11; g.add(plat);
    let y = 0.24, doorPanel = null;
    for (let t = 0; t < tiers; t++) {
      const bw = (w - 0.5) * (1 - t * 0.24), bd = (d - 0.6) * (1 - t * 0.26), bh = t === 0 ? 0.92 : 0.5;
      const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), M.wood); body.position.y = y + bh / 2; g.add(body);
      const n = t === 0 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const x = -bw / 2 + 0.05 + i * (bw - 0.1) / (n - 1);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, bh, 8), M.cinna); col.position.set(x, y + bh / 2, bd / 2 + 0.05); g.add(col);
        if (i < n - 1) { const pw = (bw - 0.1) / (n - 1) - 0.12; const pnl = new THREE.Mesh(new THREE.PlaneGeometry(pw, bh * 0.78), new THREE.MeshBasicMaterial({ map: latticeTex, color: 0xb89a70 })); pnl.position.set(x + (bw - 0.1) / (n - 1) / 2, y + bh * 0.48, bd / 2 + 0.012); g.add(pnl); if (t === 0 && i === 1) doorPanel = pnl; }
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.12, 0.06, 0.08), M.cinna); beam.position.set(0, y + bh - 0.03, bd / 2 + 0.06); g.add(beam);
      y += bh + 0.06;
      const rw = bw + 0.8, rd = bd + 0.8, rh = t === tiers - 1 ? 0.62 : 0.44;
      const eave = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.05, rd), M.wood); eave.position.y = y + 0.02; g.add(eave);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1, rh, 4, 1), M.tile); roof.rotation.y = Math.PI / 4; roof.scale.set(rw / 1.414, 1, rd / 1.414); roof.position.y = y + 0.05 + rh / 2; g.add(roof);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), M.gold); c.position.set(sx * rw / 2, y + 0.1, sz * rd / 2); c.rotation.z = -sx * 0.7; c.rotation.x = sz * 0.7; g.add(c); });
      y += 0.05 + rh * 0.5;
    }
    return { g, doorPanel, top: y };
  }
  function stoneLantern(group, x, z, list) { const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g); const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), M.stone); base.position.y = 0.06; g.add(base); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), M.stone); post.position.y = 0.37; g.add(post); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), M.lampOn); lamp.position.y = 0.72; g.add(lamp); lanternMeshes.push(lamp); const roof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.16, 4), M.stoneDark); roof.rotation.y = Math.PI / 4; roof.position.y = 0.9; g.add(roof); const glow = glowSprite(0xffb36b, 0.8); glow.position.y = 0.72; g.add(glow); list.push({ wx: x, wz: z, wy: 0.72, seed: x * 3 + z, flame: glow }); }
  function stall(group, cx, cz, w, c1, c2, name, list) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); group.add(g);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.44, 0.42), M.wood); counter.position.set(0, 0.22, -0.12); g.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.04, 0.5), M.cinna); top.position.set(0, 0.46, -0.12); g.add(top);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.9, 0.06), M.wood); back.position.set(0, 0.45, 0.42); g.add(back);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), M.wood); p.position.set(sx * (w / 2 - 0.1), 0.6, sz * 0.42 - 0.05); g.add(p); });
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, 1.15), new THREE.MeshLambertMaterial({ map: clothTex(c1, c2), side: THREE.DoubleSide })); canopy.rotation.x = -Math.PI / 2 - 0.32; canopy.position.set(0, 1.22, -0.05); g.add(canopy);
    const banner = makeBanner(name, '#efe2c4', '#2a1d16', 0.2); banner.position.set(-(w / 2 - 0.1), 0.78, -0.5); banner.rotation.y = Math.PI; g.add(banner);
    addLantern(g, w / 2 - 0.1, 1.0, -0.5, [], 0); list.push({ wx: cx + w / 2 - 0.1, wz: cz - 0.5, wy: 1.0, seed: cx, flame: null });
  }
  const SHOP_COLORS = [['#2f4a52', '#d8ccb0'], ['#6b2a20', '#d8ccb0'], ['#3e3a52', '#d8ccb0'], ['#5a3a22', '#d8ccb0']];
  const sky3 = {};
  // 铺子：带货场按商品讲解段（殿室）开店；课程场每讲一间书坊，进去看讲义
  function stalls() {
    if (sceneKey === 'commerce') {
      const r = HALLS.find(h => h.state === 'open'); if (!r) return [];
      return r.game.rooms.slice(0, 4).map((rm, i) => ({ name: shortTitle(rm.title).slice(0, 3) + '铺', product: { name: rm.title, desc: rm.summary, detail: rm.keywords.join(' · '), start: rm.start, end: rm.end, room: i, replay: r, quotes: r.game.subs.filter(s => s.t >= rm.start && s.t <= rm.end).map(s => s.text).slice(0, 6) } }));
    }
    return HALLS.filter(h => h.state === 'open').slice(0, 4).map(r => ({ name: '书坊', handout: r }));
  }
  function coverTex(r) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
    g.fillStyle = '#1a1410'; g.fillRect(0, 0, 320, 180); g.strokeStyle = '#b8975a'; g.lineWidth = 4; g.strokeRect(6, 6, 308, 168);
    g.fillStyle = '#e6cf98'; g.font = '30px "Ma Shan Zheng", "STKaiti", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(shortTitle(r.title), 160, 80); g.font = '16px "Noto Serif SC", serif'; g.fillStyle = '#a99d86'; g.fillText('第' + cn(r.no) + unit + ' · ' + fmt(r.duration), 160, 124);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
    if (r.cover) new THREE.TextureLoader().setCrossOrigin('anonymous').load(r.cover, img => { t.image = img.image; t.needsUpdate = true; }, undefined, () => {});
    return t;
  }
  function hallPlaque(r) { const b = building(r); return '第' + cn(r.no) + unit + ' · ' + (b ? b.name : shortTitle(r.title)) + (G.cleared[r.id] ? ' · 已破' : r.state === 'locked' ? ' · 未开' : ''); }
  function refreshHalls() { SW.entities.forEach(e => { if (e.type !== 'hall') return; e.flag.visible = !!G.cleared[e.replay.id]; setLabel(e.plaque, hallPlaque(e.replay)); }); }
  function buildSurface() {
    const W = SW; W.group = new THREE.Group(); scene.add(W.group);
    W.grid = Array.from({ length: W.rows }, (_, y) => Array.from({ length: W.cols }, (_, x) => (x === 0 || y === 0 || x === W.cols - 1 || y === W.rows - 1) ? 2 : 1));
    W.lights = []; W.entities = []; W.seen = new Uint8Array(W.cols * W.rows).fill(1);
    const grp = W.group;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: 0x15171a })); outer.rotation.x = -Math.PI / 2; outer.position.set(W.cols / 2, -0.01, W.rows / 2); grp.add(outer);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W.cols - 2, W.rows - 2), new THREE.MeshLambertMaterial({ map: plazaTex })); plazaTex.repeat.set(W.cols - 2, W.rows - 2); ground.rotation.x = -Math.PI / 2; ground.position.set(W.cols / 2, 0, W.rows / 2); grp.add(ground);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(1.2, W.rows - 6), M.stone); road.rotation.x = -Math.PI / 2; road.position.set(CX + 0.5, 0.004, W.rows / 2 + 0.5); grp.add(road);
    const m = new THREE.Matrix4(), walls = []; for (let y = 0; y < W.rows; y++) for (let x = 0; x < W.cols; x++) if (W.grid[y][x] === 2) walls.push([x, y]);
    const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.2, 1), M.cityWall, walls.length); walls.forEach(([x, y], i) => { m.makeTranslation(x + 0.5, 0.6, y + 0.5); wm.setMatrixAt(i, m); }); wm.instanceMatrix.needsUpdate = true; wm.frustumCulled = false; grp.add(wm);
    for (let x = 3; x < W.cols - 2; x += 4) { addLantern(grp, x + 0.5, 0.95, 1.12, W.lights, x); addLantern(grp, x + 0.5, 0.95, W.rows - 1.12, W.lights, x + 1); }
    const mtn = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 16, 48, 1, true), new THREE.MeshBasicMaterial({ map: mountainTex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })); mtn.position.set(W.cols / 2, 5.5, W.rows / 2); grp.add(mtn);
    sky3.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true })); sky3.moon.scale.set(14, 14, 1); sky3.moon.position.set(W.cols / 2 - 14, 22, -26); grp.add(sky3.moon);
    const starPos = [], sr = mulberry32(11); for (let i = 0; i < 500; i++) { const a = sr() * Math.PI * 2, e = 0.25 + sr() * 1.2, R = 60; starPos.push(W.cols / 2 + Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, W.rows / 2 + Math.sin(a) * Math.cos(e) * R); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)); sky3.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8e2d0, size: 0.18, fog: false, transparent: true, opacity: 0.8 })); grp.add(sky3.stars);
    const hallX = {};
    for (let i = 0; i < SLOTS; i++) {
      const x0 = HX0 + i * 5, tiles = []; for (let y = 2; y <= 3; y++) for (let x = x0; x < x0 + 3; x++) tiles.push([x, y]);
      const r = HALLS[i - HOFF];
      if (!r) { const h = hall(grp, x0 + 1.5, 3, 3, 2, 1); if (h.doorPanel) h.doorPanel.material.color.setHex(0x3a3530); W.entities.push({ id: 'house' + i, type: 'deco', tiles, x: x0 + 1, y: 3 }); continue; }
      hallX[r.id] = x0 + 1.5;
      const h = hall(grp, x0 + 1.5, 3, 3, 2, r.views >= 30 ? 3 : r.views >= 10 ? 2 : 1);
      if (h.doorPanel) h.doorPanel.material.color.setHex(r.state === 'open' ? 0xffe0a0 : 0x3a3530);
      const plaque = makeLabel(hallPlaque(r), '#e6cf98', 'rgba(30,18,12,0.92)', 0.19, '400 44px "Ma Shan Zheng", "STKaiti", serif'); plaque.position.set(x0 + 1.5, h.top + 0.32, 4.1); grp.add(plaque);
      const flag = new THREE.Group(); const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshLambertMaterial({ color: 0xa3312a, side: THREE.DoubleSide })); cloth.position.set(x0 + 0.37, 1.24, 4.25); flag.add(cloth); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), M.wood); pole.position.set(x0 + 0.15, 0.7, 4.25); flag.add(pole); grp.add(flag); flag.visible = !!G.cleared[r.id];
      if (r.state === 'open') {
        const fr = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.08, 0.04), M.gold); fr.position.set(x0 + 1.5, 1.05, 4.28); grp.add(fr);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 0.99), new THREE.MeshBasicMaterial({ map: coverTex(r) })); screen.position.set(x0 + 1.5, 1.05, 4.31); grp.add(screen);
        const tip = makeLabel('绢幕 · 看完整回放 / 入密室', '#f0dfb6', 'rgba(13,15,19,0.8)', 0.12); tip.position.set(x0 + 1.5, 0.42, 4.34); grp.add(tip);
        W.lights.push({ wx: x0 + 1.5, wz: 4.4, wy: 0.7, seed: i, flame: null });
      }
      W.entities.push({ id: 'hall' + r.id, type: 'hall', replay: r, tiles, x: x0 + 1, y: 3, plaque, flag });
    }
    // 街名：挂在北墙上，居中于这条街的楼阁
    (D.city.streets || []).forEach(st => { const xs = st.replays.map(id => hallX[id]).filter(x => x != null); if (!xs.length) return; const lbl = makeLabel(st.name, '#f0dfb6', 'rgba(60,24,14,0.92)', 0.22, '400 44px "Ma Shan Zheng", "STKaiti", serif'); lbl.position.set(xs.reduce((a, b) => a + b, 0) / xs.length, 1.5, 1.08); grp.add(lbl); });
    [[CX - 5, 6], [CX + 5, 6], [CX - 5, 10], [CX + 5, 10]].forEach(([x, y]) => { stoneLantern(grp, x + 0.5, y + 0.5, W.lights); W.entities.push({ id: 'lamp' + x + y, type: 'deco', tiles: [[x, y]], x, y }); });
    // 更夫：城级 NPC 台词（AI 生成）
    (D.city.npcs || []).slice(0, 2).forEach((n, i) => { const x = CX + (i ? -2 : 2), y = 8; figure(grp, x + 0.5, y + 0.5, i ? Math.PI / 2 : -Math.PI / 2, i ? 0x4a3a28 : 0x3b4a44); const lbl = makeLabel(n.name, '#ffe7a0', 'rgba(16,30,34,0.92)', 0.11); lbl.position.set(x + 0.5, 1.1, y + 0.5); grp.add(lbl); W.entities.push({ id: 'crier' + i, type: 'crier', npc: n, tiles: [[x, y]], x, y }); });
    stalls().forEach((s, i) => {
      const x0 = HX0 + i * 5, [c1, c2] = SHOP_COLORS[i % 4];
      stall(grp, x0 + 1.5, 14.5, 3, c1, c2, s.name, W.lights);
      figure(grp, x0 + 1.5, 14.95, Math.PI, [0x3b4a44, 0x5a2a22, 0x3e3a52, 0x4a3a28][i % 4]);
      const text = s.product ? s.name + ' · ' + shortTitle(s.product.name) : s.name + ' · 第' + cn(s.handout.no) + unit + '讲义';
      const lbl = makeLabel(text, '#e6cf98', 'rgba(20,16,12,0.9)', 0.15, '400 44px "Ma Shan Zheng", "STKaiti", serif'); lbl.position.set(x0 + 1.5, 1.7, 14.1); grp.add(lbl);
      const tiles = []; for (let x = x0; x < x0 + 3; x++) tiles.push([x, 14]);
      W.entities.push({ id: 'shop' + i, type: 'shop', ...s, tiles, x: x0 + 1, y: 14 });
    });
  }

  // ═════════════ 地下：密室（按场景数据生成，每室一种任务） ═════════════
  const TOOLS = { oil: { name: '灯油', use: '点亮暗室的门' }, fish: { name: '铜鱼符', use: '开 Boss 之门' }, page: { name: '卷宗残页', use: '凭此出月洞门' } };
  const TASKS = {
    collect: { name: '拾灯', goal: '找齐散落的三盏灯' },
    evidence: { name: '寻证', goal: '在回放里找到先生的原话' },
    twin: { name: '双门', goal: '读石碑上的疑问，走进对的那扇门' },
    sort: { name: '找同类', goal: '把竹签送进同类的木匣' },
    assemble: { name: '拼原话', goal: '提灯找出三片残句，在碑前拼回原话' },
    beasts: { name: '驱墨妖', goal: '举灯击退墨妖（空格）' },
    boss: { name: 'Boss', goal: '连破三问，散去 Boss' }
  };
  const ORDER = ['collect', 'evidence', 'twin', 'sort', 'assemble', 'beasts'];
  let PW = null;

  function makePalace(sc) {
    const N = sc.rooms.length, BOSS = sc.boss_room, CW = 13, CH = 11;
    const W = { name: 'palace', sceneKey, cols: CW * Math.min(3, N) + 1, rows: CH * Math.ceil(N / 3) + 1, N, BOSS, entities: [], lights: [] };
    const rnd = mulberry32(N * 31 + BOSS), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    W.grid = Array.from({ length: W.rows }, () => new Array(W.cols).fill(0));
    W.roomOf = Array.from({ length: W.rows }, () => new Array(W.cols).fill(-1));
    W.rooms = sc.rooms.map((_, i) => { const row = Math.floor(i / 3), col = row % 2 === 0 ? i % 3 : 2 - (i % 3); const w = ri(8, 10), h = ri(6, 8), x = col * CW + 2 + ri(0, CW - 3 - w), y = row * CH + 2 + ri(0, CH - 3 - h); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { W.grid[yy][xx] = 1; W.roomOf[yy][xx] = i; } return { i, x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) }; });
    W.doorAt = [];
    for (let i = 0; i < N - 1; i++) { const a = W.rooms[i], b = W.rooms[i + 1], path = []; let x = a.cx, y = a.cy; while (x !== b.cx) { x += Math.sign(b.cx - x); path.push([x, y]); } while (y !== b.cy) { y += Math.sign(b.cy - y); path.push([x, y]); } path.forEach(([px, py]) => { if (W.grid[py][px] === 0) W.grid[py][px] = 1; }); W.doorAt[i + 1] = path[path.findIndex(([px, py]) => W.roomOf[py][px] === i + 1) - 1]; }
    for (let y = 0; y < W.rows; y++) for (let x = 0; x < W.cols; x++) { if (W.grid[y][x] !== 0) continue; let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < W.rows && xx >= 0 && xx < W.cols && W.grid[yy][xx] === 1) { near = true; break; } } if (near) W.grid[y][x] = 2; }
    W.lampSpots = []; W.rooms.forEach(r => [r.x + 1, r.x + r.w - 2].forEach(tx => { if (W.grid[r.y - 1][tx] === 2) W.lampSpots.push({ x: tx, y: r.y - 1, seed: rnd() * 10 }); }));
    const taken = [], free = (x, y) => !taken.some(([a, b]) => Math.abs(a - x) <= 1 && Math.abs(b - y) <= 1);
    const place = (r, edge) => { const cand = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { if (x === r.cx || y === r.cy) continue; if (edge && !(x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1)) continue; if (free(x, y)) cand.push([x, y]); } const p = cand[Math.floor(rnd() * cand.length)] || [r.x, r.y]; taken.push(p); return p; };
    // 任务分配：非 Boss 殿室按 ORDER 轮流
    let k = 0; W.task = sc.rooms.map((_, i) => i === BOSS ? 'boss' : ORDER[k++ % ORDER.length]);
    const evidenceRoom = W.task.indexOf('evidence'), twinRoom = W.task.indexOf('twin');
    W.dark = evidenceRoom >= 0 && twinRoom > evidenceRoom ? twinRoom : -1;
    const pickItem = (i, by) => sc.rooms[i].items.slice().sort(by)[0];
    sc.rooms.forEach((room, i) => {
      const r = W.rooms[i], t = W.task[i];
      if (i > 0) { const [dx, dy] = W.doorAt[i]; W.entities.push({ id: 'door' + i, type: 'door', room: i, x: dx, y: dy, requires: i === BOSS ? 'fish' : i === W.dark ? 'oil' : null }); }
      if (t === 'collect') for (let n = 0; n < 3; n++) { const [x, y] = place(r, true); W.entities.push({ id: 'lamp' + i + n, type: 'pick', kind: 'lamp', room: i, x, y, pass: true }); }
      if (t === 'evidence') { const it = pickItem(i, (a, b) => b.explain.length - a.explain.length); const [x, y] = place(r); W.entities.push({ id: 'desk' + i, type: 'desk', room: i, x, y, item: it, reward: 'oil' }); }
      if (t === 'twin') { const it = pickItem(i, (a, b) => a.options[0].length - b.options[0].length); const [sx, sy] = place(r); W.entities.push({ id: 'stele' + i, type: 'stele', room: i, x: sx, y: sy, item: it }); const good = Math.random() < 0.5 ? 0 : 1; [0, 1].forEach(g => { const [x, y] = place(r, true); W.entities.push({ id: 'gate' + i + g, type: 'gate', room: i, x, y, item: it, text: it.options[g === good ? 0 : 1], ok: g === good }); }); }
      if (t === 'sort') {
        const pool = sc.rooms.map((rm, j) => ({ j, kw: [...new Set(rm.keywords)].filter(w => w.length <= 12) })).filter(o => o.j !== BOSS && o.kw.length >= 2);
        const cats = pool.sort((a, b) => Math.abs(a.j - i) - Math.abs(b.j - i)).slice(0, 3), used = new Set();
        cats.forEach((c, ci) => { const [x, y] = place(r, true); W.entities.push({ id: 'box' + i + ci, type: 'box', room: i, x, y, cat: ci, name: shortTitle(sc.rooms[c.j].title), got: 0 }); c.kw.filter(w => !used.has(w)).slice(0, 2).forEach((w, wi) => { used.add(w); const [tx, ty] = place(r); W.entities.push({ id: 'tok' + i + ci + wi, type: 'pick', kind: 'token', room: i, x: tx, y: ty, hx: tx, hy: ty, cat: ci, text: w, pass: true }); }); });
      }
      if (t === 'assemble') {
        const it = pickItem(i, (a, b) => b.source_quote.length - a.source_quote.length), q = it.source_quote.replace(/[「」"]/g, '');
        const cut = n => { const parts = q.split(/(?<=[，。；、,;])/).filter(Boolean); if (parts.length >= 3) { const a = Math.ceil(parts.length / 3); return [parts.slice(0, a).join(''), parts.slice(a, 2 * a).join(''), parts.slice(2 * a).join('')].filter(Boolean); } const L = Math.ceil(q.length / 3); return [q.slice(0, L), q.slice(L, 2 * L), q.slice(2 * L)]; };
        const parts = cut().filter(Boolean);
        const decoys = sc.rooms.filter((_, j) => j !== i).map(rm => rm.items[0] && rm.items[0].source_quote.slice(0, 8)).filter(Boolean).slice(0, 2);
        const [sx, sy] = place(r); W.entities.push({ id: 'stele' + i, type: 'astele', room: i, x: sx, y: sy, item: it, parts });
        parts.forEach((p, pi) => { const [x, y] = place(r, true); W.entities.push({ id: 'frag' + i + pi, type: 'pick', kind: 'frag', room: i, x, y, text: p, real: true, pass: true }); });
        decoys.forEach((p, pi) => { const [x, y] = place(r, true); W.entities.push({ id: 'fake' + i + pi, type: 'pick', kind: 'frag', room: i, x, y, text: p, real: false, pass: true }); });
      }
      if (t === 'beasts') for (let n = 0; n < 3; n++) { const [x, y] = place(r); W.entities.push({ id: 'beast' + i + n, type: 'beast', room: i, x, y, hp: 3, item: room.items[n % room.items.length] }); }
      if (t === 'boss') { const [x, y] = place(r); W.entities.push({ id: 'boss', type: 'boss', room: i, x, y, items: room.items.slice(0, 3), hp: Math.min(3, room.items.length), drop: 'page' }); }
      sc.faq.filter(f => f.room === i).slice(0, 1).forEach(f => { const [x, y] = place(r); W.entities.push({ id: 'npc' + i, type: 'npc', room: i, x, y, faq: f }); });
    });
    // 铜鱼符由 Boss 前一室的一只墨妖携带
    const fr = Math.max(0, BOSS - 1), carrier = W.entities.find(e => e.type === 'beast' && e.room === fr);
    if (carrier) carrier.drop = 'fish'; else { const [x, y] = place(W.rooms[fr]); W.entities.push({ id: 'beastF', type: 'beast', room: fr, x, y, hp: 3, drop: 'fish', item: sc.rooms[fr].items[0] }); }
    const last = W.rooms[N - 1]; W.entities.push({ id: 'portal', type: 'portal', room: N - 1, x: last.cx, y: last.cy });
    W.start = { x: W.rooms[0].cx, y: W.rooms[0].cy };
    return W;
  }

  function buildPalace() {
    if (PW && PW.group) scene.remove(PW.group);
    PW = makePalace(cur()); const W = PW; W.group = new THREE.Group(); scene.add(W.group); const grp = W.group;
    const walls = [], floors = [], corrs = [];
    for (let y = 0; y < W.rows; y++) for (let x = 0; x < W.cols; x++) { if (W.grid[y][x] === 2) walls.push([x, y]); else if (W.grid[y][x] === 1) (W.roomOf[y][x] >= 0 ? floors : corrs).push([x, y]); }
    const m = new THREE.Matrix4(), inst = (geo, mat, list, yy) => { const mesh = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([x, y], i) => { m.makeTranslation(x + 0.5, yy, y + 0.5); mesh.setMatrixAt(i, m); }); mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; grp.add(mesh); };
    inst(new THREE.BoxGeometry(1, WALL_H, 1), M.wall, walls, WALL_H / 2);
    const fg = new THREE.PlaneGeometry(1, 1); fg.rotateX(-Math.PI / 2); inst(fg, M.floor, floors, 0); inst(fg, M.corridor, corrs, 0);
    const cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(Math.PI / 2); inst(cg, M.ceil, floors.concat(corrs), WALL_H);
    const panels = [], cols = [], one = new THREE.Vector3(1, 1, 1), Qy = ry => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    W.rooms.forEach(r => { for (let k = 0; k < r.w; k += 2) { if (W.grid[r.y - 1][r.x + k] === 2) panels.push([r.x + k + 0.5, r.y + 0.012, 0]); if (W.grid[r.y + r.h][r.x + k] === 2) panels.push([r.x + k + 0.5, r.y + r.h - 0.012, Math.PI]); } for (let k = 0; k <= r.w; k += 2) { cols.push([r.x + k, r.y + 0.07]); cols.push([r.x + k, r.y + r.h - 0.07]); } });
    const pm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.6), new THREE.MeshBasicMaterial({ map: latticeTex, color: 0xc0a07a }), panels.length); panels.forEach(([x, z, ry], i) => { m.compose(new THREE.Vector3(x, 0.66, z), Qy(ry), one); pm.setMatrixAt(i, m); }); pm.instanceMatrix.needsUpdate = true; pm.frustumCulled = false; grp.add(pm);
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.056, WALL_H - 0.1, 10), M.cinna, cols.length); cols.forEach(([x, z], i) => { m.makeTranslation(x, WALL_H / 2, z); cm.setMatrixAt(i, m); }); cm.instanceMatrix.needsUpdate = true; cm.frustumCulled = false; grp.add(cm);
    W.lampSpots.forEach(sp => addLantern(grp, sp.x + 0.5, 0.95, sp.y + 1.24, W.lights, sp.seed));
    if (W.dark >= 0) { const r = W.rooms[W.dark]; W.darkBox = new THREE.Mesh(new THREE.BoxGeometry(r.w, WALL_H, r.h), new THREE.MeshBasicMaterial({ color: 0x020203, transparent: true, opacity: 0.94, depthWrite: false, side: THREE.DoubleSide })); W.darkBox.position.set(r.x + r.w / 2, WALL_H / 2, r.y + r.h / 2); grp.add(W.darkBox); }
    W.entities.forEach(buildEntity);
    W.seen = new Uint8Array(W.cols * W.rows);
  }

  function buildEntity(e) {
    const g = new THREE.Group(); g.position.set(e.x + 0.5, 0, e.y + 0.5); PW.group.add(g); e.obj = g;
    const lbl = (text, fg, bg, h, y) => { e.label = makeLabel(text, fg, bg, h); e.label.position.y = y; g.add(e.label); };
    if (e.type === 'door') {
      g.rotation.y = PW.grid[e.y][e.x - 1] === 2 && PW.grid[e.y][e.x + 1] === 2 ? 0 : Math.PI / 2;
      e.leaf = new THREE.Mesh(new THREE.BoxGeometry(0.98, WALL_H - 0.04, 0.12), new THREE.MeshLambertMaterial({ map: doorTex })); e.leaf.position.y = WALL_H / 2; g.add(e.leaf);
      lbl(e.requires ? (e.requires === 'oil' ? '暗门 · 需灯油' : '铜锁门 · 需铜鱼符') : '门闭 · 先完成上一室', '#f0dfb6', 'rgba(26,16,10,0.9)', 0.11, WALL_H + 0.1);
      const tr = cur().traces[e.room]; if (tr && tr.wrong) { const mk = makeLabel(tr.wrong + ' 人倒在此门前', '#e9b7a8', 'rgba(60,18,14,0.85)', 0.08); mk.position.set(0, 0.06, 0.5); g.add(mk); }
    } else if (e.type === 'pick') {
      if (e.kind === 'lamp') { const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10), M.silkOff); lamp.position.y = 0.12; g.add(lamp); const gl = glowSprite(0xffc070, 0.45); gl.position.y = 0.14; gl.material.opacity = 0.5; g.add(gl); e.spin = lamp; }
      if (e.kind === 'token') { const slip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.02), M.bamboo); slip.position.y = 0.3; g.add(slip); e.spin = slip; lbl(e.text, '#2b2219', 'rgba(232,220,192,0.95)', 0.1, 0.62); }
      if (e.kind === 'frag') { const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), M.paper); pg.rotation.x = -Math.PI / 2 + 0.3; pg.position.y = 0.04; g.add(pg); e.glow = glowSprite(0xe8dcc0, 0.4); e.glow.position.y = 0.1; g.add(e.glow); e.spin = pg; lbl('残片', '#2b2219', 'rgba(232,220,192,0.9)', 0.08, 0.32); }
    } else if (e.type === 'desk') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.4), M.wood); top.position.y = 0.42; g.add(top);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), M.wood); l.position.set(sx * 0.3, 0.21, sz * 0.15); g.add(l); });
      const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), M.paper); scroll.rotation.z = Math.PI / 2; scroll.position.y = 0.48; g.add(scroll);
      lbl('案卷台 · 寻证', '#f0dfb6', 'rgba(20,16,12,0.9)', 0.11, 0.8);
    } else if (e.type === 'stele' || e.type === 'astele') {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.12), M.stone); s.position.y = 0.45; g.add(s);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.18), M.stoneDark); cap.position.y = 0.88; g.add(cap);
      lbl(e.type === 'stele' ? '石碑 · 疑问' : '残碑 · 拼原话', '#f0dfb6', 'rgba(20,16,12,0.9)', 0.11, 1.1);
    } else if (e.type === 'gate') {
      const fr = new THREE.Group(); g.add(fr);
      [-0.32, 0.32].forEach(dx => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), M.cinna); p.position.set(dx, 0.5, 0); fr.add(p); });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.1), M.cinna); beam.position.y = 1.0; fr.add(beam);
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshBasicMaterial({ map: latticeTex, color: 0x8a6a4a, side: THREE.DoubleSide })); veil.position.y = 0.48; fr.add(veil);
      lbl(e.text.slice(0, 18), '#2b2219', 'rgba(232,220,192,0.95)', 0.1, 1.18); e.face = true;
    } else if (e.type === 'box') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.34), M.wood); b.position.y = 0.15; g.add(b);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.36), M.cinna); band.position.y = 0.2; g.add(band);
      lbl('匣 · ' + e.name, '#f0dfb6', 'rgba(60,24,14,0.92)', 0.11, 0.55);
    } else if (e.type === 'beast' || e.type === 'boss') {
      const big = e.type === 'boss', b = beastModel(big ? 2.2 : 1.15, big); g.add(b.root); e.model = b; e.state = 'roam'; e.t = 0; e.maxHp = e.hp;
      lbl((big ? 'Boss · ' + (cur().scene === 'commerce' ? '刁客' : '众惑') : '墨妖') + ' ' + '◆'.repeat(e.hp) + (e.drop ? ' · 携' + TOOLS[e.drop].name : ''), big ? '#ffd2c6' : '#f0dfb6', big ? 'rgba(60,18,14,0.92)' : 'rgba(20,16,12,0.88)', big ? 0.14 : 0.1, big ? 1.65 : 0.95);
      if (big) bossLight.position.set(e.x + 0.5, 0.9, e.y + 0.5);
    } else if (e.type === 'npc') {
      const mat = new THREE.MeshLambertMaterial({ color: 0xe6eeee, emissive: 0x3f5a60, transparent: true, opacity: 0.7 }); const body = new THREE.Group(); g.add(body);
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.58, 14, 1, true), mat); robe.position.y = 0.44; body.add(robe);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshLambertMaterial({ color: 0xf0e2cf, emissive: 0x3a3028, transparent: true, opacity: 0.85 })); head.position.y = 0.82; body.add(head);
      const hat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.18), M.black); hat.position.y = 0.95; body.add(hat);
      lbl('书生灯影 · ' + e.faq.count + ' 人问过', '#ffe7a0', 'rgba(16,30,34,0.92)', 0.1, 1.15); e.body = body;
    } else if (e.type === 'portal') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 40), new THREE.MeshBasicMaterial({ color: 0x5a5f5c }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 40), new THREE.MeshBasicMaterial({ map: swirlTex, color: 0x3a3f44, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const st = new THREE.Group(); st.position.y = 0.6; st.add(ring); st.add(disc); g.add(st); Object.assign(e, { ring, disc });
      lbl('月洞门 · 需卷宗残页', '#ece3cf', 'rgba(16,22,26,0.9)', 0.11, 1.15);
    }
  }

  // ═════════════ 状态 ═════════════
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let mode = 'surface', CUR = SW, P, curRoom = -1, S = null;
  const G = { points: D.progress.points || 0, ledger: [], cleared: Object.fromEntries(Object.entries(D.progress.replays || {}).filter(([, v]) => v.cleared_at).map(([k]) => [k, true])) };
  let REAL_MINUTES = 8;
  const freshS = () => ({ px: PW.start.x, py: PW.start.y, dir: 1, lamps: 5, tools: {}, done: {}, gone: [], visited: [], wrong: [], carry: null, frags: [], lampsFound: 0, startedAt: performance.now(), startPoints: G.points, ended: false, parryUntil: 0, shake: 0, combo: 0 });
  const mv = { t: 1, fx: 0, fz: 0, tx: 0, tz: 0 }, tn = { t: 1, f: 0, to: 0 }, bump = { t: 1, dx: 0, dz: 0 };
  const anims = [];
  const pl = () => mode === 'palace' ? S : U;
  function syncPlayer() { const p = pl(); P = { x: p.px + 0.5, z: p.py + 0.5, yaw: -p.dir * Math.PI / 2 }; mv.t = tn.t = bump.t = 1; }

  function applyTod() {
    const T = TOD[todKey], inP = mode === 'palace';
    if (inP) { scene.background = new THREE.Color(0x07090c); scene.fog = new THREE.FogExp2(0x07090c, 0.16); ambient.color.setHex(0x4a5056); ambient.intensity = 0.55; sky.intensity = 0; hand.intensity = 1.4; }
    else { scene.background = new THREE.Color(T.bg); scene.fog = new THREE.FogExp2(T.bg, T.fog); ambient.color.setHex(T.amb[0]); ambient.intensity = T.amb[1]; sky.color.setHex(T.sky[0]); sky.intensity = T.sky[1]; hand.intensity = T.hand; }
    const lampsOn = inP || T.lamps;
    SW.lights.forEach(l => { if (l.flame) l.flame.visible = lampsOn; });
    lanternMeshes.forEach(mm => { if (isIn(mm, SW.group)) mm.material = mm.geometry.type === 'BoxGeometry' ? (lampsOn ? M.lampOn : M.stone) : (lampsOn ? M.silk : M.silkOff); });
    sky3.moon.visible = T.moon; sky3.stars.visible = T.stars; pool.forEach(l => { l.visible = lampsOn; });
    Music.setMood(inP ? (curRoom === PW?.BOSS && !S?.gone.includes('boss') ? 'boss' : 'palace') : todKey === 'day' ? 'day' : 'plaza');
    updateWatch();
  }
  function isIn(obj, root) { while (obj) { if (obj === root) return true; obj = obj.parent; } return false; }
  let fading = false;
  function transition(text, cb) { if (fading) return; fading = true; held.length = 0; $('#fadeText').textContent = text; $('#fade').classList.add('on'); setTimeout(() => { cb(); setTimeout(() => { $('#fade').classList.remove('on'); fading = false; }, 120); }, reduceMotion ? 50 : 480); }
  function setMode(m) {
    mode = m; CUR = m === 'palace' ? PW : SW;
    SW.group.visible = m === 'surface'; if (PW && PW.group) PW.group.visible = m === 'palace';
    const mmEl = $('#mm'); mmEl.width = CUR.cols * 4; mmEl.height = CUR.rows * 4;
    $('#where').textContent = m === 'palace' ? '密室' : D.city.name;
    $('#hint').innerHTML = m === 'palace' ? '<kbd>↑</kbd><kbd>↓</kbd> 前后 · <kbd>←</kbd><kbd>→</kbd> 转身 · <kbd>Q</kbd><kbd>E</kbd> 侧移 · <kbd>空格</kbd> 举灯（墨妖蓄力时举灯可格挡反击）· 面对物件按前进交互' : '<kbd>↑</kbd><kbd>↓</kbd>/<kbd>W</kbd><kbd>S</kbd> 前后 · <kbd>←</kbd><kbd>→</kbd>/<kbd>A</kbd><kbd>D</kbd> 转身 · 面对楼阁、铺子按前进';
    applyTod(); syncPlayer(); renderDossier();
  }
  function enterPalace() { transition('入 密 室', () => { REAL_MINUTES = (cur().world && cur().world.clock && cur().world.clock.real_minutes) || 8; buildPalace(); S = freshS(); if (hooks.onEnterPalace) hooks.onEnterPalace(curReplay); track('enter_palace'); setMode('palace'); curRoom = -1; markSeen(S.px, S.py, 2); enterRoom(0); toast('一夜十二时辰。每间密室有一件事要办，完成了下一扇门才开'); }); }
  function runStats() { return { points: Math.max(0, G.points - S.startPoints), roomsDone: Object.keys(S.done).length, lamps: S.lamps }; }
  function exitPalace() { if (S && !S.ended) { S.ended = true; if (hooks.onFinish) hooks.onFinish('abandoned', runStats()); } transition('回 广 场', () => { const h = SW.entities.find(e => e.type === 'hall' && e.replay.id === curReplay.id); U.px = h ? h.x + 1 : CX; U.py = 5; U.dir = 2; setMode('surface'); refreshHalls(); }); }

  // ═════════════ 移动、拾取、交互 ═════════════
  function doAction(a) {
    const p = pl();
    if (a === 'left' || a === 'right') { p.dir = (p.dir + (a === 'left' ? 3 : 1)) % 4; tn.f = P.yaw; tn.to = P.yaw + (a === 'left' ? 1 : -1) * Math.PI / 2; tn.t = 0; return; }
    const off = { fwd: 0, back: 2, sl: 3, sr: 1 }[a], [dx, dy] = DIRS[(p.dir + off) % 4]; tryStep(dx, dy, a === 'fwd');
  }
  const onTile = (e, x, y) => e.tiles ? e.tiles.some(([a, b]) => a === x && b === y) : (e.x === x && e.y === y);
  const alive = e => !(mode === 'palace' && S.gone.includes(e.id)) && !(e.scene && e.scene !== sceneKey);
  function blocker(x, y) { return CUR.entities.find(e => !e.pass && onTile(e, x, y) && alive(e)); }
  function tryStep(dx, dy, facing) {
    const p = pl(), nx = p.px + dx, ny = p.py + dy;
    if (ny < 0 || ny >= CUR.rows || nx < 0 || nx >= CUR.cols || CUR.grid[ny][nx] !== 1) { bump.t = 0; bump.dx = dx; bump.dz = dy; return; }
    const e = blocker(nx, ny);
    if (e) { held.length = 0; if (e.type === 'deco') { bump.t = 0; bump.dx = dx; bump.dz = dy; return; } if (!facing) { toast('转过身面对它，再按前进'); return; } interact(e); return; }
    p.px = nx; p.py = ny; mv.fx = P.x; mv.fz = P.z; mv.tx = nx + 0.5; mv.tz = ny + 0.5; mv.t = 0;
    if (mode === 'palace') { markSeen(nx, ny, 2); const r = PW.roomOf[ny][nx]; if (r >= 0) enterRoom(r); pickup(nx, ny); }
  }
  function pickup(x, y) {
    const e = PW.entities.find(e => e.pass && e.x === x && e.y === y && alive(e)); if (!e) return;
    if (e.kind === 'lamp') { gone(e); S.lampsFound++; G.points += 10; Music.sfx.good(); toast('拾得一盏灯（' + S.lampsFound + ' / 3）'); if (PW.entities.filter(x => x.kind === 'lamp' && x.room === e.room && alive(x)).length === 0) finishRoom(e.room, '三盏灯都点亮了'); }
    else if (e.kind === 'token') { if (S.carry) { toast('手里已经拿着「' + S.carry.text + '」，先送进木匣'); return; } S.carry = e; gone(e); toast('拿起竹签「' + e.text + '」，送到同类的木匣'); }
    else if (e.kind === 'frag') { gone(e); S.frags.push(e); toast('拾得残片：「' + e.text + '」'); }
    renderDossier();
  }
  function gone(e) { if (!S.gone.includes(e.id)) S.gone.push(e.id); e.obj.visible = false; }
  function finishRoom(i, msg) {
    if (S.done[i]) return; S.done[i] = true; G.points += 50; Music.sfx.good(); track('room_done', { room: i });
    toast(msg + ' · 第' + CN[i + 2] + '室的门可以推开了');
    const d = PW.entities.find(x => x.id === 'door' + (i + 1)); if (d) setLabel(d.label, d.requires ? (d.requires === 'oil' ? '暗门 · 需灯油' : '铜锁门 · 需铜鱼符') : '可推门', '#2b2219', 'rgba(232,220,192,0.95)');
    renderDossier();
  }
  function enterRoom(r) {
    if (!S.visited.includes(r)) S.visited.push(r);
    const rm = PW.rooms[r]; for (let y = rm.y - 1; y <= rm.y + rm.h; y++) for (let x = rm.x - 1; x <= rm.x + rm.w; x++) PW.seen[y * PW.cols + x] = 1;
    if (r !== curRoom) { curRoom = r; track('enter_room', { room: r }); $('#where').textContent = CN[r + 1] + ' · ' + shortTitle(cur().rooms[r].title) + ' · ' + TASKS[PW.task[r]].name; applyTod(); renderDossier(); if (!S.done[r]) toast('本室：' + TASKS[PW.task[r]].goal); }
  }
  function markSeen(px, py, rad) { for (let y = py - rad; y <= py + rad; y++) for (let x = px - rad; x <= px + rad; x++) if (y >= 0 && y < PW.rows && x >= 0 && x < PW.cols) PW.seen[y * PW.cols + x] = 1; }
  function interact(e) {
    ({ hall: openHall, shop: openShop, crier: openCrier, door: openDoor, desk: openEvidence, stele: openStele, gate: openGate, box: openBox, astele: openAssemble, beast: strikeBeast, boss: openBoss, npc: openNpc,
       portal: () => { if (S.tools.page) openResult(true); else toast('月洞门紧闭：需先散去 Boss、取得卷宗残页'); } }[e.type] || (() => {}))(e);
  }

  // ═════════════ 卷宗与时辰 ═════════════
  function renderDossier() {
    const inP = mode === 'palace' && S;
    let html = '<h4>随 身 卷 宗</h4>';
    if (inP) {
      html += '<div class="row"><span>灯</span><span class="lamps">' + Array.from({ length: 5 }, (_, i) => '<i class="' + (i < S.lamps ? '' : 'off') + '"></i>').join('') + '</span></div>';
      html += '<div class="row"><span>积分</span><b>' + G.points + '</b></div>';
      html += '<div class="slots">' + Object.keys(TOOLS).map(k => '<div class="slot ' + (S.tools[k] ? 'has' : '') + '" title="' + TOOLS[k].use + '">' + (S.tools[k] ? TOOLS[k].name : '—') + '</div>').join('') + (S.carry ? '<div class="slot has">手持<br>' + esc(S.carry.text.slice(0, 6)) + '</div>' : '') + (S.frags.length ? '<div class="slot has">残片<br>×' + S.frags.length + '</div>' : '') + '</div>';
      if (curRoom >= 0) { const t = PW.task[curRoom]; html += '<div class="task">' + CN[curRoom + 1] + '室 · <b>' + TASKS[t].name + '</b>' + (S.done[curRoom] ? ' · 已完成' : '<br>' + TASKS[t].goal) + '</div>'; }
      html += '<div class="btns"><button class="btn" id="musBtn" type="button">乐 · ' + (Music.on ? '开' : '关') + '</button><button class="btn" id="upBtn" type="button">弃局回广场</button></div>';
    } else {
      html += '<div class="row"><span>积分</span><b>' + G.points + '</b></div><div class="row"><span>账簿</span><span>' + (G.ledger.length ? G.ledger.length + ' 件待下单' : '空') + '</span></div>';
      html += '<div class="btns"><button class="btn" id="sceneBtn" type="button">出城 ⇠</button><button class="btn" id="todBtn" type="button">时段 · ' + TOD[todKey].name + ' ⟳</button><button class="btn" id="musBtn" type="button">乐 · ' + (Music.on ? '开' : '关') + '</button></div>';
    }
    html += '<div class="seal" style="right:12px; bottom:-12px;">' + (inP ? '夜巡' : sceneKey === 'course' ? '课程' : '带货') + '</div>';
    if (!inP && D.viewer) html += '<div class="tiny" style="margin-top:4px">' + esc(D.viewer.nickname) + ' · 已破 ' + Object.keys(G.cleared).length + ' / ' + HALLS.filter(h => h.state === 'open').length + ' ' + unit + '</div>';
    $('#dossier').innerHTML = html;
    const on = (id, f) => { const b = $('#' + id); if (b) b.onclick = f; };
    on('todBtn', () => { const ks = Object.keys(TOD); todKey = ks[(ks.indexOf(todKey) + 1) % ks.length]; todManual = true; applyTod(); renderDossier(); });
    on('sceneBtn', () => { if (hooks.onExit) hooks.onExit(); });
    on('musBtn', () => { Music.init(); Music.toggle(); renderDossier(); });
    on('upBtn', () => exitPalace());
  }
  function updateWatch() {
    const now = new Date(), T = TOD[todKey];
    $('#watch').classList.toggle('day', mode === 'surface' && todKey === 'day');
    if (mode === 'palace' && S && !S.ended) {
      const p = Math.min(1, (performance.now() - S.startedAt) / (REAL_MINUTES * 60000)), left = Math.max(0, Math.ceil(12 * (1 - p)));
      $('#plate').textContent = SHI[(SHI.indexOf(shiOfHour(now.getHours())) + Math.floor(p * 12)) % 12] + '时';
      $('#watchMeta').innerHTML = '一夜十二时辰 ≈ ' + REAL_MINUTES + ' 分钟<br>距' + T.end + ' <b>' + NUM[left] + ' 个时辰</b><br>已破 ' + Object.keys(S.done).length + ' / ' + PW.N + ' 室';
      if (p >= 1) { S.ended = true; openResult(false); }
    } else {
      $('#plate').textContent = shiOfHour(now.getHours()) + '时';
      $('#watchMeta').innerHTML = T.txt + '<br>按你的本地时间 ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + (todManual ? ' · 演示切换为「' + T.name + '」' : '') + '<br><span style="opacity:.75">' + esc(D.city.name) + '</span>';
    }
  }

  // ═════════════ 弹窗工具 ═════════════
  const modal = $('#modal'), dialog = $('#dialog');
  let locked = false, bossTimer = null;
  let clip = null; // 弹窗里的回放片段播放器
  function stopClip() { if (clip) { clip.destroy(); clip = null; } }
  const newClip = autoplay => { stopClip(); clip = new LiveVideo(dialog.querySelector('.clip'), D.player, curReplay.video, { autoplay }); return clip; };
  function openModal(html, lock) { stopClip(); clearInterval(bossTimer); dialog.innerHTML = html; modal.hidden = false; held.length = 0; locked = !!lock; }
  function closeModal() { stopClip(); clearInterval(bossTimer); modal.hidden = true; locked = false; screenEl.focus({ preventScroll: true }); renderDossier(); }
  modal.addEventListener('click', ev => { if (ev.target === modal && !locked) closeModal(); });
  let toastTimer; function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800); }
  function flash() { const f = $('#flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 60); }
  const clipEl = () => clip;
  function hurt(msg) { track('fall', { room: curRoom }); S.lamps = Math.max(0, S.lamps - 1); S.shake = 0.35; S.combo = 0; flash(); Music.sfx.hit(); renderDossier(); if (msg) toast(msg); if (S.lamps === 0) setTimeout(openRekindle, 500); }

  // 封印：必须完整看完这一段回放（不计拖动），才能解封
  function openSeal({ title, why, from, to, onDone }) {
    const len = Math.max(8, to - from);
    openModal('<h4>封 印 · ' + esc(title) + '</h4><h2>看完这一段才能解封</h2><div class="trace">' + esc(why) + '</div>' +
      '<div class="clip"></div><div class="bar"><i id="sealBar" style="width:0"></i></div><div class="tiny" id="sealTip">回放 ' + fmt(from) + ' – ' + fmt(to) + ' · 拖动进度不计入</div>' +
      '<div class="btns"><button class="btn" type="button" id="sealPlay">▶ 播放</button><button class="btn red" type="button" id="sealOk" disabled>解封</button></div><div class="seal" style="right:16px;top:14px">封</div>', true);
    const v = newClip(true); let watched = 0, last = null;
    const go = () => { v.currentTime = from; v.play().catch(() => {}); };
    v.addEventListener('loadedmetadata', go, { once: true });
    v.addEventListener('timeupdate', () => { const t = v.currentTime; if (last !== null && t > last && t - last < 1.5) watched += t - last; last = t; const bar = $('#sealBar'), ok = $('#sealOk'); if (!bar || !ok) return; bar.style.width = Math.min(100, watched / len * 100) + '%'; if (t >= to) v.pause(); if (watched >= len * 0.85 || t >= to - 0.3) ok.disabled = false; });
    v.addEventListener('seeking', () => { last = null; });
    $('#sealPlay').onclick = () => { if (v.currentTime < from - 1 || v.currentTime > to) v.currentTime = from; v.paused ? v.play() : v.pause(); };
    $('#sealOk').onclick = () => { v.pause(); track('revive_watch', { room: curRoom, source_time: from, extra: { seconds: Math.round(watched), why: title } }); S.revives = (S.revives || 0) + 1; onDone(); };
  }
  function openRekindle() {
    const rooms = cur().rooms, r = rooms[Math.max(0, curRoom)];
    openSeal({ title: '灯尽', why: '五盏灯全灭了。静心看完这一段，灯会重新燃起三盏。', from: r.start, to: Math.min(r.end, r.start + 30), onDone: () => { S.lamps = 3; closeModal(); toast('灯复燃三盏'); } });
  }

  // 门
  function openDoor(e) {
    const prev = e.room - 1, name = CN[e.room + 1] + ' · ' + shortTitle(cur().rooms[e.room].title);
    if (!S.done[prev]) { toast('门闭着：先完成第' + CN[prev + 1] + '室的「' + TASKS[PW.task[prev]].name + '」'); return; }
    if (e.requires && !S.tools[e.requires]) { openModal('<h4>' + esc(name) + '</h4><h2>' + (e.requires === 'oil' ? '门后漆黑' : '铜锁封门') + '</h2><div class="say">' + (e.requires === 'oil' ? '门缝里透不出一丝光，没有灯油进不去。' : '一把鱼形锁眼的铜锁。需要「铜鱼符」——前面某只墨妖身上带着。') + '</div><div class="btns"><button class="btn" type="button" id="ok">退后</button></div><div class="seal" style="right:16px;top:14px">锁</div>'); $('#ok').onclick = closeModal; return; }
    gone(e); anims.push({ kind: 'door', e, t: 0 }); if (e.requires === 'oil' && PW.darkBox) PW.darkBox.visible = false;
    toast(e.requires ? '用「' + TOOLS[e.requires].name + '」开了门' : '门开了');
  }

  // 寻证：在回放字幕里搜到先生的原话
  function openEvidence(e) {
    if (S.done[e.room]) { toast('证据已找到'); return; }
    const it = e.item, subs = cur().subs, kws = [...new Set([it.keyword, ...cur().rooms[e.room].keywords])].slice(0, 5);
    openModal('<h4>案 卷 台 · 寻 证</h4><div class="q">' + esc(it.question) + '</div>' + (it.code ? '<pre>' + esc(it.code) + '</pre>' : '') +
      '<div class="tiny">不用答题：在回放里找到先生讲这件事的那一句。输入关键词搜字幕，点一句听听，确认后按「就是这句」。</div>' +
      '<div class="chips" style="margin:8px 0">' + kws.map(k => '<button class="chip" type="button">' + esc(k) + '</button>').join('') + '</div>' +
      '<input class="search" id="q" placeholder="搜回放字幕，如：负数、最后一个" autocomplete="off"><div class="hits" id="hits"><div class="tiny" style="padding:8px">输入关键词开始寻证</div></div>' +
      '<div class="clip"></div><div class="btns"><button class="btn red" type="button" id="pin" disabled>就是这句</button><button class="btn" type="button" id="close">先离开</button></div><div class="seal" style="right:16px;top:14px">证</div>');
    const v = newClip(false); let sel = null;
    const search = q => { q = q.trim(); const hits = q ? subs.filter(s => s.text.includes(q)).slice(0, 10) : []; $('#hits').innerHTML = hits.length ? hits.map(s => '<div class="hit" data-t="' + s.t + '"><time>' + fmt(s.t) + '</time><span>' + esc(s.text) + '</span></div>').join('') : '<div class="tiny" style="padding:8px">' + (q ? '没搜到，换个词' : '输入关键词开始寻证') + '</div>';
      $('#hits').querySelectorAll('.hit').forEach(h => h.onclick = () => { $('#hits').querySelectorAll('.hit').forEach(x => x.classList.remove('on')); h.classList.add('on'); sel = +h.dataset.t; v.currentTime = Math.max(0, sel - 1); v.play().catch(() => {}); $('#pin').disabled = false; }); };
    $('#q').oninput = ev => search(ev.target.value);
    dialog.querySelectorAll('.chip').forEach(c => c.onclick = () => { $('#q').value = c.textContent; search(c.textContent); });
    $('#close').onclick = closeModal;
    $('#pin').onclick = () => {
      const hitText = (subs.find(s => s.t === sel) || {}).text || ''; track('answer', { room: e.room, ref: it.id, correct: Math.abs(sel - it.source_time) <= 20, choice: hitText, source_time: it.source_time, extra: { kind: 'evidence' } });
      if (Math.abs(sel - it.source_time) <= 20) { v.pause(); track('tool_get', { room: e.room, ref: e.reward }); S.done[e.room] = false; finishRoom(e.room, '证据确凿'); S.tools[e.reward] = true; G.points += 30; dialog.innerHTML = '<h2>证据确凿</h2><div class="say">先生在 ' + fmt(it.source_time) + ' 说：「' + esc(it.source_quote) + '」<br>案卷下压着一壶「' + TOOLS[e.reward].name + '」——' + TOOLS[e.reward].use + '。</div><div class="btns"><button class="btn red" type="button" id="ok">收下</button></div>'; $('#ok').onclick = closeModal; renderDossier(); }
      else { hurt('不是这一句。灯灭一盏'); $('#pin').disabled = true; }
    };
  }

  // 双门：读碑，走进对的门
  function openStele(e) { const it = e.item; openModal('<h4>石 碑 · 疑 问</h4><div class="q">' + esc(it.question) + '</div>' + (it.code ? '<pre>' + esc(it.code) + '</pre>' : '') + '<div class="tiny">房里两扇门各刻一个答案。走过去，面对你认为对的那扇按前进。走错了，墨妖会从门后扑出来。</div><div class="btns"><button class="btn red" type="button" id="ok">记下了</button></div><div class="seal" style="right:16px;top:14px">碑</div>'); $('#ok').onclick = closeModal; }
  function openGate(e) {
    if (S.done[e.room]) { toast('机关已解'); return; }
    track('answer', { room: e.room, ref: e.item.id, correct: !!e.ok, choice: e.text, source_time: e.item.source_time, extra: { kind: 'twin' } });
    if (e.ok) { PW.entities.filter(x => x.type === 'gate' && x.room === e.room).forEach(gone); finishRoom(e.room, '门后是通路'); return; }
    hurt('门后扑出一只墨妖！灯灭一盏');
    const it = e.item; S.wrong.push(it);
    openSeal({ title: '走错门', why: '「' + e.text + '」不对。看完先生讲这一段，再去选。', from: Math.max(0, it.source_time - 10), to: it.source_time + 25, onDone: closeModal });
  }

  // 找同类：竹签送进同类木匣
  function openBox(e) {
    if (!S.carry) { const n = PW.entities.filter(x => x.kind === 'token' && x.room === e.room && x.cat === e.cat).length; toast('匣「' + e.name + '」：已收 ' + e.got + ' / ' + n + ' · 去捡竹签'); return; }
    const t = S.carry; S.carry = null; track('answer', { room: e.room, ref: 'sort:' + t.text, correct: t.cat === e.cat, choice: e.name, extra: { kind: 'sort' } });
    if (t.cat === e.cat) { e.got++; G.points += 15; Music.sfx.good(); toast('「' + t.text + '」归入「' + e.name + '」'); if (PW.entities.filter(x => x.kind === 'token' && x.room === e.room && alive(x)).length === 0 && !S.carry) finishRoom(e.room, '同类都归好了'); }
    else { hurt('「' + t.text + '」不属于「' + e.name + '」，竹签飞回原处'); S.gone = S.gone.filter(id => id !== t.id); t.obj.visible = true; }
    renderDossier();
  }

  // 拼原话：用找到的残片按顺序拼
  function openAssemble(e) {
    if (S.done[e.room]) { toast('原话已拼好'); return; }
    const mine = S.frags.filter(f => f.room === e.room);
    if (mine.filter(f => f.real).length < e.parts.length) { toast('残片还不够：这间房里藏着三片真的，提灯靠近墙角才看得见（已得 ' + mine.length + ' 片）'); return; }
    let seq = [];
    const draw = () => { $('#seq').textContent = seq.map(f => f.text).join('') || '（依次点残片）'; };
    openModal('<h4>残 碑 · 拼 原 话</h4><div class="q">' + esc(e.item.question) + '</div><div class="tiny">把先生的原话按顺序拼回来。混进来的假残片要剔掉。</div><div class="seq" id="seq"></div><div class="chips">' + shuffle(mine).map(f => '<button class="chip" type="button" data-id="' + f.id + '">' + esc(f.text) + '</button>').join('') + '</div><div class="btns"><button class="btn" type="button" id="reset">重排</button><button class="btn red" type="button" id="go">拼</button></div><div class="seal" style="right:16px;top:14px">碑</div>');
    draw();
    dialog.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { const f = mine.find(x => x.id === b.dataset.id); if (seq.includes(f)) return; seq.push(f); b.disabled = true; draw(); });
    $('#reset').onclick = () => { seq = []; dialog.querySelectorAll('[data-id]').forEach(b => b.disabled = false); draw(); };
    $('#go').onclick = () => {
      const okSeq = seq.length === e.parts.length && seq.every((f, i) => f.real && f.text === e.parts[i]); track('answer', { room: e.room, ref: e.item.id, correct: okSeq, choice: seq.map(f => f.text).join(''), source_time: e.item.source_time, extra: { kind: 'assemble' } });
      if (okSeq) { finishRoom(e.room, '原话拼回来了'); dialog.innerHTML = '<h2>原话复现</h2><div class="say">「' + esc(e.parts.join('')) + '」<br><span class="tiny">回放 ' + fmt(e.item.source_time) + '</span></div><div class="btns"><button class="btn red" type="button" id="ok">好</button></div>'; $('#ok').onclick = closeModal; }
      else { hurt('拼错了，残碑震了一下'); $('#reset').click(); }
    };
  }

  // 墨妖：举灯攻击 / 蓄力时举灯格挡
  function strikeBeast(e) { playerStrike(); }
  function playerStrike() {
    if (mode !== 'palace' || !S || !modal.hidden) return;
    S.parryUntil = performance.now() + 380;
    const p = pl(), [dx, dy] = DIRS[p.dir], e = PW.entities.find(b => b.type === 'beast' && alive(b) && b.x === p.px + dx && b.y === p.py + dy);
    anims.push({ kind: 'swing', t: 0 });
    if (!e) return;
    const parry = e.state === 'windup';
    e.hp -= parry ? 2 : 1; S.combo += 1;
    e.state = 'stun'; e.until = performance.now() + (parry ? 1400 : 600);
    Music.sfx.hit(); toast(parry ? '格挡！反击 ×2' + (S.combo > 1 ? ' · 连击 ' + S.combo : '') : '击中墨妖');
    const nx = e.x + dx, ny = e.y + dy; if (parry && PW.grid[ny][nx] === 1 && PW.roomOf[ny][nx] === e.room && !blocker(nx, ny)) { e.x = nx; e.y = ny; }
    if (e.hp <= 0) killBeast(e); else setLabel(e.label, '墨妖 ' + '◆'.repeat(e.hp) + (e.drop ? ' · 携' + TOOLS[e.drop].name : ''));
  }
  function killBeast(e) {
    gone(e); G.points += 30 + S.combo * 5;
    if (e.drop) { S.tools[e.drop] = true; track('tool_get', { room: e.room, ref: e.drop }); toast('墨妖散了，掉下「' + TOOLS[e.drop].name + '」——' + TOOLS[e.drop].use); } else toast('墨妖散了 +30');
    if (PW.task[e.room] === 'beasts' && !PW.entities.some(b => b.type === 'beast' && b.room === e.room && alive(b))) finishRoom(e.room, '墨妖都退了');
    renderDossier();
  }
  function beastAI(now) {
    if (!S || S.ended || !modal.hidden || !$('#player').hidden || fading) return;
    PW.entities.forEach(e => {
      if (e.type !== 'beast' || !alive(e)) return;
      const inRoom = PW.roomOf[S.py][S.px] === e.room, dist = Math.abs(e.x - S.px) + Math.abs(e.y - S.py);
      if (e.state === 'stun' && now < e.until) return;
      if (e.state === 'stun') e.state = 'roam';
      if (!inRoom) return;
      if (e.state === 'windup') { if (now >= e.until) { e.state = 'cool'; e.until = now + 1300; if (dist === 1) hurt('墨妖扑中！灯灭一盏'); } return; }
      if (e.state === 'cool') { if (now >= e.until) e.state = 'roam'; return; }
      if (dist === 1) { e.state = 'windup'; e.until = now + 950; return; }
      if (!e.next || now >= e.next) {
        e.next = now + 820;
        const opts = [[Math.sign(S.px - e.x), 0], [0, Math.sign(S.py - e.y)]].filter(([a, b]) => a || b).sort(() => Math.random() - 0.5);
        for (const [a, b] of opts) { const x = e.x + a, y = e.y + b; if (PW.grid[y][x] === 1 && PW.roomOf[y][x] === e.room && !blocker(x, y) && !(x === S.px && y === S.py)) { e.x = x; e.y = y; break; } }
      }
    });
  }

  // Boss：三问限时，答错被扑 + 封印
  function openBoss(e) {
    if (!alive(e)) return;
    const idx = e.maxHp - e.hp, it = e.items[idx], name = cur().scene === 'commerce' ? '刁客' : '众惑', tr = cur().traces[e.room];
    const opts = shuffle(it.options.map((o, k) => ({ o, ok: k === 0 }))); let left = 20;
    openModal('<h4>BOSS · ' + name + ' · ' + esc(shortTitle(cur().rooms[e.room].title)) + '</h4><h2>' + name + ' ' + '◆'.repeat(e.hp) + '<span style="opacity:.3">' + '◆'.repeat(idx) + '</span></h2>' +
      (tr ? '<div class="tiny">直播时这一段 ' + tr.total + ' 人答题，' + tr.wrong + ' 人答错。限时作答，答错它会扑上来，并封印到你看完先生那一段。</div>' : '') +
      '<div class="bar"><i id="tbar" style="width:100%"></i></div><div class="q">' + esc(it.question) + '</div>' + (it.code ? '<pre>' + esc(it.code) + '</pre>' : '') +
      '<div class="slips">' + opts.map((x, k) => '<button class="slip" type="button" data-ok="' + (x.ok ? 1 : 0) + '"><small>' + '甲乙丙丁'[k] + '</small>' + esc(x.o) + '</button>').join('') + '</div><div class="seal" style="right:16px;top:14px">' + name + '</div>', true);
    Music.setMood('boss');
    const fail = why => { track('answer', { room: e.room, ref: it.id, correct: false, choice: why.startsWith('超时') ? '（超时）' : ((dialog.querySelector('.slip.bad') || {}).textContent || '').slice(1), source_time: it.source_time, extra: { kind: 'boss' } }); clearInterval(bossTimer); dialog.querySelectorAll('.slip').forEach(b => b.disabled = true); S.wrong.push(it); hurt(why); anims.push({ kind: 'lunge', e, t: 0 }); setTimeout(() => openSeal({ title: name + '的封印', why: '看完先生讲这一段，才能再战。', from: Math.max(0, it.source_time - 10), to: it.source_time + 25, onDone: () => openBoss(e) }), 700); };
    bossTimer = setInterval(() => { const b = $('#tbar'); if (!b) { clearInterval(bossTimer); return; } left -= 0.2; b.style.width = Math.max(0, left / 20 * 100) + '%'; if (left <= 0) fail('超时！' + name + '扑上来，灯灭一盏'); }, 200);
    dialog.querySelectorAll('.slip').forEach(b => b.onclick = () => {
      if (b.dataset.ok !== '1') { b.classList.add('bad'); fail('答错！' + name + '扑上来，灯灭一盏'); return; }
      clearInterval(bossTimer); b.classList.add('good'); track('answer', { room: e.room, ref: it.id, correct: true, choice: it.options[0], source_time: it.source_time, extra: { kind: 'boss' } }); e.hp -= 1; G.points += 50; Music.sfx.good();
      if (e.hp > 0) { setLabel(e.label, 'Boss · ' + name + ' ' + '◆'.repeat(e.hp)); setTimeout(() => openBoss(e), 450); return; }
      gone(e); S.done[e.room] = false; finishRoom(e.room, name + '散了'); S.tools.page = true; G.points += 100; track('boss_win', { room: e.room });
      const portal = PW.entities.find(x => x.type === 'portal'); setLabel(portal.label, '月洞门 · 凭残页可出', '#2b2219', 'rgba(232,220,192,0.95)');
      dialog.innerHTML = '<h2>' + name + '散了</h2><div class="say">它散去的地方落下一页「卷宗残页」——凭此可出月洞门。</div><div class="btns"><button class="btn red" type="button" id="ok">收进卷宗</button></div>'; locked = false; $('#ok').onclick = closeModal; renderDossier(); applyTod();
    });
  }

  function openNpc(e) {
    const f = e.faq; track('npc_talk', { room: e.room, ref: String(cur().faq.indexOf(f)) });
    openModal('<h4>书 生 灯 影</h4><h2>「' + f.count + ' 人问过我同一件事」</h2><div class="q">' + esc(f.question) + '</div><div class="tiny">' + f.samples.map(s => esc(s[0]) + '：「' + esc(s[1]) + '」').join('<br>') + '</div><div class="quote"><div class="k">回 放 ' + fmt(f.source_time) + '</div>' + esc(f.answer) + '</div><div class="tiny" style="margin-top:6px">这一室要办的事：' + TASKS[PW.task[e.room]].goal + '</div><div class="btns"><button class="btn" type="button" id="rw">回看这一段</button><button class="btn red" type="button" id="ok">谢过先生</button></div>');
    $('#ok').onclick = closeModal; $('#rw').onclick = () => openPlayer({ src: curReplay.video, title: cur().title, from: Math.max(0, f.source_time - 10), to: f.source_time + 40, sub: '书生灯影 · ' + f.question });
  }

  function openResult(escaped) {
    S.ended = true; const tl = Math.max(0, 1 - (performance.now() - S.startedAt) / (REAL_MINUTES * 60000)), bonus = escaped ? Math.round(tl * 150) + S.lamps * 20 : 0; G.points += bonus; if (escaped) { G.cleared[curReplay.id] = true; track('clear'); }
    if (hooks.onFinish) hooks.onFinish(escaped ? 'cleared' : 'dawn', runStats());
    const wrong = [...new Map(S.wrong.map(it => [it.id, it])).values()], d = new Date(), day = n => { const x = new Date(d); x.setDate(x.getDate() + n); return (x.getMonth() + 1) + '/' + x.getDate(); };
    openModal('<h4>' + (escaped ? '出 月 洞 门 · 破 局' : TOD[todKey].end + ' 了 · 夜 巡 结 束') + '</h4><h2>' + (escaped ? '本场 · 已破' : '天光已现') + '</h2>' +
      '<div class="row"><span>已破密室</span><b>' + Object.keys(S.done).length + ' / ' + PW.N + '</b></div><div class="row"><span>散去墨妖</span><b>' + S.gone.filter(x => x.startsWith('beast')).length + '</b></div><div class="row"><span>余灯 · 余时奖励</span><b>+' + bonus + '</b></div><div class="row"><span>总积分</span><b style="color:var(--seal)">' + G.points + '</b></div>' +
      (wrong.length ? '<h4 style="margin-top:12px">错 题 卷 · 复 习 ' + day(1) + ' · ' + day(3) + ' · ' + day(7) + '</h4>' + wrong.map(it => '<div class="row"><span>' + esc(it.keyword) + ' · ' + esc(it.question.slice(0, 22)) + '</span><button class="btn" type="button" data-t="' + it.source_time + '">回看 ' + fmt(it.source_time) + '</button></div>').join('') + '<div class="tiny">倒下的位置会回写为回放进度条打点。</div>' : '') +
      '<div class="btns"><button class="btn red" type="button" id="back">回广场</button><button class="btn" type="button" id="again">再巡一夜</button></div>', true);
    dialog.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openPlayer({ src: curReplay.video, title: cur().title, from: Math.max(0, +b.dataset.t - 10), to: +b.dataset.t + 30, sub: '错题回看' }));
    $('#back').onclick = () => { closeModal(); exitPalace(); }; $('#again').onclick = () => { closeModal(); enterPalace(); };
  }

  function openHall(e) {
    const r = e.replay, b = building(r);
    if (r.state !== 'open') { toast('第' + cn(r.no) + unit + '还没生成密室'); return; }
    curReplay = r; const sc = r.game;
    const hot = sc.rooms.filter(rm => rm.fail_rate >= 0.4).map(rm => '<div>◆ ' + fmt(rm.start) + ' ' + esc(rm.title) + ' · ' + Math.round(rm.fail_rate * 100) + '% 答错</div>').join('');
    openModal('<h4>第 ' + cn(r.no) + ' ' + unit + ' · ' + esc(sc.host) + '</h4><h2>' + esc(b ? b.name + ' · ' + b.plaque : sc.title) + '</h2><div class="say">' + (b ? esc(b.blurb) + '<br>' : '') + '<span class="tiny">' + esc(r.title) + '</span></div><div class="say">' + (r.views ? r.views.toLocaleString() + ' 人看过 · ' : '') + fmt(sc.duration) + ' · ' + sc.rooms.length + ' 间密室' + (G.cleared[r.id] ? ' · <b style="color:var(--seal)">你已破此' + unit + '</b>' : '') + '</div>' + (hot ? '<h4 style="margin-top:12px">全 场 卡 点</h4><div class="tiny" style="color:var(--text-ink)">' + hot + '</div>' : '') + '<div class="btns"><button class="btn" type="button" id="watchFull">看完整回放</button><button class="btn red" type="button" id="enter">' + (G.cleared[r.id] ? '再巡一夜' : '入密室') + '</button></div><div class="seal" style="right:16px;top:14px">回放</div>');
    $('#watchFull').onclick = () => { openPlayer({ src: r.video, title: sc.title, sub: '完整回放' }); }; $('#enter').onclick = () => { closeModal(); enterPalace(); };
  }
  function openCrier(e) {
    const n = e.npc, r = HALLS.find(h => h.id === n.replay);
    openModal('<h4>更 夫 · ' + esc(n.name) + '</h4><h2>「' + esc(n.line) + '」</h2>' + (D.city.intro ? '<div class="tiny">' + esc(D.city.intro) + '</div>' : '') + (r ? '<div class="say" style="margin-top:8px">说的是第' + cn(r.no) + unit + '：' + esc((building(r) || {}).name || shortTitle(r.title)) + '</div>' : '') + '<div class="btns"><button class="btn red" type="button" id="ok">谢过</button></div>');
    $('#ok').onclick = closeModal;
  }
  function openShop(e) {
    if (e.handout) {
      const r = e.handout;
      openModal('<h4>书 坊</h4><h2>第' + cn(r.no) + unit + '讲义</h2><div class="say">掌柜递来一卷：知识点、易错点、易混辨析和高频问题，每条都标着回放时间点。</div><div class="btns"><button class="btn red" type="button" id="read">翻开讲义</button><button class="btn" type="button" id="close">离开</button></div><div class="seal" style="right:16px;top:14px">讲义</div>');
      $('#read').onclick = () => { if (hooks.openHandout) hooks.openHandout(r.id); }; $('#close').onclick = closeModal; return;
    }
    const p = e.product, g = p.replay.game, short = shortTitle(p.name).slice(0, 2);
    const asks = g.faq.filter(f => f.room === p.room || f.question.includes(short)).slice(0, 3);
    openModal('<h4>' + esc(e.name) + ' · 伙 计 迎 客</h4><div class="shop"><div><div class="say" id="clerk">「客官来得巧。' + esc(p.quotes.slice(0, 3).join('，')) + '」<div class="tiny">—— 转述主播' + esc(g.host) + '在直播里的原话</div></div><div class="btns">' + asks.map((f, k) => '<button class="btn" type="button" data-k="' + k + '">' + esc(f.question.slice(0, 16)) + '</button>').join('') + '</div></div>' +
      '<div>' + (p.replay.cover ? '<img src="' + esc(p.replay.cover) + '" alt="' + esc(p.name) + '" onerror="this.style.visibility=\'hidden\'">' : '') + '<div style="font-size:17px;font-weight:600;margin-top:8px">' + esc(p.name) + '</div><div class="tiny" style="color:var(--text-ink)">' + esc(p.desc) + '</div><details style="margin-top:6px"><summary class="tiny" style="cursor:pointer">卖点关键词</summary><div class="tiny" style="color:var(--text-ink)">' + esc(p.detail) + '</div></details></div></div>' +
      '<div class="btns"><button class="btn" type="button" id="explain">▶ 看讲解 · 回放 ' + fmt(p.start) + '–' + fmt(p.end) + '</button><button class="btn red" type="button" id="buy">记入账簿</button><button class="btn" type="button" id="close">离店</button></div><div class="seal" style="right:16px;top:14px">货单</div>');
    dialog.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const f = asks[+b.dataset.k]; $('#clerk').innerHTML = '「' + esc(f.answer) + '」<div class="tiny">—— ' + f.count + ' 位客官问过 · 回放 ' + fmt(f.source_time) + '</div>'; });
    $('#explain').onclick = () => { curReplay = p.replay; openPlayer({ src: p.replay.video, title: p.replay.title, from: p.start, to: p.end, sub: '商品讲解 · ' + p.name }); };
    $('#buy').onclick = () => { if (!G.ledger.includes(p.name)) G.ledger.push(p.name); toast('「' + p.name + '」已记入账簿'); renderDossier(); };
    $('#close').onclick = closeModal;
  }

  // ═════════════ 回放播放器 ═════════════
  const player = $('#player'); let video = null, clipEnd = null; // 完整回放播放器，换讲次时重建
  let seg = null, watching = null; const segs = []; // 本次打开真实播放过的区间（拖动即断开），收起时上报，供质量报告算重点回顾段
  function closeSeg() { if (seg && seg[1] - seg[0] >= 2) segs.push([Math.floor(seg[0]), Math.ceil(seg[1])]); seg = null; }
  function reportWatch() { closeSeg(); if (watching && segs.length && hooks.onWatched) hooks.onWatched(watching.replay, watching.source, segs.slice()); segs.length = 0; watching = null; }
  function onMainTime() {
    const t = video.currentTime; if (seg && t >= seg[1] && t - seg[1] < 2) seg[1] = t; else { closeSeg(); seg = [t, t]; }
    if (clipEnd && t >= clipEnd) { video.pause(); clipEnd = null; toast('这一段讲完了'); }
  }
  function openPlayer({ src, title, from, to, sub }) {
    reportWatch(); watching = { replay: curReplay.id, source: to ? 'clip' : 'full' };
    $('#pTtl').textContent = sub || ''; $('#pName').textContent = title; clipEnd = to || null;
    if (!video || video.src !== src) { if (video) video.destroy(); video = new LiveVideo($('#video'), D.player, src); video.addEventListener('timeupdate', onMainTime); video.addEventListener('seeking', closeSeg); }
    $('#pRange').textContent = to ? '片段 ' + fmt(from) + ' – ' + fmt(to) + '（播完自动停）' : '完整回放 · 可拖动';
    const sc = cur();
    $('#pSide').innerHTML = '<h4>卷 目</h4>' + sc.rooms.map((r, i) => '<div class="ch" data-t="' + r.start + '"><span>' + CN[i + 1] + ' · ' + esc(r.title) + (r.fail_rate >= 0.4 ? ' <span style="color:var(--seal)">◆</span>' : '') + '</span><span>' + fmt(r.start) + '</span></div>').join('') + '<div class="tiny" style="margin-top:10px">◆ 答题卡错误率 ≥ 40% 的段落</div>';
    $('#pSide').querySelectorAll('[data-t]').forEach(el => el.onclick = () => { video.currentTime = +el.dataset.t; clipEnd = null; video.play(); });
    player.hidden = false; held.length = 0;
    const go = () => { video.currentTime = from || 0; video.play().catch(() => {}); }; if (video.readyState >= 1) go(); else video.addEventListener('loadedmetadata', go, { once: true });
  }
  function closePlayer() { if (video) video.pause(); reportWatch(); player.hidden = true; screenEl.focus({ preventScroll: true }); }
  $('#pClose').onclick = closePlayer;

  // ═════════════ 小地图 / 前方提示 ═════════════
  const mmEl = $('#mm'), mctx = mmEl.getContext('2d');
  const MMC = { door: '#e3c88f', desk: '#8fb3a8', stele: '#cfc6b0', astele: '#cfc6b0', gate: '#d9b070', box: '#b07a4a', beast: '#d9553a', boss: '#ff3b2a', npc: '#cfe0e0', portal: '#f0dfb6', pick: '#ffd27a' };
  function drawMinimap() {
    const T = 4, W = CUR; mctx.clearRect(0, 0, mmEl.width, mmEl.height);
    for (let y = 0; y < W.rows; y++) for (let x = 0; x < W.cols; x++) { if (mode === 'palace' && !W.seen[y * W.cols + x]) continue; const g = W.grid[y][x]; if (!g) continue; mctx.fillStyle = g === 2 ? '#3a3a3c' : mode === 'palace' ? (PW.roomOf[y][x] >= 0 ? '#5e5a50' : '#45423c') : '#4a4844'; mctx.fillRect(x * T, y * T, T, T); }
    W.entities.forEach(e => {
      if (!alive(e)) return; const tiles = e.tiles || [[e.x, e.y]];
      if (mode === 'palace') { if (!W.seen[e.y * W.cols + e.x] || (e.kind === 'frag')) return; mctx.fillStyle = MMC[e.type] || '#888'; }
      else mctx.fillStyle = e.type === 'hall' ? (e.replay.state === 'open' ? '#e3c88f' : '#6b5a3a') : e.type === 'shop' ? '#8fb3a8' : e.type === 'crier' ? '#cfe0e0' : '#ffc070';
      tiles.forEach(([x, y]) => mctx.fillRect(x * T, y * T, T, T));
    });
    const cx = P.x * T, cy = P.z * T, a = -P.yaw, fx = Math.sin(a), fz = -Math.cos(a);
    mctx.fillStyle = '#fff3d0'; mctx.beginPath(); mctx.moveTo(cx + fx * 6, cy + fz * 6); mctx.lineTo(cx - fx * 3 + fz * 4, cy - fz * 3 - fx * 4); mctx.lineTo(cx - fx * 3 - fz * 4, cy - fz * 3 + fx * 4); mctx.closePath(); mctx.fill();
  }
  let lastAhead = '';
  function updateAhead() {
    let text = '';
    if (mv.t >= 1 && tn.t >= 1 && modal.hidden && player.hidden && !fading) {
      const p = pl(), [dx, dy] = DIRS[p.dir], e = blocker(p.px + dx, p.py + dy);
      if (e) text = {
        hall: () => '前方：第' + cn(e.replay.no) + unit + '楼阁 · ' + (e.replay.state !== 'open' ? '未开' : G.cleared[e.replay.id] ? '已破 · 按前进再巡一夜' : '按前进 · 看回放 / 入密室'),
        crier: () => '前方：' + e.npc.name + ' · 按前进搭话',
        shop: () => '前方：' + e.name + ' · 按前进进' + (e.handout ? '书坊' : '店'),
        door: () => !S.done[e.room - 1] ? '前方：门闭 · 先完成本室「' + TASKS[PW.task[e.room - 1]].name + '」' : e.requires && !S.tools[e.requires] ? '前方：' + (e.requires === 'oil' ? '暗门 · 需灯油' : '铜锁门 · 需铜鱼符') : '前方：门 · 按前进推开',
        desk: () => '前方：案卷台 · 按前进寻证', stele: () => '前方：石碑 · 按前进读疑问', astele: () => '前方：残碑 · 按前进拼原话',
        gate: () => '前方：门「' + e.text.slice(0, 14) + '」· 按前进走进去', box: () => '前方：木匣「' + e.name + '」' + (S.carry ? ' · 按前进放入「' + S.carry.text + '」' : ''),
        beast: () => e.state === 'windup' ? '墨妖蓄力！马上按空格举灯格挡' : '前方：墨妖 · 按空格举灯攻击', boss: () => '前方：' + (sceneKey === 'commerce' ? '刁客' : '众惑') + ' · 按前进迎战',
        npc: () => '前方：书生灯影 · 按前进请教', portal: () => S.tools.page ? '前方：月洞门 · 按前进出密室' : '前方：月洞门 · 需卷宗残页', deco: () => ''
      }[e.type]();
    }
    if (text !== lastAhead) { lastAhead = text; const el = $('#ahead'); el.textContent = text; el.hidden = !text; }
  }

  // ═════════════ 主循环 ═════════════
  const held = []; let last = performance.now(), lastWatch = 0; const camPos = new THREE.Vector3();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
    if (mv.t < 1) { mv.t = Math.min(1, mv.t + dt / 0.22); const k = ease(mv.t); P.x = mv.fx + (mv.tx - mv.fx) * k; P.z = mv.fz + (mv.tz - mv.fz) * k; }
    if (tn.t < 1) { tn.t = Math.min(1, tn.t + dt / 0.2); P.yaw = tn.f + (tn.to - tn.f) * ease(tn.t); }
    if (bump.t < 1) bump.t = Math.min(1, bump.t + dt / 0.18);
    if (mv.t >= 1 && tn.t >= 1 && bump.t >= 1 && held.length && modal.hidden && player.hidden && !fading) doAction(held[held.length - 1]);
    const b = Math.sin(bump.t * Math.PI) * 0.1, bob = reduceMotion ? 0 : Math.sin(mv.t * Math.PI) * 0.025;
    let sx = 0, sy = 0; if (S && S.shake > 0) { S.shake -= dt; sx = (Math.random() - 0.5) * 0.08; sy = (Math.random() - 0.5) * 0.06; }
    camera.position.set(P.x + bump.dx * b + sx, EYE + bob + sy, P.z + bump.dz * b); camera.rotation.set(mode === 'surface' ? 0.03 : -0.05, P.yaw, 0); camPos.copy(camera.position);
    hand.position.set(P.x, EYE + 0.15, P.z); if (mode === 'palace') hand.intensity = 1.35 + (reduceMotion ? 0 : Math.sin(t * 11) * 0.06);
    CUR.lights.slice().sort((a, c) => ((a.wx - P.x) ** 2 + (a.wz - P.z) ** 2) - ((c.wx - P.x) ** 2 + (c.wz - P.z) ** 2)).slice(0, pool.length).forEach((lt, i) => { pool[i].position.set(lt.wx, (lt.wy || 0.9) - 0.05, lt.wz + 0.1); pool[i].intensity = 1.1 + (reduceMotion ? 0 : Math.sin(t * 9 + lt.seed) * 0.12); });
    CUR.lights.forEach(lt => { if (lt.flame) { const s = reduceMotion ? 1 : 1 + Math.sin(t * 7 + lt.seed) * 0.07; lt.flame.scale.set(0.5 * s, 0.5 * s, 1); } });
    if (mode === 'palace') {
      beastAI(now);
      PW.entities.forEach(e => {
        if (!e.obj.visible) return;
        const face = () => { e.obj.rotation.y = Math.atan2(camPos.x - e.obj.position.x, camPos.z - e.obj.position.z); };
        if (e.model) {
          face(); const m = e.model; e.obj.position.x += (e.x + 0.5 - e.obj.position.x) * Math.min(1, dt * 8); e.obj.position.z += (e.y + 0.5 - e.obj.position.z) * Math.min(1, dt * 8);
          const breathe = Math.sin(t * 3 + e.x) * 0.03; m.g.position.y = breathe; m.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 8 + i * Math.PI) * 0.25; }); m.tail.rotation.z = Math.sin(t * 4) * 0.4;
          const wind = e.state === 'windup'; m.g.rotation.x = wind ? -0.35 : 0; m.jaw.position.y = wind ? -0.17 : -0.12; m.aura.material.opacity = wind ? 0.7 + Math.sin(t * 30) * 0.2 : e.state === 'stun' ? 0.1 : 0.3;
          M.eye.color.setHex(0xff5a36);
        } else if (e.spin) { e.spin.rotation.y = t * 1.5; if (e.kind === 'frag') { const d = Math.hypot(e.x + 0.5 - P.x, e.y + 0.5 - P.z), vis = d < 2.6; e.spin.visible = vis; e.glow.visible = vis; e.label.visible = d < 1.8; } }
        else if (e.type === 'npc') { face(); e.body.position.y = reduceMotion ? 0 : Math.sin(t * 2 + e.x) * 0.05; }
        else if (e.type === 'portal') { face(); e.disc.rotation.z = -t * (S.tools.page ? 2.4 : 0.4); e.ring.material.color.setHex(S.tools.page ? 0xe3c88f : 0x5a5f5c); }
        else if (e.face) face();
      });
      bossLight.intensity = PW.entities.some(e => e.type === 'boss' && alive(e)) ? 0.9 + Math.sin(t * 2) * 0.3 : 0;
      for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; const k = Math.min(1, a.t / 0.8); if (a.kind === 'door') { a.e.leaf.position.y = WALL_H / 2 + ease(k) * WALL_H; if (k >= 1) { a.e.obj.visible = false; anims.splice(i, 1); } } else if (a.kind === 'lunge') { a.e.model.g.position.z = Math.sin(k * Math.PI) * 0.4; if (k >= 1) anims.splice(i, 1); } else if (a.kind === 'swing') { hand.intensity = 3.5 * (1 - k) + 1.3; if (k >= 1) anims.splice(i, 1); } }
    }
    if (now - lastWatch > 1000) { lastWatch = now; if (!todManual && mode === 'surface') { const k = todOfHour(new Date().getHours()); if (k !== todKey) { todKey = k; applyTod(); } } updateWatch(); }
    renderer.render(scene, camera); drawMinimap(); updateAhead();
    if (running) requestAnimationFrame(frame);
  }
  function resize() { const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight, iw = Math.round(Math.min(w * (devicePixelRatio || 1), 960)); renderer.setSize(iw, Math.round(iw * h / w), false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  // ═════════════ 输入 ═════════════
  const KEYS = { ArrowUp: 'fwd', w: 'fwd', W: 'fwd', ArrowDown: 'back', s: 'back', S: 'back', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', q: 'sl', Q: 'sl', e: 'sr', E: 'sr' };
  addEventListener('keydown', ev => {
    Music.init();
    if (ev.key === 'Escape') { if (!player.hidden) closePlayer(); else if (!modal.hidden && !locked) closeModal(); return; }
    if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.key === ' ' && modal.hidden && player.hidden) { ev.preventDefault(); playerStrike(); return; }
    const act = KEYS[ev.key]; if (!act || !modal.hidden || !player.hidden) return;
    ev.preventDefault(); if (!held.includes(act)) held.push(act);
  }, sig);
  addEventListener('keyup', ev => { const act = KEYS[ev.key]; if (!act) return; const i = held.indexOf(act); if (i >= 0) held.splice(i, 1); }, sig);
  addEventListener('pointerdown', () => Music.init(), sig);
  addEventListener('blur', () => { held.length = 0; }, sig);
  // 触屏方向键：按住即连续移动
  root.querySelectorAll('[data-act]').forEach(b => { const act = b.dataset.act; b.addEventListener('pointerdown', ev => { ev.preventDefault(); Music.init(); if (act === 'strike') { playerStrike(); return; } if (!modal.hidden || !player.hidden) return; if (!held.includes(act)) held.push(act); }, sig); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => { const i = held.indexOf(act); if (i >= 0) held.splice(i, 1); }, sig)); });

  // ═════════════ 启动 ═════════════
  buildSurface(); setMode('surface'); resize(); addEventListener('resize', resize, sig);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { labels.forEach(s => setLabel(s, s.userData.text)); vBanners.forEach(v => { v.mesh.material.map.dispose(); v.mesh.material.map = vTex(v.text, v.bg, v.fg); v.mesh.material.needsUpdate = true; }); });
  setTimeout(() => toast((D.city.intro ? D.city.intro.slice(0, 40) + ' · ' : '') + '北边是回放楼阁，往南是' + (sceneKey === 'course' ? '书坊' : '夜市铺子')), 600);
  screenEl.focus({ preventScroll: true });
  // 调试入口（演示跳关与自动化测试）
  function standBefore(id) { const e = CUR.entities.find(x => x.id === id); if (!e) return false; const p = pl(); for (const [tx, ty] of e.tiles || [[e.x, e.y]]) for (let d = 0; d < 4; d++) { const [dx, dy] = DIRS[d], x = tx - dx, y = ty - dy; if (CUR.grid[y] && CUR.grid[y][x] === 1 && !blocker(x, y)) { p.px = x; p.py = y; p.dir = d; syncPlayer(); if (mode === 'palace') { markSeen(x, y, 2); const r = PW.roomOf[y][x]; if (r >= 0) enterRoom(r); } return true; } } return false; }
  window.__pc = { standBefore, enterPalace, give: k => { S.tools[k] = true; renderDossier(); }, done: i => { S.done[i] = true; }, task: () => PW && PW.task, entities: () => PW && PW.entities.map(e => e.id + ':' + e.type + (e.kind ? '/' + e.kind : '')), interactAhead: () => { const p = pl(), [dx, dy] = DIRS[p.dir], e = blocker(p.px + dx, p.py + dy); if (e) interact(e); return e && e.id; }, strike: playerStrike, walkOnto: id => { const e = PW.entities.find(x => x.id === id); S.px = e.x; S.py = e.y; syncPlayer(); pickup(e.x, e.y); }, setTod: k => { todKey = k; todManual = true; applyTod(); renderDossier(); }, state: () => S };
  requestAnimationFrame(tt => { last = tt; frame(tt); });
  return {
    dispose() {
      running = false; ac.abort(); Music.stop(); clearInterval(bossTimer); stopClip(); reportWatch(); if (video) video.destroy();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); }); });
      renderer.dispose(); delete window.__pc;
    }
  };
}
