import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

// 아래로 이만큼 내리거나, 짧게라도 빠르게 튕기면 닫는다.
const CLOSE_DISTANCE = 90
const FLICK_VELOCITY = 0.11
const FLICK_MIN_DISTANCE = 20
const CLOSE_MS = 300

// isInList: 손가락이 스크롤되는 내역 목록 안에서 시작했나. 목록 밖(요약·정렬)은 목록 위치와 상관없이 늘 시트를 끈다.
type Drag = { startY: number; time: number; isDragging: boolean; isInList: boolean }

// 위로는 더 올라갈 곳이 없으니, 끌수록 덜 따라오게 해서 막힌 느낌 대신 고무줄처럼 버티게 한다.
const resist = (distance: number) => (distance >= 0 ? distance : -Math.sqrt(-distance) * 3)

// 입력칸이나 휠처럼 스스로 세로로 움직이는 곳에서는 시트를 끌지 않는다.
const isFormControl = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, select, textarea, [data-sheet-nodrag]')

type SheetDragOptions = {
  sheetRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  onClose: () => void
}

// 바닥에서 올라온 시트를 잡아 내려 닫고, 열려 있는 동안 뒤 화면은 스크롤되지 않게 막는다.
function useSheetDrag({ sheetRef, scrollRef, onClose }: SheetDragOptions) {
  const dragRef = useRef<Drag | null>(null)
  const onCloseRef = useRef(onClose)

  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    onCloseRef.current = onClose
  })

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
    window.setTimeout(() => onCloseRef.current(), CLOSE_MS)
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

  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [])

  // 시트 어디를 잡아도 내려서 닫을 수 있다. 다만 목록 안을 잡았는데 목록이 스크롤된 상태면 먼저 목록을 올리고,
  // 맨 위에 닿은 뒤 더 내릴 때부터 시트가 따라온다. 그래서 touchmove를 직접 막아야 해서 passive가 아니다.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    const handleTouchStart = (event: TouchEvent) => {
      if (isFormControl(event.target)) return
      const isInList = event.target instanceof Node && !!scrollRef.current?.contains(event.target)
      dragRef.current = { startY: event.touches[0].clientY, time: event.timeStamp, isDragging: false, isInList }
    }

    const handleTouchMove = (event: TouchEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const distance = event.touches[0].clientY - drag.startY
      const isScrolled = drag.isInList && (scrollRef.current?.scrollTop ?? 0) > 0
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
  const handleProps = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'mouse') return
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { startY: event.clientY, time: event.timeStamp, isDragging: true, isInList: false }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (event.pointerType !== 'mouse' || !drag) return
      moveSheet(resist(event.clientY - drag.startY), true)
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'mouse') return
      finishDrag(event.clientY, event.timeStamp)
    },
  }

  return { close, isClosing, handleProps }
}

export default useSheetDrag
