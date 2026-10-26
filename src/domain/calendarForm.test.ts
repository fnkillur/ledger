import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './calendar'
import { canSaveForm, formFromEvent, moveStart, newForm, toEventInput } from './calendarForm'

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
