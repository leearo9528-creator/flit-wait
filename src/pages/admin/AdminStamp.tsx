import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase, PUBLIC_BASE_URL } from '../../lib/supabase'
import { useAsync, fmtDateTime } from '../../lib/util'
import { Card, Button, Field, Input, Alert, Spinner, Empty, Badge } from '../../components/ui'
import type { EventRow, PlaceRow, StampSpotRow } from '../../lib/types'

/**
 * 스탬프 투어 편집 — 켜기/목표/경품 설정, 스탬프 지점(부스) 등록, 지점별 QR 인쇄, 경품 교환 확인.
 * 손님 흐름: 부스 QR(/e/:slug/stamp/:code) 찍음 → 적립 → 목표 달성 시 6자리 교환 코드 → 안내소에서 코드 확인 후 '지급 완료'
 */
export default function AdminStamp({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  const [f, setF] = useState({ stamp_enabled: !!e.stamp_enabled, stamp_goal: e.stamp_goal ?? ('' as number | ''), stamp_reward_text: e.stamp_reward_text ?? '' })
  const [msg, setMsg] = useState<string | null>(null)
  const spots = useAsync<StampSpotRow[]>(async () => { const { data, error } = await supabase.from('stamp_spots').select('*').eq('event_id', e.id).order('sort_order').order('name'); if (error) throw error; return data as StampSpotRow[] }, [e.id])
  const places = useAsync<Pick<PlaceRow, 'id' | 'name' | 'kind'>[]>(async () => { const { data, error } = await supabase.from('places').select('id,name,kind').eq('event_id', e.id).order('sort_order'); if (error) throw error; return data }, [e.id])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!spots.data) return
    Promise.all(spots.data.map(s => QRCode.toDataURL(`${PUBLIC_BASE_URL}/e/${e.slug}/stamp/${s.code}`, { width: 512, margin: 2 }).then(d => [s.id, d] as const)))
      .then(arr => setQrs(Object.fromEntries(arr)))
  }, [spots.data, e.slug])

  async function save() {
    const { error } = await supabase.from('events').update({ stamp_enabled: f.stamp_enabled, stamp_goal: f.stamp_goal === '' ? null : Number(f.stamp_goal), stamp_reward_text: f.stamp_reward_text || null }).eq('id', e.id)
    setMsg(error ? error.message : '저장했어요.'); onSaved()
  }
  const [newName, setNewName] = useState(''); const [newPlace, setNewPlace] = useState('')
  async function addSpot(ev: React.FormEvent) {
    ev.preventDefault()
    const name = newName.trim() || places.data?.find(p => p.id === newPlace)?.name || ''
    if (!name) return
    const next = (spots.data?.reduce((m, s) => Math.max(m, s.sort_order), 0) ?? 0) + 10
    const { error } = await supabase.from('stamp_spots').insert({ event_id: e.id, name, place_id: newPlace || null, sort_order: next })
    if (error) { setMsg(error.message); return }
    setNewName(''); setNewPlace(''); spots.reload()
  }
  async function importBooths() {
    const have = new Set((spots.data ?? []).map(s => s.place_id).filter(Boolean))
    const rows = (places.data ?? []).filter(p => p.kind === 'booth' && !have.has(p.id)).map((p, i) => ({ event_id: e.id, place_id: p.id, name: p.name, sort_order: (i + 1) * 10 }))
    if (rows.length === 0) { setMsg('추가할 체험부스 핀이 없어요 (지도 탭에서 부스 핀을 먼저 만드세요).'); return }
    const { error } = await supabase.from('stamp_spots').insert(rows)
    setMsg(error ? error.message : `${rows.length}개 지점을 추가했어요.`); spots.reload()
  }
  async function removeSpot(id: string) { if (!confirm('이 지점을 삭제할까요? 이미 찍힌 스탬프도 같이 사라져요.')) return; await supabase.from('stamp_spots').delete().eq('id', id); spots.reload() }

  function printQr() {
    if (!spots.data) return
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e.name} 스탬프 QR</title>
      <style>body{font-family:sans-serif;margin:0} .p{page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center}
      img{width:70vw;max-width:520px} h1{font-size:40px;margin:24px 0 8px} p{font-size:20px;color:#555;margin:0}</style></head><body>
      ${spots.data.map(s => `<div class="p"><img src="${qrs[s.id] ?? ''}"><h1>${s.name}</h1><p>${e.name} 스탬프 투어 · 카메라로 QR 을 찍어 주세요</p></div>`).join('')}
      <script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 font-bold">스탬프 투어 설정</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex h-12 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold md:mt-6"><input type="checkbox" checked={f.stamp_enabled} onChange={x => setF({ ...f, stamp_enabled: x.target.checked })} /> 스탬프 투어 켜기 (손님 탭에 표시)</label>
          <Field label="목표 개수" hint="비우면 전체 지점 수"><Input type="number" value={f.stamp_goal} onChange={x => setF({ ...f, stamp_goal: x.target.value as any })} placeholder={String(spots.data?.length ?? '')} /></Field>
          <Field label="경품 안내" hint="예: 안내소에서 에코백을 드려요"><Input value={f.stamp_reward_text} onChange={x => setF({ ...f, stamp_reward_text: x.target.value })} /></Field>
        </div>
        {msg && <div className="mt-3"><Alert kind={msg.includes('했어요') ? 'success' : 'info'}>{msg}</Alert></div>}
        <div className="mt-3"><Button onClick={save} className="!w-auto px-6">저장</Button></div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-bold">스탬프 지점 {spots.data ? `(${spots.data.length})` : ''}</h3>
          <Button variant="secondary" size="sm" className="!w-auto" onClick={importBooths}>체험부스 핀 전부 가져오기</Button>
          <Button variant="secondary" size="sm" className="!w-auto" onClick={printQr} disabled={!spots.data?.length}>QR 인쇄 (지점당 1장)</Button>
        </div>
        <form onSubmit={addSpot} className="mb-4 flex flex-wrap items-end gap-2">
          <select value={newPlace} onChange={x => setNewPlace(x.target.value)} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"><option value="">지도 핀 연결 (선택)</option>{places.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input value={newName} onChange={x => setNewName(x.target.value)} placeholder="지점 이름 (비우면 핀 이름)" className="h-9 rounded-lg border border-gray-300 px-2 text-sm" />
          <Button type="submit" size="sm" className="!w-auto">지점 추가</Button>
        </form>
        {spots.loading && <Spinner />}
        {spots.data?.length === 0 && <Empty>지점이 없어요. 체험부스 핀을 가져오거나 직접 추가하세요.</Empty>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spots.data?.map(s => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
              {qrs[s.id] ? <img src={qrs[s.id]} alt="" className="h-16 w-16 rounded" /> : <div className="h-16 w-16 rounded bg-gray-100" />}
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.name}</div><div className="truncate text-xs text-gray-400">/stamp/{s.code}</div></div>
              <Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={() => removeSpot(s.id)}>삭제</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Redeem e={e} />
    </div>
  )
}

