// 讲师助教大盘 · 立体点亮城（three r128，与游戏同一套宋风夜色）
// 一讲回放 = 一片街区；街区里每间殿室一座楼，末尾一座「通关楼」。
// 一扇窗 = 一位到过这里的观众；亮窗 = 过了这一关（通关楼：通关了）；楼身色阶 = 错误率；朱红信标 = 卡点（错误率 > 50%）。
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const COLS = 4 // 每层每面 4 扇窗
const GAP = 1.5
// 错误率色阶：同一暖色相由暗到亮（低错误率沉静，高错误率灯火最盛）
const RAMP = ['#2f3a40', '#4a4536', '#6e5634', '#9c6633', '#c9743a', '#e3893a']
export const heatColor = v => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))))]

function windowTex(t) {
  const floors = Math.max(1, Math.ceil(t.windows / COLS))
  const c = document.createElement('canvas'); c.width = 64; c.height = floors * 24
  const g = c.getContext('2d')
  g.fillStyle = heatColor(t.heat); g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let f = 0; f < floors; f++) g.fillRect(0, f * 24 + 21, 64, 3)
  for (let k = 0; k < floors * COLS; k++) {
    const f = floors - 1 - Math.floor(k / COLS), col = k % COLS // 从底层往上点
    const x = 4 + col * 15, y = f * 24 + 5
    g.fillStyle = k >= t.windows ? 'rgba(0,0,0,0)' : k < t.litNow ? '#ffd08a' : '#15181b'
    g.fillRect(x, y, 11, 13)
    if (k < t.litNow && k < t.windows) { g.fillStyle = 'rgba(255,190,110,0.35)'; g.fillRect(x - 2, y - 2, 15, 17) }
  }
  const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter
  return { tex, floors }
}

function label(text, color, bg, h) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '500 36px "Noto Serif SC", "PingFang SC", serif'
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 28; c.width = w; c.height = 56
  g.font = font; g.fillStyle = bg; g.fillRect(0, 0, w, 56); g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 30)
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  s.scale.set(h * w / 56, h, 1)
  return s
}

export function createSkyline(canvas, model, { onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1))
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0c131c)
  scene.fog = new THREE.FogExp2(0x0c131c, 0.035)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.autoRotate = true; controls.autoRotateSpeed = 0.6
  canvas.addEventListener('pointerdown', () => { controls.autoRotate = false })
  scene.add(new THREE.AmbientLight(0x6a7a8a, 0.7))
  const moon = new THREE.DirectionalLight(0xa8bccf, 0.5); moon.position.set(-8, 14, 6); scene.add(moon)

  const towers = [], pickables = [], beacons = []
  let x = 0, maxX = 0, maxZ = 0
  model.districts.forEach(d => {
    const n = d.towers.length, perRow = Math.min(4, n), rows = Math.ceil(n / perRow), x0 = x
    // 街道
    const street = new THREE.Mesh(new THREE.PlaneGeometry(perRow * GAP + 0.6, rows * GAP + 0.6), new THREE.MeshLambertMaterial({ color: 0x23211d }))
    street.rotation.x = -Math.PI / 2; street.position.set(x0 + (perRow - 1) * GAP / 2, 0.01, (rows - 1) * GAP / 2); scene.add(street)
    const dl = label(d.label, '#f0dfb6', 'rgba(60,24,14,0.92)', 0.5); dl.position.set(x0 + (perRow - 1) * GAP / 2, 0.35, (rows - 1) * GAP + 1.3); scene.add(dl)
    d.towers.forEach((t, i) => {
      const row = Math.floor(i / perRow), col = row % 2 ? perRow - 1 - (i % perRow) : i % perRow // 蛇形，按闯关顺序走
      const tx = x0 + col * GAP, tz = row * GAP
      const obj = { ...t, litNow: t.lit, x: tx, z: tz }
      const { tex, floors } = windowTex(obj)
      const h = 0.35 + floors * 0.32, w = t.kind === 'gate' ? 0.95 : 0.8
      const side = new THREE.MeshBasicMaterial({ map: tex })
      const cap = new THREE.MeshLambertMaterial({ color: heatColor(t.heat) })
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [side, side, cap, cap, side, side])
      body.position.set(tx, h / 2, tz); body.userData.tower = obj; scene.add(body); pickables.push(body)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 0.32, 4), new THREE.MeshLambertMaterial({ color: t.kind === 'gate' ? 0xb8975a : 0x2a2e31, flatShading: true }))
      roof.rotation.y = Math.PI / 4; roof.position.set(tx, h + 0.16, tz); scene.add(roof)
      const lb = label(t.label, '#e6dfcf', 'rgba(13,15,19,0.82)', 0.34); lb.position.set(tx, h + 0.7, tz); scene.add(lb)
      if (t.beacon) {
        const b = new THREE.PointLight(0xc4503a, 1.2, 3); b.position.set(tx, h + 0.4, tz); scene.add(b)
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff5a3c })); orb.position.copy(b.position); scene.add(orb)
        beacons.push({ b, orb })
      }
      Object.assign(obj, { body, side, height: h })
      towers.push(obj)
      maxZ = Math.max(maxZ, tz)
    })
    x = x0 + perRow * GAP + 1.6
    maxX = x
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX + 30, maxZ + 30), new THREE.MeshLambertMaterial({ color: 0x15171a }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(maxX / 2 - 1, 0, maxZ / 2); scene.add(ground)
  const center = new THREE.Vector3(maxX / 2 - 1.6, 0.6, maxZ / 2)
  controls.target.copy(center)
  const span = Math.max(maxX, maxZ + 3)
  camera.position.set(center.x + span * 0.35, span * 0.45 + 2.5, center.z + span * 0.6 + 3.5)

  // 点选
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY] })
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
    const r = canvas.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    const hit = ray.intersectObjects(pickables)[0]
    if (hit && onPick) onPick(hit.object.userData.tower)
  })

  function setLit(id, n) {
    const t = towers.find(x => x.id === id)
    if (!t || t.litNow === n) return
    t.litNow = n
    const { tex } = windowTex(t)
    t.side.map.dispose(); t.side.map = tex; t.side.needsUpdate = true
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize()
  let running = true
  function frame(now) {
    if (!running) return
    beacons.forEach(({ b, orb }) => { const k = 0.6 + Math.sin(now / 300) * 0.4; b.intensity = 1.4 * k; orb.scale.setScalar(0.8 + k * 0.4) })
    controls.update(); renderer.render(scene, camera); requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return {
    setLit,
    dispose() {
      running = false; ro.disconnect(); controls.dispose()
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose() }) })
      renderer.dispose()
    }
  }
}
