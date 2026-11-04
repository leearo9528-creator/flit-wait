import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LS } from '../lib/util'
import { Page, Card, Button } from '../components/ui'

/** 루트 — 홈 화면에 추가(PWA)해서 열면 마지막으로 본 행사로 바로 보낸다 */
export default function Home() {
  const nav = useNavigate()
  const last = LS.get<string>('lastEvent')
  useEffect(() => { if (last) nav(`/e/${last}`, { replace: true }) }, []) // eslint-disable-line
  if (last) return null
  return (
    <Page title="FLIT 축제 앱" sub="플릿">
      <Card>
        <p className="text-sm text-gray-600">
          축제 현장의 체험부스 대기·예약, 행사장 지도, 일정·공지, 스탬프 투어를 한 화면에서 보는 모바일 웹이에요.
          행사장 QR 을 찍거나 안내받은 링크로 들어와 주세요.
        </p>
        <div className="mt-5"><Link to="/admin"><Button variant="secondary">기획자 · 행사 관리</Button></Link></div>
        <p className="mt-4 text-xs text-gray-400">운영 플릿 (FLIT) · flitunion.com</p>
      </Card>
    </Page>
  )
}
