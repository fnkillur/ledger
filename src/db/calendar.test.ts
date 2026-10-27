import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, CalendarEventInput } from '../domain/calendar'
import { saveSettings } from '../sync/settings'
import { deleteEvent, ensureMonth, saveEvent, syncCalendar } from './calendar'
import { db } from './database'

const event = (id: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  seriesId: null,
  originalStart: null,
  title: id,
  allDay: true,
  start: '2026-10-05',
  end: '2026-10-05',
  target: '공동',
  repeat: 'none',
  ...overrides,
})

const input = (title: string): CalendarEventInput => ({ title, allDay: true, start: '2026-10-07', end: '2026-10-07', target: '우사기', repeat: 'none' })

let serverEvents: CalendarEvent[]
let reads: URL[]
let writes: Record<string, unknown>[]
let isOnline: boolean
let serverStatus: number

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 26, 12))
  await Promise.all(db.tables.map(table => table.clear()))
  saveSettings({ endpoint: 'https://script.example/exec', token: 't', defaultPerson: '쿠리만쥬' })
  serverEvents = [event('server-1')]
  reads = []
  writes = []
  isOnline = true
  serverStatus = 200
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (!isOnline) throw new TypeError('Failed to fetch')
      if (serverStatus !== 200) return new Response('error', { status: serverStatus })
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        writes.push(body)
        if (body.event?.title === '거절') return Response.json({ ok: false, error: '대상이 올바르지 않아요.' })
        return Response.json({ ok: true, id: 'saved' })
      }
      reads.push(new URL(url))
      return Response.json({ ok: true, events: serverEvents })
    }),
  )
})

// 저장·삭제가 뒤에서 시작한 동기화가 다음 테스트로 넘어가지 않게 끝까지 기다린다.
afterEach(async () => {
  await syncCalendar()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('syncCalendar', () => {
  it('이번 달 앞뒤 12개월을 받아 앱에 저장한다', async () => {
    await syncCalendar()

    expect(reads[0].searchParams.get('start')).toBe('2025-09-28')
    expect(reads[0].searchParams.get('end')).toBe('2027-11-06')
    expect((await db.calendarEvents.toArray()).map(item => item.id)).toEqual(['server-1'])
  })

  it('인터넷이 없으면 저장한 일정은 앱에 먼저 보이고 대기열에 남는다', async () => {
    isOnline = false

    await saveEvent(input('병원'))
    await syncCalendar()

    const local = await db.calendarEvents.toArray()
    expect(local.map(item => item.title)).toEqual(['병원'])
    expect(local[0].id.startsWith('local-')).toBe(true)
    expect(await db.calendarOutbox.count()).toBe(1)
    expect((await db.calendarMeta.get('window'))?.error).toBe('인터넷 연결을 확인해 주세요.')
  })

  it('다시 연결되면 대기열을 보내고 서버 기준으로 바꿔 끼운다', async () => {
    isOnline = false
    await saveEvent(input('병원'))
    await syncCalendar()
    isOnline = true
    serverEvents = [event('server-1'), event('server-2', { title: '병원' })]

    await syncCalendar()

    expect(writes.map(body => body.action)).toEqual(['calendarSave'])
    expect(await db.calendarOutbox.count()).toBe(0)
    expect((await db.calendarEvents.toArray()).map(item => item.id).sort()).toEqual(['server-1', 'server-2'])
    expect((await db.calendarMeta.get('window'))?.error).toBeUndefined()
  })

  it('서버가 잠시 응답하지 못하면(500) 보낼 작업을 남겨 두고, 나중에 보내며 닉네임과 함께 누가 했는지 알린다', async () => {
    serverStatus = 500

    await saveEvent(input('병원'))
    await syncCalendar()

    expect(await db.calendarOutbox.count()).toBe(1)
    expect((await db.calendarMeta.get('window'))?.error).toBe('시트 서버가 잠시 응답하지 못했어요. (500)')

    serverStatus = 200
    await syncCalendar()

    expect(await db.calendarOutbox.count()).toBe(0)
    expect(writes.at(-1)?.actor).toEqual({ person: '쿠리만쥬', name: '쿠리만쥬' })
  })

  it('서버가 거절한 작업은 버리고 이유를 남긴다', async () => {
    await saveEvent(input('거절'))
    await syncCalendar()

    expect(await db.calendarOutbox.count()).toBe(0)
    expect((await db.calendarMeta.get('window'))?.error).toBe('대상이 올바르지 않아요.')
  })
})

describe('대기 중인 새 일정', () => {
  it('보내기 전에 고치면 대기열의 추가 작업 하나로 합치고, 지우면 보낼 것도 없앤다', async () => {
    isOnline = false
    await saveEvent(input('병원'))
    const [local] = await db.calendarEvents.toArray()

    await saveEvent({ ...input('치과'), ref: { id: local.id, seriesId: null, originalStart: null } })
    const queued = await db.calendarOutbox.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0].type === 'save' && queued[0].input.title).toBe('치과')
    expect((await db.calendarEvents.get(local.id))?.title).toBe('치과')

    await deleteEvent({ id: local.id, seriesId: null, originalStart: null }, 'all')
    expect(await db.calendarOutbox.count()).toBe(0)
    expect(await db.calendarEvents.count()).toBe(0)
  })
})

describe('반복 일정', () => {
  it('이후 모두를 지우면 그 회차부터 앱에서 바로 빠진다', async () => {
    isOnline = false
    const weekly = ['2026-10-06', '2026-10-13', '2026-10-20'].map(day =>
      event(`w-${day}`, { seriesId: 's', originalStart: day, start: day, end: day, repeat: 'weekly' }),
    )
    await db.calendarEvents.bulkPut(weekly)

    await deleteEvent({ id: 'w-2026-10-13', seriesId: 's', originalStart: '2026-10-13' }, 'following')

    expect((await db.calendarEvents.toArray()).map(item => item.id)).toEqual(['w-2026-10-06'])
  })
})

describe('ensureMonth', () => {
  it('받아 둔 범위 밖의 달은 그 달만 받는다', async () => {
    await syncCalendar()
    reads = []

    await ensureMonth('2026-12')
    await ensureMonth('2020-06')

    expect(reads.map(url => url.searchParams.get('start'))).toEqual(['2020-05-31'])
  })
})

describe('연결 전', () => {
  it('저장하지 않고 안내 문구를 던진다', async () => {
    saveSettings({ endpoint: '', token: '', defaultPerson: '쿠리만쥬' })

    await expect(saveEvent(input('병원'))).rejects.toThrow('구글 시트와 아직 연결되지 않았어요.')
  })
})
