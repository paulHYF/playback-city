// 巡夜怪外形：每个主题一套、主题内再按房间换样。返回结构和原来的四足兽一致，方便引擎沿用走、扑、蓄力动画。
// 调用：beastModel(themeKey, { room, id, type }, mats, glowTex, { scale, boss })
import * as THREE from 'three'

const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true })
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m }
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z)
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, n = 8) => mesh(new THREE.CylinderGeometry(rt, rb, h, n), mat, x, y, z)
const ball = (r, mat, x = 0, y = 0, z = 0) => mesh(new THREE.SphereGeometry(r, 10, 8), mat, x, y, z)
const cone = (r, h, mat, x = 0, y = 0, z = 0, n = 6) => mesh(new THREE.ConeGeometry(r, h, n), mat, x, y, z)

function rig(g, extra = {}) {
  const root = new THREE.Group(); root.add(g)
  const head = extra.head || new THREE.Group(); if (!head.parent) g.add(head)
  const jaw = extra.jaw || box(0.01, 0.01, 0.01, extra.bodyMat || lam(0x111), 0, -0.12, 0.1); if (!jaw.parent) head.add(jaw)
  const legs = extra.legs || []
  const tail = extra.tail || cone(0.02, 0.08, extra.bodyMat || lam(0x111), 0, 0.2, -0.2)
  if (!tail.parent) g.add(tail)
  const aura = extra.aura; if (aura) { aura.position.y = extra.auraY ?? 0.4; root.add(aura) }
  const body = extra.body || g
  return { root, g, head, jaw, legs, tail, aura, body }
}

function glow(tex, color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }))
  s.scale.set(size, size, 1); return s
}

function quadruped(m, bone, gold, aura, scale, boss) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = ball(0.22, m.body); body.scale.set(1, 0.78, 1.35); body.position.y = 0.36; g.add(body)
  const belly = ball(0.16, m.accent); belly.scale.set(1, 0.5, 1.2); belly.position.set(0, 0.27, 0.02); g.add(belly)
  const head = new THREE.Group(); head.position.set(0, 0.46, 0.3); g.add(head)
  head.add(box(0.26, 0.2, 0.22, m.body))
  const snout = box(0.2, 0.1, 0.14, m.body, 0, -0.04, 0.16); head.add(snout)
  const jaw = box(0.18, 0.04, 0.16, m.accent, 0, -0.12, 0.14); head.add(jaw)
  const legs = []
  ;[-1, 1].forEach(sx => {
    const tusk = cone(0.018, 0.09, bone, sx * 0.07, -0.1, 0.22); tusk.rotation.x = Math.PI; head.add(tusk)
    const horn = cone(0.03, 0.24, boss ? gold : bone, sx * 0.1, 0.18, -0.02); horn.rotation.z = -sx * 0.5; horn.rotation.x = -0.4; head.add(horn)
    const eye = box(0.07, 0.016, 0.01, m.eye, sx * 0.07, 0.03, 0.115); eye.rotation.z = sx * 0.25; head.add(eye)
    const brow = box(0.09, 0.025, 0.03, m.accent, sx * 0.07, 0.07, 0.11); brow.rotation.z = sx * 0.35; head.add(brow)
  })
  for (let k = 0; k < 5; k++) { const sp = cone(0.035, 0.14, m.accent, 0, 0.55 - k * 0.015, 0.16 - k * 0.1, 5); sp.rotation.x = -0.5; g.add(sp) }
  ;[[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const leg = cyl(0.04, 0.05, 0.26, m.body, sx * 0.14, 0.13, sz * 0.17, 6); g.add(leg); legs.push(leg)
    const claw = cone(0.03, 0.06, bone, sx * 0.14, 0.02, sz * 0.17 + 0.05, 5); claw.rotation.x = Math.PI / 2; g.add(claw)
  })
  const tail = cone(0.05, 0.36, m.body, 0, 0.45, -0.38); tail.rotation.x = -1; g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body: m.body, auraY: 0.4 * scale })
}

