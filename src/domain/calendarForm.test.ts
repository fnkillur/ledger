import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendar'
import { applySuggestion, canSaveForm, changeTarget, formatDatePill, formatTimePill, formFromEvent, moveStart, newForm, titleSuggestions, toEventInput } from './calendarForm'

describe('newForm', () => {
  it('고른 날짜에 다음 정시부터 1시간, 대상은 이 폰의 사람', () => {
    const form = newForm('2026-10-30', '우사기', new Date(2026, 9, 26, 14, 20))

    expect(form).toMatchObject({
      title: '',
      target: '우사기',
      allDay: false,
      startDate: '2026-10-30',
      startTime: '15:00',
      endDate: '2026-10-30',
      endTime: '16:00',
      repeat: 'none',
    })
  })

  it('밤 11시 이후면 23시에 시작하고 끝은 다음 날로 넘어간다', () => {
    const form = newForm('2026-10-30', '쿠리만쥬', new Date(2026, 9, 26, 23, 10))

    expect(form).toMatchObject({ startDate: '2026-10-30', startTime: '23:00', endDate: '2026-10-31', endTime: '00:00' })
  })
})

describe('moveStart', () => {
  it('시작을 옮기면 끝도 같은 길이만큼 따라간다', () => {
    const form = newForm('2026-10-30', '우사기', new Date(2026, 9, 26, 14, 20))

    expect(moveStart(form, { startDate: '2026-10-31', startTime: '23:30' })).toMatchObject({ endDate: '2026-11-01', endTime: '00:30' })
  })
})

describe('toEventInput', () => {
  it('종일 일정은 날짜만, 시간 일정은 ISO로 보낸다', () => {
    const form = { ...newForm('2026-10-30', '우사기', new Date(2026, 9, 26, 14)), title: ' 병원 ' }

    expect(toEventInput({ ...form, allDay: true })).toMatchObject({ title: '병원', allDay: true, start: '2026-10-30', end: '2026-10-30' })
    expect(toEventInput(form)).toMatchObject({ allDay: false, start: '2026-10-30T06:00:00.000Z', end: '2026-10-30T07:00:00.000Z' })
  })
})

describe('formFromEvent', () => {
  it('기존 일정을 그대로 폼으로 옮긴다', () => {
    const event: CalendarEvent = {
      id: 'e',
      seriesId: null,
      originalStart: null,
      title: '야간',
      allDay: false,
      start: '2026-10-09T23:00:00+09:00',
      end: '2026-10-10T01:00:00+09:00',
      target: '공동',
      repeat: 'weekly',
    }

    expect(formFromEvent(event)).toEqual({
      title: '야간',
      target: '공동',
      allDay: false,
      startDate: '2026-10-09',
      startTime: '23:00',
      endDate: '2026-10-10',
      endTime: '01:00',
      repeat: 'weekly',
    })
  })
})

describe('canSaveForm', () => {
  it('제목이 없거나 끝이 시작보다 빠르면 저장할 수 없다', () => {
    const form = { ...newForm('2026-10-30', '우사기', new Date(2026, 9, 26, 14)), title: '병원' }

    expect(canSaveForm(form)).toBe(true)
    expect(canSaveForm({ ...form, title: '  ' })).toBe(false)
    expect(canSaveForm({ ...form, endTime: '14:00' })).toBe(false)
    expect(canSaveForm({ ...form, allDay: true, endDate: '2026-10-29' })).toBe(false)
  })
})

describe('changeTarget', () => {
  const base = newForm('2026-10-30', '우사기', new Date(2026, 9, 26, 14))

  it('기념일로 처음 바꾸면 하루 종일·매년으로 맞춘다', () => {
    expect(changeTarget(base, '기념일')).toMatchObject({ target: '기념일', allDay: true, endDate: '2026-10-30', repeat: 'yearly' })
  })

  it('지정일은 하루 종일만 맞추고 반복은 그대로 둔다', () => {
    expect(changeTarget({ ...base, repeat: 'monthly' }, '없음')).toMatchObject({ allDay: true, repeat: 'monthly' })
  })

  it('이미 기념일·지정일이면 다른 값은 건드리지 않는다', () => {
    const anniversary = { ...changeTarget(base, '기념일'), repeat: 'none' as const }

    expect(changeTarget(anniversary, '없음')).toMatchObject({ target: '없음', repeat: 'none' })
  })
})

