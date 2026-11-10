import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendar'

type Sent = { token: string; title: string; body: string }

// 기기 토큰·FCM 요청만 흉내 내고, 누구에게 무엇을 보내는지 확인한다.
const loadServer = () => {
  const sent: Sent[] = []
  const tokens = {
    'kuri-android': { person: '쿠리만쥬', platform: 'android' },
    'kuri-web': { person: '쿠리만쥬', platform: 'web' },
    'usagi-web': { person: '우사기', platform: 'web' },
  }
  const context: Record<string, unknown> = {
    FIREBASE_SERVICE_ACCOUNT: { project_id: 'ledger-test' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => JSON.stringify(tokens), setProperty: () => undefined }) },
    CacheService: { getScriptCache: () => ({ get: () => 'access-token', put: () => undefined }) },
    UrlFetchApp: {
      fetchAll: (requests: { payload: string }[]) =>
        requests.map(request => {
          const { message } = JSON.parse(request.payload)
          sent.push({ token: message.token, title: message.notification?.title ?? message.data.title, body: message.notification?.body ?? message.data.body })
          return { getResponseCode: () => 200, getContentText: () => '{}' }
        }),
    },
  }
  const source = ['Push.gs', 'Reminder.gs'].map(file => readFileSync(resolve(__dirname, `../../apps-script/${file}`), 'utf8')).join('\n')
  runInNewContext(`${source}\nthis.server = { isTakeoutDay_, sendTakeoutPush_ }`, context)
  return { server: context.server as { isTakeoutDay_: (events: CalendarEvent[]) => boolean; sendTakeoutPush_: (dateKey: string) => void }, sent }
}

const event = (patch: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  seriesId: null,
  originalStart: null,
  title: '필라테스',
  allDay: false,
  start: '2026-11-10T19:00:00+09:00',
  end: '2026-11-10T20:00:00+09:00',
  target: '쿠리만쥬',
  repeat: 'none',
  ...patch,
})

describe('테이크아웃 받기 알림', () => {
  it('쿠리만쥬의 저녁 7시 필라테스가 있는 날이다', () => {
    const { server } = loadServer()
    expect(server.isTakeoutDay_([event({})])).toBe(true)
    expect(server.isTakeoutDay_([event({ title: '저녁 필라테스 수업' })])).toBe(true)
    expect(server.isTakeoutDay_([event({ start: '2026-11-10T10:00:00.000Z' })])).toBe(true)
  })

  it('시간·대상·제목이 다르거나 종일 일정이면 아니다', () => {
    const { server } = loadServer()
    expect(server.isTakeoutDay_([])).toBe(false)
    expect(server.isTakeoutDay_([event({ start: '2026-11-10T20:00:00+09:00' })])).toBe(false)
    expect(server.isTakeoutDay_([event({ target: '우사기' })])).toBe(false)
    expect(server.isTakeoutDay_([event({ target: '공동' })])).toBe(false)
    expect(server.isTakeoutDay_([event({ title: '요가' })])).toBe(false)
    expect(server.isTakeoutDay_([event({ allDay: true, start: '2026-11-10', end: '2026-11-10' })])).toBe(false)
  })

  it('쿠리만쥬의 앱(안드로이드)에만 보낸다', () => {
    const { server, sent } = loadServer()
    server.sendTakeoutPush_('2026-11-10')
    expect(sent).toEqual([{ token: 'kuri-android', title: '테이크아웃 받기', body: '오늘 저녁 7시 필라테스가 있어요' }])
  })
})
