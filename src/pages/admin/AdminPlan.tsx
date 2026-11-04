// 운영안 자동 생성 — 운영안(붙여넣기 or PDF) → /api/plan-import (Claude) → 미리보기 → "적용" 으로 DB 에 넣는다.
// 적용은 '이름 매칭 갱신' — 운영안은 초안→확정안으로 두 번 이상 오고, 그 사이에 QR(통합 /e/슬러그·스탬프 지점 code)은 이미 뽑혀 있다.
// 같은 이름 핀은 설명·시간·메뉴만 덮어쓰고 위치·스탬프 코드·대기 부스 연결은 유지, 같은 제목 일정은 시간만 갱신, 새 이름은 추가.
// 운영안에서 사라진 것은 지우지 않고 미리보기에 '운영안에 없음' 으로만 보여준다 (삭제는 사람이).
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Button, Alert, Field } from '../../components/ui'
import { PLACE_KIND_LABEL, PROGRAM_KIND_LABEL, type EventRow, type PlaceKind, type ProgramKind } from '../../lib/types'

interface PlanPlace { kind: PlaceKind; name: string; description?: string; hours?: string; x: number; y: number; menu?: { name: string; price?: string }[] }
interface PlanProgram { title: string; kind: ProgramKind; description?: string; place_name?: string; starts_at: string; ends_at: string }
interface PlanNotice { title: string; body: string; pinned?: boolean; urgent?: boolean }
interface PlanDraw { title: string; prize?: string; description?: string; draw_at?: string; winners_count?: number }
interface Plan {
  summary: string; places: PlanPlace[]; programs: PlanProgram[]; notices: PlanNotice[]
  info_text?: string; contact_text?: string; draws?: PlanDraw[]
  survey: { title: string; questions: { type: 'rating' | 'choice' | 'text'; label: string; options?: string[] }[] }
  stamp?: { enabled?: boolean; reward_text?: string; spot_names?: string[] }
}
type Section = 'places' | 'programs' | 'notices' | 'info' | 'draws' | 'survey' | 'stamp'

const fmt = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    // 글자 단위로 쪼개져 오는 PDF(크롬 인쇄 등)가 많아 공백은 넣지 않고, 줄은 hasEOL 또는 y 변화로 끊는다
    let line = '', lastY: number | null = null
    for (const it of tc.items as any[]) {
      if (!('str' in it)) continue
      const y = it.transform?.[5]
      if (lastY !== null && Math.abs(y - lastY) > 2 && line) { out.push(line); line = '' }
      line += it.str
      if (it.hasEOL) { out.push(line); line = '' }
      lastY = y
    }
    out.push(line, `\n--- ${i}쪽 끝 ---\n`)
  }
  return out.join('\n')
}

