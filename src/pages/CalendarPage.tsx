import { PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import CalendarGrid from '../components/calendar/CalendarGrid'
import DaySheet from '../components/calendar/DaySheet'
import PeriodSwitcher from '../components/PeriodSwitcher'
import { useCalendarMonth } from '../db/calendar'
import { eventsOnDay } from '../domain/calendar'
import { isSyncConfigured, useSettings } from '../sync/settings'
import { currentMonthKey, shiftMonth, toDateKey } from '../utils/format'
import { setCalendarMonth, useCalendarMonthKey } from '../utils/viewState'

const todayKey = () => toDateKey(new Date().toISOString())

function CalendarPage() {
  const monthKey = useCalendarMonthKey()
  const settings = useSettings()
  const { events, error } = useCalendarMonth(monthKey)

  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const newEventDate = monthKey === currentMonthKey() ? todayKey() : `${monthKey}-01`

  return (
    <div className="page calendar-page">
      <header className="period-header">
        <div className="period-header-row">
          <PeriodSwitcher
            period={{ type: '월별', monthKey }}
            onChange={period => setCalendarMonth(period.monthKey)}
            monthOnly
            unbounded
          />
        </div>
      </header>

      {!isSyncConfigured(settings) && (
        <Link to="/settings" className="notice calendar-notice">
          구글 시트와 아직 연결되지 않았어요. 설정에서 연결 코드를 붙여넣어 주세요.
        </Link>
      )}
      {error && <p className="status status-error calendar-notice">일정을 불러오지 못했어요. {error}</p>}

      <CalendarGrid
        monthKey={monthKey}
        events={events}
        onSelectDay={setSelectedDay}
        onSwipe={offset => setCalendarMonth(shiftMonth(monthKey, offset))}
      />

      <Link to={`/calendar/new?date=${newEventDate}`} className="fab" aria-label="일정 추가">
        <PlusIcon size={26} weight="bold" aria-hidden="true" />
      </Link>

      {selectedDay &&
        createPortal(
          <DaySheet dateKey={selectedDay} events={eventsOnDay(events, selectedDay)} onClose={() => setSelectedDay(null)} />,
          document.body,
        )}
    </div>
  )
}

export default CalendarPage
