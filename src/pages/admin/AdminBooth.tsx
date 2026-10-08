import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase, PUBLIC_BASE_URL } from '../../lib/supabase'
import { useAsync, fmtDate, fmtTime } from '../../lib/util'
import { Booth, BoothSettings } from '../../lib/types'
import { Page, Card, Button, Field, Input, Alert, Spinner, Badge, Empty } from '../../components/ui'
import ImageUpload from '../../components/ImageUpload'

export default function AdminBooth() {
  const { boothId = '' } = useParams()
  const b = useAsync<Booth>(async () => { const { data, error } = await supabase.from('booths').select('*').eq('id', boothId).single(); if (error) throw error; return data as Booth }, [boothId])
  if (b.loading) return <Spinner />
  if (b.error || !b.data) return <Page><Alert kind="error">{b.error}</Alert></Page>
  const booth = b.data
  return (
    <Page title={booth.name} sub={<><Link to={`/admin/events/${booth.event_id}`} className="underline">← 행사</Link> · /{booth.slug} · {booth.mode}</> as any} wide>
      <div className="grid gap-4 lg:grid-cols-2">
        <Basic booth={booth} onSaved={b.reload} />
        <Settings booth={booth} onSaved={b.reload} />
        <PinQr booth={booth} onSaved={b.reload} />
        {booth.mode !== 'queue' && <div className="lg:col-span-2"><Slots booth={booth} /></div>}
      </div>
    </Page>
  )
}

