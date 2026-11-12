import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { GuidePlace, PlaceKind } from '../lib/types'
import type { Live, Tone } from '../lib/live'

/**
 * 3D 행사장 지도 (2026-11-12) — 배치도 그림을 바닥에 깔고, 관리자 > 지도 탭에서 찍은 핀 자리에 부스를 세운다.
 * 따로 넣는 데이터가 없다: 핀의 종류(kind)가 모양을, 지금 대기(live)가 지붕 색을 정한다 (2D 핀과 같은 3색).
 * 가는 길은 부스를 피해 가는 경로(격자 A*)로 그리고, '걸어가기'는 그 길을 눈높이로 따라간다.
 * 배치도는 축척이 맞는 그림이 아니라서 거리·경로는 근사다. three 는 이 파일에서만 쓴다 (ParkHome 이 지연 로딩).
 */
type Item = { p: GuidePlace; live: Live | null }
type Shape = 'tent' | 'truck' | 'stall' | 'stage' | 'box' | 'flat' | 'shelter'
const SIZE: Record<PlaceKind, [number, number, Shape]> = {
  booth: [6, 6, 'tent'], food: [4, 6.5, 'truck'], market: [8, 5, 'stall'], stage: [16, 8, 'stage'],
  facility: [5, 5, 'box'], info: [5, 5, 'box'], medical: [5, 5, 'box'], other: [5, 5, 'box'], parking: [16, 11, 'flat'], shuttle: [6, 2.6, 'shelter'],
}
const INDOOR: [number, number, Shape] = [6, 6, 'box']
const TONE_HEX: Record<Tone, string> = { go: '#1d4ed8', mid: '#111827', busy: '#dc2626', time: '#64748b', off: '#cbd5e1' }
const TONE_LABEL: Record<Tone, string> = { go: 'bg-blue-700 text-white', mid: 'bg-gray-900 text-white', busy: 'bg-red-600 text-white', time: 'bg-white text-gray-900', off: 'bg-gray-200 text-gray-500' }
const NEUTRAL = '#94a3b8'
const shortName = (name: string) => { const n = name.split(' · ')[0].trim(); return n.length > 8 ? n.slice(0, 7) + '…' : n }

type Booth = { id: string; x: number; z: number; w: number; d: number; h: number; block: boolean; accent: THREE.Mesh[]; label: HTMLDivElement; text: string; on: boolean }
type EngineState = { walk: boolean; auto: boolean; len: number | null }

