import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAsync, fmtDate } from '../../lib/util'
import { EventRow } from '../../lib/types'
import { Page, Card, Button, Field, Input, Alert, Spinner, Badge, Empty } from '../../components/ui'

export default function AdminEvents() {
  // events 는 손님 화면 때문에 공개 읽기라, 담당자 코드로 들어와도 전체 행사가 보였다 → 내 관리 범위로 필터
  const { data: scope } = useAsync<{ owner: boolean; event_ids: string[] }>(async () => {
    const { data, error } = await supabase.rpc('my_admin_scope'); if (error) throw error; return data
  }, [])
  const { data, error, loading, reload } = useAsync<EventRow[]>(async () => {
    if (!scope) return []
    let q = supabase.from('events').select('*').order('starts_at', { ascending: false })
    if (!scope.owner) q = q.in('id', scope.event_ids.length ? scope.event_ids : ['00000000-0000-0000-0000-000000000000'])
    const { data, error } = await q
    if (error) throw error
    return data as EventRow[]
  }, [scope])
  const [open, setOpen] = useState(false)

  if (loading || !scope) return <Spinner />
  return (
    <Page title="행사" wide>
      {error && <Alert kind="error">{error}</Alert>}
      {data && data.length === 0 && !open ? (
        <Alert kind="info">아직 행사가 없어요. '새 행사'를 눌러 첫 행사를 만들어 보세요. 만들면 QR 링크가 바로 나와요.</Alert>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data?.map(e => (
          <Link key={e.id} to={`/admin/events/${e.id}`}>
            <Card className="hover:ring-gray-400">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold">{e.name}</div>
                  <div className="text-sm text-gray-500">{fmtDate(e.starts_at)} ~ {fmtDate(e.ends_at)} · /{e.slug}</div>
                </div>
                <Badge tone={e.status === 'open' ? 'green' : e.status === 'draft' ? 'gray' : 'red'}>{e.status}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {data?.length === 0 && <Empty>등록된 행사가 없습니다.</Empty>}
      <div className="mt-6">
        {!open ? <Button variant="secondary" onClick={() => setOpen(true)}>+ 새 행사</Button> : <NewEvent onDone={() => { setOpen(false); reload() }} />}
      </div>
    </Page>
  )
}

function NewEvent({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', slug: '', starts_at: '', ends_at: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    // 셀프 개설 RPC — 만든 사람이 자동으로 그 행사의 담당자가 된다 (owner 불필요)
    const { error } = await supabase.rpc('create_my_event', { p_name: f.name, p_slug: f.slug, p_starts_at: new Date(f.starts_at).toISOString(), p_ends_at: new Date(f.ends_at).toISOString() })
    if (error) { setErr(error.message.replace(/^[A-Z0-9]{5}:\s*/, '')); setBusy(false); return }
    setBusy(false); onDone()
  }
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field label="행사명"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="주소 (영문·숫자·하이픈)" hint="손님 링크가 /e/주소 가 돼요"><Input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required placeholder="seongnam-2026" /></Field>
        <Field label="시작"><Input type="datetime-local" value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })} required /></Field>
        <Field label="종료"><Input type="datetime-local" value={f.ends_at} onChange={e => setF({ ...f, ends_at: e.target.value })} required /></Field>
        {err && <div className="md:col-span-2"><Alert kind="error">{err}</Alert></div>}
        <div className="md:col-span-2"><Button type="submit" loading={busy}>행사 만들기</Button></div>
      </form>
    </Card>
  )
}
