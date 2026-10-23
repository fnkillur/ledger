import { describe, expect, it } from 'vitest'
import { CHEER_MESSAGES, cheerSubline, pickCheer, recordStreak } from './celebration'

describe('recordStreak', () => {
  it('오늘부터 거꾸로 하루도 빠짐없이 기록한 날 수를 센다', () => {
    const days = new Set(['2026-10-22', '2026-10-21', '2026-10-20', '2026-10-18'])

    expect(recordStreak(days, '2026-10-22')).toBe(3)
  })

  it('달이 바뀌어도 이어서 세고, 오늘 기록이 없으면 0', () => {
    expect(recordStreak(new Set(['2026-11-01', '2026-10-31']), '2026-11-01')).toBe(2)
    expect(recordStreak(new Set(['2026-10-21']), '2026-10-22')).toBe(0)
  })
})

describe('cheerSubline', () => {
  it('연속 기록이 이틀 이상이면 연속 기록을, 아니면 오늘 몇 번째인지 보여준다', () => {
    expect(cheerSubline({ streak: 3, todayCount: 5 })).toBe('3일 연속 기록 중')
    expect(cheerSubline({ streak: 1, todayCount: 2 })).toBe('오늘 2번째 기록이에요')
    expect(cheerSubline({ streak: 1, todayCount: 1 })).toBeNull()
  })
})

describe('pickCheer', () => {
  it('직전에 보여준 문구는 연달아 고르지 않는다', () => {
    const previous = CHEER_MESSAGES[0]

    expect(pickCheer(() => 0, previous)).not.toBe(previous)
    expect(CHEER_MESSAGES).toContain(pickCheer(() => 0.99, previous))
  })
})
