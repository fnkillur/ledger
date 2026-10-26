import { PlusIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { usePersonName } from '../../db/hooks'
import { REPEAT_LABEL, TARGET_TONE, type CalendarEvent, type CalendarTarget } from '../../domain/calendar'
import { formatTime, toDateKey } from '../../utils/format'
import { TargetAvatars } from './CalendarEventChip'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

type DaySheetProps = {
  dateKey: string
  events: CalendarEvent[]
  onClose: () => void
}

const formatDayTitle = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일 (${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`
}

const formatShortDate = (dateKey: string) => `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`

const formatEventTime = (event: CalendarEvent) => {
  if (event.allDay) {
    return event.start === event.end ? '하루 종일' : `${formatShortDate(event.start)} – ${formatShortDate(event.end)} 하루 종일`
  }
  const startDay = toDateKey(event.start)
  const endDay = toDateKey(event.end)
  if (startDay === endDay) return `${formatTime(event.start)} – ${formatTime(event.end)}`
  return `${formatShortDate(startDay)} ${formatTime(event.start)} – ${formatShortDate(endDay)} ${formatTime(event.end)}`
}

function DaySheet({ dateKey, events, onClose }: DaySheetProps) {
  const personName = usePersonName()

  const targetName = (target: CalendarTarget) => (target === '공동' || target === '없음' ? target : personName(target))

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet day-sheet" role="dialog" aria-label={formatDayTitle(dateKey)} onClick={event => event.stopPropagation()}>
        <div className="day-sheet-header">
          <h2>{formatDayTitle(dateKey)}</h2>
          <Link to={`/calendar/new?date=${dateKey}`} className="icon-button" aria-label="이 날 일정 추가">
            <PlusIcon size={22} weight="bold" aria-hidden="true" />
          </Link>
        </div>

        {events.length === 0 && <p className="empty-inline">일정이 없어요.</p>}
        <ul className="day-sheet-list">
          {events.map(event => (
            <li key={event.id}>
              <Link to={`/calendar/event/${encodeURIComponent(event.id)}`} state={{ event }} className={`day-sheet-item ${TARGET_TONE[event.target]}`}>
                <TargetAvatars target={event.target} size={20} />
                <span className="day-sheet-main">
                  <strong>{event.title}</strong>
                  <span className="day-sheet-meta">
                    {formatEventTime(event)}
                    {event.repeat !== 'none' && ` · ${REPEAT_LABEL[event.repeat]}`}
                    {` · ${targetName(event.target)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default DaySheet
