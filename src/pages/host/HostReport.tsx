import { Link, useParams } from 'react-router-dom'
import { rpc } from '../../lib/supabase'
import { useAsync, fmtDate } from '../../lib/util'
import { Alert, Button, Spinner } from '../../components/ui'
import DemoBanner from '../../components/DemoBanner'

/**
 * 주최 화면 결과보고서 (/h/<token>/report) — 주최 담당자가 그대로 인쇄(PDF 저장)해 내부 보고에 붙이는 한 장.
 * 숫자는 전부 DB 집계(host_report, 0051) — 손으로 적는 값 없음. 가게별 매출은 싣지 않는다(주문 건수까지만).
 */
type Report = {
  event: { name: string; slug: string; starts_at: string; ends_at: string; stamp_enabled: boolean }
  views: { total: number; by_day: { day: string; count: number }[] }
  tickets: { total: number; queue: number; reserved: number; served: number; people: number; no_show: number; avg_wait_min: number | null
    by_booth: { name: string; mode: string; total: number; served: number; people: number; no_show: number }[]; by_day: { day: string; count: number }[] }
  orders: { orders: number; picked: number; cancelled: number; sales: number; avg_ready_min: number | null
    by_place: { name: string; orders: number; picked: number; cancelled: number }[]; by_hour: { hour: number; orders: number }[] }
  stamps: { cards: number; completed: number; redeemed: number }
  notices: { total: number; urgent: number }
}
const won = (n: number) => `${Number(n).toLocaleString('ko-KR')}원`
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–')
const dayLabel = (d: string) => fmtDate(`${d}T00:00:00+09:00`)

