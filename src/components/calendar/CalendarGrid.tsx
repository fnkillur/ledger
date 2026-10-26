import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { dayTone, eventsOnDay, monthGrid, type CalendarEvent } from '../../domain/calendar'
import CalendarEventChip from './CalendarEventChip'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
// 날짜 숫자 높이와 칸의 위아래 여백·테두리.
const DAY_CHROME_HEIGHT = 25
const CHIP_STEP = 17
const SWIPE_DISTANCE = 50

type CalendarGridProps = {
  monthKey: string
  events: CalendarEvent[]
  onSelectDay: (dateKey: string) => void
  onSwipe: (offset: 1 | -1) => void
}

const weekdayClass = (index: number) => {
  if (index === 0) return 'is-sunday'
  if (index === 6) return 'is-saturday'
  return ''
}

function CalendarGrid({ monthKey, events, onSelectDay, onSwipe }: CalendarGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const didSwipeRef = useRef(false)

  const [chipLimit, setChipLimit] = useState(3)

  const weeks = monthGrid(monthKey)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const observer = new ResizeObserver(() => {
      const rowHeight = grid.clientHeight / weeks.length
      setChipLimit(Math.max(1, Math.floor((rowHeight - DAY_CHROME_HEIGHT) / CHIP_STEP)))
    })
    observer.observe(grid)
    return () => observer.disconnect()
  }, [weeks.length])

  const handlePointerDown = (event: PointerEvent) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
    didSwipeRef.current = false
  }

  const handlePointerUp = (event: PointerEvent) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) return
    didSwipeRef.current = true
    onSwipe(dx < 0 ? 1 : -1)
  }

  const handleSelect = (dateKey: string) => {
    if (didSwipeRef.current) return
    onSelectDay(dateKey)
  }

  return (
    <div className="calendar">
      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((label, index) => (
          <span key={label} className={weekdayClass(index)}>
            {label}
          </span>
        ))}
      </div>
      <div
        ref={gridRef}
        className="calendar-grid"
        style={{ '--weeks': weeks.length } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (pointerStartRef.current = null)}
      >
        {weeks.flat().map(dateKey => (
          <CalendarDay
            key={dateKey}
            dateKey={dateKey}
            monthKey={monthKey}
            events={eventsOnDay(events, dateKey)}
            chipLimit={chipLimit}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  )
}

type CalendarDayProps = {
  dateKey: string
  monthKey: string
  events: CalendarEvent[]
  chipLimit: number
  onSelect: (dateKey: string) => void
}

function CalendarDay({ dateKey, monthKey, events, chipLimit, onSelect }: CalendarDayProps) {
  const tone = dayTone(dateKey, monthKey)
  const isOverflow = events.length > chipLimit
  const visible = isOverflow ? events.slice(0, chipLimit - 1) : events
  const day = Number(dateKey.slice(8, 10))

  const className = [
    'calendar-day',
    tone.weekday === 'sun' ? 'is-sunday' : '',
    tone.weekday === 'sat' ? 'is-saturday' : '',
    tone.isOutside ? 'is-outside' : '',
    tone.isToday ? 'is-today' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={className} onClick={() => onSelect(dateKey)} aria-label={`${Number(dateKey.slice(5, 7))}월 ${day}일, 일정 ${events.length}개`}>
      <span className="calendar-day-number">{day}</span>
      {visible.map(event => (
        <CalendarEventChip key={event.id} event={event} />
      ))}
      {isOverflow && <span className="calendar-more">+{events.length - visible.length}</span>}
    </button>
  )
}

export default CalendarGrid
