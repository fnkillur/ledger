import { describe, expect, it } from 'vitest'
import { anniversariesFromSettings, anniversariesToSettings, anniversaryLabels, daysTogether, nextAnniversary } from './anniversary'

const DATES = { 사귄날: '2019-01-01', 결혼한날: '2023-01-01' }

describe('anniversary', () => {
  it('사귄 날·결혼한 날은 설정에서 넣기 전에는 비어 있다', () => {
    expect(anniversariesFromSettings({ 월예산: 0 })).toEqual({})
    expect(anniversaryLabels('2019-04-10', {})).toEqual([])
    expect(nextAnniversary('2026-11-11', {})).toBeNull()
  })

  it('시트가 날짜 글자를 날짜 칸으로 바꾸지 않게 20190102 같은 숫자로 주고받는다', () => {
    expect(anniversariesToSettings({ 사귄날: '2019-01-02', 결혼한날: '2023-04-05' })).toEqual({ 사귄날: 20190102, 결혼한날: 20230405 })
    expect(anniversariesToSettings({ 사귄날: '2019-01-02' })).toEqual({ 사귄날: 20190102, 결혼한날: '' })
    expect(anniversariesFromSettings({ 사귄날: 20190102, 결혼한날: '20230405' })).toEqual({ 사귄날: '2019-01-02', 결혼한날: '2023-04-05' })
    expect(anniversariesFromSettings({ 사귄날: 0, 결혼한날: '잘못된 값' })).toEqual({})
  })

  it('처음 만난 날을 1일로 센다', () => {
    expect(daysTogether('2019-01-01', '2019-01-01')).toBe(1)
    expect(daysTogether('2019-01-01', '2019-04-10')).toBe(100)
    expect(daysTogether('2023-01-01', '2026-11-11')).toBe(1411)
  })

  it('100일 단위와 해마다 돌아오는 날을 기념일로 알려 준다', () => {
    expect(anniversaryLabels('2019-04-10', DATES)).toEqual(['사귄 지 100일'])
    expect(anniversaryLabels('2026-01-01', DATES)).toEqual(['사귄 지 7주년', '결혼 3주년'])
    expect(anniversaryLabels('2026-11-12', DATES)).toEqual([])
    expect(anniversaryLabels('2019-01-01', DATES)).toEqual([])
  })

  it('오늘을 포함해 가장 가까운 다음 기념일과 남은 날을 알려 준다', () => {
    expect(nextAnniversary('2026-11-11', DATES)).toEqual({ dateKey: '2026-12-09', label: '사귄 지 2,900일', daysLeft: 28 })
    expect(nextAnniversary('2026-12-09', DATES)?.daysLeft).toBe(0)
  })
})
