import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, PUBLIC_BASE_URL } from '../../lib/supabase'
import { useAsync, fmtDateTime, STATUS_LABEL } from '../../lib/util'
import { EventRow, Booth } from '../../lib/types'
import { Page, Card, Button, Field, Input, Alert, Spinner, Badge, Empty } from '../../components/ui'
import AdminStats from './AdminStats'

interface Stats { booth_id: string; waiting: number; called: number; done: number; no_show: number; reserved: number }

export default function AdminEvent() {
  const { eventId = '' } = useParams()
  const ev = useAsync<EventRow>(async () => {
    const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single(); if (error) throw error; return data
  }, [eventId])
  const booths = useAsync<Booth[]>(async () => {
    const { data, error } = await supabase.from('booths').select('*').eq('event_id', eventId).order('sort_order'); if (error) throw error; return data as Booth[]
  }, [eventId])
  const stats = useAsync<Stats[]>(async () => {
    const { data, error } = await supabase.from('tickets').select('booth_id,status,party_size,slot_id').eq('event_id', eventId)
    if (error) throw error
    const m = new Map<string, Stats>()
    for (const t of data) {
      const s = m.get(t.booth_id) ?? { booth_id: t.booth_id, waiting: 0, called: 0, done: 0, no_show: 0, reserved: 0 }
      if (t.slot_id) { if (['waiting', 'called', 'checked_in', 'done'].includes(t.status)) s.reserved += t.party_size }
      else if (t.status === 'waiting') s.waiting++
      else if (t.status === 'called') s.called++
      else if (t.status === 'checked_in' || t.status === 'done') s.done++
      else if (t.status === 'no_show') s.no_show++
      m.set(t.booth_id, s)
    }
    return [...m.values()]
  }, [eventId])
  useEffect(() => { const i = setInterval(stats.reload, 10000); return () => clearInterval(i) }, [stats.reload])

  const [tab, setTab] = useState<'booths' | 'stats' | 'settings' | 'notify'>('booths')
  if (ev.loading || booths.loading) return <Spinner />
  if (ev.error || !ev.data) return <Page><Alert kind="error">{ev.error}</Alert></Page>
  const e = ev.data

  return (
    <Page title={e.name} sub={`/${e.slug} · ${fmtDateTime(e.starts_at)} ~ ${fmtDateTime(e.ends_at)}`} wide>
      <div className="mb-4 flex items-center gap-2">
        <Badge tone={e.status === 'open' ? 'green' : e.status === 'draft' ? 'gray' : 'red'}>{e.status}</Badge>
        <a className="rounded-lg bg-gray-100 px-2 py-1 text-xs" href={`${PUBLIC_BASE_URL}/e/${e.slug}`} target="_blank" rel="noreferrer">통합 QR 링크 /e/{e.slug}</a>
        <a className="rounded-lg bg-gray-100 px-2 py-1 text-xs" href={`${PUBLIC_BASE_URL}/board/${e.slug}`} target="_blank" rel="noreferrer">현황판 /board/{e.slug}</a>
        <div className="ml-auto flex gap-1 rounded-xl bg-gray-100 p-1 text-sm">
          {(['booths', 'stats', 'settings', 'notify'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-gray-600'}`}>{{ booths: '부스', stats: '통계', settings: '행사 설정', notify: '발송 로그' }[t]}</button>
          ))}
        </div>
      </div>

      {tab === 'booths' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {booths.data?.map(b => {
              const s = stats.data?.find(x => x.booth_id === b.id)
              return (
                <Card key={b.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold">{b.name}</div>
                      <div className="text-xs text-gray-500">/{b.slug} · {b.mode} {b.is_paused && <Badge tone="red">일시중단</Badge>} {!b.pin_hash && <Badge tone="amber">PIN 없음</Badge>}</div>
                    </div>
                    <Link to={`/admin/booths/${b.id}`} className="text-sm font-semibold underline">설정</Link>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                    <Stat label="대기" v={s?.waiting ?? 0} /><Stat label="호출" v={s?.called ?? 0} /><Stat label="완료" v={s?.done ?? 0} /><Stat label="노쇼" v={s?.no_show ?? 0} />
                  </div>
                  {b.mode !== 'queue' && <div className="mt-2 text-xs text-gray-500">예약 좌석 합계 {s?.reserved ?? 0}</div>}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <a className="rounded-lg bg-gray-100 px-2 py-1" href={`${PUBLIC_BASE_URL}/q/${b.slug}`} target="_blank" rel="noreferrer">손님 대기 /q/{b.slug}</a>
                    {b.mode !== 'queue' && <a className="rounded-lg bg-gray-100 px-2 py-1" href={`${PUBLIC_BASE_URL}/r/${b.slug}`} target="_blank" rel="noreferrer">예약 /r/{b.slug}</a>}
                    <a className="rounded-lg bg-gray-100 px-2 py-1" href={`${PUBLIC_BASE_URL}/s/${b.slug}`} target="_blank" rel="noreferrer">스태프 /s/{b.slug}</a>
                  </div>
                </Card>
              )
            })}
          </div>
          {booths.data?.length === 0 && <Empty>부스가 없습니다.</Empty>}
          <div className="mt-6"><NewBooth eventId={eventId} next={(booths.data?.length ?? 0) + 1} onDone={booths.reload} /></div>
        </>
      )}
      {tab === 'stats' && <AdminStats eventId={eventId} eventName={e.name} />}
      {tab === 'settings' && <EventSettings e={e} onSaved={ev.reload} />}
      {tab === 'notify' && <NotifyLog eventId={eventId} />}
    </Page>
  )
}

