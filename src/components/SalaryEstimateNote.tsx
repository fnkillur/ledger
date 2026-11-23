import { usePersonName } from '../db/hooks'
import type { PendingSalary } from '../domain/stats'
import HelpNote from './HelpNote'

// 수입 대비 지출이 예상치일 때 붙이는 표시. 어느 월급을 기다리는지는 ? 를 눌러야 보인다.
function SalaryEstimateNote({ pending }: { pending: PendingSalary[] }) {
  const personName = usePersonName()

  return (
    <HelpNote label="지난달 월급 기준" helpLabel="기다리는 월급 보기">
      아직 안 들어온 월급은 지난달 금액으로 셌어요
      <br />
      월급 예정 {pending.map(salary => `${personName(salary.person)} ${salary.day}일`).join(' · ')}
    </HelpNote>
  )
}

export default SalaryEstimateNote
