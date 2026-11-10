import { useParams, useSearchParams } from 'react-router-dom'
import { Alert, Spinner } from '../../components/ui'
import CustomerNav from '../../components/CustomerNav'
import DemoBanner from '../../components/DemoBanner'
import MyStrips from '../../components/MyStrips'
import { useGuide } from '../../lib/guide'
import { TONE_TEXT } from '../../lib/live'

/**
 * 셋째 탭 — 먹거리(가게마다 메뉴·가격을 다 펼쳐 한 화면에) 또는 체험(대기 짧은 순 목록).
 * 먹거리·마켓이 둘 다 있으면 위에서 고른다.
 */
export default function Browse({ tab }: { tab: 'food' | 'booth' }) {
  const { slug = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const { data, error, loading, rows, open } = useGuide(slug)
  if (loading && !data) return <Spinner />
  if (!data?.event) return <div className="p-6"><Alert kind="error">{error ?? '행사를 찾을 수 없습니다.'}</Alert></div>

  const foods = rows.filter(r => r.p.kind === 'food'), markets = rows.filter(r => r.p.kind === 'market')
  const kind = tab === 'booth' ? 'booth' : (sp.get('k') === 'market' && markets.length) || !foods.length ? 'market' : 'food'
  const booths = rows.filter(r => r.p.booth).sort((a, b) => (a.live?.sort ?? 0) - (b.live?.sort ?? 0))
  const list = kind === 'booth' ? booths : kind === 'food' ? foods : markets
  const word = kind === 'food' ? '메뉴' : '상품'

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-24">
      <DemoBanner />
      <header className="sticky top-0 z-10 bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
        <h1 className="text-[22px] font-bold leading-tight text-gray-900">{kind === 'booth' ? '체험' : '먹거리 · 마켓'}</h1>
        {tab === 'food' && foods.length > 0 && markets.length > 0 && (
          <div className="mt-3 flex rounded-full bg-gray-100 p-0.5 text-sm font-semibold">
            {([['food', `먹거리 ${foods.length}`], ['market', `마켓 ${markets.length}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSp(k === 'food' ? {} : { k }, { replace: true })} className={`flex-1 rounded-full py-2 ${kind === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{label}</button>
            ))}
          </div>
        )}
      </header>
      <div className="space-y-3 px-4">
        <MyStrips slug={slug} />
        {data.event.status !== 'open' && <Alert kind="info">지금은 운영 시간이 아니에요.</Alert>}

        {kind === 'booth' && (
          <ul className="divide-y divide-gray-100">
            {list.map(({ p, live }) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-bold text-gray-900">{p.name}</span>
                    <span className="block truncate text-xs text-gray-500">{[p.booth!.location, p.description].filter(Boolean).join(' · ')}</span>
                  </span>
                  {live && <span className={`shrink-0 text-[17px] font-bold tabular-nums ${TONE_TEXT[live.tone]}`}>{live.text}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {kind !== 'booth' && list.map(({ p, live }) => (
          <section key={p.id} className="overflow-hidden rounded-2xl ring-1 ring-gray-200">
            <button type="button" onClick={() => open(p)} className="flex w-full items-center gap-3 bg-gray-50 px-4 py-3 text-left active:bg-gray-100">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-bold text-gray-900">{p.name}</span>
                <span className="block truncate text-xs text-gray-500">{[p.description, p.hours].filter(Boolean).join(' · ')}</span>
              </span>
              {live && <span className={`shrink-0 text-[15px] font-bold ${TONE_TEXT[live.tone]}`}>{live.text}</span>}
              {p.order_open && <span className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${p.order_paused ? 'bg-gray-200 text-gray-500' : 'bg-gray-900 text-white'}`}>{p.order_paused ? '잠시 멈춤' : '주문'}</span>}
            </button>
            {(p.menu?.length ?? 0) > 0
              ? <ul className="divide-y divide-gray-100 px-4">
                  {p.menu.map((m, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => open(p)} className={`flex w-full items-center gap-3 py-2.5 text-left ${m.sold_out ? 'opacity-50' : ''}`}>
                        {m.image_url && <img src={m.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 object-cover" />}
                        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-gray-900">{m.name}</span>{m.desc && <span className="block truncate text-xs text-gray-500">{m.desc}</span>}</span>
                        <span className="shrink-0 text-[15px] tabular-nums text-gray-700">{m.sold_out ? '품절' : m.price}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              : <p className="px-4 py-3 text-sm text-gray-400">{word}는 현장에서 확인해 주세요.</p>}
          </section>
        ))}
        {list.length === 0 && <p className="py-16 text-center text-sm text-gray-400">표시할 곳이 없어요.</p>}
      </div>
      <CustomerNav slug={slug} active="food" />
    </div>
  )
}
