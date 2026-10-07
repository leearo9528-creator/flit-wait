import { Link } from 'react-router-dom'
import type { Booth } from '../lib/types'

export default function BoothHeader({ booth, event, tag }: { booth: Pick<Booth, 'name' | 'image_url' | 'description' | 'location'>; event: { name: string; slug?: string }; tag?: string }) {
  return (
    <header className="-mx-4 -mt-6 mb-4">
      <div className="relative h-44 overflow-hidden bg-gray-900">
        {booth.image_url ? <img src={booth.image_url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[radial-gradient(ellipse_at_top_right,_#38bdf8_0%,_#111827_60%)]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/85 via-gray-950/20 to-transparent" />
        {event.slug && <Link to={`/e/${event.slug}`} className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">← 체험부스 전체</Link>}
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <div className="text-xs text-white/70">{event.name}{tag ? ` · ${tag}` : ''}</div>
          <h1 className="text-2xl font-black leading-tight">{booth.name}</h1>
        </div>
      </div>
      {booth.description && <p className="mt-3 px-4 text-sm leading-relaxed text-gray-600">{booth.description}</p>}
    </header>
  )
}
