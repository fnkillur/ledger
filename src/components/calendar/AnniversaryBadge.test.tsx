import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { saveSharedSettings } from '../../db/repository'
import AnniversaryBadge from './AnniversaryBadge'
import CalendarGrid from './CalendarGrid'
import DaySheet from './DaySheet'

let container: HTMLDivElement
let root: Root

const render = async (element: React.ReactNode) => {
  await act(async () => root.render(element))
  await act(() => new Promise(resolve => setTimeout(resolve, 30)))
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  await saveSharedSettings({ 월예산: 0, 월저축목표: 0, 기념일: { 사귄날: '2019-01-01', 결혼한날: '2023-01-01' } })
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

describe('기념일', () => {
  it('날짜를 넣기 전에는 캘린더 머리에 아무것도 보이지 않는다', async () => {
    await db.shared.clear()
    await render(<AnniversaryBadge todayKey="2026-11-11" />)

    expect(container.querySelector('.anniversary')).toBeNull()
  })

  it('캘린더 머리에 사귄 지·결혼한 지 날수를 늘 보여 주고, 누르면 날짜와 다음 기념일을 알려 준다', async () => {
    await render(<AnniversaryBadge todayKey="2026-11-11" />)

    const badge = container.querySelector('.anniversary-badge') as HTMLButtonElement
    expect(badge.textContent).toBe('2,872일1,411일')
    expect(container.querySelector('.anniversary-detail')).toBeNull()

    await act(async () => badge.click())
    const detail = container.querySelector('.anniversary-detail')?.textContent
    expect(detail).toContain('사귄 지 2,872일')
    expect(detail).toContain('2019. 1. 1.')
    expect(detail).toContain('결혼 1,411일')
    expect(detail).toContain('다음 기념일 · 사귄 지 2,900일 · 28일 남음')
  })

  it('설정에서 바꾼 날짜로 센다', async () => {
    await saveSharedSettings({ 월예산: 0, 월저축목표: 0, 기념일: { 사귄날: '2026-11-01', 결혼한날: '2026-11-11' } })
    await render(<AnniversaryBadge todayKey="2026-11-11" />)

    expect(container.querySelector('.anniversary-badge')?.textContent).toBe('11일1일')
  })

  it('한쪽 날짜만 넣었으면 그 줄만 보여 준다', async () => {
    await saveSharedSettings({ 월예산: 0, 월저축목표: 0, 기념일: { 사귄날: '2026-11-01' } })
    await render(<AnniversaryBadge todayKey="2026-11-11" />)

    expect(container.querySelector('.anniversary-badge')?.textContent).toBe('11일')
  })

  it('달력에서 기념일인 날에 하트를 붙이고, 칸을 읽어 줄 때 기념일도 말한다', async () => {
    await render(<CalendarGrid monthKey="2026-12" events={[]} focusedDate={null} onSelectDay={() => {}} />)

    const day = container.querySelector('[aria-label^="12월 9일"]') as HTMLElement
    expect(day.querySelector('.cal-anniversary')).not.toBeNull()
    expect(day.getAttribute('aria-label')).toContain('사귄 지 2,900일')
    expect(container.querySelector('[aria-label^="12월 8일"] .cal-anniversary')).toBeNull()
  })

  it('기념일인 날을 열면 일정이 없어도 기념일을 보여 준다', async () => {
    await render(
      <MemoryRouter>
        <DaySheet dateKey="2026-12-09" events={[]} anniversaries={['사귄 지 2,900일']} onClose={() => {}} />
      </MemoryRouter>,
    )

    expect(document.querySelector('.day-sheet-anniversaries')?.textContent).toContain('사귄 지 2,900일')
    expect(document.querySelector('.day-sheet-empty')).toBeNull()
  })
})