function Redeem({ e }: { e: EventRow }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const cards = useAsync<Array<{ id: string; reward_code: string | null; completed_at: string | null; redeemed_at: string | null }>>(async () => {
    const { data, error } = await supabase.from('stamp_cards').select('id,reward_code,completed_at,redeemed_at').eq('event_id', e.id).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(200)
    if (error) throw error; return data
  }, [e.id])
  useEffect(() => { const i = setInterval(cards.reload, 15000); return () => clearInterval(i) }, [cards.reload])
  async function redeem(ev: React.FormEvent) {
    ev.preventDefault()
    const c = cards.data?.find(x => x.reward_code === code.trim())
    if (!c) { setMsg('그 코드로 완료된 카드가 없어요.'); return }
    if (c.redeemed_at) { setMsg(`이미 ${fmtDateTime(c.redeemed_at)} 에 지급한 코드예요.`); return }
    const { error } = await supabase.from('stamp_cards').update({ redeemed_at: new Date().toISOString() }).eq('id', c.id)
    setMsg(error ? error.message : `${code} 지급 완료했어요.`); setCode(''); cards.reload()
  }
  const done = cards.data?.length ?? 0, redeemed = cards.data?.filter(c => c.redeemed_at).length ?? 0
  return (
    <Card>
      <h3 className="mb-1 font-bold">경품 교환 확인</h3>
      <p className="mb-3 text-xs text-gray-500">손님 화면의 6자리 코드를 입력하면 지급 처리돼요. 같은 코드를 두 번 쓸 수 없어요.</p>
      <form onSubmit={redeem} className="mb-3 flex items-end gap-2">
        <Field label="교환 코드"><Input value={code} onChange={x => setCode(x.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000" className="!w-40 tracking-widest" /></Field>
        <Button type="submit" className="!w-auto px-5" disabled={code.length !== 6}>지급 완료</Button>
      </form>
      {msg && <div className="mb-3"><Alert kind={msg.includes('완료했어요') ? 'success' : 'info'}>{msg}</Alert></div>}
      <div className="flex gap-2 text-sm"><Badge tone="green">완주 {done}</Badge><Badge tone="blue">지급 {redeemed}</Badge><Badge tone="amber">미지급 {done - redeemed}</Badge></div>
    </Card>
  )
}
