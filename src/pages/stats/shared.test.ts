import { describe, expect, it } from 'vitest'
import { formatAxisWon, niceTicks } from './shared'

describe('niceTicks', () => {
  it('1·2·2.5·5 단위로 딱 떨어지는 눈금을 고른다', () => {
    expect(niceTicks(18_000_000)).toEqual([0, 5_000_000, 10_000_000, 15_000_000, 20_000_000])
    expect(niceTicks(9_500_000)).toEqual([0, 2_500_000, 5_000_000, 7_500_000, 10_000_000])
    expect(niceTicks(0)).toEqual([0])
  })

  it('축 라벨은 쉼표 없이 만·억 단위로 줄인다', () => {
    expect([formatAxisWon(20_000_000), formatAxisWon(150_000_000), formatAxisWon(5000)]).toEqual(['2000만', '1.5억', '5000'])
  })
})
