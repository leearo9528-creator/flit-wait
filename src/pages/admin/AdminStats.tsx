import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAsync, STATUS_LABEL } from '../../lib/util'
import { Card, Button, Spinner, Alert, Empty } from '../../components/ui'

interface Row { booth_id: string; name: string; mode: string; total: number; queue_total: number; served: number; no_show: number; cancelled: number; reserved_seats: number; capacity: number; avg_wait_min: number | null; people: number }
interface Stats { by_booth: Row[]; by_hour: { hour: string; count: number }[]; notifications: Record<string, number> | null }

export default function AdminStats({ eventId, eventName }: { eventId: string; eventName: string }) {
  const { data, error, loading, reload } = useAsync<Stats>(async () => {
    const { data, error } = await supabase.rpc('admin_event_stats', { p_event: eventId }); if (error) throw error; return data
  }, [eventId])
  useEffect(() => { const i = setInterval(reload, 30000); return () => clearInterval(i) }, [reload])

  async function exportCsv() {
    const { data, error } = await supabase.from('tickets')
      .select('ticket_no,name,phone,party_size,status,source,created_at,called_at,checked_in_at,booths(name),slots(starts_at)')
      .eq('event_id', eventId).order('created_at')
    if (error) { alert(error.message); return }
    const head = ['부스', '구분', '회차', '대기번호', '이름', '전화', '인원', '상태', '경로', '접수시각', '호출시각', '입장시각']
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const kst = (v: string | null) => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : ''
    const rows = (data as any[]).map(t => [t.booths?.name, t.slots ? '예약' : '대기', t.slots ? kst(t.slots.starts_at) : '', t.ticket_no, t.name, t.phone, t.party_size, STATUS_LABEL[t.status] ?? t.status, t.source, kst(t.created_at), kst(t.called_at), kst(t.checked_in_at)])
    const csv = '﻿' + [head, ...rows].map(r => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `${eventName}_접수내역.csv`; a.click()
  }

  if (loading) return <Spinner />
  if (error || !data) return <Alert kind="error">{error ?? '권한이 없습니다.'}</Alert>
  const tot = data.by_booth.reduce((a, r) => ({ total: a.total + r.total, served: a.served + r.served, no_show: a.no_show + r.no_show, people: a.people + r.people }), { total: 0, served: 0, no_show: 0, people: 0 })
  const maxH = Math.max(1, ...data.by_hour.map(h => h.count))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="총 접수" v={tot.total} /><Kpi label="체험 완료" v={tot.served} sub={`${tot.people}명`} />
        <Kpi label="노쇼" v={tot.no_show} sub={tot.total ? `${Math.round(tot.no_show / tot.total * 100)}%` : ''} />
        <Kpi label="알림 발송" v={data.notifications?.sent ?? 0} sub={data.notifications?.failed ? `실패 ${data.notifications.failed}` : data.notifications?.pending ? `대기 ${data.notifications.pending}` : ''} />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">부스별</h3><Button variant="secondary" size="sm" className="!w-auto" onClick={exportCsv}>CSV 내보내기</Button></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">부스</th><th>접수</th><th>완료</th><th>노쇼</th><th>취소</th><th>평균 대기</th><th>예약/정원</th></tr></thead>
            <tbody>
              {data.by_booth.map(r => (
                <tr key={r.booth_id} className="border-t">
                  <td className="py-1.5 font-semibold">{r.name}</td><td>{r.total}</td><td>{r.served} <span className="text-xs text-gray-400">({r.people}명)</span></td>
                  <td className={r.no_show ? 'text-red-700' : ''}>{r.no_show}</td><td>{r.cancelled}</td>
                  <td>{r.avg_wait_min != null ? `${r.avg_wait_min}분` : '—'}</td>
                  <td>{r.mode === 'queue' ? '—' : `${r.reserved_seats}/${r.capacity}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-bold">시간대별 접수</h3>
        {data.by_hour.length === 0 ? <Empty>아직 접수가 없습니다.</Empty> : (
          <div className="flex h-40 items-end gap-1 overflow-x-auto">
            {data.by_hour.map(h => (
              <div key={h.hour} className="flex min-w-[36px] flex-1 flex-col items-center justify-end gap-1">
                <div className="text-[10px] tabular-nums text-gray-600">{h.count}</div>
                <div className="w-full rounded-t bg-gray-900" style={{ height: `${Math.max(4, h.count / maxH * 120)}px` }} />
                <div className="text-[10px] text-gray-500">{h.hour.split(' ')[1]}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

const Kpi = ({ label, v, sub }: { label: string; v: number; sub?: string }) => (
  <Card className="!p-4"><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-bold tabular-nums">{v}</div>{sub && <div className="text-xs text-gray-500">{sub}</div>}</Card>
)
