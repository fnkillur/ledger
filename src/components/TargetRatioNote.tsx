import HelpNote from './HelpNote'

// 수입 대비 지출의 기준이 100%가 아니라 우리 목표라는 걸 알려 준다. 목표는 시트 설정 탭의 지출목표비율.
function TargetRatioNote({ target }: { target: number }) {
  return (
    <HelpNote label={`목표 ${target}%`} helpLabel="목표 기준 보기" className="target-note">
      번 돈의 {100 - target}%는 남겨 보자는 우리 목표예요
      <br />
      소득 상위 20% 가구는 번 돈의 약 55%를 써요 (2025년 4분기 가계동향)
      <br />
      구글 시트 설정 탭의 지출목표비율에서 바꿀 수 있어요
    </HelpNote>
  )
}

export default TargetRatioNote
