// 地宫摆件：只做氛围，不参与玩法。
// 由 engine.js 的 placeProps 摆放：只放在殿室靠墙的边缘格，避开玩法物件及其四周一格、门口、中线通道；
// 不带文字标签、不上小地图、不发强光（发光件只有一点暗光晕，不加点光源），用哑光材质与主题的低饱和配色。
// 每件以地面中心为原点，+z 朝向殿室内侧；高度一般不超过 0.6（视线高 0.56，墙高 1.3）。
import * as THREE from 'three'

/** colors：主题的 props.colors（wood / metal / stone / cloth / accent / paper） */
export function propKit(colors, glowTex) {
  const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, lam(v)]));
  const dark = lam(0x1a1714), gold = lam(0x8d7445);
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const group = (...items) => { const g = new THREE.Group(); items.forEach(i => g.add(i)); return g; };
  const box = (w, h, d, mat, x = 0, y = h / 2, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cyl = (rt, rb, h, mat, x = 0, y = h / 2, z = 0, seg = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  const ball = (r, mat, x = 0, y = r, z = 0) => mesh(new THREE.SphereGeometry(r, 10, 8), mat, x, y, z);
  const glow = (color, size, y) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(size, size, 1); s.position.y = y; return s; };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  const floor = {
    jar: r => { const s = 0.8 + r() * 0.4, m = pick(r, [C.stone, C.cloth, C.wood]); const g = group(ball(0.13, m, 0, 0.14), cyl(0.06, 0.09, 0.08, m, 0, 0.27), cyl(0.07, 0.06, 0.02, dark, 0, 0.31)); g.scale.setScalar(s); return g; },
    ding: () => { const g = group(cyl(0.16, 0.12, 0.16, C.metal, 0, 0.2)); [0, 2.1, 4.2].forEach(a => g.add(cyl(0.02, 0.02, 0.14, C.metal, Math.cos(a) * 0.1, 0.07, Math.sin(a) * 0.1, 6))); [-1, 1].forEach(sx => { const h = mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), C.metal, sx * 0.13, 0.3, 0); h.rotation.y = Math.PI / 2; g.add(h); }); return g; },
    crate: r => { const s = 0.22 + r() * 0.08; const g = group(box(s, s, s, C.wood)); [-1, 1].forEach(k => g.add(box(s + 0.01, 0.025, 0.02, dark, 0, s / 2 + k * s * 0.35, s / 2))); if (r() < 0.5) { const t = box(s * 0.8, s * 0.8, s * 0.8, C.wood, 0.02, s + s * 0.4, -0.02); t.rotation.y = 0.4; g.add(t); } return g; },
    barrel: () => group(cyl(0.12, 0.11, 0.34, C.wood), cyl(0.125, 0.125, 0.025, dark, 0, 0.07), cyl(0.125, 0.125, 0.025, dark, 0, 0.27)),
    books: r => { const g = new THREE.Group(); let y = 0; const n = 3 + Math.floor(r() * 3); for (let k = 0; k < n; k++) { const h = 0.03 + r() * 0.02, b = box(0.2 + r() * 0.06, h, 0.15, lam(pick(r, [0x5a2a20, 0x2a4048, 0x4a4a2a, 0x3a2a40, 0x6a5a3a])), 0, y + h / 2); b.rotation.y = (r() - 0.5) * 0.5; g.add(b); y += h; } return g; },
    shelf: r => { const g = group(box(0.5, 0.75, 0.16, C.wood, 0, 0.375, -0.12)); [0.2, 0.42, 0.64].forEach(y => { let x = -0.21; while (x < 0.2) { const w = 0.025 + r() * 0.03, h = 0.12 + r() * 0.06; g.add(box(w, h, 0.11, lam(pick(r, [0x5a2a20, 0x2a4048, 0x4a4a2a, 0x6a5a3a])), x + w / 2, y - 0.17 + h / 2 + 0.02, -0.08)); x += w + 0.008; } }); return g; },
    table: r => { const g = group(box(0.46, 0.03, 0.3, C.wood, 0, 0.3)); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(box(0.03, 0.3, 0.03, C.wood, a * 0.2, 0.15, b * 0.12))); g.add(cyl(0.03, 0.025, 0.05, C.stone, -0.1, 0.34, 0)); const sc = cyl(0.02, 0.02, 0.2, C.paper, 0.08, 0.335, 0.02, 8); sc.rotation.z = Math.PI / 2; g.add(sc); if (r() < 0.5) g.add(box(0.12, 0.012, 0.08, C.paper, 0.05, 0.322, -0.07)); return g; },
    screen: () => { const g = new THREE.Group(); [-1, 0, 1].forEach(k => { const p = box(0.2, 0.6, 0.015, C.cloth, k * 0.19, 0.32, Math.abs(k) * -0.05); p.rotation.y = k * 0.35; g.add(p); g.add(box(0.02, 0.64, 0.02, C.wood, k * 0.19 + 0.1, 0.32, Math.abs(k) * -0.05)); }); return g; },
    figure: r => { const g = group(cyl(0.08, 0.11, 0.36, C.stone, 0, 0.18), ball(0.07, C.stone, 0, 0.43), box(0.16, 0.04, 0.12, C.stone, 0, 0.02)); g.rotation.y = (r() - 0.5) * 0.6; return g; },
    coffin: () => group(box(0.34, 0.2, 0.6, C.wood, 0, 0.1), box(0.38, 0.05, 0.64, C.wood, 0, 0.225), box(0.08, 0.06, 0.08, C.accent, 0, 0.26, 0.2)),
    cage: () => { const g = group(box(0.4, 0.03, 0.4, C.metal, 0, 0.015), box(0.4, 0.03, 0.4, C.metal, 0, 0.55)); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.add(cyl(0.008, 0.008, 0.54, C.metal, Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.18, 4)); } return g; },
    brazier: () => { const g = group(cyl(0.14, 0.08, 0.08, C.metal, 0, 0.3)); [0, 2.1, 4.2].forEach(a => { const l = cyl(0.012, 0.012, 0.3, C.metal, Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08, 5); g.add(l); }); g.add(ball(0.06, lam(0x3a1a0a), 0, 0.33)); g.add(glow(0xff8a3a, 0.35, 0.38)); return g; },
    hay: r => { const m = mesh(new THREE.ConeGeometry(0.22, 0.18, 8), lam(0x8a7a3a), 0, 0.09); m.scale.set(1, 1, 0.7 + r() * 0.4); return group(m); },
    safe: () => group(box(0.3, 0.34, 0.26, C.metal, 0, 0.17), cyl(0.04, 0.04, 0.02, C.accent, 0, 0.2, 0.135, 12), box(0.02, 0.08, 0.02, C.accent, 0.09, 0.2, 0.135)),
    clock: () => group(box(0.2, 0.72, 0.14, C.wood, 0, 0.36, -0.08), cyl(0.07, 0.07, 0.015, C.paper, 0, 0.58, 0.0, 16).rotateX(Math.PI / 2), box(0.01, 0.2, 0.01, C.accent, 0, 0.3, 0)),
    globe: () => group(cyl(0.06, 0.08, 0.04, C.wood, 0, 0.02), cyl(0.012, 0.012, 0.22, C.metal, 0, 0.13), ball(0.1, C.cloth, 0, 0.32)),
    trunk: r => { const g = group(box(0.38, 0.2, 0.24, C.cloth, 0, 0.1), box(0.39, 0.03, 0.25, C.metal, 0, 0.17), box(0.06, 0.04, 0.02, C.accent, 0, 0.14, 0.125)); g.rotation.y = (r() - 0.5) * 0.4; return g; },
    candles: r => { const g = new THREE.Group(); const n = 3 + Math.floor(r() * 3); for (let k = 0; k < n; k++) { const h = 0.06 + r() * 0.14, x = (r() - 0.5) * 0.24, z = (r() - 0.5) * 0.18; g.add(cyl(0.018, 0.018, h, C.paper, x, h / 2, z, 6)); const f = glow(0xffc070, 0.08, h + 0.02); f.position.x = x; f.position.z = z; g.add(f); } return g; },
    chair: r => { const g = group(box(0.26, 0.03, 0.24, C.wood, 0, 0.22), box(0.26, 0.3, 0.03, C.wood, 0, 0.37, -0.11)); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(box(0.025, 0.22, 0.025, C.wood, a * 0.11, 0.11, b * 0.1))); g.rotation.z = r() < 0.5 ? 0.15 : 0; return g; },
    umbrella: () => { const c = mesh(new THREE.ConeGeometry(0.24, 0.12, 12, 1, true), new THREE.MeshLambertMaterial({ color: colors.cloth, side: THREE.DoubleSide }), 0, 0.12); c.rotation.z = 1.2; const st = cyl(0.008, 0.008, 0.5, C.wood, 0.05, 0.12); st.rotation.z = 1.2 + Math.PI / 2; return group(c, st); },
    lantern_floor: () => group(cyl(0.012, 0.012, 0.36, C.wood, 0, 0.18, 0, 5), ball(0.1, C.cloth, 0, 0.42), cyl(0.05, 0.05, 0.02, gold, 0, 0.52), glow(0xff6a3a, 0.3, 0.42)),
    giftbox: r => { const g = new THREE.Group(); let y = 0; [0.26, 0.2, 0.14].slice(0, 2 + Math.floor(r() * 2)).forEach(s => { g.add(box(s, s * 0.6, s, C.cloth, 0, y + s * 0.3)); g.add(box(s + 0.005, s * 0.6 + 0.005, 0.025, C.accent, 0, y + s * 0.3)); y += s * 0.6; }); g.rotation.y = r() * 0.6; return g; },
    drum: () => { const d = cyl(0.16, 0.16, 0.16, C.cloth, 0, 0.32, 0, 14); d.rotation.x = Math.PI / 2; const g = group(d); [-1, 1].forEach(k => { const rim = cyl(0.165, 0.165, 0.015, C.accent, 0, 0.32, k * 0.08, 14); rim.rotation.x = Math.PI / 2; g.add(rim); g.add(box(0.025, 0.26, 0.025, C.wood, k * 0.12, 0.13, 0)); }); return g; },
    basket: r => { const g = group(cyl(0.15, 0.11, 0.14, C.wood, 0, 0.07, 0, 12)); for (let k = 0; k < 5; k++) g.add(ball(0.04, lam(pick(r, [0xa84a2a, 0x8a8a2a, 0xc8a050, 0x6a2a2a])), (r() - 0.5) * 0.14, 0.15, (r() - 0.5) * 0.14)); return g; },
    wine: r => { const g = new THREE.Group(); const n = 2 + Math.floor(r() * 2); for (let k = 0; k < n; k++) { const j = group(ball(0.1, C.stone, 0, 0.1), cyl(0.05, 0.07, 0.06, C.stone, 0, 0.2), cyl(0.06, 0.06, 0.03, C.cloth, 0, 0.24)); j.position.set((k - (n - 1) / 2) * 0.17, 0, (r() - 0.5) * 0.08); g.add(j); } return g; },
    scrolls: r => { const g = group(cyl(0.1, 0.09, 0.22, C.stone, 0, 0.11, 0, 12)); for (let k = 0; k < 4; k++) { const s = cyl(0.015, 0.015, 0.28, C.paper, (r() - 0.5) * 0.08, 0.26, (r() - 0.5) * 0.08, 6); s.rotation.z = (r() - 0.5) * 0.5; g.add(s); } return g; },
    incense: () => group(cyl(0.09, 0.07, 0.1, C.metal, 0, 0.14), cyl(0.07, 0.07, 0.03, dark, 0, 0.03), cyl(0.004, 0.004, 0.12, lam(0xa3312a), 0.02, 0.24, 0, 4), cyl(0.004, 0.004, 0.1, lam(0xa3312a), -0.02, 0.23, 0, 4)),
    bonsai: r => { const g = group(cyl(0.12, 0.09, 0.08, C.stone, 0, 0.04, 0, 12), cyl(0.015, 0.02, 0.14, C.wood, 0, 0.15, 0, 5)); for (let k = 0; k < 3; k++) g.add(ball(0.06 + r() * 0.03, lam(0x3a5a3a), (r() - 0.5) * 0.12, 0.24 + r() * 0.06, (r() - 0.5) * 0.08)); return g; },
    gears: r => { const g = new THREE.Group(); for (let k = 0; k < 3; k++) { const s = 0.08 + r() * 0.06, d = cyl(s, s, 0.03, C.metal, (r() - 0.5) * 0.2, 0.02 + k * 0.035, (r() - 0.5) * 0.2, 8); g.add(d); } return g; },
    pipes: () => { const g = group(cyl(0.04, 0.04, 0.7, C.metal, -0.05, 0.35, -0.1), cyl(0.04, 0.04, 0.5, C.metal, 0.08, 0.25, -0.12)); const v = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), C.accent, -0.05, 0.4, -0.05); g.add(v); return g; },
    puppet: r => { const g = group(box(0.14, 0.2, 0.1, C.wood, 0, 0.3), box(0.1, 0.1, 0.09, C.wood, 0, 0.46), box(0.04, 0.2, 0.04, C.wood, -0.04, 0.1), box(0.04, 0.2, 0.04, C.wood, 0.04, 0.1), box(0.03, 0.16, 0.03, C.metal, -0.1, 0.3), box(0.03, 0.16, 0.03, C.metal, 0.1, 0.3)); g.rotation.y = (r() - 0.5) * 0.8; return g; },
    coral: r => { const g = new THREE.Group(); const m = lam(pick(r, [0xc85a4a, 0xd88a6a, 0xb84a6a])); for (let k = 0; k < 5; k++) { const c = mesh(new THREE.ConeGeometry(0.025, 0.25 + r() * 0.2, 5), m, (r() - 0.5) * 0.12, 0.15, (r() - 0.5) * 0.12); c.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8); g.add(c); } return g; },
    seaweed: r => { const g = new THREE.Group(); for (let k = 0; k < 4; k++) { const c = mesh(new THREE.ConeGeometry(0.02, 0.4 + r() * 0.3, 4), lam(0x2a6a4a), (r() - 0.5) * 0.15, 0.25, (r() - 0.5) * 0.15); c.rotation.z = (r() - 0.5) * 0.3; g.add(c); } return g; },
    shell: () => { const s = mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.paper, 0, 0); s.scale.set(1, 0.35, 1); s.rotation.x = -0.5; s.position.set(0, 0.05, -0.03); return group(s, ball(0.035, lam(0xe8f0f0), 0, 0.04, 0.05)); },
    chest: () => group(box(0.32, 0.18, 0.22, C.wood, 0, 0.09), mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10, 1, false, 0, Math.PI), C.wood, 0, 0.18, 0).rotateZ(Math.PI / 2), box(0.33, 0.03, 0.23, C.accent, 0, 0.12), box(0.05, 0.06, 0.02, C.accent, 0, 0.17, 0.115)),
    lotus: () => { const g = group(cyl(0.16, 0.18, 0.06, C.stone, 0, 0.03)); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, p = mesh(new THREE.ConeGeometry(0.05, 0.12, 4), C.cloth, Math.cos(a) * 0.1, 0.1, Math.sin(a) * 0.1); p.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(p); } g.add(ball(0.05, C.accent, 0, 0.14)); return g; },
    sand: r => { const m = ball(0.2, C.stone, 0, 0); m.scale.set(1, 0.3 + r() * 0.2, 0.8); return group(m); }
  };

  // 墙挂：贴在殿室左右墙面，不占地面格（原点在墙面上，+z 朝殿室内）
  const wall = {
    chains: r => { const g = new THREE.Group(); [-0.12, 0.12].forEach(x => { for (let k = 0; k < 6 + Math.floor(r() * 4); k++) { const l = mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 8), C.metal, x, 1.05 - k * 0.04, 0.03); l.rotation.y = k % 2 ? Math.PI / 2 : 0; g.add(l); } }); return g; },
    shelf_wall: r => { const g = group(box(0.42, 0.025, 0.12, C.wood, 0, 0.78, 0.06)); for (let k = 0; k < 3; k++) { const m = pick(r, [C.stone, C.cloth, C.metal]); g.add(r() < 0.5 ? cyl(0.035, 0.03, 0.09, m, -0.13 + k * 0.13, 0.84, 0.06) : ball(0.045, m, -0.13 + k * 0.13, 0.84, 0.06)); } return g; },
    frame: r => group(box(0.34, 0.26, 0.02, C.wood, 0, 0.82, 0.01), box(0.28, 0.2, 0.01, lam(pick(r, [0x4a5a6a, 0x6a5a3a, 0x3a4a3a])), 0, 0.82, 0.022)),
    wallclock: () => group(cyl(0.12, 0.12, 0.03, C.wood, 0, 0.9, 0.02, 16).rotateX(Math.PI / 2), cyl(0.1, 0.1, 0.01, C.paper, 0, 0.9, 0.04, 16).rotateX(Math.PI / 2), box(0.01, 0.08, 0.01, dark, 0, 0.93, 0.05)),
    scroll_hang: () => group(box(0.22, 0.5, 0.01, C.paper, 0, 0.78, 0.01), cyl(0.012, 0.012, 0.26, C.wood, 0, 1.04, 0.015, 6).rotateZ(Math.PI / 2), cyl(0.012, 0.012, 0.26, C.wood, 0, 0.53, 0.015, 6).rotateZ(Math.PI / 2), box(0.1, 0.24, 0.005, dark, 0, 0.8, 0.017)),
    banner: () => group(box(0.22, 0.55, 0.01, C.cloth, 0, 0.78, 0.015), box(0.26, 0.02, 0.02, C.wood, 0, 1.06, 0.015), box(0.22, 0.04, 0.012, C.accent, 0, 0.6, 0.016)),
    firecrackers: () => { const g = group(cyl(0.006, 0.006, 0.6, lam(0x3a2a1a), 0, 0.8, 0.03, 4)); for (let k = 0; k < 10; k++) { const c = cyl(0.014, 0.014, 0.06, C.cloth, (k % 2 ? 1 : -1) * 0.03, 0.55 + k * 0.05, 0.03, 6); c.rotation.z = (k % 2 ? 1 : -1) * 0.8; g.add(c); } return g; },
    mirror: () => { const f = cyl(0.16, 0.16, 0.025, C.wood, 0, 0.82, 0.015, 16); f.rotation.x = Math.PI / 2; f.scale.set(0.75, 1, 1); const glass = cyl(0.13, 0.13, 0.01, lam(0x6a7a7a), 0, 0.82, 0.03, 16); glass.rotation.x = Math.PI / 2; glass.scale.set(0.75, 1, 1); return group(f, glass); },
    gear_wall: () => { const d = cyl(0.18, 0.18, 0.04, C.metal, 0, 0.82, 0.02, 10); d.rotation.x = Math.PI / 2; const hub = cyl(0.05, 0.05, 0.06, C.accent, 0, 0.82, 0.03, 8); hub.rotation.x = Math.PI / 2; return group(d, hub); },
    starfish: r => { const g = new THREE.Group(); const m = lam(pick(r, [0xd88a4a, 0xc85a4a])); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, arm = box(0.03, 0.12, 0.015, m, Math.sin(a) * 0.05, 0.8 + Math.cos(a) * 0.05, 0.015); arm.rotation.z = -a; g.add(arm); } return g; },
    net: () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { g.add(box(0.005, 0.4, 0.005, C.cloth, -0.16 + k * 0.08, 0.8, 0.02)); g.add(box(0.36, 0.005, 0.005, C.cloth, 0, 0.62 + k * 0.09, 0.02)); } return g; }
  };
  return { floor, wall };
}
