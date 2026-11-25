import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarChange, CalendarEvent, CalendarEventInput, Holiday } from '../domain/calendar'
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
let serverHolidays: Holiday[] | undefined
let reads: URL[]
let writes: Record<string, unknown>[]
let isOnline: boolean
let serverStatus: number
let isStalled: boolean
let serverChanges: CalendarChange[]
let isTokenExpired: boolean
let tokenCount: number

const calendarReads = () => reads.filter(url => url.searchParams.get('action') === 'calendar')
const changeReads = () => reads.filter(url => url.searchParams.get('action') === 'calendarChanges')
// 요청 제한 시간 타이머는 앱 저장소 작업 몇 번 뒤에야 걸려서, 끝날 때까지 실제 틈을 주며 시간을 조금씩 넘긴다.
const runPastTimeout = async (pending: Promise<void>) => {
  let isDone = false
  pending.then(() => {
    isDone = true
  })
  for (let step = 0; step < 100 && !isDone; step += 1) {
    await new Promise(resolve => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(1_000)
  }
  await pending
}
const errorOf = async () => (await db.calendarMeta.get('sync'))?.error
const change = (overrides: Partial<CalendarChange>): CalendarChange => ({ id: 'x', seriesId: null, isSeries: false, start: null, end: null, originalStart: null, ...overrides })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 26, 12))
  await Promise.all(db.tables.map(table => table.clear()))
  saveSettings({ endpoint: 'https://script.example/exec', token: 't', defaultPerson: '쿠리만쥬' })
  serverEvents = [event('server-1')]
  serverHolidays = []
  reads = []
  writes = []
  isOnline = true
  serverStatus = 200
  isStalled = false
  serverChanges = []
  isTokenExpired = false
  tokenCount = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (!isOnline) throw new TypeError('Failed to fetch')
      // 앱이 뒤로 갔다 오며 끊긴 연결처럼, 응답도 실패도 없이 멈춰 있다가 요청을 그만둘 때만 끝난다.
      if (isStalled) return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        writes.push(body)
        if (serverStatus !== 200) return new Response('error', { status: serverStatus })
        if (body.event?.title === '거절') return Response.json({ ok: false, error: '대상이 올바르지 않아요.' })
        return Response.json({ ok: true, id: 'saved' })
      }
      if (serverStatus !== 200) return new Response('error', { status: serverStatus })
      const read = new URL(url)
      reads.push(read)
      if (read.searchParams.get('action') === 'calendarChanges') {
        tokenCount += 1
        const syncToken = `token-${tokenCount}`
        if (!read.searchParams.get('syncToken')) return Response.json({ ok: true, syncToken })
        if (isTokenExpired) return Response.json({ ok: true, reset: true, syncToken })
        return Response.json({ ok: true, syncToken, changes: serverChanges })
      }
      return Response.json({ ok: true, events: serverEvents, holidays: serverHolidays })
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
  it('처음에는 확인 번호를 받고, 이번 달 앞뒤 한 달을 먼저 받은 뒤 앱에 없는 지난 4개월을 받는다', async () => {
    await syncCalendar()

    expect(reads[0].searchParams.get('action')).toBe('calendarChanges')
    expect(reads[0].searchParams.has('syncToken')).toBe(false)
    const ranges = calendarReads().map(url => [url.searchParams.get('start'), url.searchParams.get('end')])
    expect(ranges).toEqual([
      ['2026-08-30', '2026-12-05'],
      ['2026-05-31', '2026-09-05'],
    ])
    expect((await db.calendarMeta.get('sync'))?.syncToken).toBe('token-1')
    expect((await db.calendarLoaded.toCollection().primaryKeys()).sort()).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect((await db.calendarEvents.toArray()).map(item => item.id)).toEqual(['server-1'])
  })

  it('지난 4개월보다 긴 주기 항목이 있으면 그 주기만큼 지난 일정을 받아 둔다', async () => {
    await db.cycles.put({ id: 'c', name: '치과', icon: '', target: '공동', keyword: '', anchor: null, period: { amount: 6, unit: 'month' }, memo: '', deleted: false, updatedAt: '' })

    await syncCalendar()

    expect(await db.calendarLoaded.get('2026-04')).toBeTruthy()
    expect(await db.calendarLoaded.get('2026-03')).toBeUndefined()
  })

  it('그다음부터는 바뀐 것만 확인하고, 바뀐 게 없으면 일정을 받지 않는다', async () => {
    await syncCalendar()
    reads = []

    await syncCalendar()

    expect(changeReads().map(url => url.searchParams.get('syncToken'))).toEqual(['token-1'])
    expect(calendarReads()).toEqual([])
    expect((await db.calendarMeta.get('sync'))?.syncToken).toBe('token-2')
  })

  it('바뀐 일정이 있는 달만 다시 받아 바꿔 끼운다', async () => {
    await syncCalendar()
    reads = []
    serverEvents = [event('server-2', { title: '병원', start: '2026-10-20', end: '2026-10-20' })]
    serverChanges = [change({ id: 'server-2', start: '2026-10-20', end: '2026-10-20' })]

    await syncCalendar()

    expect(calendarReads().map(url => [url.searchParams.get('start'), url.searchParams.get('end')])).toEqual([['2026-09-27', '2026-10-31']])
    expect((await db.calendarEvents.toArray()).map(item => item.id)).toEqual(['server-2'])
  })

  it('받아 두지 않은 달이 바뀐 건 다시 받지 않는다', async () => {
    await syncCalendar()
    reads = []
    serverChanges = [change({ id: 'far', start: '2029-01-01', end: '2029-01-01' })]

    await syncCalendar()

    expect(calendarReads()).toEqual([])
  })

  it('구글이 확인 번호를 버렸으면 받아 둔 달 기록을 지우고 처음처럼 다시 받는다', async () => {
    await syncCalendar()
    reads = []
    isTokenExpired = true

    await syncCalendar()

    expect(calendarReads()).toHaveLength(2)
    expect((await db.calendarMeta.get('sync'))?.syncToken).toBe('token-2')
  })

  it('받기에 실패해도 보낼 작업이 없으면 오류를 띄우지 않고, 확인 번호도 넘기지 않아 다음에 다시 받는다', async () => {
    await syncCalendar()
    serverChanges = [change({ id: 'server-2', start: '2026-10-20', end: '2026-10-20' })]
    isOnline = false

    await syncCalendar()

    expect(await errorOf()).toBeUndefined()
    expect((await db.calendarMeta.get('sync'))?.syncToken).toBe('token-1')

    isOnline = true
    reads = []
    await syncCalendar()
    expect(calendarReads()).toHaveLength(1)
  })

  it('인터넷이 없으면 저장한 일정은 앱에 먼저 보이고 대기열에 남는다', async () => {
    isOnline = false

    await saveEvent(input('병원'))
    await syncCalendar()

    const local = await db.calendarEvents.toArray()
    expect(local.map(item => item.title)).toEqual(['병원'])
    expect(local[0].id.startsWith('local-')).toBe(true)
    expect(await db.calendarOutbox.count()).toBe(1)
    expect(await errorOf()).toBe('인터넷 연결을 확인해 주세요.')
  })

  it('다시 연결되면 대기열을 보내고, 바뀐 것을 확인해 그 달을 서버 기준으로 바꿔 끼운다', async () => {
    await syncCalendar()
    isOnline = false
    await saveEvent(input('병원'))
    await syncCalendar()
    isOnline = true
    serverEvents = [event('server-1'), event('server-2', { title: '병원', start: '2026-10-07', end: '2026-10-07' })]
    serverChanges = [change({ id: 'server-2', start: '2026-10-07', end: '2026-10-07' })]

    await syncCalendar()

    expect(writes.map(body => body.action)).toEqual(['calendarSave'])
    expect(await db.calendarOutbox.count()).toBe(0)
    expect((await db.calendarEvents.toArray()).map(item => item.id).sort()).toEqual(['server-1', 'server-2'])
    expect(await errorOf()).toBeUndefined()
  })

  it('지우기도 누가 했는지 함께 보내서 서버가 상대에게 알린다', async () => {
    await db.calendarEvents.put(event('server-1'))

    await deleteEvent({ id: 'server-1', seriesId: null, originalStart: null }, 'all')
    await syncCalendar()

    expect(writes.map(body => [body.action, body.actor])).toEqual([['calendarDelete', { person: '쿠리만쥬', name: '쿠리만쥬' }]])
  })

  it('서버가 잠시 응답하지 못하면(500) 보낼 작업을 남겨 두고, 나중에 보내며 닉네임과 함께 누가 했는지 알린다', async () => {
    serverStatus = 500

    await saveEvent(input('병원'))
    await syncCalendar()

    expect(await db.calendarOutbox.count()).toBe(1)
    expect(await errorOf()).toBe('시트 서버가 잠시 응답하지 못했어요. (500)')

    serverStatus = 200
    await syncCalendar()

    expect(await db.calendarOutbox.count()).toBe(0)
    expect(writes.at(-1)?.actor).toEqual({ person: '쿠리만쥬', name: '쿠리만쥬' })
  })

  it('응답 없이 멈춘 확인은 제한 시간이 지나면 조용히 끝나서, 다시 시도하면 새로 받는다', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 26, 12))
    isStalled = true

    await runPastTimeout(syncCalendar())

    expect(await errorOf()).toBeUndefined()

    isStalled = false
    await syncCalendar()

    expect((await db.calendarEvents.toArray()).map(item => item.id)).toEqual(['server-1'])
  })

  it('저장 요청이 멈췄다 끝나면 보낼 작업을 버리지 않고 남겨 둔다', async () => {
    isOnline = false
    await saveEvent(input('병원'))
    await syncCalendar()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 26, 12))
    isOnline = true
    isStalled = true

    await runPastTimeout(syncCalendar())

    expect(await db.calendarOutbox.count()).toBe(1)
    expect(await errorOf()).toBe('시트 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.')
    isStalled = false
  })

  it('새로 만드는 일정은 미리 정한 번호를 함께 보내, 다시 보내도 같은 번호라 두 번 생기지 않는다', async () => {
    serverStatus = 500
    await saveEvent(input('병원'))
    await syncCalendar()
    serverStatus = 200
    await syncCalendar()

    const [first, second] = writes.map(body => body.createId)
    expect(writes).toHaveLength(2)
    // 구글 캘린더 일정 번호는 소문자 a~v와 숫자로 5자 이상이어야 한다.
    expect(first).toMatch(/^[0-9a-v]{5,1024}$/)
    expect(second).toBe(first)
  })

  it('대기 중인 새 일정을 고쳐도 미리 정한 번호는 그대로다', async () => {
    isOnline = false
    await saveEvent(input('병원'))
    const [queued] = await db.calendarOutbox.toArray()
    const [local] = await db.calendarEvents.toArray()
    await saveEvent({ ...input('치과'), ref: { id: local.id, seriesId: null, originalStart: null } })
    isOnline = true
    await syncCalendar()

    expect(queued.type === 'save' && queued.createId).toBeTruthy()
    expect(writes.map(body => body.createId)).toEqual([queued.type === 'save' && queued.createId])
  })

  it('서버가 거절한 작업은 버리고 이유를 남긴다', async () => {
    await saveEvent(input('거절'))
    await syncCalendar()

    expect(await db.calendarOutbox.count()).toBe(0)
    expect(await errorOf()).toBe('대상이 올바르지 않아요.')
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
  it('받아 둔 달은 다시 받지 않고, 아직 받지 않은 달만 받아 기록한다', async () => {
    await syncCalendar()
    reads = []

    await ensureMonth('2026-11')
    await ensureMonth('2020-06')
    await ensureMonth('2020-06')

    expect(calendarReads().map(url => url.searchParams.get('start'))).toEqual(['2020-05-31'])
    expect(await db.calendarLoaded.get('2020-06')).toBeTruthy()
  })

  it('처음 확인 전에는 받지 않는다(확인 번호가 생긴 뒤 받아야 그 사이 바뀐 것을 놓치지 않는다)', async () => {
    isOnline = false
    await syncCalendar()
    isOnline = true

    await ensureMonth('2020-06')

    expect(calendarReads()).toEqual([])
  })
})