function createEngine(canvas: HTMLCanvasElement, labelBox: HTMLDivElement, cb: { onTap: (id: string) => void; onState: (s: EngineState) => void }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#eef2f7')
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b5, 2.3))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(40, 90, 30); scene.add(sun)
  const world = new THREE.Group(), routeG = new THREE.Group(); scene.add(world, routeG)
  const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c })
  const M = { white: lam('#fafaf7'), wood: lam('#c9a36f'), ink: lam('#1f2937'), post: lam('#9aa3b2'), hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }) }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#f7fbff' })); ground.rotation.x = -Math.PI / 2; scene.add(ground)
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#e2e8f0' })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.2; scene.add(apron)
  const pin = new THREE.Mesh(new THREE.ConeGeometry(1, 2.4, 4), new THREE.MeshLambertMaterial({ color: '#1d4ed8', emissive: '#0b2a80' })); pin.rotation.x = Math.PI; pin.visible = false; scene.add(pin)
  const meDot = new THREE.Group()
  meDot.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' })), new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.14, 24), new THREE.MeshBasicMaterial({ color: '#2563eb' })))
  meDot.visible = false; scene.add(meDot)

  let W = 200, D = 250, k = 1, cell = 1, GW = 0, GD = 0, grid = new Uint8Array(0)
  let booths: Booth[] = [], hits: THREE.Mesh[] = [], targetId: string | null = null, disposed = false
  let route: { pts: [number, number][]; len: number } | null = null
  const cam = { tx: 0, tz: 0, r: 200, theta: 0.35, phi: 0.85, goal: null as null | { tx: number; tz: number; r: number } }
  const walker = { x: 0, z: 0, h: 0, s: 0 }
  const st = { walk: false, auto: false }
  const emit = () => cb.onState({ walk: st.walk, auto: st.auto, len: route ? route.len : null })

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m }
  const clear = (g: THREE.Object3D) => { while (g.children.length) { const c = g.children[0] as THREE.Mesh; g.remove(c); c.traverse?.((o: any) => { o.geometry?.dispose?.() }) } }

  function setGround(tex: THREE.Texture | null, aspect: number, w: number) {
    W = w; D = w * aspect; k = Math.min(2.4, Math.max(1, W / 120))
    ground.scale.set(W, D, 1); apron.scale.set(W * 6, D * 6, 1)
    const mat = ground.material as THREE.MeshBasicMaterial
    if (tex) { mat.map = tex; mat.color.set('#ffffff') } else { mat.map = null; mat.color.set('#f7fbff') }
    mat.needsUpdate = true
    cam.r = Math.max(W, D) * 1.45; cam.tx = 0; cam.tz = D * 0.04; cam.goal = null; clampCam()
  }

  function build(places: { id: string; kind: PlaceKind; x: number; y: number }[], indoor = false) {
    clear(world); clearRoute(); labelBox.innerHTML = ''; booths = []; hits = []
    for (const p of places) {
      // 실내 행사는 천막·트럭이 없다 — 체험·먹거리·마켓을 전부 조립부스(상자 + 띠)로 세운다
      const [w0, d0, shape] = indoor && (p.kind === 'booth' || p.kind === 'food' || p.kind === 'market') ? INDOOR : SIZE[p.kind] ?? SIZE.other
      const w = w0 * k, d = d0 * k, x = (p.x - 50) / 100 * W, z = (p.y - 50) / 100 * D
      const g = new THREE.Group(); g.position.set(x, 0, z); world.add(g)
      const accentMat = lam(NEUTRAL), accent: THREE.Mesh[] = []; let h = 3 * k
      if (shape === 'tent') {
        box(w * 0.94, 2.3 * k, d * 0.94, M.white, 0, 1.15 * k, 0, g)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.74, 1.7 * k, 4), accentMat); roof.rotation.y = Math.PI / 4; roof.position.y = 3.15 * k; g.add(roof); accent.push(roof); h = 4 * k
      } else if (shape === 'truck') {
        accent.push(box(w * 0.92, 2.2 * k, d * 0.7, accentMat, 0, 1.6 * k, d * 0.1, g))
        box(w * 0.88, 1.6 * k, d * 0.24, M.white, 0, 1.3 * k, -d * 0.37, g); box(w * 0.86, 0.5 * k, d * 0.94, M.ink, 0, 0.25 * k, 0, g)
        box(w * 0.5, 0.1 * k, d * 0.6, M.white, -w * 0.7, 2.5 * k, d * 0.1, g); h = 2.8 * k
      } else if (shape === 'stall') {
        box(w * 0.86, 0.95 * k, d * 0.45, M.wood, 0, 0.475 * k, 0, g)
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.14 * k, 2.3 * k, 0.14 * k, M.post, sx * (w / 2 - 0.2 * k), 1.15 * k, sz * (d / 2 - 0.2 * k), g)
        accent.push(box(w, 0.2 * k, d, accentMat, 0, 2.4 * k, 0, g)); h = 2.6 * k
      } else if (shape === 'stage') {
        box(w, 1.1 * k, d, M.ink, 0, 0.55 * k, 0, g)
        accent.push(box(w, 5.4 * k, 0.5 * k, accentMat, 0, 3.8 * k, -d / 2 + 0.25 * k, g))
        box(w * 1.04, 0.4 * k, d * 0.7, M.post, 0, 6.7 * k, -d * 0.15, g)
        for (const s of [-1, 1]) box(0.4 * k, 5.6 * k, 0.4 * k, M.post, s * w / 2, 3.9 * k, d * 0.2, g); h = 6.9 * k
      } else if (shape === 'flat') {
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#475569', transparent: true, opacity: 0.28, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.05; g.add(pad)
        box(0.25 * k, 3 * k, 0.25 * k, M.post, 0, 1.5 * k, 0, g); accent.push(box(1.6 * k, 1.6 * k, 0.2 * k, accentMat, 0, 3.4 * k, 0, g)); h = 4.2 * k
      } else if (shape === 'shelter') {
        for (const s of [-1, 1]) box(0.16 * k, 2.4 * k, 0.16 * k, M.post, s * (w / 2 - 0.2 * k), 1.2 * k, 0, g)
        accent.push(box(w, 0.2 * k, d, accentMat, 0, 2.5 * k, 0, g)); h = 2.7 * k
      } else {
        box(w, 2.5 * k, d, M.white, 0, 1.25 * k, 0, g); accent.push(box(w * 1.04, 0.35 * k, d * 1.04, accentMat, 0, 2.68 * k, 0, g)); h = 2.9 * k
      }
      const hm = box(Math.max(w, 5 * k), h, Math.max(d, 5 * k), M.hit, x, h / 2, z, world); hm.userData.id = p.id; hits.push(hm)
      const label = document.createElement('div'); label.style.cssText = 'position:absolute;left:0;top:0;will-change:transform'; labelBox.appendChild(label)
      booths.push({ id: p.id, x, z, w, d, h, block: shape !== 'flat', accent, label, text: '', on: true })
    }
    cell = Math.max(1, W / 320); GW = Math.ceil(W / cell); GD = Math.ceil(D / cell); grid = new Uint8Array(GW * GD)
    for (const b of booths) {
      if (!b.block) continue
      const m = 0.3 * k, x0 = Math.floor((b.x - b.w / 2 - m + W / 2) / cell), x1 = Math.ceil((b.x + b.w / 2 + m + W / 2) / cell), z0 = Math.floor((b.z - b.d / 2 - m + D / 2) / cell), z1 = Math.ceil((b.z + b.d / 2 + m + D / 2) / cell)
      for (let z = Math.max(0, z0); z < Math.min(GD, z1); z++) for (let x = Math.max(0, x0); x < Math.min(GW, x1); x++) grid[z * GW + x] = 1
    }
    dirty = true
  }

  /** 지붕 색·이름표를 지금 대기에 맞춘다 (6~20초마다 불린다 — 장면은 다시 짓지 않는다) */
  function update(items: Item[], shown: Set<string>) {
    const by = new Map(items.map(i => [i.p.id, i]))
    for (const b of booths) {
      const it = by.get(b.id); if (!it) continue
      const hex = it.live ? TONE_HEX[it.live.tone] : NEUTRAL
      for (const m of b.accent) (m.material as THREE.MeshLambertMaterial).color.set(hex)
      const isT = b.id === targetId, show = shown.has(b.id) || isT
      const text = `${show ? 1 : 0}|${isT ? 1 : 0}|${it.p.name}|${it.live?.text ?? ''}|${it.live?.tone ?? ''}`
      if (text === b.text) continue
      b.text = text; b.label.dataset.show = show ? '1' : ''
      const pill = it.live && it.p.booth ? TONE_LABEL[it.live.tone] : 'bg-white text-gray-700'
      b.label.innerHTML = ''
      const span = document.createElement('span')
      span.className = `flex items-baseline gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold shadow-md ring-1 ring-gray-300 ${isT ? 'bg-blue-700 text-white ring-2 ring-white' : pill}`
      span.textContent = shortName(it.p.name)
      if (it.live) { const t = document.createElement('span'); t.className = 'text-[13px] tabular-nums'; t.textContent = it.live.text; span.appendChild(t) }
      b.label.appendChild(span)
    }
    dirty = true
  }

  // ── 길찾기 (격자 A*) ──
  const free = (cx: number, cz: number) => cx >= 0 && cz >= 0 && cx < GW && cz < GD && !grid[cz * GW + cx]
  const freeAt = (x: number, z: number) => free(Math.floor((x + W / 2) / cell), Math.floor((z + D / 2) / cell))
  function nearestFree(x: number, z: number): [number, number] {
    const cx = Math.min(GW - 1, Math.max(0, Math.floor((x + W / 2) / cell))), cz = Math.min(GD - 1, Math.max(0, Math.floor((z + D / 2) / cell)))
    for (let r = 0; r < 60; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; if (free(cx + dx, cz + dz)) return [cx + dx, cz + dz] }
    return [cx, cz]
  }
  function los(a: [number, number], b: [number, number]) {
    const dx = b[0] - a[0], dz = b[1] - a[1], n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (cell * 0.4))), m = 0.4 * cell
    for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + dx * t, z = a[1] + dz * t; if (!freeAt(x - m, z) || !freeAt(x + m, z) || !freeAt(x, z - m) || !freeAt(x, z + m)) return false }
    return true
  }
  function findPath(A: [number, number], B: [number, number]): [number, number][] | null {
    const s = nearestFree(A[0], A[1]), t = nearestFree(B[0], B[1]), N = GW * GD
    const g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap: [number, number][] = []
    const si = s[1] * GW + s[0], ti = t[1] * GW + t[0]
    const push = (f: number, i: number) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break;[heap[p], heap[c]] = [heap[c], heap[p]]; c = p } }
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break;[heap[m], heap[c]] = [heap[c], heap[m]]; c = m } } return top }
    const hh = (i: number) => { const dx = Math.abs(i % GW - t[0]), dz = Math.abs(Math.floor(i / GW) - t[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) }
    g[si] = 0; push(hh(si), si); let found = false
    while (heap.length) {
      const cur = pop()[1]; if (closed[cur]) continue; closed[cur] = 1; if (cur === ti) { found = true; break }
      const cx = cur % GW, cz = Math.floor(cur / GW)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (!free(nx, nz)) continue
        if (dx && dz && (!free(cx + dx, cz) || !free(cx, cz + dz))) continue
        const ni = nz * GW + nx, ng = g[cur] + (dx && dz ? 1.414 : 1); if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ng + hh(ni), ni) }
      }
    }
    if (!found) return null
    const cells: [number, number][] = []; for (let c = ti; c !== -1; c = came[c]) cells.push([(c % GW + 0.5) * cell - W / 2, (Math.floor(c / GW) + 0.5) * cell - D / 2]); cells.reverse()
    const out: [number, number][] = [cells[0]]; let i = 0
    while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !los(cells[i], cells[j])) j--; out.push(cells[j]); i = j }
    return out
  }
  const rmA = new THREE.MeshBasicMaterial({ color: '#1d4ed8' }), rmB = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  function clearRoute() { clear(routeG); route = null }
  function drawRoute(pts: [number, number][]) {
    clear(routeG); let len = 0
    pts.forEach((a, i) => {
      for (const [r, y, m] of [[0.95 * k, 0.06, rmB], [0.6 * k, 0.1, rmA]] as [number, number, THREE.Material][]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 14), m); c.position.set(a[0], y, a[1]); routeG.add(c) }
      if (i < pts.length - 1) {
        const b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); len += L
        for (const [wd, y, m] of [[1.9 * k, 0.06, rmB], [1.2 * k, 0.1, rmA]] as [number, number, THREE.Material][]) { const s = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, wd), m); s.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); s.rotation.y = -Math.atan2(dz, dx); routeG.add(s) }
      }
    })
    return len
  }
  /** 목적지와 출발점(내 위치, 없으면 지도 아래쪽 가운데 = 보통 입구)으로 경로를 그린다 */
  function setRoute(id: string | null, me: { x: number; y: number } | null) {
    const changed = id !== targetId; targetId = id
    for (const b of booths) b.text = ''   // 이름표 다시 그리게
    const from: [number, number] = me ? [(me.x - 50) / 100 * W, (me.y - 50) / 100 * D] : [0, D / 2 - 2 * cell]
    meDot.visible = !!me; meDot.scale.setScalar(1.3 * k); if (me) meDot.position.set(from[0], 0.12, from[1])
    const b = booths.find(x => x.id === id)
    pin.visible = !!b
    if (!b) { if (!st.walk) clearRoute(); emit(); return }
    if (st.walk && !changed) return   // 걷는 중엔 내 위치가 움직여도 길을 다시 긋지 않는다
    pin.scale.setScalar(k)
    const pts = findPath(from, [b.x, b.z + b.d / 2 + Math.max(b.w, b.d) * 0.6 + 2 * k])   // 부스 앞에서 한 발 물러선 자리 — 걸어가서 섰을 때 부스가 한눈에 들어오게
    if (!pts) { clearRoute(); emit(); return }
    route = { pts, len: drawRoute(pts) }
    if (changed) {
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
      cam.goal = { tx: (Math.min(...xs) + Math.max(...xs)) / 2, tz: (Math.min(...zs) + Math.max(...zs)) / 2, r: Math.max(40 * k, span * 1.9 + 20 * k) }
    }
    emit()
  }

  // ── 카메라 · 손가락 ──
  function clampCam() { cam.r = Math.min(Math.max(W, D) * 2.2, Math.max(14 * k, cam.r)); cam.phi = Math.min(1.36, Math.max(0.12, cam.phi)); cam.tx = Math.min(W / 2, Math.max(-W / 2, cam.tx)); cam.tz = Math.min(D / 2, Math.max(-D / 2, cam.tz)) }
  const ptrs = new Map<number, { x: number; y: number; btn: number; shift: boolean }>(); let g0: { d: number; a: number; my: number } | null = null, tap: { x: number; y: number; t: number } | null = null
  const down = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }); cam.goal = null; tap = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; g0 = null }
  const move = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null
    if (st.walk) { if (ptrs.size === 1) { walker.h += dx * 0.006; if (st.auto) { st.auto = false; emit() } } return }
    if (ptrs.size === 1) {
      if (p.btn === 2 || p.shift) { cam.theta -= dx * 0.006; cam.phi -= dy * 0.005 }
      else { const s = cam.r * 0.0017; cam.tx += (-Math.cos(cam.theta) * dx - Math.sin(cam.theta) * dy) * s; cam.tz += (Math.sin(cam.theta) * dx - Math.cos(cam.theta) * dy) * s }
    } else if (ptrs.size === 2) {
      const a = [...ptrs.values()], d = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y), ang = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x), my = (a[0].y + a[1].y) / 2
      if (g0) { cam.r *= g0.d / Math.max(1, d); let da = ang - g0.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; cam.theta += da; cam.phi -= (my - g0.my) * 0.005 }
      g0 = { d, a: ang, my }
    }
    clampCam()
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  const up = (e: PointerEvent) => {
    const had = ptrs.delete(e.pointerId); g0 = null
    if (had && tap && e.type === 'pointerup' && Date.now() - tap.t < 450 && !st.walk) {
      const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera)
      const h = ray.intersectObjects(hits, false); if (h.length) cb.onTap(h[0].object.userData.id)
    }
    tap = null
  }
  const wheel = (e: WheelEvent) => { if (st.walk || !(e.ctrlKey || e.metaKey || e.shiftKey)) return; e.preventDefault(); cam.goal = null; cam.r *= Math.exp(e.deltaY * 0.0012); clampCam() }
  const noMenu = (e: Event) => e.preventDefault()
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', noMenu)

  // ── 걷기 ──
  const keys: Record<string, boolean> = {}
  function walk(on: boolean) {
    if (on) {
      const p = route ? route.pts[0] : (() => { const c = nearestFree(0, D / 2 - 2 * cell); return [(c[0] + 0.5) * cell - W / 2, (c[1] + 0.5) * cell - D / 2] as [number, number] })()
      const n = route?.pts[1]; walker.x = p[0]; walker.z = p[1]; walker.s = 0; walker.h = n ? Math.atan2(n[0] - p[0], -(n[1] - p[1])) : 0
      st.walk = true; st.auto = !!route
    } else { st.walk = false; st.auto = false; cam.tx = walker.x; cam.tz = walker.z; cam.theta = -walker.h; cam.r = 60 * k; cam.phi = 0.95; clampCam() }
    dirty = true; emit()
  }
  function toggleAuto() { if (!route) return; if (!st.auto && walker.s >= route.len - 0.5) walker.s = 0; st.auto = !st.auto; emit() }
  function stepWalk(dt: number) {
    if (st.auto && route) {
      walker.s = Math.min(route.len, walker.s + dt * 9 * k); let s = walker.s
      for (let i = 0; i < route.pts.length - 1; i++) {
        const a = route.pts[i], b = route.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (s <= L || i === route.pts.length - 2) { const t = Math.min(1, s / Math.max(0.001, L)); walker.x = a[0] + (b[0] - a[0]) * t; walker.z = a[1] + (b[1] - a[1]) * t; let d = Math.atan2(b[0] - a[0], -(b[1] - a[1])) - walker.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; walker.h += d * Math.min(1, dt * 4); break }
        s -= L
      }
      if (walker.s >= route.len) { st.auto = false; const b = booths.find(x => x.id === targetId); if (b) walker.h = Math.atan2(b.x - walker.x, -(b.z - walker.z)); emit() }
    } else {
      if (keys.l) walker.h -= dt * 1.9; if (keys.r) walker.h += dt * 1.9; const mv = (keys.f ? 1 : 0) - (keys.b ? 1 : 0)
      if (mv) { const nx = walker.x + Math.sin(walker.h) * mv * dt * 11 * k, nz = walker.z - Math.cos(walker.h) * mv * dt * 11 * k; if (Math.abs(nx) < W / 2 && freeAt(nx, walker.z)) walker.x = nx; if (Math.abs(nz) < D / 2 && freeAt(walker.x, nz)) walker.z = nz }
    }
  }

  // ── 그리기 ──
  let dirty = true, cw = 1, ch = 1, lastSig = '', last = performance.now(), raf = 0
  const v3 = new THREE.Vector3()
  function resize() { const r = canvas.parentElement!.getBoundingClientRect(); cw = r.width; ch = r.height; if (!cw || !ch) return; renderer.setSize(cw, ch, false); camera.aspect = cw / ch; camera.updateProjectionMatrix(); dirty = true }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement!)
  function labels() {
    for (const b of booths) {
      let show = !!b.label.dataset.show
      if (show) { v3.set(b.x, b.h + 1.2 * k, b.z).project(camera); if (v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) show = false; else if (st.walk && Math.hypot(b.x - walker.x, b.z - walker.z) > 90 * k) show = false }
      if (show) b.label.style.transform = `translate(-50%,-100%) translate(${((v3.x + 1) / 2 * cw).toFixed(1)}px,${((1 - v3.y) / 2 * ch).toFixed(1)}px)`
      if (show !== b.on) { b.label.style.display = show ? '' : 'none'; b.on = show }
    }
  }
  function frame(now: number) {
    if (disposed) return
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    if (st.walk) { stepWalk(dt); camera.position.set(walker.x, 1.7 * k, walker.z); camera.lookAt(walker.x + Math.sin(walker.h) * 10, 1.5 * k, walker.z - Math.cos(walker.h) * 10) }
    else {
      if (cam.goal) { const f = Math.min(1, dt * 5); cam.tx += (cam.goal.tx - cam.tx) * f; cam.tz += (cam.goal.tz - cam.tz) * f; cam.r += (cam.goal.r - cam.r) * f; if (Math.abs(cam.goal.r - cam.r) < 0.3 && Math.hypot(cam.goal.tx - cam.tx, cam.goal.tz - cam.tz) < 0.3) cam.goal = null }
      const sp = Math.sin(cam.phi); camera.position.set(cam.tx + cam.r * sp * Math.sin(cam.theta), cam.r * Math.cos(cam.phi), cam.tz + cam.r * sp * Math.cos(cam.theta)); camera.lookAt(cam.tx, 0, cam.tz)
    }
    const tb = pin.visible ? booths.find(x => x.id === targetId) : null
    if (tb) { pin.position.set(tb.x, tb.h + (4.6 + Math.sin(now / 260) * 0.4) * k, tb.z); pin.rotation.y = now / 700 }
    camera.updateMatrixWorld()
    const sig = camera.position.x.toFixed(2) + camera.position.y.toFixed(2) + camera.position.z.toFixed(2) + camera.rotation.y.toFixed(3) + camera.rotation.x.toFixed(3)
    if (sig !== lastSig || dirty || tb) { if (sig !== lastSig || dirty) labels(); lastSig = sig; dirty = false; renderer.render(scene, camera) }
    raf = requestAnimationFrame(frame)
  }
  resize(); raf = requestAnimationFrame(frame)

  return {
    setGround, build, update, setRoute, walk, toggleAuto, resize,
    key: (kk: string, on: boolean) => { keys[kk] = on; if (on && st.auto) { st.auto = false; emit() } },
    zoom: (f: number) => { cam.goal = { tx: cam.tx, tz: cam.tz, r: Math.min(Math.max(W, D) * 2.2, Math.max(14 * k, cam.r * f)) } },
    rotate: (a: number) => { cam.theta += a },
    dispose: () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect()
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', noMenu)
      clear(world); clear(routeG); labelBox.innerHTML = ''; renderer.dispose()
    },
  }
}

