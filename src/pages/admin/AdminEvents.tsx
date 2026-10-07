import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAsync, fmtDate } from '../../lib/util'
import { EventRow } from '../../lib/types'
import { Page, Card, Button, Field, Input, Alert, Spinner, Badge, Empty } from '../../components/ui'

export default function AdminEvents() {
  const { data, error, loading, reload } = useAsync<EventRow[]>(async () => {
    const { data, error } = await supabase.from('events').select('*').order('starts_at', { ascending: false })
    if (error) throw error
    return data as EventRow[]
  }, [])
  const [open, setOpen] = useState(false)

  if (loading) return <Spinner />
  return (
    <Page title="행사" wide>
      {error && <Alert kind="error">{error}</Alert>}
      {error?.includes('permission') || (data && data.length === 0 && !open) ? (
        <Alert kind="info">행사가 없거나 관리자 권한이 없습니다. 처음이라면 Supabase SQL에서 <code>admins</code> 테이블에 내 user_id 를 owner 로 넣어주세요.</Alert>
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
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('events').insert({ ...f, starts_at: new Date(f.starts_at).toISOString(), ends_at: new Date(f.ends_at).toISOString(), created_by: u.user?.id }).select('id').single()
    if (error) { setErr(error.message); setBusy(false); return }
    // 생성자를 이 행사의 manager 로 (owner 가 아니면 RLS 로 insert 실패할 수 있음 → 무시)
    await supabase.from('admins').insert({ user_id: u.user!.id, event_id: data.id, role: 'manager' })
    setBusy(false); onDone()
  }
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field label="행사명"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="slug (URL)"><Input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required placeholder="seongnam-2026" /></Field>
        <Field label="시작"><Input type="datetime-local" value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })} required /></Field>
        <Field label="종료"><Input type="datetime-local" value={f.ends_at} onChange={e => setF({ ...f, ends_at: e.target.value })} required /></Field>
        {err && <div className="md:col-span-2"><Alert kind="error">{err}</Alert></div>}
        <div className="md:col-span-2"><Button type="submit" loading={busy}>행사 만들기</Button></div>
      </form>
    </Card>
  )
}
