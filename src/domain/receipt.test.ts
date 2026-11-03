import { describe, expect, it } from 'vitest'
import { groupReceipt, moveReceiptItem, receiptMemo } from './receipt'

const items = [
  { name: '양파', amount: 3980, category: '식재료' },
  { name: '크리넥스', amount: 9900, category: '생활' },
  { name: '우유', amount: 2650, category: '식재료' },
  { name: '삼각김밥', amount: 1500, category: '외식' },
]

describe('groupReceipt', () => {
  it('카테고리별로 묶고 큰 묶음부터 보여준다', () => {
    const groups = groupReceipt(items, 18030)
    expect(groups.map(group => [group.category, group.amount, group.items.length])).toEqual([
      ['생활', 9900, 1],
      ['식재료', 6630, 2],
      ['외식', 1500, 1],
    ])
  })

  it('결제 금액이 영수증 합계와 다르면 비율대로 나누고 합을 맞춘다', () => {
    const groups = groupReceipt(items, 17000)
    expect(groups.reduce((sum, group) => sum + group.amount, 0)).toBe(17000)
    expect(groups.find(group => group.category === '외식')?.amount).toBe(1414)
  })

  it('나눌 금액이 없으면 빈 목록이다', () => {
    expect(groupReceipt([], 10000)).toEqual([])
    expect(groupReceipt(items, 0)).toEqual([])
  })
})

describe('receiptMemo', () => {
  it('품목 이름을 세 개까지 적고 나머지는 개수로 줄인다', () => {
    expect(receiptMemo(items.slice(0, 2))).toBe('양파, 크리넥스')
    expect(receiptMemo(items)).toBe('양파, 크리넥스, 우유 외 1개')
  })
})

describe('moveReceiptItem', () => {
  it('고른 품목만 다른 카테고리로 옮긴다', () => {
    expect(moveReceiptItem(items, 1, '편의점·마트·잡화')[1].category).toBe('편의점·마트·잡화')
    expect(moveReceiptItem(items, 1, '편의점·마트·잡화')[0].category).toBe('식재료')
  })
})
