// 축제 데이터 리포트 — 주최(지자체·대학) 제출용. "축제를 데이터로 남긴다" 의 산출물.
// 내부용 AdminReport 와 달리 결재 첨부를 전제로 한다: 방문 → 동선 → 체험·소비 → 반응 → 운영 → 데이터 출처.
// 숫자는 전부 DB 집계(admin_event_report · admin_event_report_extra · admin_event_dataset). 손으로 적는 값은 '총평' 한 칸뿐.
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAsync, fmtDate } from '../../lib/util'
import { Button, Alert, Spinner } from '../../components/ui'

interface Dataset {
  views_by_hour: { hour: number; count: number }[]
  journey: { cards: number; cards_2plus: number; dwell_median_min: number | null; dwell_avg_min: number | null; reach: { name: string; cards: number }[]; first_spot: { name: string; count: number }[]; transitions: { from: string; to: string; count: number }[]; by_hour: { hour: number; count: number }[] }
  crowd: { name: string; kind: string; changes: number; high_min: number; mid_min: number }[]
  notices: { title: string; urgent: boolean; at: string }[]
  vendors: { submitted: number; approved: number }
  draws: { title: string; entries: number; winners: number }[]
}

export default function AdminDataReport({ eventId }: { eventId: string }) {
  const base = useAsync<any>(async () => { const { data, error } = await supabase.rpc('admin_event_report', { p_event: eventId }); if (error) throw error; return data }, [eventId])
  const extra = useAsync<any>(async () => { const { data } = await supabase.rpc('admin_event_report_extra', { p_event: eventId }); return data }, [eventId])
  const ds = useAsync<Dataset>(async () => { const { data, error } = await supabase.rpc('admin_event_dataset', { p_event: eventId }); if (error) throw error; return data }, [eventId])
  const [memo, setMemo] = useState('')
  const [org, setOrg] = useState('')
  if (base.loading || ds.loading) return <Spinner />
  if (base.error || !base.data) return <Alert kind="error">{base.error ?? '권한이 없어요.'}</Alert>
  const r = base.data, d = ds.data, sv = extra.data?.survey
  const t = r.tickets, v = r.views, s = r.stamps
  const kst = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const days = Math.max(1, Math.round((new Date(kst(r.event.ends_at)).getTime() - new Date(kst(r.event.starts_at)).getTime()) / 86400_000) + 1)  // 달력 일수 (12/20 11시~12/21 20시 = 2일)
  const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : null
  const peakHour = [...(d?.views_by_hour ?? [])].sort((a, b) => b.count - a.count)[0]
  const survey = (sv?.questions ?? []) as { id: string; label: string; type: string; avg: number | null; dist: Record<string, number> | null; texts: string[] | null }[]
  const rating = survey.find(q => q.type === 'rating' && q.avg != null)
  const choice = (key: string) => survey.find(q => q.type === 'choice' && q.label.includes(key))
  const resid = choice('어디서'), age = choice('연령'), withWho = choice('누구와'), via = choice('알게')
  const topOf = (q?: { dist: Record<string, number> | null }) => q?.dist ? Object.entries(q.dist).sort((a, b) => b[1] - a[1]) : []
  const nonLocal = resid?.dist ? Object.entries(resid.dist).filter(([k]) => !/시내|관내|본 지역|우리/.test(k)).reduce((a, [, n]) => a + n, 0) : null
  const residTotal = resid?.dist ? Object.values(resid.dist).reduce((a, n) => a + n, 0) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="text-sm text-gray-500">주최 측 결과보고에 첨부하는 양식이에요. 인쇄 → PDF 저장. 숫자는 전부 자동 집계라 손으로 고칠 게 없어요.</div>
        <Button className="!w-auto px-5" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>
      <div className="grid gap-3 print:hidden md:grid-cols-2">
        <input value={org} onChange={x => setOrg(x.target.value)} placeholder="제출처 (예: 성남시 문화예술과)" className="h-11 rounded-xl border border-gray-300 px-3 text-sm" />
        <input value={memo} onChange={x => setMemo(x.target.value)} placeholder="총평 한 줄 (선택 — 리포트 맨 아래에 들어가요)" className="h-11 rounded-xl border border-gray-300 px-3 text-sm" />
      </div>

      <div id="report" className="rounded-2xl bg-white p-8 ring-1 ring-gray-200 print:p-0 print:ring-0">
        {/* 표지 */}
        <div className="border-b-2 border-gray-900 pb-5">
          <div className="flex items-start justify-between">
            <div className="text-xs font-semibold tracking-widest text-gray-500">축제 데이터 리포트 · FESTIVAL DATA REPORT</div>
            <div className="text-xs text-gray-500">작성 {new Date().toLocaleDateString('ko-KR')} · 운영 플릿(FLIT)</div>
          </div>
          <h2 className="mt-2 text-3xl font-bold">{r.event.name}</h2>
          <p className="mt-1 text-sm text-gray-600">{fmtDate(r.event.starts_at)} ~ {fmtDate(r.event.ends_at)} · {days}일간{org ? ` · 제출처: ${org}` : ''}</p>
        </div>

        {/* 핵심 숫자 6 */}
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Kpi label="앱 접속" v={v.total} sub="행사 QR 진입" />
          <Kpi label="체험 참여" v={t.people} sub={`${t.served}팀 완료`} />
          <Kpi label="평균 대기" v={t.avg_wait_min != null ? `${t.avg_wait_min}분` : '–'} />
          <Kpi label="평균 체류" v={d?.journey.dwell_median_min != null ? `${d.journey.dwell_median_min}분` : '–'} sub="스탬프 첫→끝" />
          <Kpi label="만족도" v={rating?.avg != null ? `${rating.avg}/5` : '–'} sub={sv?.responses ? `${sv.responses}명 응답` : undefined} />
          <Kpi label="외지 방문" v={nonLocal != null && residTotal ? `${pct(nonLocal, residTotal)}%` : '–'} sub="설문 거주지" />
        </div>

        {/* 1. 방문 */}
        <Section n="1" title="방문 — 얼마나, 언제 왔나">
          <div className="grid gap-6 sm:grid-cols-2">
            <div><h4 className="sub">일자별 앱 접속</h4><Bars rows={v.by_day.map((x: any) => ({ label: fmtDate(`${x.day}T00:00:00+09:00`), v: x.count }))} /></div>
            <div><h4 className="sub">시간대별 접속{peakHour ? ` · 피크 ${peakHour.hour}시` : ''}</h4><Bars rows={(d?.views_by_hour ?? []).map(x => ({ label: `${x.hour}시`, v: x.count }))} compact /></div>
          </div>
          {(resid || age || withWho || via) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              {[resid, age, withWho, via].filter(Boolean).map(q => (
                <div key={q!.id}><h4 className="sub">{q!.label}</h4><Dist entries={topOf(q)} /></div>
              ))}
            </div>
          )}
          <p className="note">앱 접속은 행사 QR 로 들어온 기기 기준(세션당 1회). 입장객 전수와는 다르며, 통상 입장객의 일부가 앱을 켠다. 거주지·연령·동반·유입 경로는 만족도 설문 응답 기준.</p>
        </Section>

        {/* 2. 동선 */}
        {r.event.stamp_enabled && d && (
          <Section n="2" title="동선 — 어디를 어떻게 돌았나">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="sub">지점별 도달 (스탬프 참여 {d.journey.cards}명 중)</h4>
                <Bars rows={d.journey.reach.map(x => ({ label: x.name, v: x.cards, pct: pct(x.cards, d.journey.cards) }))} />
                <p className="mt-2 text-sm text-gray-700">완주 {s.completed}명 ({pct(s.completed, s.cards) ?? 0}%) · 경품 수령 {s.redeemed}명 · 체류 중앙값 {d.journey.dwell_median_min ?? '–'}분 (평균 {d.journey.dwell_avg_min ?? '–'}분, 2곳 이상 방문 {d.journey.cards_2plus}명 기준)</p>
              </div>
              <div>
                <h4 className="sub">많이 다닌 길 (지점 → 지점)</h4>
                {d.journey.transitions.length ? <ol className="space-y-1 text-sm">{d.journey.transitions.slice(0, 6).map((x, i) => <li key={i} className="flex justify-between"><span>{x.from} → {x.to}</span><span className="tabular-nums text-gray-600">{x.count}</span></li>)}</ol> : <p className="text-sm text-gray-400">데이터 없음</p>}
                {d.journey.first_spot.length > 0 && <p className="mt-2 text-sm text-gray-700">첫 방문 지점 1위: {d.journey.first_spot[0].name} ({pct(d.journey.first_spot[0].count, d.journey.cards)}%)</p>}
                <h4 className="sub mt-3">시간대별 스탬프</h4><Bars rows={d.journey.by_hour.map(x => ({ label: `${x.hour}시`, v: x.count }))} compact />
              </div>
            </div>
            <p className="note">스탬프 QR 을 찍은 시각으로 계산. 도달률이 낮은 지점은 동선 끝이거나 안내가 부족했던 곳.</p>
          </Section>
        )}

        {/* 3. 체험·소비 */}
        <Section n={r.event.stamp_enabled ? '3' : '2'} title="체험·소비 — 부스가 얼마나 돌았나">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="py-1">부스</th><th className="text-right">접수</th><th className="text-right">완료</th><th className="text-right">인원</th><th className="text-right">노쇼</th><th className="text-right">노쇼율</th></tr></thead>
            <tbody>{t.by_booth.map((b: any) => <tr key={b.name} className="border-t"><td className="py-1.5">{b.name}</td><td className="text-right tabular-nums">{b.total}</td><td className="text-right tabular-nums">{b.served}</td><td className="text-right tabular-nums">{b.people}</td><td className="text-right tabular-nums">{b.no_show}</td><td className="text-right tabular-nums">{pct(b.no_show, b.total) ?? '–'}%</td></tr>)}</tbody>
          </table>
          {t.by_booth.length === 0 && <p className="text-sm text-gray-400">대기·예약을 쓴 부스 없음</p>}
          {d && (d.vendors.submitted > 0 || d.draws.length > 0) && (
            <p className="mt-3 text-sm text-gray-700">
              {d.vendors.submitted > 0 && <>셀러 셀프 등록 {d.vendors.submitted}건 · 승인 {d.vendors.approved}건. </>}
              {d.draws.map(x => `${x.title} 응모 ${x.entries}명`).join(' · ')}
            </p>
          )}
          <p className="note">셀러별 매출·객단가·품목별 판매는 QR 주문·결제를 함께 운영한 행사에서 이 섹션에 들어간다 (현금 매출 제외, 실측).</p>
        </Section>

        {/* 4. 반응 */}
        <Section n={r.event.stamp_enabled ? '4' : '3'} title="반응 — 어땠나">
          {sv?.responses ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {survey.filter(q => q.type !== 'text' && !/어디서|연령|누구와|알게/.test(q.label)).map(q => (
                <div key={q.id}><h4 className="sub">{q.label}{q.avg != null ? ` · 평균 ${q.avg}` : ''}</h4><Dist entries={topOf(q)} /></div>
              ))}
              {survey.filter(q => q.type === 'text' && q.texts?.length).map(q => (
                <div key={q.id} className="sm:col-span-2"><h4 className="sub">{q.label} ({q.texts!.length}건 중 일부)</h4><ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">{q.texts!.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">설문 응답 없음</p>}
        </Section>

        {/* 5. 운영 */}
        <Section n={r.event.stamp_enabled ? '5' : '4'} title="운영 — 현장 기록">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h4 className="sub">구역 혼잡 (스태프 기록)</h4>
              {d?.crowd.length ? <table className="w-full text-sm"><tbody>{d.crowd.map(c => <tr key={c.name} className="border-t"><td className="py-1">{c.name}</td><td className="text-right tabular-nums">혼잡 {c.high_min}분 · 보통 {c.mid_min}분</td></tr>)}</tbody></table> : <p className="text-sm text-gray-400">기록 없음</p>}
            </div>
            <div>
              <h4 className="sub">공지 {d?.notices.length ?? 0}건 (긴급 {d?.notices.filter(n => n.urgent).length ?? 0})</h4>
              <ul className="space-y-0.5 text-sm">{(d?.notices ?? []).slice(0, 8).map((n, i) => <li key={i} className="flex gap-2"><span className="shrink-0 tabular-nums text-gray-500">{new Date(n.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}</span><span>{n.urgent && <b className="text-red-600">[긴급] </b>}{n.title}</span></li>)}</ul>
              <p className="mt-2 text-sm text-gray-700">알림 발송 {r.notifications?.sent ?? 0}건 · 실패 {r.notifications?.failed ?? 0}건 · 지도 핀 {r.content.places} · 일정 {r.content.programs}</p>
            </div>
          </div>
        </Section>

        {memo && <Section n="" title="총평"><p className="text-sm leading-relaxed text-gray-800">{memo}</p></Section>}

        <div className="mt-8 border-t pt-3 text-[11px] leading-relaxed text-gray-500">
          데이터 출처: 행사 앱(wait.flitunion.com) 접속·대기·예약·스탬프·설문·공지 기록. 개인 식별 정보 없이 집계. 앱을 켜지 않은 방문객은 포함되지 않으므로 입장객 전수와 구분해서 읽는다. 작성: 플릿(FLIT) · 문의 010-2244-3585
        </div>
      </div>
      <style>{`.sub{font-size:12px;font-weight:700;color:#374151;margin-bottom:6px}.note{margin-top:10px;font-size:11px;color:#6b7280;line-height:1.5}
        @media print { body * { visibility: hidden } #report, #report * { visibility: visible } #report { position: absolute; left: 0; top: 0; width: 100% } section { break-inside: avoid } }`}</style>
    </div>
  )
}

const Kpi = ({ label, v, sub }: { label: string; v: number | string; sub?: string }) => (
  <div className="rounded-xl bg-gray-50 px-3 py-3"><div className="text-[11px] text-gray-500">{label}</div><div className="text-xl font-bold tabular-nums">{v}</div>{sub && <div className="text-[11px] text-gray-500">{sub}</div>}</div>
)
const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <section className="mt-7"><h3 className="mb-3 border-b pb-1 text-base font-bold text-gray-900">{n && <span className="mr-2 text-gray-400">{n}</span>}{title}</h3>{children}</section>
)
function Bars({ rows, compact }: { rows: { label: string; v: number; pct?: number | null }[]; compact?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.v))
  if (rows.length === 0) return <p className="text-sm text-gray-400">데이터 없음</p>
  return (
    <ul className={compact ? 'space-y-0.5' : 'space-y-1.5'}>
      {rows.map(r => (
        <li key={r.label} className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
          <span className={`shrink-0 truncate text-gray-600 ${compact ? 'w-10' : 'w-24'}`}>{r.label}</span>
          <span className={`${compact ? 'h-2' : 'h-3'} rounded bg-gray-900`} style={{ width: `${Math.max(2, (r.v / max) * 100)}%` }} />
          <span className="tabular-nums text-gray-700">{r.v}{r.pct != null ? <span className="text-gray-400"> · {r.pct}%</span> : null}</span>
        </li>
      ))}
    </ul>
  )
}
function Dist({ entries }: { entries: [string, number][] }) {
  const total = entries.reduce((a, [, n]) => a + n, 0)
  if (!total) return <p className="text-sm text-gray-400">응답 없음</p>
  return <ul className="space-y-0.5 text-sm">{entries.map(([k, n]) => <li key={k} className="flex items-center gap-2"><span className="w-20 shrink-0 truncate text-gray-600">{k}</span><span className="h-2.5 rounded bg-gray-900" style={{ width: `${Math.max(2, (n / total) * 100)}%` }} /><span className="tabular-nums text-gray-700">{Math.round((n / total) * 100)}%</span></li>)}</ul>
}
