// 준비 체크리스트 — 준비 중(draft) 행사 상단에 떠서 "손님 화면이 열리려면 뭐가 남았는지" 를 보여준다.
// 항목은 전부 DB 에서 센다(손으로 상태를 적지 않는다). 전부 끝나야 하는 건 아니고 안내일 뿐 — "운영 시작" 은 언제든 누를 수 있다.
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/util'
import { EventRow } from '../../lib/types'
import { Card, Button, Alert } from '../../components/ui'

interface Counts { places: number; programs: number; notices: number; stamp_spots: number; booths: number }

export default function AdminChecklist({ e, onSaved, onGo }: { e: EventRow; onSaved: () => void; onGo: (tab: string) => void }) {
  const q = useAsync<Counts>(async () => {
    const cnt = async (t: string) => {
      const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('event_id', e.id)
      if (error) throw error; return count ?? 0
    }
    const [places, programs, notices, stamp_spots, booths] = await Promise.all([cnt('places'), cnt('programs'), cnt('notices'), cnt('stamp_spots'), cnt('booths')])
    return { places, programs, notices, stamp_spots, booths }
  }, [e])  // e 객체가 바뀌면(onSaved → reload) 다시 센다
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const c = q.data

  const items: { key: string; label: string; done: boolean; hint: string; tab: string }[] = c ? [
    { key: 'map', label: '행사장 배치도 올리기', done: !!e.map_image_url, hint: '지도 탭에서 배치도 이미지를 올리세요', tab: 'map' },
    { key: 'pins', label: '지도에 부스·시설 핀 놓기', done: c.places > 0, hint: `핀 ${c.places}개 · 배치도 위를 클릭하면 놓여요`, tab: 'map' },
    { key: 'prog', label: '일정 1개 이상 등록', done: c.programs > 0, hint: `일정 ${c.programs}개 · 공지 ${c.notices}개`, tab: 'schedule' },
    { key: 'info', label: '행사 안내·문의처 적기', done: !!(e.info_text || e.contact_text), hint: '일정·안내 탭 아래쪽', tab: 'schedule' },
    { key: 'stamp', label: '스탬프 투어 (선택)', done: !e.stamp_enabled || c.stamp_spots > 0, hint: e.stamp_enabled ? `스탬프 지점 ${c.stamp_spots}개 · QR 출력까지` : '안 쓰면 그대로 두세요', tab: 'stamp' },
    { key: 'vendor', label: '셀러 셀프 등록 링크 (선택)', done: true, hint: e.vendor_open ? '열려 있어요 — 참여·셀러 탭에서 링크 복사' : '닫혀 있어요 — 셀러를 직접 모을 때만 켜세요', tab: 'engage' },
  ] : []
  const doneN = items.filter(i => i.done).length

  async function start() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('events').update({ status: 'open' }).eq('id', e.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  if (e.status !== 'draft') return null
  return (
    <Card className="mb-4 border-amber-200 bg-amber-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold">준비 체크리스트 {c && <span className="text-sm font-normal text-gray-500">{doneN}/{items.length}</span>}</div>
          <div className="text-sm text-gray-600">지금은 준비 중이라 손님 화면(/e/{e.slug})이 안 보여요. 아래를 채우고 운영 시작을 누르면 열려요.</div>
        </div>
        <Button onClick={start} disabled={busy} className="!w-auto px-6">{busy ? '여는 중…' : '운영 시작'}</Button>
      </div>
      {err && <Alert kind="error">{err}</Alert>}
      {q.error && <Alert kind="error">{q.error}</Alert>}
      {c && (
        <ul className="mt-3 grid gap-1 text-sm md:grid-cols-2">
          {items.map(i => (
            <li key={i.key} className="flex items-start gap-2">
              <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i.done ? 'bg-green-600 text-white' : 'border border-gray-400 text-gray-400'}`}>{i.done ? '✓' : ''}</span>
              <button type="button" onClick={() => onGo(i.tab)} className="text-left">
                <div className={i.done ? 'text-gray-500 line-through' : 'font-semibold'}>{i.label}</div>
                <div className="text-xs text-gray-500">{i.hint}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-xs text-gray-500">운영안 파일이 있으면 <button type="button" className="font-semibold underline" onClick={() => onGo('plan')}>운영안 자동 생성</button>으로 핀·일정·공지를 한 번에 채울 수 있어요.</div>
    </Card>
  )
}