const Stat = ({ label, v }: { label: string; v: number }) => <div className="rounded-lg bg-gray-50 py-2"><div className="text-xs text-gray-500">{label}</div><div className="text-lg font-bold tabular-nums">{v}</div></div>

function NewBooth({ eventId, next, onDone }: { eventId: string; next: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', slug: '', mode: 'queue', location: '' })
  const [err, setErr] = useState<string | null>(null)
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>+ 부스 추가</Button>
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.from('booths').insert({ ...f, event_id: eventId, sort_order: next })
    if (error) { setErr(error.message); return }
    setOpen(false); setF({ name: '', slug: '', mode: 'queue', location: '' }); onDone()
  }
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
        <Field label="부스명"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="slug"><Input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required /></Field>
        <Field label="모드">
          <select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3">
            <option value="queue">queue · 대기표</option><option value="slot">slot · 예약만</option><option value="hybrid">hybrid · 예약+현장대기</option>
          </select>
        </Field>
        <Field label="위치"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></Field>
        {err && <div className="md:col-span-4"><Alert kind="error">{err}</Alert></div>}
        <div className="md:col-span-4 flex gap-2"><Button type="submit">추가</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>취소</Button></div>
      </form>
    </Card>
  )
}

function EventSettings({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  const [f, setF] = useState({ name: e.name, status: e.status, notice: e.notice ?? '', privacy_text: e.privacy_text, data_retention_days: e.data_retention_days })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('events').update({ ...f, notice: f.notice || null }).eq('id', e.id)
    setMsg(error ? error.message : '저장했습니다.'); setBusy(false); onSaved()
  }
  async function purge() {
    if (!confirm('이 행사의 모든 개인정보(이름·전화번호)를 파기합니다. 되돌릴 수 없습니다. 진행할까요?')) return
    const { data, error } = await supabase.rpc('admin_purge_event', { p_event: e.id })
    setMsg(error ? error.message : `${data}건 파기했습니다.`)
  }
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="행사명"><Input value={f.name} onChange={x => setF({ ...f, name: x.target.value })} /></Field>
        <Field label="상태" hint="open 일 때만 손님 접수·예약이 됩니다.">
          <select value={f.status} onChange={x => setF({ ...f, status: x.target.value as any })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3">
            <option value="draft">draft · 준비</option><option value="open">open · 운영</option><option value="closed">closed · 종료</option>
          </select>
        </Field>
        <div className="md:col-span-2"><Field label="공지 문구 (손님 화면 상단, 비우면 숨김)"><Input value={f.notice} onChange={x => setF({ ...f, notice: x.target.value })} placeholder="예: 우천으로 15시 이후 체험 중단" /></Field></div>
        <div className="md:col-span-2"><Field label="개인정보 동의 문구"><textarea value={f.privacy_text} onChange={x => setF({ ...f, privacy_text: x.target.value })} rows={3} className="w-full rounded-xl border border-gray-300 p-3 text-sm" /></Field></div>
        <Field label="보존기간 (행사 종료 후 N일 뒤 자동 파기)"><Input type="number" value={f.data_retention_days} onChange={x => setF({ ...f, data_retention_days: +x.target.value })} /></Field>
      </div>
      {msg && <div className="mt-4"><Alert kind={msg.includes('했습니다') ? 'success' : 'error'}>{msg}</Alert></div>}
      <div className="mt-4 flex gap-2"><Button onClick={save} loading={busy} className="!w-auto px-6">저장</Button><Button variant="danger" onClick={purge} className="!w-auto px-6">개인정보 즉시 파기</Button></div>
    </Card>
  )
}

function NotifyLog({ eventId }: { eventId: string }) {
  const { data, loading, reload } = useAsync<any[]>(async () => {
    const { data, error } = await supabase.from('notifications')
      .select('id,template_code,channel,status,scheduled_at,sent_at,error,tickets!inner(name,booth_id,event_id)')
      .eq('tickets.event_id', eventId).order('scheduled_at', { ascending: false }).limit(200)
    if (error) throw error; return data
  }, [eventId])
  useEffect(() => { const i = setInterval(reload, 15000); return () => clearInterval(i) }, [reload])
  if (loading) return <Spinner />
  const cnt = (s: string) => data?.filter(n => n.status === s).length ?? 0
  return (
    <Card>
      <div className="mb-3 flex gap-2 text-sm"><Badge tone="gray">대기 {cnt('pending')}</Badge><Badge tone="green">발송 {cnt('sent')}</Badge><Badge tone="red">실패 {cnt('failed')}</Badge><Badge>건너뜀 {cnt('skipped')}</Badge></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">예정</th><th>템플릿</th><th>채널</th><th>상태</th><th>수신자</th><th>오류</th></tr></thead>
          <tbody>
            {data?.map(n => (
              <tr key={n.id} className="border-t">
                <td className="py-1.5 tabular-nums">{fmtDateTime(n.scheduled_at)}</td><td>{n.template_code}</td><td>{n.channel}</td>
                <td><Badge tone={n.status === 'sent' ? 'green' : n.status === 'failed' ? 'red' : 'gray'}>{n.status}</Badge></td>
                <td>{n.tickets?.name}</td><td className="max-w-xs truncate text-xs text-red-700">{n.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.length === 0 && <Empty>발송 기록이 없습니다.</Empty>}
    </Card>
  )
}

export { STATUS_LABEL }
