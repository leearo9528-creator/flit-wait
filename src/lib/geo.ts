/** 그림 지도 위에 GPS 위치를 올리기 — 지도는 축척이 맞는 그림이 아니라서 근사다.
 *  기준점 = 지도 좌표(x,y %)와 실제 좌표(lat,lng)를 둘 다 가진 장소 2곳 이상.
 *  기준점들로 '이동 + 회전 + 확대'(닮음 변환)를 최소제곱으로 맞춘다. */
export type Ctl = { x: number; y: number; lat: number; lng: number }
export type Fit = { toMap: (lat: number, lng: number) => { x: number; y: number }; mPerUnit: number; aspect: number }

/** aspect = 지도 그림의 세로/가로. 지도 좌표는 가로 100 · 세로 100*aspect 인 평면으로 본다 */
export function fitMap(ctl: Ctl[], aspect: number): Fit | null {
  const pts = ctl.filter(c => [c.x, c.y, c.lat, c.lng].every(v => typeof v === 'number' && isFinite(v)))
  if (pts.length < 2 || !(aspect > 0)) return null
  const lat0 = pts.reduce((a, c) => a + c.lat, 0) / pts.length, lng0 = pts.reduce((a, c) => a + c.lng, 0) / pts.length
  const kx = Math.cos(lat0 * Math.PI / 180) * 111_320, ky = 110_540
  const geo = (lat: number, lng: number) => [(lng - lng0) * kx, -(lat - lat0) * ky] as const   // 미터, 북쪽이 위(y 감소)
  const G = pts.map(c => geo(c.lat, c.lng)), M = pts.map(c => [c.x, c.y * aspect] as const)
  const mx = M.reduce((a, m) => a + m[0], 0) / M.length, my = M.reduce((a, m) => a + m[1], 0) / M.length   // G 의 평균은 0
  // 복소수 a = Σ conj(g)·(m - m̄) / Σ|g|²
  let re = 0, im = 0, den = 0
  G.forEach((g, i) => { const dx = M[i][0] - mx, dy = M[i][1] - my; re += g[0] * dx + g[1] * dy; im += g[0] * dy - g[1] * dx; den += g[0] * g[0] + g[1] * g[1] })
  if (den < 1) return null   // 기준점이 사실상 같은 자리 (1m 이내)
  re /= den; im /= den
  const scale = Math.hypot(re, im); if (!(scale > 0)) return null
  return {
    aspect, mPerUnit: 1 / scale,
    toMap: (lat, lng) => { const [gx, gy] = geo(lat, lng); return { x: mx + re * gx - im * gy, y: (my + im * gx + re * gy) / aspect } },
  }
}

/** 지도 위 두 점 사이 거리(m) — 근사 */
export function mapMeters(f: Fit, a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * f.aspect) * f.mPerUnit
}
export const fmtMeters = (m: number) => m < 15 ? '바로 앞' : m < 1000 ? `약 ${Math.round(m / 10) * 10}m` : `약 ${(m / 1000).toFixed(1)}km`