export default function HostReport() {
  const { token = '' } = useParams()
  const { data: r, error, loading } = useAsync<Report>(() => rpc('host_report', { p_token: token }), [token])
  if (loading && !r) return <Spinner />
  if (!r) return <div className="p-6"><Alert kind="error">{error ?? '결과보고서를 열 수 없어요.'}</Alert></div>
  const t = r.tickets, o = r.orders, s = r.stamps
  // 날짜 수로 센다 (시작일·종료일 포함) — 시간 차를 반올림하면 20일 10시~21일 18시 행사가 '1일', 21~23일 행사가 '2일'로 나왔다
  const kstDay = (iso: string) => Date.parse(`${new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}T00:00:00Z`)
  const days = Math.max(1, Math.round((kstDay(r.event.ends_at) - kstDay(r.event.starts_at)) / 86400_000) + 1)

  return (
    <div className="mx-auto min-h-dvh max-w-3xl bg-white pb-16">
      <div className="print:hidden"><DemoBanner /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 print:hidden">
        <Link to={`/h/${token}`} className="text-sm font-semibold text-gray-600 underline">주최 화면으로</Link>
        <Button className="!w-auto px-5" onClick={() => window.print()}>PDF로 저장 · 인쇄</Button>
      </div>
      <p className="px-4 pt-2 text-xs text-gray-500 print:hidden">버튼을 누르고 인쇄 창에서 <b>PDF로 저장</b>을 고르세요. 지금까지 쌓인 숫자가 그대로 들어가요.</p>

      <div id="report" className="px-4 pt-5 print:px-0 print:pt-0">
        <div className="mb-5 border-b border-gray-300 pb-4">
          <div className="text-xs font-semibold tracking-widest text-gray-500">운영 결과보고서 · FLIT</div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{r.event.name}</h1>
          <p className="text-sm text-gray-600">{fmtDate(r.event.starts_at)} ~ {fmtDate(r.event.ends_at)} · {days}일 · 작성 {new Date().toLocaleDateString('ko-KR')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="앱 방문" v={r.views.total.toLocaleString('ko-KR')} sub="첫 화면을 연 횟수" />
          <Kpi label="대기·예약 접수" v={t.total.toLocaleString('ko-KR')} sub={`대기 ${t.queue} · 예약 ${t.reserved}`} />
          <Kpi label="체험 이용" v={`${t.served.toLocaleString('ko-KR')}팀`} sub={`${t.people.toLocaleString('ko-KR')}명 · 노쇼 ${pct(t.no_show, t.total)}`} />
          <Kpi label="평균 대기" v={t.avg_wait_min != null ? `${t.avg_wait_min}분` : '–'} sub="접수부터 입장까지" />
        </div>

        {t.by_booth.length > 0 && (
          <Section title="체험 부스별">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">부스</th><th className="text-right">접수</th><th className="text-right">이용</th><th className="text-right">인원</th><th className="text-right">노쇼</th></tr></thead>
              <tbody>{t.by_booth.map(b => <tr key={b.name} className="border-t border-gray-200"><td className="py-1.5">{b.name}</td><td className="text-right tabular-nums">{b.total}</td><td className="text-right tabular-nums">{b.served}</td><td className="text-right tabular-nums">{b.people}</td><td className="text-right tabular-nums">{b.no_show}</td></tr>)}</tbody>
            </table>
          </Section>
        )}

        {(t.by_day.length > 0 || r.views.by_day.length > 0) && (
          <div className="grid gap-x-8 sm:grid-cols-2">
            {t.by_day.length > 0 && <Section title="일자별 접수"><Bars rows={t.by_day.map(d => ({ label: dayLabel(d.day), v: d.count }))} /></Section>}
            {r.views.by_day.length > 0 && <Section title="일자별 앱 방문"><Bars rows={r.views.by_day.map(d => ({ label: dayLabel(d.day), v: d.count }))} /></Section>}
          </div>
        )}

        {o.orders > 0 && (
          <Section title="먹거리 주문 (앱 주문)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="주문" v={`${o.orders.toLocaleString('ko-KR')}건`} sub={`전달 ${o.picked} · 취소 ${pct(o.cancelled, o.orders)}`} />
              <Kpi label="주문 금액 합계" v={won(o.sales)} sub="전달 완료 기준" />
              <Kpi label="평균 준비 시간" v={o.avg_ready_min != null ? `${o.avg_ready_min}분` : '–'} sub="주문부터 준비 완료까지" />
              <Kpi label="주문 받은 가게" v={`${o.by_place.length}곳`} />
            </div>
            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div><div className="mb-1.5 text-xs font-semibold text-gray-500">가게별 주문 (건)</div><Bars rows={o.by_place.map(p => ({ label: p.name, v: p.orders }))} /></div>
              <div><div className="mb-1.5 text-xs font-semibold text-gray-500">시간대별 주문 (건)</div><Bars rows={o.by_hour.map(h => ({ label: `${h.hour}시`, v: h.orders }))} /></div>
            </div>
          </Section>
        )}

        {r.event.stamp_enabled && s.cards > 0 && (
          <Section title="스탬프 투어">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="참여" v={s.cards.toLocaleString('ko-KR')} />
              <Kpi label="완주" v={s.completed.toLocaleString('ko-KR')} sub={`완주율 ${pct(s.completed, s.cards)}`} />
              <Kpi label="경품 지급" v={s.redeemed.toLocaleString('ko-KR')} />
            </div>
          </Section>
        )}

        <Section title="공지">
          <p className="text-sm text-gray-700">행사 기간에 올린 공지 <b>{r.notices.total}</b>건 (긴급 {r.notices.urgent}건)</p>
        </Section>

        <p className="mt-6 border-t border-gray-300 pt-3 text-xs text-gray-500">숫자는 플릿 축제 앱에 쌓인 기록을 그대로 센 값이에요. 개인정보는 들어 있지 않아요. · 운영 플릿 (FLIT) · flitunion.com</p>
      </div>
      <style>{`@media print { @page { margin: 14mm } body * { visibility: hidden } #report, #report * { visibility: visible } #report { position: absolute; left: 0; top: 0; width: 100% } }`}</style>
    </div>
  )
}

function Kpi({ label, v, sub }: { label: string; v: string | number; sub?: string }) {
  return <div className="rounded-xl px-3 py-3 ring-1 ring-gray-200"><div className="text-xs font-semibold text-gray-500">{label}</div><div className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{v}</div>{sub && <div className="text-[11px] text-gray-500">{sub}</div>}</div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6 break-inside-avoid"><h2 className="mb-2 text-[15px] font-bold text-gray-900">{title}</h2>{children}</section>
}
function Bars({ rows }: { rows: { label: string; v: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.v))
  return <ul className="space-y-1.5">{rows.map(r => (
    <li key={r.label} className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 truncate text-gray-700">{r.label}</span>
      <span className="h-3 flex-1 rounded bg-gray-100"><span className="block h-3 rounded bg-gray-800" style={{ width: `${(r.v / max) * 100}%`, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} /></span>
      <span className="w-12 shrink-0 text-right tabular-nums text-gray-900">{r.v.toLocaleString('ko-KR')}</span>
    </li>))}</ul>
}
