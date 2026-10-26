import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../domain/calendar'
import { saveSettings } from '../sync/settings'
import { refreshCalendarMonth, saveAndRefresh } from './calendar'
import { db } from './database'

const event = (id: string): CalendarEvent => ({
  id,
  seriesId: null,
  originalStart: null,
  title: id,
  allDay: true,
  start: '2026-10-05',
  end: '2026-10-05',
  target: '공동',
  repeat: 'none',
})

let requests: URL[]

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  saveSettings({ endpoint: 'https://script.example/exec', token: 't', defaultPerson: '쿠리만쥬' })
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ ok: true, id: 'saved' })
      requests.push(new URL(url))
      return Response.json({ ok: true, events: [event('fresh')] })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('refreshCalendarMonth', () => {
  it('그리드 첫날부터 마지막 날까지 받아 그 달 캐시를 바꾼다', async () => {
    await db.calendarMonths.put({ monthKey: '2026-10', events: [event('old')], fetchedAt: '' })

    await refreshCalendarMonth('2026-10')

    expect(requests[0].searchParams.get('start')).toBe('2026-09-27')
    expect(requests[0].searchParams.get('end')).toBe('2026-10-31')
    expect((await db.calendarMonths.get('2026-10'))?.events.map(item => item.id)).toEqual(['fresh'])
  })

  it('서버 오류 문구를 그대로 던지고 캐시는 남긴다', async () => {
    await db.calendarMonths.put({ monthKey: '2026-10', events: [event('old')], fetchedAt: '' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: '캘린더가 연결되지 않았어요.' })))

    await expect(refreshCalendarMonth('2026-10')).rejects.toThrow('캘린더가 연결되지 않았어요.')
    expect((await db.calendarMonths.get('2026-10'))?.events.map(item => item.id)).toEqual(['old'])
  })

  it('연결 전이면 요청하지 않는다', async () => {
    saveSettings({ endpoint: '', token: '', defaultPerson: '쿠리만쥬' })

    await refreshCalendarMonth('2026-10')

    expect(requests).toEqual([])
  })
})

describe('saveAndRefresh', () => {
  it('저장한 뒤 보던 달은 다시 받고, 다른 달 캐시는 비워 다음에 새로 받게 한다', async () => {
    await db.calendarMonths.bulkPut([
      { monthKey: '2026-10', events: [event('old')], fetchedAt: '' },
      { monthKey: '2026-11', events: [event('stale')], fetchedAt: '' },
    ])

    await saveAndRefresh('2026-10', settings => Promise.resolve(settings.token))

    expect((await db.calendarMonths.get('2026-10'))?.events.map(item => item.id)).toEqual(['fresh'])
    expect(await db.calendarMonths.get('2026-11')).toBeUndefined()
  })

  it('연결 전이면 저장하지 않고 안내 문구를 던진다', async () => {
    saveSettings({ endpoint: '', token: '', defaultPerson: '쿠리만쥬' })
    const write = vi.fn()

    await expect(saveAndRefresh('2026-10', write)).rejects.toThrow('구글 시트와 아직 연결되지 않았어요.')
    expect(write).not.toHaveBeenCalled()
  })
})