describe('공휴일', () => {
  it('일정과 함께 받은 공휴일을 날짜별로 저장하고, 같은 날 둘이면 이름을 이어 붙인다', async () => {
    serverHolidays = [
      { date: '2026-10-03', name: '개천절' },
      { date: '2026-10-09', name: '한글날' },
      { date: '2026-10-09', name: '임시공휴일' },
    ]

    await syncCalendar()

    expect(await db.holidays.toArray()).toEqual([
      { date: '2026-10-03', name: '개천절' },
      { date: '2026-10-09', name: '한글날 · 임시공휴일' },
    ])
  })

  it('달을 다시 받으면 그 범위의 공휴일을 새 목록으로 바꾼다', async () => {
    serverHolidays = [{ date: '2026-10-03', name: '개천절' }]
    await syncCalendar()

    serverHolidays = [{ date: '2026-10-09', name: '한글날' }]
    serverChanges = [change({ id: 'server-1', start: '2026-10-05', end: '2026-10-05' })]
    await syncCalendar()

    expect((await db.holidays.toArray()).map(item => item.date)).toEqual(['2026-10-09'])
  })

  it('공휴일을 보내지 않는 예전 서버면 받아 둔 공휴일을 그대로 둔다', async () => {
    serverHolidays = [{ date: '2026-10-03', name: '개천절' }]
    await syncCalendar()

    serverHolidays = undefined
    serverChanges = [change({ id: 'server-1', start: '2026-10-05', end: '2026-10-05' })]
    await syncCalendar()

    expect((await db.holidays.toArray()).map(item => item.date)).toEqual(['2026-10-03'])
  })
})

describe('연결 전', () => {
  it('저장하지 않고 안내 문구를 던진다', async () => {
    saveSettings({ endpoint: '', token: '', defaultPerson: '쿠리만쥬' })

    await expect(saveEvent(input('병원'))).rejects.toThrow('구글 시트와 아직 연결되지 않았어요.')
  })
})