export default function AdminPlan({ e, onSaved }: { e: EventRow; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sel, setSel] = useState<Record<Section, boolean>>({ places: true, programs: true, notices: true, info: true, draws: true, survey: true, stamp: true })
  const [done, setDone] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ places: { id: string; name: string }[]; programs: { id: string; title: string }[]; notices: { id: string; title: string }[]; draws: { id: string; title: string }[]; spots: { id: string; name: string; place_id: string | null }[] } | null>(null)
  // 이름 매칭: 공백·기호 무시, '안내소 · 경품 교환' 과 '안내소' 처럼 구분자(· / ( —) 앞 머리가 같으면 같은 것으로 본다 (템플릿 샘플 ↔ 운영안)
  const norm = (x: string) => x.replace(/\s+/g, '').toLowerCase()
  const head = (x: string) => norm(x.split(/[·(—\-/:]/)[0])
  const same = (a: string, b: string) => norm(a) === norm(b) || (head(a).length >= 2 && head(a) === head(b))
  const has = (list: { name?: string; title?: string }[] | undefined, key: string) => !!list?.some(r => same(r.name ?? r.title ?? '', key))
  const missing = <T extends { name?: string; title?: string }>(list: T[] | undefined, keys: string[]) => (list ?? []).filter(r => !keys.some(k => same(k, r.name ?? r.title ?? '')))
  const [prune, setPrune] = useState(false)   // 운영안에 없는 기존 항목 지우기 (템플릿 샘플 정리용)

  async function loadExisting() {
    const [pl, pr, no, dr, sp] = await Promise.all([
      supabase.from('places').select('id,name').eq('event_id', e.id),
      supabase.from('programs').select('id,title').eq('event_id', e.id),
      supabase.from('notices').select('id,title').eq('event_id', e.id),
      supabase.from('draws').select('id,title').eq('event_id', e.id),
      supabase.from('stamp_spots').select('id,name,place_id').eq('event_id', e.id),
    ])
    const ex = { places: pl.data ?? [], programs: pr.data ?? [], notices: no.data ?? [], draws: dr.data ?? [], spots: sp.data ?? [] }
    setExisting(ex); return ex
  }

  async function onFile(f: File | null) {
    if (!f) return
    setErr(null); setBusy('PDF 읽는 중…')
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) setText(await pdfToText(f))
      else setText(await f.text())
    } catch (x: any) { setErr(`파일을 읽지 못했어요: ${x.message ?? x}`) }
    setBusy(null)
  }

  async function generate() {
    setErr(null); setDone(null); setPlan(null); setBusy('운영안 읽는 중… (20~40초)')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요해요.')
      const r = await fetch('/api/plan-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ event_id: e.id, event_name: e.name, starts_at: e.starts_at, ends_at: e.ends_at, text }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `실패 (${r.status})`)
      await loadExisting()
      setPlan(j.plan as Plan)
    } catch (x: any) { setErr(x.message ?? String(x)) }
    setBusy(null)
  }

  async function apply() {
    if (!plan) return
    setErr(null); setBusy('적용 중…')
    try {
      const ex = await loadExisting()
      const ev: Record<string, unknown> = {}
      const nameToId = new Map<string, string>()
      for (const p of ex.places) nameToId.set(norm(p.name), p.id)
      const idOf = (name: string) => nameToId.get(norm(name)) ?? [...nameToId.entries()].find(([k]) => same(k, name))?.[1]
      const find = <T extends { name?: string; title?: string }>(list: T[], key: string) => list.find(r => same(r.name ?? r.title ?? '', key))
      const del = async (table: string, ids: string[]) => { if (!ids.length) return; const { error } = await supabase.from(table).delete().in('id', ids); if (error) throw error }
      if (sel.places && plan.places.length) {
        let i = ex.places.length
        for (const p of plan.places) {
          const hit = find(ex.places, p.name)
          const common = { description: p.description || null, hours: p.hours || null, menu: p.menu?.length ? p.menu : [] }
          if (hit) { const { error } = await supabase.from('places').update({ ...common, kind: p.kind }).eq('id', hit.id); if (error) throw error }   // 위치(x,y)·booth_id 는 유지
          else { const { data, error } = await supabase.from('places').insert({ event_id: e.id, kind: p.kind, name: p.name, ...common, x: clamp(p.x), y: clamp(p.y), sort_order: (++i) * 10 }).select('id,name').single(); if (error) throw error; nameToId.set(norm(data.name), data.id) }
        }
        if (prune) {
          const gone = missing(ex.places, plan.places.map(p => p.name)).map(p => p.id)
          await del('stamp_spots', ex.spots.filter(s => s.place_id && gone.includes(s.place_id)).map(s => s.id))   // 핀이 지워지면 그 지점 QR 도 무효
          await del('places', gone)
        }
      }
      if (sel.programs && plan.programs.length) {
        for (const p of plan.programs) {
          if (isNaN(new Date(p.starts_at).getTime()) || !(new Date(p.ends_at) > new Date(p.starts_at))) continue
          const row = { kind: p.kind, description: p.description || null, place_id: p.place_name ? idOf(p.place_name) ?? null : null, starts_at: p.starts_at, ends_at: p.ends_at }
          const hit = find(ex.programs, p.title)
          const { error } = hit ? await supabase.from('programs').update(row).eq('id', hit.id) : await supabase.from('programs').insert({ event_id: e.id, title: p.title, ...row })
          if (error) throw error
        }
        if (prune) await del('programs', missing(ex.programs, plan.programs.map(p => p.title)).map(p => p.id))
      }
      if (sel.notices && plan.notices.length) {
        for (const n of plan.notices) {
          const row = { body: n.body, pinned: !!n.pinned, urgent: !!n.urgent }
          const hit = find(ex.notices, n.title)
          const { error } = hit ? await supabase.from('notices').update(row).eq('id', hit.id) : await supabase.from('notices').insert({ event_id: e.id, title: n.title, ...row })
          if (error) throw error
        }
        if (prune) await del('notices', missing(ex.notices, plan.notices.map(n => n.title)).map(n => n.id))
      }
      if (sel.info) { if (plan.info_text) ev.info_text = plan.info_text; if (plan.contact_text) ev.contact_text = plan.contact_text }
      if (sel.draws && plan.draws?.length) {
        for (const d of plan.draws) {
          const row = { prize: d.prize || null, description: d.description || null, draw_at: d.draw_at && !isNaN(new Date(d.draw_at).getTime()) ? d.draw_at : null, winners_count: Math.min(500, Math.max(1, d.winners_count ?? 1)) }
          const hit = find(ex.draws, d.title)
          const { error } = hit ? await supabase.from('draws').update(row).eq('id', hit.id) : await supabase.from('draws').insert({ event_id: e.id, title: d.title, ...row, status: 'open' })   // 이미 추첨한 건 status 안 건드림
          if (error) throw error
        }
      }
      if (sel.survey && plan.survey?.questions?.length) {
        const questions = plan.survey.questions.map((q, i) => ({ id: `q${i + 1}`, type: q.type, label: q.label, options: q.type === 'choice' ? (q.options ?? []) : undefined }))
        const { error } = await supabase.from('surveys').upsert({ event_id: e.id, enabled: true, title: plan.survey.title, questions }); if (error) throw error
      }
      if (sel.stamp && plan.stamp?.enabled) {
        ev.stamp_enabled = true; if (plan.stamp.reward_text) ev.stamp_reward_text = plan.stamp.reward_text
        // 지점은 이미 있으면 그대로(QR code 유지). 핀 이름이 지점에 없을 때만 추가
        const newSpots = (plan.stamp.spot_names ?? []).filter(n => idOf(n) && !find(ex.spots, n))
        if (newSpots.length) { const { error } = await supabase.from('stamp_spots').insert(newSpots.map((n, i) => ({ event_id: e.id, place_id: idOf(n), name: n, sort_order: (ex.spots.length + i + 1) * 10 }))); if (error) throw error }
      }
      if (Object.keys(ev).length) { const { error } = await supabase.from('events').update(ev).eq('id', e.id); if (error) throw error }
      setDone('들어갔어요. 이미 있던 핀은 위치와 스탬프 QR 을 그대로 두고 내용만 바꿨어요. 지도·일정·안내 탭에서 다듬어 주세요.')
      setPlan(null); onSaved()
    } catch (x: any) { setErr(x.message ?? String(x)) }
    setBusy(null)
  }

  const Tag = ({ isNew }: { isNew: boolean }) => <span className={`ml-1 rounded px-1 text-[10px] ${isNew ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{isNew ? '추가' : '갱신'}</span>
  const Gone = ({ items }: { items: { name?: string; title?: string }[] }) => items.length ? <div className="mt-2 text-xs text-amber-700">운영안에 없음{prune ? ' → 지워져요' : ' (그대로 둬요)'}: {items.map(i => i.name ?? i.title).join(', ')}</div> : null

  const Sec = ({ k, title, n, children }: { k: Section; title: string; n: number; children: React.ReactNode }) => (
    <div className={`rounded-xl border p-3 ${sel[k] ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-50'}`}>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={sel[k]} onChange={x => setSel({ ...sel, [k]: x.target.checked })} />{title} <span className="text-xs font-normal text-gray-500">{n}</span></label>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-bold">운영안 자동 생성</h3>
        <p className="mt-1 text-sm text-gray-600">기획서·큐시트·부스 배치표를 붙여 넣거나 PDF 를 올리면 지도 핀·타임테이블·공지·안내·럭키드로우·설문 초안을 뽑아 줘요. 미리 보고 고른 것만 들어가요.</p>
        <div className="mt-3 grid gap-3">
          <Field label="운영안 파일 (PDF · txt · md)"><input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" onChange={x => onFile(x.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
          <Field label="또는 붙여넣기" hint={`${text.length.toLocaleString()}자`}>
            <textarea value={text} onChange={x => setText(x.target.value)} rows={10} placeholder={'예)\n12/20(토) 11:00~20:00 ○○광장\n부스: 셀러 20팀(핸드메이드·소품), 푸드트럭 4대(핫도그·츄러스·뱅쇼·핫초코)\n무대: 11:00 오픈 캐롤 / 15:00 어쿠스틱 공연 / 18:00 럭키드로우 추첨(선물세트 3명)\n스탬프 5곳 완주 시 안내소에서 선물\n주차: 인근 공영주차장 / 우천 시 공연 취소'} className="w-full rounded-xl border border-gray-300 p-3 text-sm" />
          </Field>
          <Button onClick={generate} disabled={!!busy || text.trim().length < 40}>{busy ?? '자동 생성'}</Button>
        </div>
        {err && <div className="mt-3"><Alert kind="error">{err}</Alert></div>}
        {done && <div className="mt-3"><Alert kind="success">{done}</Alert></div>}
      </Card>

      {plan && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-bold">미리보기</h3><p className="mt-1 text-sm text-gray-600">{plan.summary}</p></div>
            <Button onClick={apply} disabled={!!busy} className="!w-auto px-6">{busy ?? '체크한 것 적용'}</Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Sec k="places" title="지도 핀" n={plan.places.length}>
              <ul className="space-y-1">{plan.places.map((p, i) => <li key={i}><span className="rounded bg-gray-100 px-1 text-xs">{PLACE_KIND_LABEL[p.kind] ?? p.kind}</span> <b>{p.name}</b><Tag isNew={!has(existing?.places, p.name)} /> {p.hours && <span className="text-gray-500">{p.hours}</span>}{p.description && <div className="text-xs text-gray-500">{p.description}</div>}{p.menu?.length ? <div className="text-xs text-gray-500">{p.menu.map(m => `${m.name}${m.price ? ` ${m.price}` : ''}`).join(' · ')}</div> : null}</li>)}</ul>
              {plan.places.length === 0 && <div className="text-gray-400">없음</div>}
              <Gone items={missing(existing?.places, plan.places.map(p => p.name))} />
            </Sec>
            <Sec k="programs" title="타임테이블" n={plan.programs.length}>
              <ul className="space-y-1">{plan.programs.map((p, i) => <li key={i}><span className="tabular-nums text-gray-500">{fmt(p.starts_at)}~{fmt(p.ends_at).split(' ').pop()}</span> <b>{p.title}</b><Tag isNew={!has(existing?.programs, p.title)} /> <span className="text-xs text-gray-500">{PROGRAM_KIND_LABEL[p.kind] ?? p.kind}{p.place_name ? ` · ${p.place_name}` : ''}</span></li>)}</ul>
              {plan.programs.length === 0 && <div className="text-gray-400">없음</div>}
              <Gone items={missing(existing?.programs, plan.programs.map(p => p.title))} />
            </Sec>
            <Sec k="notices" title="공지" n={plan.notices.length}>
              <ul className="space-y-1">{plan.notices.map((n, i) => <li key={i}><b>{n.title}</b><Tag isNew={!has(existing?.notices, n.title)} />{n.pinned && <span className="ml-1 text-xs text-gray-500">고정</span>}<div className="text-xs text-gray-500">{n.body}</div></li>)}</ul>
            </Sec>
            <Sec k="info" title="행사 안내·문의처" n={(plan.info_text ? 1 : 0) + (plan.contact_text ? 1 : 0)}>
              <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700">{plan.info_text || '(없음)'}</pre>
              {plan.contact_text && <div className="mt-1 text-xs text-gray-700">문의: {plan.contact_text}</div>}
            </Sec>
            <Sec k="draws" title="럭키드로우" n={plan.draws?.length ?? 0}>
              <ul className="space-y-1">{(plan.draws ?? []).map((d, i) => <li key={i}><b>{d.title}</b><Tag isNew={!has(existing?.draws, d.title)} /> <span className="text-xs text-gray-500">{d.prize ?? ''} · {d.winners_count ?? 1}명{d.draw_at ? ` · ${fmt(d.draw_at)}` : ''}</span></li>)}</ul>
              {!plan.draws?.length && <div className="text-gray-400">없음</div>}
            </Sec>
            <Sec k="survey" title="만족도 설문" n={plan.survey?.questions?.length ?? 0}>
              <div className="font-semibold">{plan.survey?.title}</div>
              <ol className="list-decimal pl-5">{plan.survey?.questions?.map((q, i) => <li key={i}>{q.label} <span className="text-xs text-gray-500">{q.type}{q.options?.length ? ` · ${q.options.join('/')}` : ''}</span></li>)}</ol>
            </Sec>
            <Sec k="stamp" title="스탬프 투어" n={plan.stamp?.spot_names?.length ?? 0}>
              {plan.stamp?.enabled ? <div>{plan.stamp.reward_text && <div>보상: {plan.stamp.reward_text}</div>}<div className="text-xs text-gray-500">지점: {(plan.stamp.spot_names ?? []).join(', ') || '(지도 핀 중에서 골라야 해요)'}</div></div> : <div className="text-gray-400">운영안에 없음</div>}
            </Sec>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={prune} onChange={x => setPrune(x.target.checked)} className="mt-1" /><span><b>운영안에 없는 핀·일정·공지 지우기</b><span className="block text-xs text-gray-500">템플릿 샘플을 정리할 때 켜세요. 지워지는 핀에 붙은 스탬프 지점도 같이 지워져 그 QR 은 못 써요.</span></span></label>
          <p className="mt-2 text-xs text-gray-500">같은 이름은 갱신, 새 이름은 추가, 운영안에서 빠진 건 그대로 둬요. 핀 위치·스탬프 QR·대기 부스 연결은 안 바뀌니 초안으로 QR 을 먼저 뽑고 확정안으로 다시 돌려도 돼요.</p>
        </Card>
      )}
    </div>
  )
}

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? Math.round(n * 100) / 100 : 50))
