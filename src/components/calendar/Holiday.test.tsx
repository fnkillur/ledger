import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import CalendarGrid from './CalendarGrid'
import DaySheet from './DaySheet'

let container: HTMLDivElement
let root: Root

const render = async (element: React.ReactNode) => {
  await act(async () => root.render(element))
  await act(() => new Promise(resolve => setTimeout(resolve, 30)))
}

const dayButton = (label: string) => container.querySelector(`.cal-day[aria-label^="${label}"]`) as HTMLButtonElement

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  await db.holidays.bulkPut([{ date: '2026-09-25', name: '추석' }])
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('공휴일', () => {
  it('달력에서 공휴일 날짜는 빨간 날로 칠하고, 읽어 줄 때 이름도 알려 준다', async () => {
    await render(<CalendarGrid monthKey="2026-09" events={[]} focusedDate={null} onSelectDay={() => {}} />)

    const holiday = dayButton('9월 25일')
    expect(holiday.classList.contains('is-holiday')).toBe(true)
    expect(holiday.getAttribute('aria-label')).toBe('9월 25일, 추석')
    expect(dayButton('9월 24일').classList.contains('is-holiday')).toBe(false)
  })

  it('날짜 시트 맨 위에 공휴일 이름을 보여 준다', async () => {
    await render(
      <MemoryRouter>
        <DaySheet dateKey="2026-09-25" events={[]} holiday="추석" onClose={() => {}} />
      </MemoryRouter>,
    )

    expect(document.querySelector('.day-sheet-holiday')?.textContent).toBe('추석')
    expect(document.querySelector('.day-sheet-empty')).toBeNull()
  })
})
