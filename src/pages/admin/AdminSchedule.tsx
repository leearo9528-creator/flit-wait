import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAsync, fmtDateTime } from '../../lib/util'
import { Card, Button, Field, Input, Alert, Spinner, Empty, Badge } from '../../components/ui'
import { PROGRAM_KIND_LABEL, type EventRow, type NoticeRow, type PlaceRow, type ProgramKind, type ProgramRow } from '../../lib/types'

/** 일정·안내 편집 — 타임테이블(programs) / 공지(notices) / 행사 안내·연락처(events.info_text·contact_text) */
export default function AdminSchedule({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  return (
    <div className="space-y-4">
      <Programs e={e} />
      <Notices e={e} />
      <Info e={e} onSaved={onSaved} />
    </div>
  )
}

// datetime-local(KST) ↔ ISO
const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); const k = new Date(d.getTime() + 9 * 3600_000); return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}` }
const fromLocal = (s: string) => new Date(`${s}:00+09:00`).toISOString()
const KINDS = Object.keys(PROGRAM_KIND_LABEL) as ProgramKind[]

function Programs({ e }: { e: EventRow }) {
  const q = useAsync<ProgramRow[]>(async () => { const { data, error } = await supabase.from('programs').select('*').eq('event_id', e.id).order('starts_at'); if (error) throw error; return data as ProgramRow[] }, [e.id])
  const places = useAsync<Pick<PlaceRow, 'id' | 'name'>[]>(async () => { const { data, error } = await supabase.from('places').select('id,name').eq('event_id', e.id).order('sort_order'); if (error) throw error; return data }, [e.id])
  const [msg, setMsg] = useState<string | null>(null)
  const blank = () => ({ title: '', kind: 'stage' as ProgramKind, place_id: '', description: '', starts_at: toLocal(e.starts_at), ends_at: toLocal(new Date(new Date(e.starts_at).getTime() + 3600_000).toISOString()) })
  const [f, setF] = useState(blank())
  const [editing, setEditing] = useState<string | null>(null)

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!f.title.trim()) return
    const row = { event_id: e.id, title: f.title.trim(), kind: f.kind, place_id: f.place_id || null, description: f.description || null, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at) }
    if (new Date(row.ends_at) <= new Date(row.starts_at)) { setMsg('종료가 시작보다 늦어야 해요.'); return }
    const { error } = editing ? await supabase.from('programs').update(row).eq('id', editing) : await supabase.from('programs').insert(row)
    if (error) { setMsg(error.message); return }
    setMsg(null); setF({ ...blank(), starts_at: f.ends_at, ends_at: toLocal(new Date(fromLocal(f.ends_at)).toISOString()) }); setEditing(null); q.reload()
  }
  function edit(p: ProgramRow) { setEditing(p.id); setF({ title: p.title, kind: p.kind, place_id: p.place_id ?? '', description: p.description ?? '', starts_at: toLocal(p.starts_at), ends_at: toLocal(p.ends_at) }) }
  async function remove(id: string) { if (!confirm('삭제할까요?')) return; await supabase.from('programs').delete().eq('id', id); q.reload() }

  return (
    <Card>
      <h3 className="mb-3 font-bold">타임테이블 {q.data ? `(${q.data.length})` : ''}</h3>
      <form onSubmit={submit} className="mb-4 grid gap-3 rounded-xl bg-gray-50 p-4 md:grid-cols-4">
        <div className="md:col-span-2"><Field label="제목"><Input value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="예: 개막 공연 · 버스킹 · 럭키드로우" /></Field></div>
        <Field label="종류"><select value={f.kind} onChange={x => setF({ ...f, kind: x.target.value as ProgramKind })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3">{KINDS.map(k => <option key={k} value={k}>{PROGRAM_KIND_LABEL[k]}</option>)}</select></Field>
        <Field label="장소 (지도 핀)"><select value={f.place_id} onChange={x => setF({ ...f, place_id: x.target.value })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3"><option value="">없음</option>{places.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="시작"><Input type="datetime-local" value={f.starts_at} onChange={x => setF({ ...f, starts_at: x.target.value })} /></Field>
        <Field label="종료"><Input type="datetime-local" value={f.ends_at} onChange={x => setF({ ...f, ends_at: x.target.value })} /></Field>
        <div className="md:col-span-2"><Field label="설명 한 줄 (선택)"><Input value={f.description} onChange={x => setF({ ...f, description: x.target.value })} /></Field></div>
        <div className="md:col-span-4 flex gap-2"><Button type="submit" className="!w-auto px-6">{editing ? '수정 저장' : '추가'}</Button>{editing && <Button type="button" variant="ghost" className="!w-auto" onClick={() => { setEditing(null); setF(blank()) }}>취소</Button>}</div>
      </form>
      {msg && <div className="mb-3"><Alert kind="error">{msg}</Alert></div>}
      {q.loading && <Spinner />}
      {q.data?.length === 0 && <Empty>아직 일정이 없어요. 위에서 추가하면 손님 '일정·안내' 탭에 바로 떠요.</Empty>}
      <ul className="divide-y">
        {q.data?.map(p => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="w-40 shrink-0 text-sm tabular-nums text-gray-600">{fmtDateTime(p.starts_at)}<br />~ {fmtDateTime(p.ends_at)}</div>
            <div className="min-w-0 flex-1"><div className="text-xs text-gray-500">{PROGRAM_KIND_LABEL[p.kind]}{p.place_id ? ` · ${places.data?.find(x => x.id === p.place_id)?.name ?? ''}` : ''}</div><div className="truncate font-semibold">{p.title}</div></div>
            <Button variant="ghost" size="sm" className="!w-auto" onClick={() => edit(p)}>편집</Button>
            <Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={() => remove(p.id)}>삭제</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Notices({ e }: { e: EventRow }) {
  const q = useAsync<NoticeRow[]>(async () => { const { data, error } = await supabase.from('notices').select('*').eq('event_id', e.id).order('publish_at', { ascending: false }); if (error) throw error; return data as NoticeRow[] }, [e.id])
  const [f, setF] = useState({ title: '', body: '', urgent: false, pinned: false, later: false, publish_at: toLocal(new Date().toISOString()) })
  const [msg, setMsg] = useState<string | null>(null)
  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); if (!f.title.trim()) return
    const { error } = await supabase.from('notices').insert({ event_id: e.id, title: f.title.trim(), body: f.body || null, urgent: f.urgent, pinned: f.pinned, publish_at: f.later ? fromLocal(f.publish_at) : new Date().toISOString() })
    if (error) { setMsg(error.message); return }
    setMsg(null); setF({ ...f, title: '', body: '', urgent: false, later: false }); q.reload()
  }
  async function remove(id: string) { if (!confirm('삭제할까요?')) return; await supabase.from('notices').delete().eq('id', id); q.reload() }
  async function toggle(n: NoticeRow, k: 'urgent' | 'pinned') { await supabase.from('notices').update({ [k]: !n[k] }).eq('id', n.id); q.reload() }
  return (
    <Card>
      <h3 className="mb-1 font-bold">공지 {q.data ? `(${q.data.length})` : ''}</h3>
      <p className="mb-3 text-xs text-gray-500">긴급 공지는 빨간 배너로 맨 위에, 고정은 그다음, 나머지는 최신순. 발행 예약을 걸면 그 시각부터 보여요.</p>
      <form onSubmit={submit} className="mb-4 grid gap-3 rounded-xl bg-gray-50 p-4 md:grid-cols-2">
        <Field label="제목"><Input value={f.title} onChange={x => setF({ ...f, title: x.target.value })} placeholder="예: 15시 메인 무대 공연 10분 지연" /></Field>
        <div className="flex flex-wrap items-end gap-4 pb-1 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.urgent} onChange={x => setF({ ...f, urgent: x.target.checked })} /> 긴급</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.pinned} onChange={x => setF({ ...f, pinned: x.target.checked })} /> 고정</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.later} onChange={x => setF({ ...f, later: x.target.checked })} /> 발행 예약</label>
          {f.later && <Input type="datetime-local" value={f.publish_at} onChange={x => setF({ ...f, publish_at: x.target.value })} className="!h-9 !w-auto" />}
        </div>
        <div className="md:col-span-2"><Field label="내용 (선택)"><textarea value={f.body} onChange={x => setF({ ...f, body: x.target.value })} rows={2} className="w-full rounded-xl border border-gray-300 p-3 text-sm" /></Field></div>
        <div className="md:col-span-2"><Button type="submit" className="!w-auto px-6">공지 올리기</Button></div>
      </form>
      {msg && <div className="mb-3"><Alert kind="error">{msg}</Alert></div>}
      {q.loading && <Spinner />}
      {q.data?.length === 0 && <Empty>공지가 없어요.</Empty>}
      <ul className="divide-y">
        {q.data?.map(n => {
          const future = new Date(n.publish_at).getTime() > Date.now()
          return (
            <li key={n.id} className="flex items-center gap-3 py-2.5">
              <div className="w-36 shrink-0 text-xs tabular-nums text-gray-500">{fmtDateTime(n.publish_at)}{future && <Badge tone="amber">예약</Badge>}</div>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{n.title}</div>{n.body && <div className="truncate text-xs text-gray-500">{n.body}</div>}</div>
              <button type="button" onClick={() => toggle(n, 'urgent')} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${n.urgent ? 'bg-red-600 text-white ring-red-600' : 'text-gray-500 ring-gray-300'}`}>긴급</button>
              <button type="button" onClick={() => toggle(n, 'pinned')} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${n.pinned ? 'bg-gray-900 text-white ring-gray-900' : 'text-gray-500 ring-gray-300'}`}>고정</button>
              <Button variant="ghost" size="sm" className="!w-auto text-red-600" onClick={() => remove(n.id)}>삭제</Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Info({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  const [f, setF] = useState({ info_text: e.info_text ?? '', contact_text: e.contact_text ?? '' })
  const [msg, setMsg] = useState<string | null>(null)
  async function save() {
    const { error } = await supabase.from('events').update({ info_text: f.info_text || null, contact_text: f.contact_text || null }).eq('id', e.id)
    setMsg(error ? error.message : '저장했어요.'); onSaved()
  }
  return (
    <Card>
      <h3 className="mb-3 font-bold">행사 안내 · 연락처</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="행사 안내 (주차·화장실·셔틀·반입 금지 등)" hint="줄바꿈 그대로 보여요"><textarea value={f.info_text} onChange={x => setF({ ...f, info_text: x.target.value })} rows={6} className="w-full rounded-xl border border-gray-300 p-3 text-sm" placeholder={'주차: 탄천주차장 (무료, 300대)\n화장실: 안내소 옆 · 사송교 아래\n우천 시: 야외 공연 취소, 체험은 정상 운영'} /></Field>
        <Field label="주최·운영 연락처" hint="전화번호는 자동으로 눌러서 걸 수 있게 돼요"><textarea value={f.contact_text} onChange={x => setF({ ...f, contact_text: x.target.value })} rows={6} className="w-full rounded-xl border border-gray-300 p-3 text-sm" placeholder={'운영 본부 010-2244-3585\n분실물 안내소 (메인 무대 옆)'} /></Field>
      </div>
      {msg && <div className="mt-3"><Alert kind={msg.includes('했어요') ? 'success' : 'error'}>{msg}</Alert></div>}
      <div className="mt-3"><Button onClick={save} className="!w-auto px-6">저장</Button></div>
    </Card>
  )
}
