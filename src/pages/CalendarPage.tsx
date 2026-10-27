import { PlusIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router'
import CalendarCarousel from '../components/calendar/CalendarCarousel'
import DaySheet, { type DaySheetView } from '../components/calendar/DaySheet'
import PeriodSwitcher from '../components/PeriodSwitcher'
import { useCalendarEvents, useCalendarStatus, useCalendarSync } from '../db/calendar'
import { eventsOnDay } from '../domain/calendar'
import { isSyncConfigured, useSettings } from '../sync/settings'
import { currentMonthKey, shiftMonth, toDateKey } from '../utils/format'
import { setCalendarMonth, useCalendarMonthKey } from '../utils/viewState'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const todayKey = () => toDateKey(new Date().toISOString())

const weekdayClass = (index: number) => {
  if (index === 0) return 'is-sunday'
  if (index === 6) return 'is-saturday'
  return ''
}

function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // 새 일정 알림을 누르고 들어오면 주소에 날짜가 붙어 와서, 그 날짜 시트를 연다.
  const linkedDate = searchParams.get('date')
  const monthKey = useCalendarMonthKey()
  const settings = useSettings()
  const events = useCalendarEvents()
  const { error, pendingCount } = useCalendarStatus()

  const [pickedDay, setPickedDay] = useState<{ dateKey: string; view: DaySheetView } | null>(null)

  const opened = linkedDate ? { dateKey: linkedDate, view: { type: 'list' } as DaySheetView } : pickedDay

  const closeSheet = () => {
    setPickedDay(null)
    if (linkedDate) setSearchParams({}, { replace: true })
  }

  const newEventDate = monthKey === currentMonthKey() ? todayKey() : `${monthKey}-01`

  useCalendarSync(monthKey)

  // 새 일정 알림을 누르고 들어오면 그 날짜의 달로 옮긴다.
  useEffect(() => {
    if (linkedDate) setCalendarMonth(linkedDate.slice(0, 7))
  }, [linkedDate])

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
      {error && <p className="status status-error calendar-notice">캘린더를 맞추지 못했어요. {error}</p>}
      {pendingCount > 0 && <p className="calendar-pending">보내지 않은 변경 {pendingCount}건 · 연결되면 자동으로 보내요</p>}

      <div className="cal">
        <div className="cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((label, index) => (
            <span key={label} className={weekdayClass(index)}>
              {label}
            </span>
          ))}
        </div>
        {/* 받아 둔 일정을 다 읽은 뒤에 달력을 그려서, 빈 달력에 일정이 뒤늦게 튀어나오지 않게 한다. */}
        {events && (
          <CalendarCarousel
            monthKey={monthKey}
            events={events}
            onChangeMonth={offset => setCalendarMonth(shiftMonth(monthKey, offset))}
            onSelectDay={dateKey => setPickedDay({ dateKey, view: { type: 'list' } })}
          />
        )}
      </div>

      <button type="button" className="fab" aria-label="일정 추가" onClick={() => setPickedDay({ dateKey: newEventDate, view: { type: 'form' } })}>
        <PlusIcon size={26} weight="bold" aria-hidden="true" />
      </button>

      {opened &&
        createPortal(
          <DaySheet
            key={opened.dateKey}
            dateKey={opened.dateKey}
            events={eventsOnDay(events ?? [], opened.dateKey)}
            initialView={opened.view}
            onClose={closeSheet}
          />,
          document.body,
        )}
    </div>
  )
}

export default CalendarPage
