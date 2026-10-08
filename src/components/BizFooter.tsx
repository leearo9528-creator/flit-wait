/** 사업자 정보 — 전자상거래법 표시 의무 + 카카오 비즈니스 채널 심사의 '채널명-사업자 관계' 증빙 */
export default function BizFooter({ className = '' }: { className?: string }) {
  return (
    <div className={`mt-6 text-center text-[11px] leading-relaxed text-gray-400 ${className}`}>
      <div className="font-semibold text-gray-500">플릿(FLIT)은 애즈셉이 운영하는 서비스입니다</div>
      <div>상호 애즈셉 · 대표 이아로 · 사업자등록번호 655-26-02147</div>
      <div>서울특별시 도봉구 마들로 724, 213호 · hello@flitunion.com</div>
    </div>
  )
}
