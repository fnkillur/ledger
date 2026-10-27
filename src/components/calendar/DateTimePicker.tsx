import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { monthGrid } from '../../domain/calendar'
import { formatDatePill, formatTimePill } from '../../domain/calendarForm'
import { IS_WEB_BUILD } from '../../platform'
import { shiftMonth, toDateKey } from '../../utils/format'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const WHEEL_ITEM_HEIGHT = 36
const WHEEL_SETTLE_MS = 120
const PERIODS = ['오전', '오후']
const HOURS = Array.from({ length: 12 }, (_, index) => String(index === 0 ? 12 : index))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

const THIS_YEAR = new Date().getFullYear()

const pad = (value: number) => String(value).padStart(2, '0')

type DateTimeRowProps = {
  label: string
  pickerId: string
  date: string
  time: string
  minDate?: string
  showTime: boolean
  isInvalid?: boolean
  opened: string | null
  onToggle: (picker: string) => void
  onDate: (date: string) => void
  onTime: (time: string) => void
}

// 아이폰 웹은 기본 날짜·시간 창이 쓸 만해서 그대로 두고, 안드로이드 앱은 행 아래에 펼치는 선택기를 쓴다.
export function DateTimeRow({ label, pickerId, date, time, minDate, showTime, isInvalid = false, opened, onToggle, onDate, onTime }: DateTimeRowProps) {
  const dateKey = `${pickerId}-date`
  const timeKey = `${pickerId}-time`
  const invalidClass = isInvalid ? ' is-invalid' : ''

  if (IS_WEB_BUILD) {
    return (
      <div className="form-row">
        <span>{label}</span>
        <div className="pill-group">
          <input
            className={`pill-input${invalidClass}`}
            type="date"
            aria-label={`${label} 날짜`}
            min={minDate}
            value={date}
            onChange={changeEvent => changeEvent.target.value && onDate(changeEvent.target.value)}
          />
          {showTime && (
            <input
              className={`pill-input${invalidClass}`}
              type="time"
              aria-label={`${label} 시간`}
              value={time}
              onChange={changeEvent => changeEvent.target.value && onTime(changeEvent.target.value)}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="form-row">
        <span>{label}</span>
        <div className="pill-group">
          <button
            type="button"
            className={`pill-input${invalidClass}${opened === dateKey ? ' is-open' : ''}`}
            aria-label={`${label} 날짜`}
            aria-expanded={opened === dateKey}
            onClick={() => onToggle(dateKey)}
          >
            {formatDatePill(date, THIS_YEAR)}
          </button>
          {showTime && (
            <button
              type="button"
              className={`pill-input${invalidClass}${opened === timeKey ? ' is-open' : ''}`}
              aria-label={`${label} 시간`}
              aria-expanded={opened === timeKey}
              onClick={() => onToggle(timeKey)}
            >
              {formatTimePill(time)}
            </button>
          )}
        </div>
      </div>
      {opened === dateKey && (
        <div className="form-row form-row-picker">
          <CalendarPicker value={date} min={minDate} onChange={onDate} />
        </div>
      )}
      {opened === timeKey && showTime && (
        <div className="form-row form-row-picker">
          <TimeWheel value={time} onChange={onTime} />
        </div>
      )}
    </>
  )
}

type CalendarPickerProps = {
  value: string
  min?: string
  onChange: (dateKey: string) => void
}

// 안드로이드 기본 날짜 창 대신, 아이폰 캘린더처럼 행 아래에 펼쳐지는 달력.
export function CalendarPicker({ value, min, onChange }: CalendarPickerProps) {
  const [monthKey, setMonthKey] = useState(value.slice(0, 7))
  const [todayKey] = useState(() => toDateKey(new Date().toISOString()))

  const [year, month] = monthKey.split('-').map(Number)
  const weeks = monthGrid(monthKey).filter(week => week.some(day => day.startsWith(monthKey)))

  return (
    <div className="calendar-picker">
      <div className="calendar-picker-header">
        <strong>
          {year}년 {month}월
        </strong>
        <button type="button" className="icon-button" aria-label="이전 달" onClick={() => setMonthKey(shiftMonth(monthKey, -1))}>
          <CaretLeftIcon size={20} weight="bold" />
        </button>
        <button type="button" className="icon-button" aria-label="다음 달" onClick={() => setMonthKey(shiftMonth(monthKey, 1))}>
          <CaretRightIcon size={20} weight="bold" />
        </button>
      </div>
      <div className="calendar-picker-grid" role="grid">
        {WEEKDAYS.map(weekday => (
          <span key={weekday} className="calendar-picker-weekday">
            {weekday}
          </span>
        ))}
        {weeks.flat().map(day => {
          if (!day.startsWith(monthKey)) return <span key={day} />
          const className = ['calendar-picker-day', day === value ? 'is-selected' : '', day === todayKey ? 'is-today' : ''].filter(Boolean).join(' ')
          return (
            <button key={day} type="button" className={className} disabled={!!min && day < min} onClick={() => onChange(day)}>
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type TimeWheelProps = {
  value: string
  onChange: (time: string) => void
}

// 오전·오후, 시, 분 세 줄을 굴려서 고른다.
export function TimeWheel({ value, onChange }: TimeWheelProps) {
  const [hour, minute] = value.split(':').map(Number)
  const period = hour < 12 ? 0 : 1
  const hourIndex = hour % 12

  const change = (nextPeriod: number, nextHourIndex: number, nextMinute: number) =>
    onChange(`${pad(nextPeriod * 12 + nextHourIndex)}:${pad(nextMinute)}`)

  return (
    <div className="time-wheel" data-sheet-nodrag>
      <span className="time-wheel-band" aria-hidden="true" />
      <WheelColumn label="오전 오후" items={PERIODS} index={period} onSelect={index => change(index, hourIndex, minute)} />
      <WheelColumn label="시" items={HOURS} index={hourIndex} onSelect={index => change(period, index, minute)} />
      <WheelColumn label="분" items={MINUTES} index={minute} onSelect={index => change(period, hourIndex, index)} />
    </div>
  )
}

type WheelColumnProps = {
  label: string
  items: string[]
  index: number
  onSelect: (index: number) => void
}

function WheelColumn({ label, items, index, onSelect }: WheelColumnProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const settleRef = useRef<number | undefined>(undefined)
  const isScrollingRef = useRef(false)

  // 손으로 굴리는 중이 아닐 때만 바깥 값에 맞춰 위치를 옮긴다.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || isScrollingRef.current) return
    list.scrollTop = index * WHEEL_ITEM_HEIGHT
  }, [index])

  useEffect(() => () => window.clearTimeout(settleRef.current), [])

  const handleScroll = () => {
    isScrollingRef.current = true
    window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      isScrollingRef.current = false
      const list = listRef.current
      if (!list) return
      const nextIndex = Math.min(items.length - 1, Math.max(0, Math.round(list.scrollTop / WHEEL_ITEM_HEIGHT)))
      if (nextIndex !== index) onSelect(nextIndex)
    }, WHEEL_SETTLE_MS)
  }

  const scrollToItem = (itemIndex: number) => listRef.current?.scrollTo({ top: itemIndex * WHEEL_ITEM_HEIGHT, behavior: 'smooth' })

  return (
    <div ref={listRef} className="wheel-column" role="listbox" aria-label={label} onScroll={handleScroll}>
      {items.map((item, itemIndex) => (
        <button
          key={item}
          type="button"
          role="option"
          aria-selected={itemIndex === index}
          className="wheel-item"
          onClick={() => scrollToItem(itemIndex)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}
