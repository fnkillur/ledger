import { PlusIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import kurimanjuThinking from '../../assets/stickers/kurimanju/thinking.webp'
import usagiSigh from '../../assets/stickers/usagi/sigh.webp'
import { usePersonName } from '../../db/hooks'
import { isDayInfo, REPEAT_LABEL, TARGET_TONE, targetLabel, type CalendarEvent } from '../../domain/calendar'
import { IS_WEB_BUILD } from '../../platform'
import { formatTime, toDateKey } from '../../utils/format'
import CalendarEventForm from './CalendarEventForm'
import { DayInfoIcon, TargetAvatars } from './CalendarEventChip'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
// 아래로 이만큼 내리거나, 짧게라도 빠르게 튕기면 닫는다.
const CLOSE_DISTANCE = 90
const FLICK_VELOCITY = 0.11
const FLICK_MIN_DISTANCE = 20
const CLOSE_MS = 300
// 웹(아이폰)은 우사기, 안드로이드 앱은 쿠리만쥬가 일정 추가 버튼을 지킨다.
const ADD_STICKER = IS_WEB_BUILD ? usagiSigh : kurimanjuThinking

export type DaySheetView = { type: 'list' } | { type: 'form'; event?: CalendarEvent }

type DaySheetProps = {
  dateKey: string
  events: CalendarEvent[]
  initialView?: DaySheetView
  onClose: () => void
}

type Drag = { startY: number; time: number; isDragging: boolean }

const formatDayTitle = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일 (${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`
}

const formatShortDate = (dateKey: string) => `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`

// 카드 왼쪽 시간 칸: 위에는 시작, 아래에는 끝. 다른 날에 걸치면 날짜를 붙인다.
const timeColumn = (event: CalendarEvent, dateKey: string) => {
  if (event.allDay) {
    if (event.start === event.end) return { top: '종일', bottom: '' }
    return { top: formatShortDate(event.start), bottom: `~${formatShortDate(event.end)}` }
  }
  const startDay = toDateKey(event.start)
  const endDay = toDateKey(event.end)
  return {
    top: startDay === dateKey ? formatTime(event.start) : formatShortDate(startDay),
    bottom: endDay === dateKey ? formatTime(event.end) : `~${formatShortDate(endDay)}`,
  }
}

// 위로는 더 올라갈 곳이 없으니, 끌수록 덜 따라오게 해서 막힌 느낌 대신 고무줄처럼 버티게 한다.
const resist = (distance: number) => (distance >= 0 ? distance : -Math.sqrt(-distance) * 3)

// 입력칸이나 휠처럼 스스로 세로로 움직이는 곳에서는 시트를 끌지 않는다.
const isFormControl = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, select, textarea, [data-sheet-nodrag]')

function DaySheet({ dateKey, events, initialView = { type: 'list' }, onClose }: DaySheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)

  const [view, setView] = useState<DaySheetView>(initialView)
  const [isClosing, setIsClosing] = useState(false)

  // 끄는 동안에는 React를 다시 그리지 않고 시트의 transform만 바꾼다.
  const moveSheet = (offset: number, isDragging: boolean) => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.classList.toggle('is-dragging', isDragging)
    sheet.style.transform = `translateY(${offset}px)`
  }

  const close = () => {
    moveSheet(sheetRef.current?.offsetHeight ?? window.innerHeight, false)
    setIsClosing(true)
    window.setTimeout(onClose, CLOSE_MS)
  }

  const finishDrag = (endY: number, time: number) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.isDragging) return
    const distance = endY - drag.startY
    const velocity = distance / Math.max(1, time - drag.time)
    if (distance > CLOSE_DISTANCE || (velocity > FLICK_VELOCITY && distance > FLICK_MIN_DISTANCE)) {
      close()
      return
    }
    moveSheet(0, false)
  }

  // 시트 어디를 잡아도 내려서 닫을 수 있다. 다만 안쪽 목록이 스크롤된 상태면 먼저 목록을 올리고,
  // 맨 위에 닿은 뒤 더 내릴 때부터 시트가 따라온다. 그래서 touchmove를 직접 막아야 해서 passive가 아니다.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const handleTouchStart = (event: TouchEvent) => {
      if (isFormControl(event.target)) return
      dragRef.current = { startY: event.touches[0].clientY, time: event.timeStamp, isDragging: false }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const distance = event.touches[0].clientY - drag.startY
      const isScrolled = (scrollRef.current?.scrollTop ?? 0) > 0
      if (!drag.isDragging) {
        if (isScrolled || distance <= 0) {
          dragRef.current = null
          return
        }
        drag.isDragging = true
        drag.startY = event.touches[0].clientY
        drag.time = event.timeStamp
      }
      event.preventDefault()
      moveSheet(resist(event.touches[0].clientY - drag.startY), true)
    }

    const handleTouchEnd = (event: TouchEvent) => finishDrag(event.changedTouches[0].clientY, event.timeStamp)

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true })
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false })
    sheet.addEventListener('touchend', handleTouchEnd)
    sheet.addEventListener('touchcancel', handleTouchEnd)
    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart)
      sheet.removeEventListener('touchmove', handleTouchMove)
      sheet.removeEventListener('touchend', handleTouchEnd)
      sheet.removeEventListener('touchcancel', handleTouchEnd)
    }
    // finishDrag·moveSheet는 ref만 쓰므로 처음 한 번 연결하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 마우스로 개발할 때를 위해 손잡이는 포인터로도 끌 수 있게 둔다.
  const handleHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startY: event.clientY, time: event.timeStamp, isDragging: true }
  }

  const handleHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (event.pointerType !== 'mouse' || !drag) return
    moveSheet(resist(event.clientY - drag.startY), true)
  }

  const handleHandlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    finishDrag(event.clientY, event.timeStamp)
  }

  const showList = () => {
    setView({ type: 'list' })
    scrollRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className={`sheet-backdrop day-sheet-backdrop${isClosing ? ' is-closing' : ''}`} onClick={close}>
      <div ref={sheetRef} className="day-sheet" role="dialog" aria-label={formatDayTitle(dateKey)} onClick={event => event.stopPropagation()}>
        <div
          className="day-sheet-handle"
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
        >
          <span className="day-sheet-grabber" aria-hidden="true" />
          {view.type === 'list' && <h2>{formatDayTitle(dateKey)}</h2>}
        </div>

        {view.type === 'list' ? (
          <div key="list" className="day-sheet-view">
            <div ref={scrollRef} className="day-sheet-scroll">
              {events.length === 0 && <p className="day-sheet-empty">이 날은 아직 일정이 없어요.</p>}
              <ul className="day-sheet-list">
                {events.map(event => (
                  <li key={event.id}>
                    <button type="button" className={`day-sheet-item ${TARGET_TONE[event.target]}`} onClick={() => setView({ type: 'form', event })}>
                      <EventCard event={event} dateKey={dateKey} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="day-sheet-footer">
              <button type="button" className="add-sticker" onClick={() => setView({ type: 'form' })} aria-label="일정 추가">
                <img src={ADD_STICKER} alt="" className="add-sticker-image" draggable={false} />
                <span className="add-sticker-plus" aria-hidden="true">
                  <PlusIcon size={16} weight="bold" />
                </span>
                <span className="add-sticker-label">일정 추가</span>
              </button>
            </div>
          </div>
        ) : (
          <div key={view.event?.id ?? 'new'} ref={scrollRef} className="day-sheet-view day-sheet-scroll is-form">
            <CalendarEventForm event={view.event} date={dateKey} layout="sheet" onDone={showList} onCancel={showList} />
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, dateKey }: { event: CalendarEvent; dateKey: string }) {
  const personName = usePersonName()

  const time = timeColumn(event, dateKey)

  return (
    <>
      <span className="day-sheet-time">
        <strong>{time.top}</strong>
        {time.bottom && <span>{time.bottom}</span>}
      </span>
      <span className="day-sheet-accent" aria-hidden="true" />
      <span className="day-sheet-main">
        <strong>{event.title}</strong>
        <span className="day-sheet-meta">
          {isDayInfo(event.target) ? <DayInfoIcon target={event.target} size={16} /> : <TargetAvatars target={event.target} size={16} />}
          {targetLabel(event.target, personName)}
          {event.repeat !== 'none' && ` · ${REPEAT_LABEL[event.repeat]}`}
        </span>
      </span>
    </>
  )
}

export default DaySheet
