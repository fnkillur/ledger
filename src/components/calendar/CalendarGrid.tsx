import { HeartIcon } from '@phosphor-icons/react'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useHolidays } from '../../db/calendar'
import { useAnniversaries } from '../../db/hooks'
import { anniversaryLabels, type Anniversaries } from '../../domain/anniversary'
import { dayTone, monthGrid, weekLayout, withHolidays, type CalendarEvent } from '../../domain/calendar'
import CalendarEventChip from './CalendarEventChip'

// 날짜 숫자 줄 높이와 주 아래쪽 여백.
const WEEK_CHROME_HEIGHT = 26
const LANE_STEP = 20
const DEFAULT_LANES = 3

type CalendarGridProps = {
  monthKey: string
  events: CalendarEvent[]
  focusedDate: string | null
  cycleDates?: ReadonlySet<string>
  onSelectDay: (dateKey: string) => void
}

function CalendarGrid({ monthKey, events, focusedDate, cycleDates, onSelectDay }: CalendarGridProps) {
  const anniversaries = useAnniversaries()
  const holidays = useHolidays()

  const gridRef = useRef<HTMLDivElement>(null)

  const [gridHeight, setGridHeight] = useState<number | null>(null)

  const weeks = monthGrid(monthKey)
  const eventsWithHolidays = withHolidays(events, holidays)
  // 달 높이는 그대로고 주 수(5·6주)만 바뀌므로, 줄 수를 그릴 때 바로 계산해야 달을 넘긴 직후 한 번 접혔다 펴지지 않는다.
  const maxLanes = gridHeight === null ? DEFAULT_LANES : Math.max(1, Math.floor((gridHeight / weeks.length - WEEK_CHROME_HEIGHT) / LANE_STEP))

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    // 아직 화면에 펼쳐지지 않아 높이가 0이면 모르는 것으로 둔다.
    const measure = () => setGridHeight(grid.clientHeight || null)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={gridRef} className="cal-grid" style={{ '--weeks': weeks.length } as CSSProperties}>
      {weeks.map(week => (
        <CalendarWeek
          key={week[0]}
          week={week}
          monthKey={monthKey}
          events={eventsWithHolidays}
          maxLanes={maxLanes}
          focusedDate={focusedDate}
          cycleDates={cycleDates}
          anniversaries={anniversaries}
          holidays={holidays}
          onSelect={onSelectDay}
        />
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
  cycleDates?: ReadonlySet<string>
  anniversaries: Anniversaries
  holidays: ReadonlyMap<string, string>
  onSelect: (dateKey: string) => void
}

function CalendarWeek({ week, monthKey, events, maxLanes, focusedDate, cycleDates, anniversaries, holidays, onSelect }: CalendarWeekProps) {
  const { bars, hidden, moreLane } = weekLayout(week, events, maxLanes)

  return (
    <div className="cal-week">
      {week.map((dateKey, column) => (
        <CalendarDay
          key={dateKey}
          dateKey={dateKey}
          monthKey={monthKey}
          column={column}
          isFocused={dateKey === focusedDate}
          hasCycle={cycleDates?.has(dateKey) ?? false}
          holiday={holidays.get(dateKey)}
          anniversaryLabels={anniversaryLabels(dateKey, anniversaries)}
          onSelect={onSelect}
        />
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
  hasCycle: boolean
  holiday?: string
  anniversaryLabels: string[]
  onSelect: (dateKey: string) => void
}

function CalendarDay({ dateKey, monthKey, column, isFocused, hasCycle, holiday, anniversaryLabels, onSelect }: CalendarDayProps) {
  const tone = dayTone(dateKey, monthKey)
  const day = Number(dateKey.slice(8, 10))

  const className = [
    'cal-day',
    tone.weekday === 'sun' ? 'is-sunday' : '',
    tone.weekday === 'sat' ? 'is-saturday' : '',
    holiday ? 'is-holiday' : '',
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
      aria-label={[`${Number(dateKey.slice(5, 7))}월 ${day}일`, ...(holiday ? [holiday] : []), ...anniversaryLabels, ...(hasCycle ? ['교체할 것 있음'] : [])].join(', ')}
    >
      <span className="cal-day-number">{day}</span>
      {anniversaryLabels.length > 0 && <HeartIcon className="cal-anniversary" size={9} weight="fill" aria-hidden="true" />}
      {hasCycle && <span className="cal-cycle-dot" aria-hidden="true" />}
    </button>
  )
}

export default CalendarGrid
