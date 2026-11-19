import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { groceryPurchases } from '../../domain/groceryItems'
import type { Transaction } from '../../domain/types'
import GroceryItemsCard from './GroceryItemsCard'

const transaction = (id: string, occurredAt: Date, receiptItems: Transaction['receiptItems']): Transaction => ({
  id,
  occurredAt: occurredAt.toISOString(),
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '롯데마트',
  category: '식재료',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  scope: '공동',
  receiptItems,
})

const LAST_MONTH = transaction('a', new Date(2026, 9, 2, 12), [{ name: '국산 두부', amount: 2500 }])
const THIS_MONTH = [
  transaction('b', new Date(2026, 10, 5, 12), [
    { name: '국산두부', amount: 2800 },
    { name: '한우 등심', amount: 30000 },
  ]),
  transaction('c', new Date(2026, 10, 9, 12), [{ name: '국산 두부', amount: 5400, quantity: 2 }]),
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = async (current: Transaction[], all: Transaction[]) => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <GroceryItemsCard purchases={groceryPurchases(current)} allPurchases={groceryPurchases(all)} />
      </MemoryRouter>,
    ),
  )
}

const rows = () => [...container.querySelectorAll('.grocery-item')].map(row => row.textContent)

describe('식재료 품목 카드', () => {
  it('이 기간에 산 품목을 횟수순으로 보여 주고, 금액순으로 바꿀 수 있다', async () => {
    await render(THIS_MONTH, [LAST_MONTH, ...THIS_MONTH])

    expect(rows()).toEqual(['국산 두부2회8,200원', '한우 등심1회30,000원'])

    await act(async () => ([...container.querySelectorAll('[aria-label="품목 정렬"] button')].find(button => button.textContent === '금액순') as HTMLButtonElement).click())
    expect(rows()).toEqual(['한우 등심1회30,000원', '국산 두부2회8,200원'])
  })

  it('품목을 누르면 처음부터 산 기록과 지난번보다 얼마 바뀌었는지 보여 준다', async () => {
    await render(THIS_MONTH, [LAST_MONTH, ...THIS_MONTH])

    await act(async () => (container.querySelector('.grocery-item') as HTMLButtonElement).click())

    const sheet = document.querySelector('[role="dialog"][aria-label="국산 두부 가격"]')!
    expect(sheet.querySelector('.grocery-price-change')?.textContent).toBe('지난번보다 100원 내렸어요 (-4%)')
    expect([...sheet.querySelectorAll('.grocery-history li')].map(row => row.textContent)).toEqual([
      '2026.11.9롯데마트×2 · 개당 2,700원5,400원',
      '2026.11.5롯데마트2,800원',
      '2026.10.2롯데마트2,500원',
    ])
  })

  it('영수증 품목이 한 번도 없으면 카드를 숨기고, 이 기간에만 없으면 안내한다', async () => {
    await render([], [])
    expect(container.querySelector('.card')).toBeNull()

    await render([], [LAST_MONTH])
    expect(container.textContent).toContain('이 기간에는 영수증으로 기록한 식재료가 없어요.')
  })
})
