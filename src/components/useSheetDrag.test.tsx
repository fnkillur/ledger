import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useSheetDrag from './useSheetDrag'

let container: HTMLDivElement
let root: Root

function Sheet({ onClose }: { onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useSheetDrag({ sheetRef, scrollRef, onClose })

  return (
    <div ref={sheetRef} className="sheet">
      <div className="header">요약</div>
      <div ref={scrollRef} className="list">
        <p className="row">내역</p>
      </div>
    </div>
  )
}

// jsdom에는 Touch 생성자가 없어서 손가락 위치만 담은 이벤트를 직접 만든다.
const touch = (target: Element, type: string, clientY: number, timeStamp: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const point = [{ clientY }]
  Object.defineProperties(event, { touches: { value: point }, changedTouches: { value: point }, timeStamp: { value: timeStamp } })
  target.dispatchEvent(event)
}

const dragDown = (target: Element) => {
  touch(target, 'touchstart', 100, 0)
  touch(target, 'touchmove', 130, 50)
  touch(target, 'touchmove', 300, 200)
  touch(target, 'touchend', 300, 210)
}

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useSheetDrag', () => {
  it('목록이 스크롤돼 있어도 목록 밖(위쪽 요약)을 잡아 내리면 닫힌다', () => {
    const onClose = vi.fn()
    act(() => root.render(<Sheet onClose={onClose} />))
    container.querySelector('.list')!.scrollTop = 200

    act(() => dragDown(container.querySelector('.header')!))
    act(() => vi.runAllTimers())

    expect(onClose).toHaveBeenCalled()
  })

  it('목록이 스크롤돼 있을 때 목록 안을 내리면 시트 대신 목록이 움직인다', () => {
    const onClose = vi.fn()
    act(() => root.render(<Sheet onClose={onClose} />))
    container.querySelector('.list')!.scrollTop = 200

    act(() => dragDown(container.querySelector('.row')!))
    act(() => vi.runAllTimers())

    expect(onClose).not.toHaveBeenCalled()
  })
})