function Basic({ booth, onSaved }: { booth: Booth; onSaved: () => void }) {
  const [f, setF] = useState({ name: booth.name, location: booth.location ?? '', mode: booth.mode, is_paused: booth.is_paused, sort_order: booth.sort_order ?? 0, image_url: booth.image_url ?? null as string | null, description: booth.description ?? '', group_name: (booth as any).group_name ?? '' })
  const [msg, setMsg] = useState<string | null>(null)
  async function save() {
    const { error } = await supabase.from('booths').update({ ...f, description: f.description || null, group_name: f.group_name.trim() || null }).eq('id', booth.id)
    setMsg(error ? error.message : '저장했습니다.'); onSaved()
  }
  return (
    <Card>
      <h2 className="mb-3 font-bold">기본 정보</h2>
      <div className="mb-3"><ImageUpload value={f.image_url} folder={`booths/${booth.id}`} onChange={u => setF({ ...f, image_url: u })} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="소개 (손님 화면에 표시)"><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={2} className="w-full rounded-xl border border-gray-300 p-3 text-sm" placeholder="예: 또띠아 반죽부터 토핑까지 직접 만들어 바로 먹어요 · 소요 50분 · 7세 이상" /></Field></div>
        <Field label="부스명"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="위치"><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="대분류 (손님 목록에서 묶어서 표시)" hint="같은 이름끼리 한 그룹으로 접힙니다. 비우면 그룹 없이 바로 표시"><Input value={f.group_name} onChange={e => setF({ ...f, group_name: e.target.value })} placeholder="예: 테크놀이터 / 쿠킹 클래스" /></Field>
        <Field label="모드">
          <select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value as any })} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-3">
            <option value="queue">queue · 대기표</option><option value="slot">slot · 예약만</option><option value="hybrid">hybrid · 예약+현장대기</option>
          </select>
        </Field>
        <Field label="정렬"><Input type="number" value={f.sort_order} onChange={e => setF({ ...f, sort_order: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={f.is_paused} onChange={e => setF({ ...f, is_paused: e.target.checked })} className="h-5 w-5" /> 접수 일시중단</label>
      </div>
      {msg && <div className="mt-3"><Alert kind={msg.includes('했습니다') ? 'success' : 'error'}>{msg}</Alert></div>}
      <div className="mt-3"><Button onClick={save} className="!w-auto px-6">저장</Button></div>
    </Card>
  )
}

const NUM: Array<[keyof BoothSettings, string, string]> = [
  ['max_party_size', '1건당 최대 인원', '명'],
  ['queue_close_before_min', '대기 접수 마감 (행사 종료 N분 전)', '분'],
  ['notify_ahead_teams', '순서 임박 알림 (앞 N팀)', '팀'],
  ['call_valid_min', '호출 후 유효시간 → 노쇼', '분'],
  ['reserve_close_before_min', '사전 예약 마감 (회차 시작 N분 전)', '분'],
  ['noshow_after_start_min', '회차 시작 후 미체크인 노쇼', '분'],
  ['cancel_until_before_min', '손님 자체 취소 가능 (시작 N분 전까지)', '분'],
]

function Settings({ booth, onSaved }: { booth: Booth; onSaved: () => void }) {
  const [s, setS] = useState<BoothSettings>({ ...booth.settings })
  const [openAt, setOpenAt] = useState(booth.settings.reserve_open_at ? toLocalInput(booth.settings.reserve_open_at) : '')
  const [dayBefore, setDayBefore] = useState(() => { const r = booth.settings.reminders?.find(r => r.type === 'day_before') as any; return r ? String(r.hour) : '' })
  const [beforeMin, setBeforeMin] = useState(() => { const r = booth.settings.reminders?.find(r => r.type === 'before_min') as any; return r ? String(r.min) : '' })
  const [msg, setMsg] = useState<string | null>(null)
  async function save() {
    const reminders: BoothSettings['reminders'] = []
    if (dayBefore !== '') reminders.push({ type: 'day_before', hour: +dayBefore })
    if (beforeMin !== '') reminders.push({ type: 'before_min', min: +beforeMin })
    const settings = { ...s, reminders, reserve_open_at: openAt ? new Date(openAt).toISOString() : null }
    const { error } = await supabase.from('booths').update({ settings }).eq('id', booth.id)
    setMsg(error ? error.message : '저장했습니다.'); onSaved()
  }
  return (
    <Card>
      <h2 className="mb-3 font-bold">운영 설정</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {NUM.map(([k, label, unit]) => (
          <Field key={k} label={`${label} (${unit})`}><Input type="number" value={(s[k] as number) ?? ''} onChange={e => setS({ ...s, [k]: +e.target.value })} /></Field>
        ))}
        <Field label="사전 예약 오픈 일시 (비우면 즉시)"><Input type="datetime-local" value={openAt} onChange={e => setOpenAt(e.target.value)} /></Field>
        <Field label="리마인드 ① 전날 N시 (비우면 안 보냄)"><Input type="number" value={dayBefore} onChange={e => setDayBefore(e.target.value)} placeholder="19" /></Field>
        <Field label="리마인드 ② 시작 N분 전 (비우면 안 보냄)"><Input type="number" value={beforeMin} onChange={e => setBeforeMin(e.target.value)} placeholder="30" /></Field>
        <div className="space-y-2 text-sm md:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.allow_duplicate_phone} onChange={e => setS({ ...s, allow_duplicate_phone: e.target.checked })} className="h-5 w-5" /> 같은 번호 중복 접수 허용</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.transfer_noshow_to_queue} onChange={e => setS({ ...s, transfer_noshow_to_queue: e.target.checked })} className="h-5 w-5" /> 예약 노쇼 좌석을 현장 대기에 개방</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.sms_fallback} onChange={e => setS({ ...s, sms_fallback: e.target.checked })} className="h-5 w-5" /> 알림톡 실패 시 SMS 대체 발송</label>
        </div>
      </div>
      {msg && <div className="mt-3"><Alert kind={msg.includes('했습니다') ? 'success' : 'error'}>{msg}</Alert></div>}
      <div className="mt-3"><Button onClick={save} className="!w-auto px-6">저장</Button></div>
    </Card>
  )
}

function toLocalInput(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function PinQr({ booth, onSaved }: { booth: Booth; onSaved: () => void }) {
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const links = [
    ['q', `${PUBLIC_BASE_URL}/q/${booth.slug}`, '손님 · 대기 접수'],
    ...(booth.mode !== 'queue' ? [['r', `${PUBLIC_BASE_URL}/r/${booth.slug}`, '손님 · 사전 예약']] : []),
    ['s', `${PUBLIC_BASE_URL}/s/${booth.slug}`, '스태프'],
  ]
  useEffect(() => {
    Promise.all(links.map(([k, url]) => QRCode.toDataURL(url, { width: 512, margin: 2 }).then(d => [k, d] as const)))
      .then(arr => setQrs(Object.fromEntries(arr)))
  }, [booth.slug, booth.mode]) // eslint-disable-line
  async function setPinNow() {
    const { error } = await supabase.rpc('admin_set_pin', { p_booth: booth.id, p_pin: pin })
    setMsg(error ? error.message : `PIN 설정 완료 (${pin})`); setPin(''); onSaved()
  }
  return (
    <Card>
      <h2 className="mb-3 font-bold">스태프 PIN · QR</h2>
      <div className="flex items-end gap-2">
        <Field label={booth.pin_hash ? 'PIN 변경 (숫자 4~6자리)' : 'PIN 설정 (숫자 4~6자리)'}><Input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" /></Field>
        <Button onClick={setPinNow} disabled={pin.length < 4} className="!w-auto px-5">{booth.pin_hash ? '변경' : '설정'}</Button>
      </div>
      {!booth.pin_hash && <div className="mt-2"><Badge tone="amber">PIN 미설정 — 스태프 로그인 불가</Badge></div>}
      {msg && <div className="mt-3"><Alert kind={msg.includes('완료') ? 'success' : 'error'}>{msg}</Alert></div>}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {links.map(([k, url, label]) => (
          <div key={k} className="text-center">
            {qrs[k] && <img src={qrs[k]} alt={label} className="mx-auto w-full rounded-lg ring-1 ring-gray-200" />}
            <div className="mt-1 text-xs font-semibold">{label}</div>
            <a href={qrs[k]} download={`${booth.slug}-${k}.png`} className="text-xs underline">PNG 저장</a>
            <div className="mt-0.5 break-all text-[10px] text-gray-400">{url}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Slots({ booth }: { booth: Booth }) {
  const q = useAsync<any[]>(async () => {
    const { data, error } = await supabase.from('slots').select('*').eq('booth_id', booth.id).order('starts_at'); if (error) throw error; return data
  }, [booth.id])
  const [f, setF] = useState({ date: '', times: '11:00, 13:00, 14:30, 16:00, 17:30', duration: 60, capacity: 8 })
  const [msg, setMsg] = useState<string | null>(null)
  async function gen() {
    const times = f.times.split(/[,\s]+/).filter(Boolean)
    const { data, error } = await supabase.rpc('admin_generate_slots', { p_booth: booth.id, p_date: f.date, p_times: times, p_duration_min: f.duration, p_capacity: f.capacity })
    setMsg(error ? error.message : `${data}개 회차 생성`); q.reload()
  }
  async function cancel(id: string) {
    if (!confirm('이 회차를 취소하고 예약자 전원에게 취소 알림을 보낼까요?')) return
    const { data, error } = await supabase.rpc('admin_cancel_slot', { p_slot: id })
    setMsg(error ? error.message : `회차 취소 · 예약 ${data}건 취소 알림 발송`); q.reload()
  }
  async function toggle(id: string, status: string) {
    await supabase.from('slots').update({ status: status === 'open' ? 'closed' : 'open' }).eq('id', id); q.reload()
  }
  async function del(id: string) {
    if (!confirm('회차를 삭제할까요? (예약 없는 회차만)')) return
    const { error } = await supabase.from('slots').delete().eq('id', id); setMsg(error ? error.message : null); q.reload()
  }
  const byDay = new Map<string, any[]>()
  for (const s of q.data ?? []) { const k = fmtDate(s.starts_at); byDay.set(k, [...(byDay.get(k) ?? []), s]) }
  return (
    <Card>
      <h2 className="mb-3 font-bold">회차</h2>
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="날짜"><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <div className="md:col-span-2"><Field label="시작 시각들 (쉼표)"><Input value={f.times} onChange={e => setF({ ...f, times: e.target.value })} /></Field></div>
        <Field label="길이(분)"><Input type="number" value={f.duration} onChange={e => setF({ ...f, duration: +e.target.value })} /></Field>
        <Field label="정원"><Input type="number" value={f.capacity} onChange={e => setF({ ...f, capacity: +e.target.value })} /></Field>
      </div>
      <div className="mt-3"><Button onClick={gen} disabled={!f.date} className="!w-auto px-6">회차 일괄 생성</Button></div>
      {msg && <div className="mt-3"><Alert kind={msg.includes('생성') || msg.includes('발송') ? 'success' : 'error'}>{msg}</Alert></div>}
      <div className="mt-5 space-y-4">
        {[...byDay.entries()].map(([d, arr]) => (
          <div key={d}>
            <div className="mb-2 text-sm font-semibold text-gray-700">{d}</div>
            <div className="grid gap-2 md:grid-cols-5">
              {arr.map(s => (
                <div key={s.id} className={`rounded-xl p-3 ring-1 ${s.status === 'cancelled' ? 'bg-gray-50 opacity-50 ring-gray-200' : s.status === 'closed' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-gray-200'}`}>
                  <div className="font-bold tabular-nums">{fmtTime(s.starts_at)} <span className="text-xs font-normal text-gray-500">~{fmtTime(s.ends_at)}</span></div>
                  <div className="text-xs text-gray-500">정원 {s.capacity} · {s.status}</div>
                  {s.status !== 'cancelled' && (
                    <div className="mt-2 flex gap-1 text-xs">
                      <button onClick={() => toggle(s.id, s.status)} className="rounded bg-gray-100 px-2 py-1">{s.status === 'open' ? '마감' : '오픈'}</button>
                      <button onClick={() => cancel(s.id)} className="rounded bg-red-50 px-2 py-1 text-red-700">취소</button>
                      <button onClick={() => del(s.id)} className="rounded bg-gray-100 px-2 py-1">삭제</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {q.data?.length === 0 && <Empty>회차가 없습니다. 위에서 생성하세요.</Empty>}
      </div>
    </Card>
  )
}
