import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from './ui'

/** 이미지 → 1600px WebP 축소 → Supabase Storage(images) 업로드 → public URL */
export default function ImageUpload({ value, folder, onChange, aspect = 'aspect-[16/9]' }: { value: string | null | undefined; folder: string; onChange: (url: string | null) => void; aspect?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(file: File) {
    setBusy(true); setErr(null)
    try {
      const blob = await shrink(file, 1600)
      const path = `${folder}/${Date.now()}.webp`
      const { error } = await supabase.storage.from('images').upload(path, blob, { contentType: 'image/webp', upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('images').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }

  return (
    <div>
      <div className={`relative overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200 ${aspect}`}>
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-gray-400">사진 없음</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" size="sm" className="!w-auto" loading={busy} onClick={() => ref.current?.click()}>{value ? '사진 변경' : '사진 올리기'}</Button>
        {value && <Button variant="ghost" size="sm" className="!w-auto" onClick={() => onChange(null)}>삭제</Button>}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && pick(e.target.files[0])} />
      </div>
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </div>
  )
}

async function shrink(file: File, max: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) })
  const r = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise(res => c.toBlob(b => res(b!), 'image/webp', 0.86))
}