export default function Map3D({ imageUrl, mPerUnit, indoor = false, items, shownIds, target, me, onTap, onAspect }: {
  imageUrl: string; mPerUnit: number; indoor?: boolean; items: Item[]; shownIds: string[]; target: GuidePlace | null; me: { x: number; y: number } | null
  onTap: (p: GuidePlace) => void; onAspect?: (a: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null), labelRef = useRef<HTMLDivElement>(null)
  const eng = useRef<ReturnType<typeof createEngine> | null>(null)
  const itemsRef = useRef(items); itemsRef.current = items
  const tapRef = useRef(onTap); tapRef.current = onTap
  const [state, setState] = useState<EngineState>({ walk: false, auto: false, len: null })
  const [fail, setFail] = useState(false)
  const [ground, setGround] = useState<{ aspect: number; tex: THREE.Texture | null } | null>(null)
  const [built, setBuilt] = useState(0)

  useEffect(() => {
    try {
      eng.current = createEngine(canvasRef.current!, labelRef.current!, { onTap: id => { const it = itemsRef.current.find(i => i.p.id === id); if (it) tapRef.current(it.p) }, onState: setState })
    } catch { setFail(true) }
    return () => { eng.current?.dispose(); eng.current = null }
  }, [])

  // 배치도 그림 → 바닥 텍스처. SVG 도 캔버스에 한 번 그려서 올린다 (크기 없는 SVG 대비)
  useEffect(() => {
    let off = false; const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => {
      if (off) return
      const a = im.naturalWidth ? im.naturalHeight / im.naturalWidth : 1.25; let tex: THREE.Texture | null = null
      try {
        const c = document.createElement('canvas'); c.width = 1536; c.height = Math.min(4096, Math.round(1536 * a))
        c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
        tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
      } catch { tex = null }
      onAspect?.(a); setGround({ aspect: a, tex })
    }
    im.onerror = () => { if (!off) setGround({ aspect: 1.25, tex: null }) }
    im.src = imageUrl
    return () => { off = true }
  }, [imageUrl]) // eslint-disable-line

  const geo = useMemo(() => items.filter(i => i.p.x != null && i.p.y != null).map(i => ({ id: i.p.id, kind: i.p.kind, x: Number(i.p.x), y: Number(i.p.y) })), [items])
  const geoSig = geo.map(g => `${g.id}:${g.kind}:${g.x}:${g.y}`).join('|')
  useEffect(() => {
    if (!eng.current || !ground) return
    eng.current.setGround(ground.tex, ground.aspect, 100 * mPerUnit); eng.current.build(geo, indoor); setBuilt(n => n + 1)
  }, [ground, geoSig, mPerUnit, indoor]) // eslint-disable-line
  const shownSig = shownIds.join('|')
  useEffect(() => { if (built) eng.current?.update(items, new Set(shownIds)) }, [items, shownSig, built, target?.id]) // eslint-disable-line
  const meSig = me ? `${me.x.toFixed(1)},${me.y.toFixed(1)}` : ''
  useEffect(() => { if (built) { eng.current?.setRoute(target?.id ?? null, me); eng.current?.update(itemsRef.current, new Set(shownIds)) } }, [target?.id, meSig, built]) // eslint-disable-line

  const hold = (kk: string) => ({ onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); eng.current?.key(kk, true) }, onPointerUp: () => eng.current?.key(kk, false), onPointerLeave: () => eng.current?.key(kk, false), onPointerCancel: () => eng.current?.key(kk, false) })
  const fab = 'flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg font-bold text-gray-800 shadow-md ring-1 ring-gray-300 active:scale-95'
  const pad = 'flex h-12 w-14 touch-none select-none items-center justify-center rounded-xl bg-gray-900/90 text-xl text-white active:bg-blue-700'
  const mins = state.len != null ? Math.max(1, Math.round(state.len / 70)) : 0

  return (
    <div className="relative mt-3 h-[62dvh] min-h-[360px] w-full overflow-hidden bg-slate-100">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none" aria-label="3D 행사장 지도" />
      <div ref={labelRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {fail && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-500">이 기기에서는 3D 지도를 열 수 없어요. 위의 '지도'로 봐 주세요.</p>}
      {!fail && !state.walk && (
        <>
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            <button type="button" className={fab} onClick={() => eng.current?.zoom(0.7)} aria-label="확대">+</button>
            <button type="button" className={fab} onClick={() => eng.current?.zoom(1.4)} aria-label="축소">−</button>
            <button type="button" className={fab} onClick={() => eng.current?.rotate(Math.PI / 6)} aria-label="돌리기">⟳</button>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
            {state.len != null && <span className="rounded-full bg-gray-900 px-3.5 py-2.5 text-sm font-bold tabular-nums text-white shadow-md">길 따라 약 {Math.max(10, Math.round(state.len / 10) * 10)}m · {mins}분</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => eng.current?.walk(true)} className="rounded-full bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-md active:bg-blue-800">{state.len != null ? '걸어가기' : '걸어 보기'}</button>
          </div>
        </>
      )}
      {!fail && state.walk && (
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
          <div className="flex gap-2">
            {state.len != null && <button type="button" onClick={() => eng.current?.toggleAuto()} className="rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-md">{state.auto ? '잠깐 멈춤' : '길 따라가기'}</button>}
            <button type="button" onClick={() => eng.current?.walk(false)} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-gray-900 shadow-md ring-1 ring-gray-300">걷기 끝내기</button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={pad} aria-label="왼쪽으로 돌기" {...hold('l')}>↺</button>
            <button type="button" className={pad} aria-label="앞으로" {...hold('f')}>▲</button>
            <button type="button" className={pad} aria-label="뒤로" {...hold('b')}>▼</button>
            <button type="button" className={pad} aria-label="오른쪽으로 돌기" {...hold('r')}>↻</button>
          </div>
        </div>
      )}
    </div>
  )
}
