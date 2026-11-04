import { supabase } from '../../lib/supabase'
import { useAsync, fmtDate } from '../../lib/util'
import { Card, Button, Alert, Spinner } from '../../components/ui'

interface Report {
  event: { id: string; name: string; slug: string; starts_at: string; ends_at: string; stamp_enabled: boolean; stamp_goal: number | null }
  views: { total: number; by_day: { day: string; count: number }[]; by_page: { page: string; count: number }[] }
  tickets: { total: number; queue: number; reserved: number; served: number; people: number; no_show: number; avg_wait_min: number | null
    by_booth: { name: string; mode: string; total: number; served: number; people: number; no_show: number }[]; by_day: { day: string; count: number }[] }
  stamps: { cards: number; completed: number; redeemed: number; stamps: number; by_spot: { name: string; count: number }[] }
  content: { places: number; programs: number; notices: number; urgent_notices: number }
  notifications: Record<string, number>
}

/**
 * 결과 리포트 — 기획자 내부 보고용 한 장. 화면 그대로 인쇄(PDF 저장).
 * 숫자는 전부 DB 집계(admin_event_report) — 손으로 적는 값 없음.
 */
export default function AdminReport({ eventId }: { eventId: string }) {
  const { data: r, error, loading } = useAsync<Report>(async () => { const { data, error } = await supabase.rpc('admin_event_report', { p_event: eventId }); if (error) throw error; return data }, [eventId])
  const extra = useAsync<any>(async () => { const { data } = await supabase.rpc('admin_event_report_extra', { p_event: eventId }); return data }, [eventId])
  if (loading) return <Spinner />
  if (error || !r) return <Alert kind="error">{error ?? '권한이 없어요.'}</Alert>
  const t = r.tickets, v = r.views, s = r.stamps
  const pct = (a: number, b: number) => b > 0 ? `${Math.round((a / b) * 100)}%` : '–'
  const days = Math.max(1, Math.round((new Date(r.event.ends_at).getTime() - new Date(r.event.starts_at).getTime()) / 86400_000))
  const sent = r.notifications?.sent ?? 0, failed = r.notifications?.failed ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-500">인쇄하면 A4 한두 장 PDF 로 저장돼요 (브라우저 인쇄 → PDF 저장).</p>
        <Button className="!w-auto px-5" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>

      <div id="report" className="rounded-2xl bg-white p-6 ring-1 ring-gray-200 print:p-0 print:ring-0">
        <div className="mb-6 border-b pb-4">
          <div className="text-xs font-semibold tracking-widest text-gray-500">EVENT REPORT · FLIT</div>
          <h2 className="mt-1 text-2xl font-bold">{r.event.name}</h2>
          <p className="text-sm text-gray-600">{fmtDate(r.event.starts_at)} ~ {fmtDate(r.event.ends_at)} · {days}일 · 생성 {new Date().toLocaleDateString('ko-KR')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="앱 방문 (홈 진입)" v={v.total} />
          <Kpi label="대기·예약 접수" v={t.total} sub={`대기 ${t.queue} · 예약 ${t.reserved}`} />
          <Kpi label="체험 완료" v={t.served} sub={`${t.people}명 · 노쇼 ${t.no_show} (${pct(t.no_show, t.total)})`} />
          <Kpi label="평균 대기" v={t.avg_wait_min != null ? `${t.avg_wait_min}분` : '–'} sub="대기표 접수→입장" />
        </div>

        <Section title="부스별">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">부스</th><th className="text-right">접수</th><th className="text-right">완료</th><th className="text-right">인원</th><th className="text-right">노쇼</th></tr></thead>
            <tbody>{t.by_booth.map(b => <tr key={b.name} className="border-t"><td className="py-1.5">{b.name} <span className="text-xs text-gray-400">{b.mode === 'queue' ? '대기' : b.mode === 'slot' ? '예약' : '혼합'}</span></td><td className="text-right tabular-nums">{b.total}</td><td className="text-right tabular-nums">{b.served}</td><td className="text-right tabular-nums">{b.people}</td><td className="text-right tabular-nums">{b.no_show}</td></tr>)}</tbody>
          </table>
          {t.by_booth.length === 0 && <p className="text-sm text-gray-400">부스 없음</p>}
        </Section>

        <div className="grid gap-6 sm:grid-cols-2">
          <Section title="일자별 접수">
            <Bars rows={t.by_day.map(d => ({ label: fmtDate(`${d.day}T00:00:00+09:00`), v: d.count }))} />
          </Section>
          <Section title="일자별 앱 방문">
            <Bars rows={v.by_day.map(d => ({ label: fmtDate(`${d.day}T00:00:00+09:00`), v: d.count }))} />
          </Section>
        </div>

        {r.event.stamp_enabled && (
          <Section title="스탬프 투어">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="참여 카드" v={s.cards} />
              <Kpi label="완주" v={s.completed} sub={pct(s.completed, s.cards) + ' 완주율'} />
              <Kpi label="경품 지급" v={s.redeemed} />
            </div>
            <div className="mt-3"><Bars rows={s.by_spot.map(x => ({ label: x.name, v: x.count }))} /></div>
          </Section>
        )}

        {extra.data?.survey?.responses > 0 && (
          <Section title={`만족도 설문 · 응답 ${extra.data.survey.responses}`}>
            <ul className="space-y-1.5 text-sm">
              {extra.data.survey.questions.map((q: any) => (
                <li key={q.id} className="flex flex-wrap items-baseline gap-2"><span className="text-gray-700">{q.label}</span>
                  {q.type === 'rating' && <b>평균 {q.avg}점</b>}
                  {q.type === 'choice' && Object.entries(q.dist ?? {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => <span key={k} className="rounded bg-gray-50 px-1.5 text-xs">{k} {v}</span>)}
                  {q.type === 'text' && <span className="text-xs text-gray-500">주관식 {q.texts?.length ?? 0}건</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {extra.data?.draws?.length > 0 && (
          <Section title="럭키드로우">
            <ul className="text-sm">{extra.data.draws.map((d: any, i: number) => <li key={i}>{d.title} — 응모 <b>{d.entries}</b>명 · 당첨 {d.winners}명 · {d.status === 'drawn' ? '추첨 완료' : d.status}</li>)}</ul>
          </Section>
        )}
        <Section title="운영 콘텐츠 · 알림">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <li>지도 핀 <b>{r.content.places}</b></li><li>일정 <b>{r.content.programs}</b></li><li>공지 <b>{r.content.notices}</b> (긴급 {r.content.urgent_notices})</li>
            <li>알림톡·SMS 발송 <b>{sent}</b>{failed ? <span className="text-red-600"> · 실패 {failed}</span> : null}</li>
            {extra.data?.vendors && <li>셀프 등록 업체 <b>{extra.data.vendors.approved}</b> (대기 {extra.data.vendors.pending})</li>}
          </ul>
        </Section>

        <p className="mt-6 border-t pt-3 text-xs text-gray-400">숫자는 FLIT 축제 앱 데이터베이스 집계예요. 개인정보는 포함되지 않아요. · 플릿 (FLIT) · flitunion.com</p>
      </div>
      <style>{`@media print { body * { visibility: hidden } #report, #report * { visibility: visible } #report { position: absolute; left: 0; top: 0; width: 100% } }`}</style>
    </div>
  )
}

const Kpi = ({ label, v, sub }: { label: string; v: number | string; sub?: string }) => (
  <div className="rounded-xl bg-gray-50 px-4 py-3"><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-bold tabular-nums">{v}</div>{sub && <div className="text-xs text-gray-500">{sub}</div>}</div>
)
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-6"><h3 className="mb-2 text-sm font-bold text-gray-700">{title}</h3>{children}</section>
)
function Bars({ rows }: { rows: { label: string; v: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.v))
  if (rows.length === 0) return <p className="text-sm text-gray-400">데이터 없음</p>
  return (
    <ul className="space-y-1.5">
      {rows.map(r => (
        <li key={r.label} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate text-gray-600">{r.label}</span>
          <span className="h-3 rounded bg-gray-900" style={{ width: `${Math.max(2, (r.v / max) * 100)}%` }} />
          <span className="tabular-nums text-gray-700">{r.v}</span>
        </li>
      ))}
    </ul>
  )
}
