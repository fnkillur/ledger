import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { dayTone, monthGrid, weekLayout, type CalendarEvent } from '../../domain/calendar'
import CalendarEventChip from './CalendarEventChip'

// 날짜 숫자 줄 높이와 주 아래쪽 여백.
const WEEK_CHROME_HEIGHT = 26
const LANE_STEP = 20

type CalendarGridProps = {
  monthKey: string
  events: CalendarEvent[]
  focusedDate: string | null
  onSelectDay: (dateKey: string) => void
}

function CalendarGrid({ monthKey, events, focusedDate, onSelectDay }: CalendarGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={gridRef} className="cal-grid" style={{ '--weeks': weeks.length } as CSSProperties}>
      {weeks.map(week => (
        <CalendarWeek key={week[0]} week={week} monthKey={monthKey} events={events} maxLanes={maxLanes} focusedDate={focusedDate} onSelect={onSelectDay} />
      ))}
    </div>
  )
}

type CalendarWeekProps = {
  week: string[]
  monthKey: string
  events: CalendarEvent[]
  maxLanes: number
  focusedDate: string | null
  onSelect: (dateKey: string) => void
}

function CalendarWeek({ week, monthKey, events, maxLanes, focusedDate, onSelect }: CalendarWeekProps) {
  const { bars, hidden, moreLane } = weekLayout(week, events, maxLanes)

  return (
    <div className="cal-week">
      {week.map((dateKey, column) => (
        <CalendarDay key={dateKey} dateKey={dateKey} monthKey={monthKey} column={column} isFocused={dateKey === focusedDate} onSelect={onSelect} />
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
  isFocused: boolean
  onSelect: (dateKey: string) => void
}

function CalendarDay({ dateKey, monthKey, column, isFocused, onSelect }: CalendarDayProps) {
  const tone = dayTone(dateKey, monthKey)
  const day = Number(dateKey.slice(8, 10))

  const className = [
    'cal-day',
    tone.weekday === 'sun' ? 'is-sunday' : '',
    tone.weekday === 'sat' ? 'is-saturday' : '',
    tone.isOutside ? 'is-outside' : '',
    tone.isToday ? 'is-today' : '',
    isFocused ? 'is-focused' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      style={{ gridColumn: column + 1 }}
      aria-pressed={isFocused}
      onClick={() => onSelect(dateKey)}
      aria-label={`${Number(dateKey.slice(5, 7))}월 ${day}일`}
    >
      <span className="cal-day-number">{day}</span>
    </button>
  )
}

export default CalendarGrid
