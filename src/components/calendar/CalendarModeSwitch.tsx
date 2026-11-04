import { useNavigate } from 'react-router'
import Segmented from '../Segmented'

const MODES = ['일정', '주기'] as const

type CalendarModeSwitchProps = { mode: (typeof MODES)[number] }

// 캘린더 탭 안에서 일정과 주기 화면을 오간다. 뒤로 가기에 쌓이지 않게 바꿔 끼운다.
function CalendarModeSwitch({ mode }: CalendarModeSwitchProps) {
  const navigate = useNavigate()

  return (
    <div className="calendar-mode-switch">
      <Segmented label="캘린더 보기" options={MODES} value={mode} onChange={next => navigate(next === '일정' ? '/' : '/cycles', { replace: true })} />
    </div>
  )
}

export default CalendarModeSwitch