function humanoid(m, opts, aura, scale) {
  const { robe, hat, hatH = 0.22, skin = 0xd8ccb0, sash, tall = 1 } = opts
  const g = new THREE.Group(); g.scale.setScalar(scale * 0.95)
  const body = cyl(0.12, 0.18, 0.55 * tall, robe, 0, 0.32 * tall, 0, 10); g.add(body)
  if (sash) g.add(cyl(0.13, 0.19, 0.06, sash, 0, 0.28 * tall, 0, 10))
  const head = new THREE.Group(); head.position.set(0, 0.66 * tall, 0); g.add(head)
  head.add(ball(0.1, lam(skin)))
  const jaw = box(0.12, 0.03, 0.08, lam(skin), 0, -0.08, 0.04); head.add(jaw)
  ;[-1, 1].forEach(sx => head.add(box(0.035, 0.012, 0.01, m.eye, sx * 0.045, 0.02, 0.09)))
  if (hat) {
    const brim = cyl(0.16, 0.16, 0.02, hat, 0, 0.1, 0, 12); head.add(brim)
    const cap = box(0.1, hatH, 0.1, hat, 0, 0.12 + hatH / 2, 0); head.add(cap)
  }
  const legs = []
  ;[-1, 1].forEach(sx => {
    const arm = cyl(0.025, 0.03, 0.32, robe, sx * 0.16, 0.38 * tall, 0.02, 6); arm.rotation.z = sx * 0.25; g.add(arm); legs.push(arm)
    const foot = box(0.08, 0.05, 0.12, robe, sx * 0.07, 0.03, 0.02); g.add(foot)
  })
  const tail = cone(0.02, 0.12, robe, 0, 0.2, -0.16); tail.rotation.x = -0.8; g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.5 * scale })
}

function shrimp(m, aura, scale) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = cyl(0.1, 0.14, 0.42, m.body, 0, 0.28, 0, 8); body.rotation.x = 0.9; g.add(body)
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.22); g.add(head)
  head.add(ball(0.12, m.body))
  const jaw = box(0.14, 0.04, 0.1, m.accent, 0, -0.08, 0.08); head.add(jaw)
  ;[-1, 1].forEach(sx => {
    const eye = ball(0.035, m.eye, sx * 0.07, 0.08, 0.08); head.add(eye)
    const ant = cyl(0.008, 0.004, 0.32, m.accent, sx * 0.05, 0.22, 0.04, 4); ant.rotation.z = -sx * 0.4; ant.rotation.x = -0.5; head.add(ant)
  })
  const legs = []
  for (let k = 0; k < 6; k++) {
    const sx = k % 2 ? 1 : -1, z = 0.12 - Math.floor(k / 2) * 0.1
    const leg = cyl(0.018, 0.012, 0.22, m.accent, sx * 0.12, 0.12, z, 5); leg.rotation.z = sx * 0.8; g.add(leg); legs.push(leg)
  }
  const tail = cone(0.1, 0.22, m.accent, 0, 0.18, -0.28); tail.rotation.x = -1.2; g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.35 * scale })
}

function crab(m, aura, scale) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = box(0.42, 0.16, 0.28, m.body, 0, 0.22, 0); g.add(body)
  const head = new THREE.Group(); head.position.set(0, 0.3, 0.12); g.add(head)
  const jaw = box(0.16, 0.04, 0.1, m.accent, 0, -0.06, 0.08); head.add(jaw)
  ;[-1, 1].forEach(sx => {
    head.add(ball(0.04, m.eye, sx * 0.1, 0.06, 0.08))
    const clawArm = cyl(0.03, 0.025, 0.22, m.body, sx * 0.28, 0.22, 0.12, 6); clawArm.rotation.z = sx * 0.7; g.add(clawArm)
    const claw = box(0.12, 0.08, 0.16, m.accent, sx * 0.38, 0.28, 0.22); g.add(claw)
  })
  const legs = []
  for (let k = 0; k < 8; k++) {
    const sx = k < 4 ? -1 : 1, z = 0.1 - (k % 4) * 0.07
    const leg = cyl(0.016, 0.012, 0.2, m.body, sx * 0.2, 0.1, z, 5); leg.rotation.z = sx * 0.9; g.add(leg); legs.push(leg)
  }
  const tail = box(0.08, 0.04, 0.1, m.accent, 0, 0.16, -0.18); g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.3 * scale })
}

