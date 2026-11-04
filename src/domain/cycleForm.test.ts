import { describe, expect, it } from 'vitest'
import type { CycleInput } from './cycle'
import { cycleFormError } from './cycleForm'

const draft = (overrides: Partial<CycleInput> = {}): CycleInput => ({
  name: '정수기 필터',
  icon: '',
  target: '공동',
  period: { amount: 6, unit: 'month' },
  link: null,
  notify: { enabled: false, offsets: [], afterDays: null },
  memo: '',
  ...overrides,
})

describe('cycleFormError', () => {
  it('문제가 없으면 null', () => {
    expect(cycleFormError(draft())).toBeNull()
  })

  it('이름이 비어 있으면 막는다', () => {
    expect(cycleFormError(draft({ name: '  ' }))).toBe('이름을 입력해 주세요')
  })

  it('주기 숫자는 1 이상이어야 한다', () => {
    expect(cycleFormError(draft({ period: { amount: 0, unit: 'month' } }))).toBe('주기를 1 이상으로 정해 주세요')
  })

  it('결제 연결은 카테고리나 가맹점 말이 있어야 한다', () => {
    expect(cycleFormError(draft({ link: { category: '', keyword: '', person: '우사기' } }))).toBe('연결할 카테고리나 가맹점을 정해 주세요')
  })

  it('알림을 켜면 보낼 때를 골라야 한다', () => {
    expect(cycleFormError(draft({ notify: { enabled: true, offsets: [], afterDays: null } }))).toBe('알림 받을 때를 골라 주세요')
    expect(cycleFormError(draft({ period: null, notify: { enabled: true, offsets: [], afterDays: null } }))).toBe('며칠 지나면 알릴지 정해 주세요')
    expect(cycleFormError(draft({ period: null, notify: { enabled: true, offsets: [], afterDays: 90 } }))).toBeNull()
  })
})
