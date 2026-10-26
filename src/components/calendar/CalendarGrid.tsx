import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { dayTone, monthGrid, weekLayout, type CalendarEvent } from '../../domain/calendar'
import CalendarEventChip from './CalendarEventChip'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
// 날짜 숫자 줄 높이와 주 아래쪽 여백.
const WEEK_CHROME_HEIGHT = 26
const LANE_STEP = 20
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

  const [maxLanes, setMaxLanes] = useState(3)

  const weeks = monthGrid(monthKey)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const observer = new ResizeObserver(() => {
      const weekHeight = grid.clientHeight / weeks.length
      setMaxLanes(Math.max(1, Math.floor((weekHeight - WEEK_CHROME_HEIGHT) / LANE_STEP)))
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
    <div className="cal">
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((label, index) => (
          <span key={label} className={weekdayClass(index)}>
            {label}
          </span>
        ))}
      </div>
      <div
        ref={gridRef}
        className="cal-grid"
        style={{ '--weeks': weeks.length } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (pointerStartRef.current = null)}
      >
        {weeks.map(week => (
          <CalendarWeek key={week[0]} week={week} monthKey={monthKey} events={events} maxLanes={maxLanes} onSelect={handleSelect} />
        ))}
      </div>
    </div>
  )
}

type CalendarWeekProps = {
  week: string[]
  monthKey: string
  events: CalendarEvent[]
  maxLanes: number
  onSelect: (dateKey: string) => void
}

function CalendarWeek({ week, monthKey, events, maxLanes, onSelect }: CalendarWeekProps) {
  const { bars, hidden, moreLane } = weekLayout(week, events, maxLanes)

  return (
    <div className="cal-week">
      {week.map((dateKey, column) => (
        <CalendarDay key={dateKey} dateKey={dateKey} monthKey={monthKey} column={column} onSelect={onSelect} />
      ))}
      {bars.map(bar => (
        <CalendarEventChip key={`${bar.event.id}-${week[0]}`} bar={bar} />
      ))}
      {moreLane !== null &&
        hidden.map(
          (count, column) =>
            count > 0 && (
              <span key={week[column]} className="cal-more" style={{ gridColumn: column + 1, gridRow: moreLane + 2 }}>
                +{count}
              </span>
            ),
        )}
    </div>
  )
}

type CalendarDayProps = {
  dateKey: string
  monthKey: string
  column: number
  onSelect: (dateKey: string) => void
}

function CalendarDay({ dateKey, monthKey, column, onSelect }: CalendarDayProps) {
  const tone = dayTone(dateKey, monthKey)
  const day = Number(dateKey.slice(8, 10))

  const className = [
    'cal-day',
    tone.weekday === 'sun' ? 'is-sunday' : '',
    tone.weekday === 'sat' ? 'is-saturday' : '',
    tone.isOutside ? 'is-outside' : '',
    tone.isToday ? 'is-today' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      style={{ gridColumn: column + 1 }}
      onClick={() => onSelect(dateKey)}
      aria-label={`${Number(dateKey.slice(5, 7))}월 ${day}일`}
    >
      <span className="cal-day-number">{day}</span>
    </button>
  )
}

export default CalendarGrid
