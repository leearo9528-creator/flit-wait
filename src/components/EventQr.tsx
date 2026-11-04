// 통합 QR (/e/슬러그) — 행사 만든 순간 고정되는 링크라 내용이 비어 있어도 첫날 바로 뽑아 현수막·안내판에 쓴다.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { PUBLIC_BASE_URL } from '../lib/supabase'

export default function EventQr({ slug, name }: { slug: string; name: string }) {
  const url = `${PUBLIC_BASE_URL}/e/${slug}`
  const [png, setPng] = useState<string | null>(null)
  useEffect(() => { QRCode.toDataURL(url, { width: 1024, margin: 2 }).then(setPng).catch(() => setPng(null)) }, [url])

  function print() {
    if (!png) return
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${name} 행사 QR</title>
      <style>body{font-family:sans-serif;margin:0} .p{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center}
      img{width:70vw;max-width:560px} h1{font-size:44px;margin:24px 0 8px} p{font-size:22px;color:#555;margin:0}</style></head><body>
      <div class="p"><img src="${png}"><h1>${name}</h1><p>지도 · 부스 · 일정 · 스탬프 — 카메라로 QR 을 찍어 주세요</p><p style="font-size:16px;margin-top:12px">${url}</p></div>
      <script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-2 pr-3">
      {png ? <img src={png} alt="행사 QR" className="h-16 w-16 rounded bg-white" /> : <div className="h-16 w-16 rounded bg-gray-200" />}
      <div className="text-xs">
        <div className="font-semibold">행사 QR · <a className="underline" href={url} target="_blank" rel="noreferrer">/e/{slug}</a></div>
        <div className="text-gray-500">내용을 아직 안 채웠어도 이 QR 은 안 바뀌어요. 현수막·안내판용으로 먼저 뽑으세요.</div>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={print} disabled={!png} className="rounded-lg bg-gray-900 px-2 py-1 font-semibold text-white disabled:bg-gray-300">인쇄</button>
          {png && <a href={png} download={`${slug}-qr.png`} className="rounded-lg bg-white px-2 py-1 font-semibold ring-1 ring-gray-300">PNG 저장</a>}
        </div>
      </div>
    </div>
  )
}
