import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../lib/util'
import { Card, Button, Field, Input, Alert, Spinner, Empty } from '../../components/ui'
import ImageUpload from '../../components/ImageUpload'
import { PLACE_KIND_LABEL, CROWD_LABEL, type Booth, type EventRow, type PlaceKind, type PlaceRow, type Crowd } from '../../lib/types'

const KINDS = Object.keys(PLACE_KIND_LABEL) as PlaceKind[]

/** '떡볶이 5,000원' → {name:'떡볶이', price:'5,000원'} — 마지막 토큰에 숫자가 있으면 가격 */
function parseMenu(text: string) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.*?)\s+(\S*\d\S*)$/)
    return m ? { name: m[1].trim(), price: m[2] } : { name: l }
  })
}

/**
 * 행사장 지도 편집 — 배치도 올리고, 지도 위를 눌러 핀을 찍는다.
 * 1) 배치도 이미지 업로드(events.map_image_url) 2) 아래 '핀 추가' 로 장소 만들고 3) 목록에서 장소를 고른 뒤 지도를 누르면 그 자리로 이동.
 * 체험부스 핀은 부스와 연결하면 손님 지도에 대기 현황·접수 버튼이 같이 뜬다.
 */
export default function AdminMap({ e, booths, onSaved }: { e: EventRow; booths: Booth[]; onSaved: () => void }) {
  const [map, setMap] = useState({ map_image_url: e.map_image_url ?? null as string | null, map_note: e.map_note ?? '', lat: e.lat ?? ('' as number | ''), lng: e.lng ?? ('' as number | '') })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const places = useAsync<PlaceRow[]>(async () => {
    const { data, error } = await supabase.from('places').select('*').eq('event_id', e.id).order('sort_order').order('name'); if (error) throw error; return data as PlaceRow[]
  }, [e.id])
  const [sel, setSel] = useState<string | null>(null)

  async function saveMap() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('events').update({
      map_image_url: map.map_image_url, map_note: map.map_note || null,
      lat: map.lat === '' ? null : Number(map.lat), lng: map.lng === '' ? null : Number(map.lng),
    }).eq('id', e.id)
    setMsg(error ? error.message : '저장했어요.'); setBusy(false); onSaved()
  }

  // 지도를 누르면 선택한 핀을 그 자리로
  async function placeAt(ev: React.MouseEvent<HTMLDivElement>) {
    if (!sel) { setMsg('먼저 아래 목록에서 옮길 핀을 고르세요.'); return }
    const r = ev.currentTarget.getBoundingClientRect()
    const x = Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10
    const y = Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10
    const { error } = await supabase.from('places').update({ x, y }).eq('id', sel)
    if (error) setMsg(error.message); else places.reload()
  }

  async function addPlace(f: Partial<PlaceRow>) {
    const next = (places.data?.reduce((m, p) => Math.max(m, p.sort_order), 0) ?? 0) + 10
    const { data, error } = await supabase.from('places').insert({ ...f, event_id: e.id, sort_order: next }).select('id').single()
    if (error) { setMsg(error.message); return }
    setSel(data.id); places.reload()
  }
  async function updatePlace(id: string, f: Partial<PlaceRow>) {
    const { error } = await supabase.from('places').update(f).eq('id', id)
    if (error) setMsg(error.message); else places.reload()
  }
  async function removePlace(id: string) {
    if (!confirm('이 핀을 삭제할까요?')) return
    const { error } = await supabase.from('places').delete().eq('id', id)
    if (error) setMsg(error.message); else { if (sel === id) setSel(null); places.reload() }
  }
  /** 부스 전부를 핀으로 한 번에 만들기 (아직 핀이 없는 부스만). 자리는 가운데 → 눌러서 옮긴다 */
  async function importBooths() {
    const have = new Set((places.data ?? []).map(p => p.booth_id).filter(Boolean))
    const rows = booths.filter(b => !have.has(b.id)).map((b, i) => ({
      event_id: e.id, booth_id: b.id, kind: 'booth' as PlaceKind, name: b.name, description: b.description ?? null, image_url: b.icon_url ?? b.image_url ?? null,
      x: 20 + (i % 5) * 15, y: 20 + Math.floor(i / 5) * 15, sort_order: (b.sort_order ?? 0) * 10,
    }))
    if (rows.length === 0) { setMsg('모든 부스가 이미 핀으로 있어요.'); return }
    const { error } = await supabase.from('places').insert(rows)
    setMsg(error ? error.message : `${rows.length}개 부스를 핀으로 추가했어요. 지도를 눌러 자리를 잡아 주세요.`); places.reload()
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <Field label="행사장 배치도 (손님 홈 화면의 지도)" hint={map.map_image_url ? (sel ? '지도를 누르면 선택한 핀이 그 자리로 이동해요.' : '아래 목록에서 핀을 고른 뒤 지도를 누르세요.') : '배치도 이미지를 올리면 핀을 찍을 수 있어요.'}>
            {map.map_image_url ? (
              <div className="relative cursor-crosshair select-none overflow-hidden rounded-xl ring-1 ring-gray-200" onClick={placeAt}>
                <img src={map.map_image_url} alt="" className="block w-full" draggable={false} />
                {(places.data ?? []).map(p => (
                  <span key={p.id} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-full ${sel === p.id ? 'z-10' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                    <span className={`block rounded-full px-2 py-0.5 text-[11px] font-bold text-white shadow ring-2 ring-white ${sel === p.id ? 'bg-orange-500' : 'bg-gray-800'}`}>{p.name}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2"><ImageUpload value={map.map_image_url} folder={`events/${e.id}/map`} onChange={u => setMap({ ...map, map_image_url: u })} aspect={map.map_image_url ? 'hidden' : 'aspect-[4/3]'} /></div>
          </Field>
          <div className="space-y-3">
            <Field label="지도 아래 안내 한 줄"><Input value={map.map_note} onChange={x => setMap({ ...map, map_note: x.target.value })} placeholder="예: 탄천 사송교~하탑교 구간" /></Field>
            <Field label="행사장 위도" hint="카카오맵에서 장소 우클릭 → 좌표. 둘 다 넣으면 손님 화면에 '행사장까지 길찾기'"><Input value={map.lat} onChange={x => setMap({ ...map, lat: x.target.value as any })} placeholder="37.3948" inputMode="decimal" /></Field>
            <Field label="행사장 경도"><Input value={map.lng} onChange={x => setMap({ ...map, lng: x.target.value as any })} placeholder="127.1112" inputMode="decimal" /></Field>
            <Button onClick={saveMap} loading={busy}>지도 설정 저장</Button>
            <Button variant="secondary" onClick={importBooths}>부스 전부 핀으로 가져오기</Button>
          </div>
        </div>
        {msg && <div className="mt-3"><Alert kind={msg.includes('했어요') ? 'success' : 'info'}>{msg}</Alert></div>}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">핀 목록 {places.data ? `(${places.data.length})` : ''}</h3>
          <NewPlace booths={booths} onAdd={addPlace} />
        </div>
        {places.loading && <Spinner />}
        {places.data?.length === 0 && <Empty>아직 핀이 없어요. '부스 전부 핀으로 가져오기' 또는 '핀 추가'로 시작하세요.</Empty>}
        <ul className="divide-y">
          {places.data?.map(p => (
            <PlaceEditor key={p.id} p={p} booths={booths} selected={sel === p.id} onSelect={() => setSel(sel === p.id ? null : p.id)} onSave={f => updatePlace(p.id, f)} onRemove={() => removePlace(p.id)} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function NewPlace({ booths, onAdd }: { booths: Booth[]; onAdd: (f: Partial<PlaceRow>) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<{ kind: PlaceKind; name: string; booth_id: string }>({ kind: 'facility', name: '', booth_id: '' })
  if (!open) return <Button variant="secondary" size="sm" className="!w-auto" onClick={() => setOpen(true)}>핀 추가</Button>
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={ev => { ev.preventDefault(); if (!f.name.trim()) return; onAdd({ kind: f.kind, name: f.name.trim(), booth_id: f.booth_id || null }); setF({ kind: 'facility', name: '', booth_id: '' }); setOpen(false) }}>
      <select value={f.kind} onChange={x => setF({ ...f, kind: x.target.value as PlaceKind })} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
        {KINDS.map(k => <option key={k} value={k}>{PLACE_KIND_LABEL[k]}</option>)}
      </select>
      <input value={f.name} onChange={x => setF({ ...f, name: x.target.value })} placeholder="이름 (예: 화장실 A)" className="h-9 rounded-lg border border-gray-300 px-2 text-sm" />
      {f.kind === 'booth' && (
        <select value={f.booth_id} onChange={x => { const b = booths.find(b => b.id === x.target.value); setF({ ...f, booth_id: x.target.value, name: f.name || b?.name || '' }) }} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
          <option value="">부스 연결 안 함</option>{booths.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <Button type="submit" size="sm" className="!w-auto">추가</Button>
      <Button type="button" variant="ghost" size="sm" className="!w-auto" onClick={() => setOpen(false)}>취소</Button>
    </form>
  )
}

function PlaceEditor({ p, booths, selected, onSelect, onSave, onRemove }: { p: PlaceRow; booths: Booth[]; selected: boolean; onSelect: () => void; onSave: (f: Partial<PlaceRow>) => void; onRemove: () => void }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ kind: p.kind, name: p.name, description: p.description ?? '', hours: p.hours ?? '', booth_id: p.booth_id ?? '', lat: p.lat ?? '', lng: p.lng ?? '', sort_order: p.sort_order, image_url: p.image_url, menu: (p.menu ?? []).map(m => m.price ? `${m.name} ${m.price}` : m.name).join('\n') })
  const booth = booths.find(b => b.id === p.booth_id)
  return (
    <li className={`py-2.5 ${selected ? 'bg-orange-50' : ''}`}>
      <div className="flex items-center gap-3 px-1">
        <button type="button" onClick={onSelect} className={`h-8 shrink-0 rounded-lg px-3 text-xs font-semibold ring-1 ${selected ? 'bg-orange-500 text-white ring-orange-500' : 'bg-white text-gray-700 ring-gray-300'}`}>{selected ? '지도 눌러 배치' : '선택'}</button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-500">{PLACE_KIND_LABEL[p.kind]}{booth ? ` · 부스 연결: ${booth.name}` : ''}{Number(p.x) === 50 && Number(p.y) === 50 ? ' · 아직 지도에 안 놓음' : ''}</div>
          <div className="truncate font-semibold">{p.name}</div>
        </div>
        {/* 현장 혼잡도 — 스태프가 누른다. 손님 지도에 '여유/보통/혼잡' 배지 */}
        <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold">
          {(['low', 'mid', 'high'] as Crowd[]).map(c => (
            <button key={c} type="button" title="혼잡도" onClick={() => onSave({ crowd: p.crowd === c ? null : c })}
              className={`rounded-md px-2 py-1 ${p.crowd === c ? (c === 'low' ? 'bg-green-600 text-white' : c === 'mid' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white') : 'text-gray-500'}`}>{CROWD_LABEL[c]}</button>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="!w-auto" onClick={() => setEdit(o => !o)}>{edit ? '접기' : '편집'}</Button>
        <Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={onRemove}>삭제</Button>
      </div>
      {edit && (
        <form className="mt-3 grid gap-3 px-1 md:grid-cols-3" onSubmit={ev => { ev.preventDefault(); onSave({ kind: f.kind, name: f.name.trim(), description: f.description || null, hours: f.hours || null, booth_id: f.booth_id || null, lat: f.lat === '' ? null : Number(f.lat), lng: f.lng === '' ? null : Number(f.lng), sort_order: Number(f.sort_order) || 0, image_url: f.image_url, menu: parseMenu(f.menu) }); setEdit(false) }}>
          <Field label="종류">
            <select value={f.kind} onChange={x => setF({ ...f, kind: x.target.value as PlaceKind })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3">
              {KINDS.map(k => <option key={k} value={k}>{PLACE_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="이름"><Input value={f.name} onChange={x => setF({ ...f, name: x.target.value })} /></Field>
          <Field label="부스 연결 (대기 현황·접수 버튼이 같이 뜸)">
            <select value={f.booth_id} onChange={x => setF({ ...f, booth_id: x.target.value })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3">
              <option value="">연결 안 함</option>{booths.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <div className="md:col-span-2"><Field label="설명 한 줄"><Input value={f.description} onChange={x => setF({ ...f, description: x.target.value })} placeholder="예: 떡볶이·어묵 · 현금 가능" /></Field></div>
          <Field label="운영 시간"><Input value={f.hours} onChange={x => setF({ ...f, hours: x.target.value })} placeholder="예: 11:00~20:00" /></Field>
          <div className="md:col-span-3">
            <button type="button" className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800 active:bg-gray-200"
              onClick={() => navigator.geolocation?.getCurrentPosition(g => setF(v => ({ ...v, lat: Number(g.coords.latitude.toFixed(6)) as any, lng: Number(g.coords.longitude.toFixed(6)) as any })), () => alert('위치를 가져오지 못했어요. 위치 권한을 확인해 주세요.'), { enableHighAccuracy: true, timeout: 15000 })}>
              지금 서 있는 곳을 이 장소 좌표로
            </button>
            <p className="mt-1 text-xs text-gray-500">장소 2곳 이상에 좌표가 있으면 손님 지도에 '내 위치'와 가는 길 거리가 나와요. 서로 멀리 떨어진 곳(예: 입구와 맨 안쪽)에서 찍을수록 정확해요.</p>
          </div>
          <Field label="위도"><Input value={f.lat} onChange={x => setF({ ...f, lat: x.target.value as any })} inputMode="decimal" /></Field>
          <Field label="경도"><Input value={f.lng} onChange={x => setF({ ...f, lng: x.target.value as any })} inputMode="decimal" /></Field>
          <Field label="정렬"><Input type="number" value={f.sort_order} onChange={x => setF({ ...f, sort_order: +x.target.value })} /></Field>
          {(f.kind === 'food' || f.kind === 'market') && (
            <div className="md:col-span-3"><Field label="메뉴 (한 줄에 하나, '이름 가격' — 가격은 선택)" hint="예: 떡볶이 5,000원 / 핫도그 4,000원"><textarea value={f.menu} onChange={x => setF({ ...f, menu: x.target.value })} rows={4} className="w-full rounded-xl border border-gray-300 p-3 text-sm" /></Field></div>
          )}
          <div className="md:col-span-3"><Field label="사진 (선택)"><ImageUpload value={f.image_url} folder={`events/${p.event_id}/places`} onChange={u => setF({ ...f, image_url: u })} aspect="aspect-[3/1] max-w-xs" /></Field></div>
          <div className="md:col-span-3 flex gap-2"><Button type="submit" className="!w-auto px-6">저장</Button><Button type="button" variant="ghost" className="!w-auto" onClick={() => setEdit(false)}>취소</Button></div>
        </form>
      )}
    </li>
  )
}
