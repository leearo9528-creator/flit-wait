import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { LS, fmtDateTime, fmtPhone, STATUS_LABEL } from '../../lib/util'
import { Card, Button, Field, Input, Alert, Badge } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'

interface Row { token: string; booth: string; status: string; ticket_no: number | null; slot_at: string | null; created_at: string }

/** 내 접수·예약 — 이 기기에서 접수한 것 + 이름/전화로 찾기 */
export default function MyTickets() {
  const { slug = '' } = useParams()
  const [mine, setMine] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [found, setFound] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // localStorage 에 저장된 토큰들 → 상태 조회
    const tokens: string[] = []
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith('ticket:') || k.startsWith('resv:')) { const v = LS.get<{ token: string }>(k); if (v?.token) tokens.push(v.token) } } } catch {}
    Promise.all(tokens.map(tk => rpc('get_ticket', { p_token: tk }).then((t: any) => t ? { token: tk, booth: t.booth.name, status: t.status, ticket_no: t.ticket_no, slot_at: t.slot?.starts_at ?? null, created_at: t.created_at } : null).catch(() => null)))
      .then(rs => setMine(rs.filter(Boolean) as Row[]))
  }, [])

  async function search(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { setFound(await rpc<Row[]>('find_my_tickets', { p_event_slug: slug, p_name: name, p_phone: phone })) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const tone = (s: string) => (({ waiting: 'blue', called: 'amber', checked_in: 'green', done: 'green', no_show: 'red', cancelled: 'gray' } as any)[s] ?? 'gray')
  const List = ({ rows }: { rows: Row[] }) => (
    <div className="space-y-2">
      {rows.map(r => (
        <Link key={r.token} to={`/t/${r.token}`} className="block rounded-xl bg-white p-4 ring-1 ring-gray-200 active:bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="font-bold">{r.booth}</div>
            <Badge tone={tone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
          </div>
          <div className="mt-1 text-sm text-gray-500">{r.slot_at ? `예약 ${fmtDateTime(r.slot_at)}` : `대기번호 ${r.ticket_no}번 · ${fmtDateTime(r.created_at)} 접수`}</div>
        </Link>
      ))}
    </div>
  )

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-gray-50 px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-bold">내 대기·예약</h1>
      {mine.length > 0 ? <List rows={mine} /> : <Card><p className="text-sm text-gray-500">이 기기에서 접수한 내역이 없어요. 다른 폰으로 접수했다면 아래에서 찾을 수 있어요.</p></Card>}

      <Card className="mt-5">
        <div className="mb-3 text-sm font-semibold text-gray-700">이름·전화번호로 찾기</div>
        <form onSubmit={search} className="space-y-3">
          <Field label="접수할 때 쓴 이름"><Input value={name} onChange={e => setName(e.target.value)} required /></Field>
          <Field label="휴대폰번호"><Input value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} inputMode="numeric" required /></Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy}>찾기</Button>
        </form>
        {found && (found.length ? <div className="mt-4"><List rows={found} /></div> : <div className="mt-4"><Alert kind="info">일치하는 내역이 없어요. 이름과 번호를 확인해 주세요.</Alert></div>)}
      </Card>
      <CustomerNav slug={slug} active="my" />
    </div>
  )
}