function paperDoll(m, aura, scale, tint) {
  const paper = lam(tint)
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = box(0.28, 0.5, 0.04, paper, 0, 0.36, 0); g.add(body)
  const head = new THREE.Group(); head.position.set(0, 0.68, 0); g.add(head)
  head.add(box(0.16, 0.16, 0.04, paper))
  const jaw = box(0.1, 0.02, 0.03, m.accent, 0, -0.06, 0.02); head.add(jaw)
  ;[-1, 1].forEach(sx => {
    head.add(box(0.03, 0.04, 0.02, m.eye, sx * 0.04, 0.02, 0.03))
    const arm = box(0.08, 0.28, 0.03, paper, sx * 0.18, 0.4, 0); arm.rotation.z = sx * 0.3; g.add(arm)
  })
  const legs = [box(0.08, 0.22, 0.03, paper, -0.06, 0.12, 0), box(0.08, 0.22, 0.03, paper, 0.06, 0.12, 0)]
  legs.forEach(l => g.add(l))
  const tail = box(0.06, 0.16, 0.02, paper, 0, 0.28, -0.04); g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.45 * scale })
}

function worm(m, aura, scale) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const segs = []
  for (let k = 0; k < 5; k++) {
    const s = ball(0.1 - k * 0.01, k % 2 ? m.accent : m.body, 0, 0.22, 0.18 - k * 0.12); g.add(s); segs.push(s)
  }
  const head = new THREE.Group(); head.position.set(0, 0.28, 0.28); g.add(head)
  head.add(ball(0.12, m.body))
  const jaw = box(0.1, 0.03, 0.08, m.accent, 0, -0.06, 0.08); head.add(jaw)
  ;[-1, 1].forEach(sx => head.add(ball(0.03, m.eye, sx * 0.06, 0.04, 0.08)))
  const legs = segs.slice(1, 5)
  const tail = cone(0.06, 0.16, m.accent, 0, 0.2, -0.38); tail.rotation.x = -0.6; g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body: segs[0], auraY: 0.3 * scale })
}

function puppet(m, metal, aura, scale) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = box(0.22, 0.28, 0.16, m.body, 0, 0.38, 0); g.add(body)
  g.add(cyl(0.04, 0.04, 0.08, metal, 0, 0.54, 0, 8))
  const head = new THREE.Group(); head.position.set(0, 0.64, 0); g.add(head)
  head.add(box(0.16, 0.16, 0.14, m.body))
  const jaw = box(0.12, 0.03, 0.08, metal, 0, -0.08, 0.04); head.add(jaw)
  ;[-1, 1].forEach(sx => head.add(box(0.04, 0.04, 0.02, m.eye, sx * 0.04, 0.02, 0.08)))
  const legs = []
  ;[-1, 1].forEach(sx => {
    const arm = cyl(0.025, 0.02, 0.28, metal, sx * 0.16, 0.4, 0, 6); g.add(arm); legs.push(arm)
    const leg = cyl(0.03, 0.025, 0.24, metal, sx * 0.07, 0.14, 0, 6); g.add(leg); legs.push(leg)
    g.add(box(0.08, 0.04, 0.1, m.body, sx * 0.07, 0.03, 0.02))
  })
  const gear = cyl(0.08, 0.08, 0.04, metal, 0, 0.42, -0.1, 10); g.add(gear)
  const tail = cone(0.03, 0.14, metal, 0, 0.3, -0.16); tail.rotation.x = -0.9; g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.45 * scale })
}

function nian(m, gold, aura, scale, boss) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = ball(0.24, m.body); body.scale.set(1.1, 0.9, 1.4); body.position.y = 0.32; g.add(body)
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.32); g.add(head)
  head.add(box(0.32, 0.24, 0.28, m.body))
  const jaw = box(0.26, 0.08, 0.2, m.accent, 0, -0.14, 0.1); head.add(jaw)
  ;[-1, 1].forEach(sx => {
    head.add(box(0.06, 0.04, 0.02, m.eye, sx * 0.1, 0.04, 0.15))
    const ear = cone(0.05, 0.16, m.accent, sx * 0.14, 0.2, -0.04, 5); ear.rotation.z = -sx * 0.3; head.add(ear)
  })
  const mane = cyl(0.22, 0.18, 0.08, gold, 0, 0.12, -0.04, 10); head.add(mane)
  const legs = []
  ;[[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const leg = cyl(0.05, 0.06, 0.24, m.body, sx * 0.14, 0.12, sz * 0.16, 6); g.add(leg); legs.push(leg)
  })
  const tail = cone(0.05, 0.3, m.accent, 0, 0.38, -0.4); tail.rotation.x = -0.8; g.add(tail)
  if (boss) g.add(cone(0.04, 0.2, gold, 0, 0.72, 0.2))
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.4 * scale })
}

