import { Page, Card } from '../components/ui'
import BizFooter from '../components/BizFooter'

export default function Home() {
  return (
    <Page title="플릿 대기·예약" sub="FLIT WAIT">
      <Card>
        <p className="text-sm text-gray-600">
          행사 체험부스 대기표·사전 예약 시스템입니다. 부스 앞 QR을 스캔하거나, 안내받은 링크로 접속해 주세요.
        </p>
        <p className="mt-4 text-xs text-gray-400">운영: 플릿 (FLIT) · 문의는 현장 운영본부</p>
      </Card>
      <BizFooter />
    </Page>
  )
}
