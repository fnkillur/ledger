import { describe, expect, it } from 'vitest'
import { parseMonthlySummary } from './monthlySummary'

const CATEGORIES = ['편의점·마트·잡화', '식비', '카페·간식', '쇼핑', '교통·자동차', '주거·통신', '의료·건강·피트니스', '술·유흥']

describe('parseMonthlySummary', () => {
  it('카테고리와 같은 줄의 금액을 읽고 퍼센트는 건너뛴다', () => {
    const { items } = parseMonthlySummary('편의점·마트·잡화 32% 1,243,342원\n식비 12% 183,600원', CATEGORIES)

    expect(items.map(item => [item.category, item.amount])).toEqual([
      ['편의점·마트·잡화', 1243342],
      ['식비', 183600],
    ])
  })

  it('가운뎃점이 빠지거나 공백이 섞여도 카테고리를 찾는다', () => {
    const { items } = parseMonthlySummary('카페 간식 53,750원\n교통자동차 93,000 원', CATEGORIES)

    expect(items.map(item => item.category)).toEqual(['카페·간식', '교통·자동차'])
  })

  it('긴 이름은 한 글자 오타를 허용한다', () => {
    const { items } = parseMonthlySummary('의료·건강·피트너스 245,900원', CATEGORIES)

    expect(items[0]).toMatchObject({ category: '의료·건강·피트니스', amount: 245900 })
  })

  it('%가 숫자로 잘못 읽힌 값은 금액으로 보지 않고, 쉼표가 빠진 금액도 읽는다', () => {
    const { items, total } = parseMonthlySummary(
      '10월 쓴 돈\n1512,600원\n() 편의점:마트-잡화 3596 528,900원\n」) 식비 22% 331200원\n(7) 카페-간식 129',
      CATEGORIES,
    )

    expect(total).toBe(1512600)
    expect(items.map(item => [item.category, item.amount])).toEqual([
      ['편의점·마트·잡화', 528900],
      ['식비', 331200],
    ])
  })

  it('금액이 다음 줄에 있으면 이어 붙인다', () => {
    const { items } = parseMonthlySummary('주거·통신\n98,220원', CATEGORIES)

    expect(items[0]).toMatchObject({ category: '주거·통신', amount: 98220 })
  })

  it('총액 줄과 모르는 줄을 따로 모으고, 같은 카테고리는 처음 것만 쓴다', () => {
    const { items, unmatched, total } = parseMonthlySummary(
      '10월 쓴 돈 2,568,451원\n식비 67,000원\n이체 300,000원\n식비 99,999원',
      CATEGORIES,
    )

    expect(total).toBe(2568451)
    expect(items).toEqual([{ category: '식비', amount: 67000, line: '식비 67,000원' }])
    expect(unmatched).toEqual([{ line: '이체 300,000원', amount: 300000 }])
  })

  it('토스의 "그 외 N개" 합계와 그 목록을 따로 모아 검산하고, 저축 카테고리도 찾는다', () => {
    const text = [
      '소비 분석',
      '저축·투자에 가장 많은 돈을 썼어요',
      '저축·투자 1,553,312원',
      '편의점·마트·잡화 1,258,842원',
      '그 외 14개 1,842,651원',
      '5:42 10/21 (수)',
      '그 외 14개',
      '식비 183,600원',
      '원두 57,500원',
      '이체 0원',
    ].join('\n')

    const { items, unmatched, othersCheck } = parseMonthlySummary(text, [...CATEGORIES, '저축·투자', '원두'])

    expect(items.map(item => [item.category, item.amount])).toEqual([
      ['저축·투자', 1553312],
      ['편의점·마트·잡화', 1258842],
      ['식비', 183600],
      ['원두', 57500],
    ])
    expect(othersCheck).toEqual({ count: 14, expected: 1842651, actual: 241100, readCount: 2 })
    expect(unmatched).toEqual([])
  })
})
