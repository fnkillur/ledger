import { describe, expect, it } from 'vitest'
import { previousComparison } from './period'

const TODAY = new Date(2026, 9, 23, 15, 0)
const toLocal = (iso: string) => new Date(iso).toLocaleString('sv-SE').slice(0, 10)

describe('previousComparison', () => {
  it('진행 중인 올해는 작년 1월 1일부터 작년 오늘까지와 비교한다', () => {
    const { range, label } = previousComparison({ type: '연도별', monthKey: '2026-10' }, TODAY)!

    expect([toLocal(range.start), toLocal(range.end)]).toEqual(['2025-01-01', '2025-10-24'])
    expect(label).toBe('작년 같은 기간')
  })

  it('끝난 해와 지난 달은 바로 이전 기간 전체와 비교한다', () => {
    const lastYear = previousComparison({ type: '연도별', monthKey: '2025-12' }, TODAY)!
    const month = previousComparison({ type: '월별', monthKey: '2026-09' }, TODAY)!

    expect([toLocal(lastYear.range.start), toLocal(lastYear.range.end), lastYear.label]).toEqual(['2024-01-01', '2025-01-01', '2024년'])
    expect([toLocal(month.range.start), toLocal(month.range.end), month.label]).toEqual(['2026-08-01', '2026-09-01', '8월'])
  })

  it('진행 중인 달은 비교하지 않는다', () => {
    expect(previousComparison({ type: '월별', monthKey: '2026-10' }, TODAY)).toBeNull()
  })
})
