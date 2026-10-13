/** 손님 목록·상세 공통 조각: 썸네일(사진 없으면 이름 커버), 상태 뱃지, 상태 판정 */

export interface BoothLike { id: string; name: string; mode: 'queue' | 'slot' | 'hybrid'; is_paused: boolean; image_url: string | null; group_name?: string | null; total_left?: number; reserve_open_at?: string | null }

export type BoothStatus = { kind: 'open' | 'paused' | 'closed' | 'soldout' | 'upcoming'; label: string }

export function boothStatus(b: BoothLike, eventClosed: boolean): BoothStatus {
  if (eventClosed) return { kind: 'closed', label: '운영 종료' }
  if (b.is_paused) return { kind: 'paused', label: '접수 중단' }
  if (b.mode !== 'queue') {
    const openAt = b.reserve_open_at ? new Date(b.reserve_open_at) : null
    if (openAt && openAt.getTime() > Date.now()) return { kind: 'upcoming', label: '예약 오픈 예정' }
    if ((b.total_left ?? 1) <= 0) return { kind: 'soldout', label: '매진' }
    return { kind: 'open', label: '예약 중' }
  }
  return { kind: 'open', label: '접수 중' }
}

export function StatusBadge({ st }: { st: BoothStatus }) {
  const tone = st.kind === 'open' ? 'bg-orange-50 text-orange-600' : st.kind === 'upcoming' ? 'bg-sky-50 text-sky-700' : st.kind === 'soldout' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
  return <span className={`rounded-md px-2 py-1 text-[13px] font-semibold ${tone}`}>{st.label}</span>
}

const GRADS = ['from-rose-400 to-orange-300', 'from-sky-400 to-indigo-400', 'from-emerald-400 to-teal-300', 'from-violet-400 to-fuchsia-300', 'from-amber-400 to-yellow-300']
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

export function BoothThumb({ b, dim, label, size = 'h-[100px] w-[100px]' }: { b: BoothLike; dim?: boolean; label?: string; size?: string }) {
  const grad = GRADS[hash(b.id) % GRADS.length]
  const g = b.group_name?.trim()
  const initial = (g && b.name.startsWith(g) ? b.name.slice(g.length).replace(/^[\s·\-:]+/, '') : b.name).trim().slice(0, 1) || b.name.slice(0, 1)
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${grad} ${size}`}>
      {b.image_url
        ? <img src={b.image_url} alt="" className="h-full w-full object-cover" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        : <div className="flex h-full items-center justify-center text-4xl font-black text-white/85">{initial}</div>}
      {dim && label && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[15px] font-bold text-white">{label}</div>
      )}
    </div>
  )
}