function sandDemon(m, aura, scale) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = cone(0.22, 0.7, m.body, 0, 0.36, 0, 7); g.add(body)
  const head = new THREE.Group(); head.position.set(0, 0.62, 0.04); g.add(head)
  head.add(ball(0.12, m.body))
  const jaw = box(0.1, 0.03, 0.08, m.accent, 0, -0.08, 0.06); head.add(jaw)
  ;[-1, 1].forEach(sx => {
    head.add(box(0.05, 0.02, 0.01, m.eye, sx * 0.05, 0.02, 0.1))
    const arm = cone(0.05, 0.32, m.accent, sx * 0.16, 0.34, 0.04, 5); arm.rotation.z = sx * 0.6; g.add(arm)
  })
  const legs = [cone(0.08, 0.28, m.body, -0.08, 0.12, 0.04, 5), cone(0.08, 0.28, m.body, 0.08, 0.12, 0.04, 5)]
  legs.forEach(l => g.add(l))
  const tail = cone(0.06, 0.24, m.accent, 0, 0.2, -0.16, 5); tail.rotation.x = 0.8; g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.5 * scale })
}

function jailer(m, metal, aura, scale) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = box(0.28, 0.36, 0.18, m.body, 0, 0.4, 0); g.add(body)
  g.add(box(0.3, 0.08, 0.2, metal, 0, 0.52, 0))
  const head = new THREE.Group(); head.position.set(0, 0.66, 0); g.add(head)
  head.add(box(0.16, 0.16, 0.14, m.body))
  const helm = box(0.18, 0.08, 0.16, metal, 0, 0.1, 0); head.add(helm)
  const jaw = box(0.12, 0.04, 0.08, metal, 0, -0.08, 0.04); head.add(jaw)
  ;[-1, 1].forEach(sx => head.add(box(0.03, 0.02, 0.01, m.eye, sx * 0.04, 0.02, 0.08)))
  const legs = []
  ;[-1, 1].forEach(sx => {
    const arm = cyl(0.03, 0.025, 0.28, m.body, sx * 0.18, 0.4, 0, 6); g.add(arm); legs.push(arm)
    g.add(cyl(0.04, 0.035, 0.22, metal, sx * 0.08, 0.12, 0, 6))
  })
  const tail = box(0.04, 0.2, 0.04, metal, 0, 0.28, -0.12); g.add(tail)
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.5 * scale })
}

function haggler(m, gold, aura, scale) {
  return humanoid(m, { robe: m.body, hat: gold, hatH: 0.08, sash: m.accent, skin: 0xc8b090 }, aura, scale)
}

function tombBeast(m, bone, aura, scale, boss) {
  const g = new THREE.Group(); g.scale.setScalar(scale)
  const body = box(0.2, 0.16, 0.32, m.body, 0, 0.34, 0); g.add(body)
  const head = new THREE.Group(); head.position.set(0, 0.48, 0.2); g.add(head)
  head.add(box(0.16, 0.16, 0.16, bone))
  const jaw = box(0.12, 0.04, 0.1, bone, 0, -0.1, 0.04); head.add(jaw)
  ;[-1, 1].forEach(sx => {
    head.add(box(0.03, 0.03, 0.01, m.eye, sx * 0.05, 0.02, 0.09))
    const horn = cone(0.02, 0.18, bone, sx * 0.08, 0.16, -0.02); horn.rotation.z = -sx * 0.4; head.add(horn)
  })
  const legs = []
  ;[[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const leg = cyl(0.02, 0.025, 0.28, bone, sx * 0.1, 0.14, sz * 0.12, 5); g.add(leg); legs.push(leg)
  })
  const tail = cone(0.03, 0.28, bone, 0, 0.34, -0.28); tail.rotation.x = -0.7; g.add(tail)
  if (boss) g.add(cone(0.08, 0.2, m.accent, 0, 0.7, 0))
  return rig(g, { head, jaw, legs, tail, aura, body, auraY: 0.4 * scale })
}

const BONE = lam(0xd8ccb0), GOLD = lam(0xb8975a), METAL = lam(0x4a4a4e)
const BLACK = lam(0x1a1214), WHITE = lam(0xe8e0d4), RED = lam(0x8a1a1a)

