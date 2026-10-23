import { describe, expect, it } from 'vitest'
import { cleanNickname, displayName, nicknamesFromSettings, nicknamesToSettings } from './nickname'

describe('nickname', () => {
  it('앞뒤 공백을 지우고 10자로 자르며, 빈 값·숫자만 있는 값은 쓰지 않는다', () => {
    expect(cleanNickname('  토끼  ')).toBe('토끼')
    expect(cleanNickname('가나다라마바사아자차카')).toBe('가나다라마바사아자차')
    expect(cleanNickname('')).toBeUndefined()
    expect(cleanNickname(0)).toBeUndefined()
    expect(cleanNickname('0')).toBeUndefined()
  })

  it('시트 설정 값에서 사람별 닉네임을 꺼내고, 없으면 원래 이름을 보여준다', () => {
    const nicknames = nicknamesFromSettings({ 월예산: 0, 닉네임_우사기: '토끼', 닉네임_쿠리만쥬: 0 })

    expect(nicknames).toEqual({ 우사기: '토끼' })
    expect(displayName('우사기', nicknames)).toBe('토끼')
    expect(displayName('쿠리만쥬', nicknames)).toBe('쿠리만쥬')
  })

  it('지운 닉네임도 빈 값으로 보내서 시트에서 지워지게 한다', () => {
    expect(nicknamesToSettings({ 우사기: '토끼' })).toEqual({ 닉네임_쿠리만쥬: '', 닉네임_우사기: '토끼' })
  })
})
