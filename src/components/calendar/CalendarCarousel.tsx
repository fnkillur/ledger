import { useLayoutEffect, useMemo, useRef, type PointerEvent } from 'react'
import { gridRange, overlapsRange, type CalendarEvent } from '../../domain/calendar'
import { shiftMonth } from '../../utils/format'
import CalendarGrid from './CalendarGrid'

// 손가락을 이만큼 움직여야 가로 넘기기로 본다. 그 전에는 탭인지 세로 움직임인지 모른다.
const DRAG_START_DISTANCE = 8
// 화면 폭의 이 비율 이상 끌거나, 짧게라도 빠르게 튕기면 달을 넘긴다.
const FLIP_RATIO = 0.2
const FLICK_VELOCITY = 0.11
const FLICK_MIN_DISTANCE = 40
const SETTLE_MS = 300
const CENTER = 'translateX(calc(-100% / 3))'

type CalendarCarouselProps = {
  monthKey: string
  events: CalendarEvent[]
  focusedDate: string | null
  onChangeMonth: (offset: 1 | -1) => void
  onSelectDay: (dateKey: string) => void
}

type Gesture = { x: number; y: number; time: number; isHorizontal: boolean | null }

// 끄는 동안에는 매 프레임 React를 다시 그리지 않도록 트랙의 transform을 직접 바꾼다.
function CalendarCarousel({ monthKey, events, focusedDate, onChangeMonth, onSelectDay }: CalendarCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const isSettlingRef = useRef(false)
  const didDragRef = useRef(false)

  const months = useMemo(() => [-1, 0, 1].map(offset => shiftMonth(monthKey, offset)), [monthKey])
  const eventsByMonth = useMemo(
    () =>
      months.map(month => {
        const { start, end } = gridRange(month)
        return events.filter(event => overlapsRange(event, start, end))
      }),
    [months, events],
  )

  // 달이 바뀐 직후, 화면에 그리기 전에 트랙을 가운데로 되돌려 이전 달이 비치지 않게 한다.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    track.classList.remove('is-settling')
    track.style.transform = CENTER
  }, [monthKey])

  const moveTrack = (offsetX: number) => {
    if (trackRef.current) trackRef.current.style.transform = `translateX(calc(-100% / 3 + ${offsetX}px))`
  }

  const settle = (offsetX: number, monthOffset?: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    isSettlingRef.current = true
    track.classList.add('is-settling')
    moveTrack(offsetX)
    window.setTimeout(() => {
      isSettlingRef.current = false
      if (monthOffset) {
        onChangeMonth(monthOffset)
        return
      }
      track.classList.remove('is-settling')
    }, SETTLE_MS)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isSettlingRef.current) return
    gestureRef.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, isHorizontal: null }
    didDragRef.current = false
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture) return
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    if (gesture.isHorizontal === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_START_DISTANCE) return
      gesture.isHorizontal = Math.abs(dx) > Math.abs(dy)
      if (gesture.isHorizontal) event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (!gesture.isHorizontal) return
    didDragRef.current = true
    moveTrack(dx)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    gestureRef.current = null
    if (!gesture?.isHorizontal) return
    const width = viewportRef.current?.clientWidth ?? 1
    const dx = event.clientX - gesture.x
    const velocity = Math.abs(dx) / Math.max(1, event.timeStamp - gesture.time)
    const isFlip = Math.abs(dx) > width * FLIP_RATIO || (velocity > FLICK_VELOCITY && Math.abs(dx) > FLICK_MIN_DISTANCE)
    if (!isFlip) {
      settle(0)
      return
    }
    settle(dx < 0 ? -width : width, dx < 0 ? 1 : -1)
  }

  const handleSelectDay = (dateKey: string) => {
    if (didDragRef.current) return
    onSelectDay(dateKey)
  }

  return (
    <div
      ref={viewportRef}
      className="cal-viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        if (!gestureRef.current?.isHorizontal) return
        gestureRef.current = null
        settle(0)
      }}
    >
      <div ref={trackRef} className="cal-track">
        {/* 자리(이전·현재·다음)마다 같은 그리드를 다시 써서, 달이 바뀌어도 칸 높이 계산이 처음부터 다시 돌지 않게 한다. */}
        {months.map((month, index) => (
          <CalendarGrid key={index} monthKey={month} events={eventsByMonth[index]} focusedDate={focusedDate} onSelectDay={handleSelectDay} />
        ))}
      </div>
    </div>
  )
}

export default CalendarCarousel
