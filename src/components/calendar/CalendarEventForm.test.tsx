import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/database'
import type { CalendarEvent } from '../../domain/calendar'
import { saveSettings } from '../../sync/settings'
import CalendarEventForm from './CalendarEventForm'

let container: HTMLDivElement
let root: Root

const pilates: CalendarEvent = {
  id: 'p1',
  seriesId: null,
  originalStart: null,
  title: '필라테스',
  allDay: false,
  start: '2026-10-08T19:00:00+09:00',
  end: '2026-10-08T20:00:00+09:00',
  target: '우사기',
  repeat: 'none',
}

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))
const titleInput = () => container.querySelector<HTMLInputElement>('input[aria-label="일정 이름"]')!
const suggestionButtons = () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="예전 일정 추천"] button')]

// React가 관리하는 입력칸에 글자를 넣을 때는 값 설정자를 거쳐 input 이벤트를 보내야 onChange가 불린다.
const type = async (value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(titleInput(), value)
    titleInput().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  await db.calendarEvents.put(pilates)
  saveSettings({ endpoint: '', token: '', defaultPerson: '쿠리만쥬' })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('일정 이름 추천', () => {
  it('글자를 치기 전에는 추천하지 않고, 치면 예전 일정을 추천해 고르면 시간까지 채운다', async () => {
    await act(async () => root.render(<MemoryRouter><CalendarEventForm date="2026-11-20" layout="page" onDone={() => {}} onCancel={() => {}} /></MemoryRouter>))
    await wait()
    expect(suggestionButtons()).toHaveLength(0)

    await type('필')
    await wait()
    expect(suggestionButtons().map(button => button.textContent)).toEqual(['필라테스오후 7:00'])

    await act(async () => suggestionButtons()[0].click())
    expect(titleInput().value).toBe('필라테스')
    expect(container.textContent).toContain('오후 7:00')
    expect(container.textContent).toContain('11월 20일')
    expect(suggestionButtons()).toHaveLength(0)
  })

  it('일정을 고칠 때는 추천하지 않는다', async () => {
    await act(async () =>
      root.render(<MemoryRouter><CalendarEventForm event={{ ...pilates, title: '필' }} date="2026-10-08" layout="page" onDone={() => {}} onCancel={() => {}} /></MemoryRouter>),
    )
    await wait()
    await type('필라')
    await wait()
    expect(suggestionButtons()).toHaveLength(0)
  })
})
