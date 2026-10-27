import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './defaultCategories'
import { findSameMerchant, guessCategory, suggestCategory } from './classify'
import type { Transaction } from './types'

const NAMES = DEFAULT_CATEGORIES.map(category => category.name)

describe('guessCategory', () => {
  it('가맹점 이름의 흔한 단어로 카테고리를 추정한다', () => {
    expect(guessCategory('스타벅스 강남R점')).toBe('카페·간식')
    expect(guessCategory('메가MGC커피')).toBe('카페·간식')
    expect(guessCategory('GS25 역삼점')).toBe('편의점·마트·잡화')
    expect(guessCategory('카카오T 택시')).toBe('교통·자동차')
    expect(guessCategory('아이파킹주식회사')).toBe('교통·자동차')
    expect(guessCategory('온누리약국')).toBe('의료·건강·피트니스')
    expect(guessCategory('아파트관리비')).toBe('주거·통신')
    expect(guessCategory('올리브영 강남점')).toBe('쇼핑')
    expect(guessCategory('롯데마트 잠실점')).toBe('편의점·마트·잡화')
    expect(guessCategory('느티나무마트')).toBe('편의점·마트·잡화')
  })

  it('겹치는 단어는 더 긴 쪽을 따른다', () => {
    expect(guessCategory('쿠팡이츠')).toBe('식비')
    expect(guessCategory('쿠팡')).toBe('편의점·마트·잡화')
  })

  it('짧은 영문 단어는 단어 경계가 맞을 때만 쓴다', () => {
    expect(guessCategory('CU 선릉점')).toBe('편의점·마트·잡화')
    expect(guessCategory('ACCUWEATHER')).toBeNull()
  })

  it('모르는 가맹점은 null', () => {
    expect(guessCategory('동네빵집아님상회')).toBeNull()
  })
})

describe('suggestCategory', () => {
  it('직접 만든 분류 규칙이 먼저고, 없는 카테고리는 추정하지 않는다', () => {
    const rules = [{ keyword: '스타벅스', category: '원두', updatedAt: '' }]

    expect(suggestCategory('스타벅스', rules, NAMES)).toBe('원두')
    expect(suggestCategory('메가커피', rules, NAMES)).toBe('카페·간식')
    expect(suggestCategory('메가커피', [], ['식비'])).toBeNull()
  })
})

describe('findSameMerchant', () => {
  const base: Transaction = {
    id: 'a',
    occurredAt: '2026-10-01T00:00:00.000Z',
    person: '쿠리만쥬',
    kind: '지출',
    amount: 5000,
    shareCount: 1,
    merchant: '스타벅스 강남R점',
    category: '식비',
    excluded: false,
    source: '수동',
    memo: '',
    rawText: '',
    scope: '공동',
    deleted: false,
    updatedAt: '2026-10-01T00:00:00.000Z',
  }

  it('띄어쓰기·대소문자만 다른 같은 가맹점의 다른 카테고리 기록을 고른다', () => {
    const rows = [
      base,
      { ...base, id: 'b', merchant: '스타벅스강남r점' },
      { ...base, id: 'c', category: '카페·간식' },
      { ...base, id: 'd', merchant: '스타벅스 역삼점' },
      { ...base, id: 'e', deleted: true },
      { ...base, id: 'f', kind: '수입' as const },
      { ...base, id: 'g', source: '월합계' as const },
      { ...base, id: 'h' },
    ]
    const found = findSameMerchant(rows, { merchant: '스타벅스 강남R점', kind: '지출', category: '카페·간식', exceptId: 'h' })
    expect(found.map(row => row.id)).toEqual(['a', 'b'])
  })

  it('가맹점이 비면 아무것도 고르지 않는다', () => {
    expect(findSameMerchant([{ ...base, merchant: '' }], { merchant: ' ', kind: '지출', category: '카페·간식' })).toEqual([])
  })
})