describe('formatDatePill', () => {
  it('올해면 연도를 빼고 요일을 붙인다', () => {
    expect(formatDatePill('2026-10-27', 2026)).toBe('10월 27일 (화)')
  })

  it('다른 해면 연도를 붙인다', () => {
    expect(formatDatePill('2027-01-31', 2026)).toBe('2027년 1월 31일 (일)')
  })
})

describe('formatTimePill', () => {
  it('오전·오후 12시간제로 보여 준다', () => {
    expect(formatTimePill('00:05')).toBe('오전 12:05')
    expect(formatTimePill('12:00')).toBe('오후 12:00')
    expect(formatTimePill('23:30')).toBe('오후 11:30')
  })
})

const pastEvent = (id: string, overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id,
  seriesId: null,
  originalStart: null,
  title: id,
  allDay: false,
  start: '2026-10-01T11:00:00+09:00',
  end: '2026-10-01T12:00:00+09:00',
  target: '우사기',
  repeat: 'none',
  ...overrides,
})

describe('titleSuggestions', () => {
  const events = [
    pastEvent('a', { title: '필라테스', start: '2026-10-01T11:00:00+09:00', end: '2026-10-01T12:00:00+09:00' }),
    pastEvent('b', { title: '필라테스', start: '2026-10-08T19:00:00+09:00', end: '2026-10-08T20:00:00+09:00' }),
    pastEvent('c', { title: '필름 현상', start: '2026-10-20T10:00:00+09:00', end: '2026-10-20T10:30:00+09:00' }),
    // 반복 일정은 회차가 많아도 한 번으로 센다.
    ...['2026-10-02', '2026-10-09', '2026-10-16'].map(day =>
      pastEvent(`w-${day}`, { title: '필드 하키', seriesId: 'w', start: `${day}T09:00:00+09:00`, end: `${day}T10:00:00+09:00`, repeat: 'weekly' }),
    ),
    pastEvent('d', { title: '필리핀 여행 기념일', target: '기념일', allDay: true, start: '2026-10-05', end: '2026-10-05' }),
    pastEvent('e', { title: '병원', target: '공동' }),
  ]

  it('글자를 치기 전에는 추천하지 않는다', () => {
    expect(titleSuggestions(events, '  ')).toEqual([])
  })

  it('친 글자가 들어간 제목을 자주 쓴 순으로, 같으면 최근 순으로 하나씩 고르고 가장 최근 일정을 대표로 둔다', () => {
    expect(titleSuggestions(events, '필').map(event => event.id)).toEqual(['b', 'c', 'w-2026-10-16'])
  })

  it('기념일은 추천하지 않고, 대소문자는 가리지 않는다', () => {
    expect(titleSuggestions([...events, pastEvent('y', { title: 'Yoga' })], 'yo').map(event => event.title)).toEqual(['Yoga'])
    expect(titleSuggestions(events, '기념일')).toEqual([])
  })

  it('최대 다섯 개까지만 추천한다', () => {
    const many = Array.from({ length: 7 }, (_, index) => pastEvent(`m${index}`, { title: `운동 ${index}` }))
    expect(titleSuggestions(many, '운동')).toHaveLength(5)
  })
})

describe('applySuggestion', () => {
  it('제목·대상·시간은 고른 일정에서 가져오고 날짜는 지금 고른 날로 둔다', () => {
    const form = newForm('2026-11-20', '쿠리만쥬', new Date(2026, 10, 12, 14))
    const picked = pastEvent('b', { title: '필라테스', start: '2026-10-08T19:00:00+09:00', end: '2026-10-08T20:30:00+09:00', target: '우사기' })

    expect(applySuggestion(form, picked)).toMatchObject({
      title: '필라테스',
      target: '우사기',
      allDay: false,
      startDate: '2026-11-20',
      startTime: '19:00',
      endDate: '2026-11-20',
      endTime: '20:30',
      repeat: 'none',
    })
  })

  it('여러 날 종일 일정은 같은 길이로 고른 날부터 잡는다', () => {
    const form = newForm('2026-11-20', '쿠리만쥬', new Date(2026, 10, 12, 14))
    const picked = pastEvent('t', { title: '제주 여행', allDay: true, start: '2026-10-03', end: '2026-10-05', target: '공동' })

    expect(applySuggestion(form, picked)).toMatchObject({ allDay: true, startDate: '2026-11-20', endDate: '2026-11-22', target: '공동' })
  })
})