// 每个主题至少两种：巡夜 / 破惑房按房间轮换，Boss 用最后一种放大
export const BEAST_KINDS = {
  song_palace: ['ink', 'ink_red'],
  night_market: ['haggler', 'haggler_gold'],
  tomb: ['skeleton', 'tomb_beast'],
  dungeon: ['jailer', 'jailer_helm'],
  escape: ['watcher', 'watcher_hood'],
  haunted: ['wuchang_hei', 'wuchang_bai', 'paper'],
  festival: ['nian', 'nian_gold'],
  library: ['worm', 'worm_gold'],
  mohist: ['puppet', 'puppet_gear'],
  dragon: ['shrimp', 'crab'],
  dunhuang: ['sand', 'sand_blue']
}

const NAMES = {
  ink: '墨妖', ink_red: '朱鬃墨妖',
  haggler: '砍价鬼', haggler_gold: '金牌砍价鬼',
  skeleton: '枯骨', tomb_beast: '墓魇',
  jailer: '狱卒', jailer_helm: '铁面狱卒',
  watcher: '黑衣看守', watcher_hood: '蒙面看守',
  wuchang_hei: '黑无常', wuchang_bai: '白无常', paper: '纸人',
  nian: '年兽', nian_gold: '金鳞年兽',
  worm: '蠹鱼精', worm_gold: '金蠹',
  puppet: '机关偶', puppet_gear: '铜齿轮偶',
  shrimp: '虾兵', crab: '蟹将',
  sand: '风沙魔', sand_blue: '青砂魔'
}

function hash(s) { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) | 0; return Math.abs(n) }

export function kindOf(theme, e, boss) {
  const list = BEAST_KINDS[theme] || BEAST_KINDS.song_palace
  if (boss) return list[list.length - 1]
  return list[hash((e.id || '') + ':' + (e.room ?? 0)) % list.length]
}

export function kindName(kind) { return NAMES[kind] || kind }

export function beastModel(theme, e, mats, glowTex, { scale = 1, boss = false } = {}) {
  const kind = kindOf(theme, e, boss)
  const aura = glow(glowTex, mats.aura, boss ? 2.2 : 0.9)
  const m = { body: mats.body, accent: mats.accent, eye: mats.eye }
  const s = scale
  switch (kind) {
    case 'shrimp': return { ...shrimp(m, aura, s), kind }
    case 'crab': return { ...crab(m, aura, s), kind }
    case 'wuchang_hei': return { ...humanoid(m, { robe: BLACK, hat: BLACK, hatH: 0.32, sash: RED, skin: 0xc8b8a8 }, aura, s), kind }
    case 'wuchang_bai': return { ...humanoid(m, { robe: WHITE, hat: WHITE, hatH: 0.36, sash: RED, skin: 0xf0e8dc }, aura, s), kind }
    case 'paper': return { ...paperDoll(m, aura, s, 0xf0e8d8), kind }
    case 'nian': case 'nian_gold': return { ...nian(m, GOLD, aura, s, boss || kind === 'nian_gold'), kind }
    case 'worm': case 'worm_gold': return { ...worm(kind === 'worm_gold' ? { ...m, accent: GOLD } : m, aura, s), kind }
    case 'puppet': case 'puppet_gear': return { ...puppet(m, kind === 'puppet_gear' ? GOLD : METAL, aura, s), kind }
    case 'sand': case 'sand_blue': return { ...sandDemon(kind === 'sand_blue' ? { ...m, accent: lam(0x3a6a8a) } : m, aura, s), kind }
    case 'jailer': case 'jailer_helm': return { ...jailer(m, METAL, aura, s), kind }
    case 'haggler': return { ...haggler(m, mats.accent, aura, s), kind }
    case 'haggler_gold': return { ...haggler(m, GOLD, aura, s), kind }
    case 'watcher': return { ...humanoid(m, { robe: BLACK, hat: BLACK, hatH: 0.12, sash: lam(0x2f6f8f), skin: 0xb0a898 }, aura, s), kind }
    case 'watcher_hood': return { ...humanoid(m, { robe: lam(0x1e2228), hat: lam(0x1e2228), hatH: 0.18, sash: mats.accent, skin: 0x8a8078 }, aura, s), kind }
    case 'skeleton': case 'tomb_beast': return { ...tombBeast(m, BONE, aura, s, boss || kind === 'tomb_beast'), kind }
    case 'ink_red': return { ...quadruped({ ...m, accent: lam(0xa3312a) }, BONE, GOLD, aura, s, boss), kind }
    default: return { ...quadruped(m, BONE, GOLD, aura, s, boss), kind }
  }
}
