import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cachedRpc, DEMO } from './supabase'
import { useAsync, LS } from './util'
import { liveOf, type Live } from './live'
import type { EventGuide, GuidePlace, PlaceKind } from './types'

export type Row = { p: GuidePlace; live: Live | null }
export type Group = 'booth' | 'food' | 'market' | 'stage' | 'etc'
export const groupOf = (k: PlaceKind): Group => (k === 'booth' || k === 'food' || k === 'market' || k === 'stage' ? k : 'etc')

/** 아래 탭 셋째 칸 — 먹거리(또는 마켓)가 있는 행사는 '먹거리', 없으면 '체험'. 한 번 알아낸 것을 기기에 적어 두고 어느 화면에서든 같은 탭을 그린다 */
export const thirdTab = (slug: string): 'food' | 'booth' => (LS.get<string>(`tab3:${slug}`) === 'booth' ? 'booth' : 'food')

/**
 * 손님 화면들이 같이 쓰는 행사 데이터 — 지도 안내(event_guide)에 '지도에 안 올린 부스'(event_summary)를 붙여 한 줄로 만든다.
 * 화면이 보이는 동안 주기적으로 다시 읽는다.
 */
export function useGuide(slug: string) {
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync<EventGuide>(() => cachedRpc('event_guide', slug), [slug])
  const sum = useAsync<{ booths: any[] } | null>(() => cachedRpc('event_summary', slug), [slug])
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') { reload(); sum.reload() } }
    const iv = setInterval(again, DEMO ? 6000 : 20000 + Math.random() * 5000)
    document.addEventListener('visibilitychange', again)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', again) }
  }, [slug]) // eslint-disable-line
  const rows: Row[] = useMemo(() => {
    const places = data?.places ?? [], onMap = new Set(places.map(p => p.booth?.id).filter(Boolean))
    const loose: GuidePlace[] = (sum.data?.booths ?? []).filter(b => !onMap.has(b.id)).map((b, i) => ({
      id: `booth:${b.slug}`, kind: 'booth', name: b.name, description: b.description ?? null, image_url: b.image_url ?? null, x: null, y: null, sort_order: 9000 + i, menu: [], hours: null,
      booth: { id: b.id, slug: b.slug, mode: b.mode, is_paused: b.is_paused, location: b.location ?? null, waiting_teams: b.waiting_teams ?? 0, today_left: b.today_left ?? 0, next_slot_at: b.next_slot_at ?? null },
    } as unknown as GuidePlace))
    return [...places, ...loose].map(p => ({ p, live: liveOf(p) }))
  }, [data?.places, sum.data])
  useEffect(() => {
    if (!data?.event) return
    LS.set(`tab3:${slug}`, rows.some(r => r.p.kind === 'food' || r.p.kind === 'market') ? 'food' : 'booth')
  }, [data?.event?.id, rows.length]) // eslint-disable-line
  // 배치도에 없는 부스는 상세 화면이 없으니 바로 줄서기·예약으로 보낸다
  const open = (p: GuidePlace) => nav(p.id.startsWith('booth:') ? (p.booth!.mode === 'slot' ? `/r/${p.booth!.slug}` : `/q/${p.booth!.slug}`) : `/e/${slug}/p/${p.id}`)
  return { data, error, loading, rows, open }
}
