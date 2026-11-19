import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Transaction } from '../domain/types'
import TransactionRow from './TransactionRow'

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 't1',
  occurredAt: '2026-11-05T03:00:00.000Z',
  person: '쿠리만쥬',
  kind: '지출',
  amount: 12000,
  shareCount: 1,
  merchant: '편의점',
  category: '편의점·마트·잡화',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  scope: '공동',
  ...overrides,
})

const personLabel = async (item: Transaction) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ul>
          <TransactionRow transaction={item} />
        </ul>
      </MemoryRouter>,
    ),
  )
  const label = container.querySelector('.tx-row-person')?.textContent
  const badges = [...container.querySelectorAll('.tx-badge')].map(badge => badge.textContent)
  root.unmount()
  return { label, badges }
}

describe('TransactionRow', () => {
  it('공금 지출은 결제한 사람 대신 공금으로 보여 준다', async () => {
    expect((await personLabel(transaction({}))).label).toBe('공금')
  })

  it('용돈 지출은 그 사람과 용돈 배지를, 수입은 그 사람을 보여 준다', async () => {
    expect(await personLabel(transaction({ scope: '개인' }))).toEqual({ label: '쿠리만쥬', badges: ['용돈'] })
    expect((await personLabel(transaction({ kind: '수입', scope: '공동' }))).label).toBe('쿠리만쥬')
  })
})

const ITEMS = [
  { name: '그릭요거트', amount: 7960, quantity: 2 },
  { name: '페투치네', amount: 2500, quantity: 1 },
  { name: '두부', amount: 1500 },
  { name: '대파', amount: 1520 },
]

const renderRow = async (item: Transaction) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ul>
          <TransactionRow transaction={item} />
        </ul>
      </MemoryRouter>,
    ),
  )
  return { container, unmount: () => act(() => root.unmount()) }
}

describe('영수증 품목이 있는 내역', () => {
  it('목록에는 다른 내역처럼 한 줄만 보이고, 누르면 영수증 시트가 열려 품목과 수정 버튼을 보여 준다', async () => {
    const { container, unmount } = await renderRow(transaction({ category: '식재료', merchant: '롯데마트', receiptItems: ITEMS }))

    expect(container.querySelector('.tx-receipt')).toBeNull()
    expect(container.querySelector('a.tx-row')).toBeNull()

    await act(async () => (container.querySelector('button.tx-row') as HTMLButtonElement).click())

    const sheet = document.querySelector('[role="dialog"][aria-label="롯데마트 영수증"]')!
    expect(sheet.querySelector('h2')?.textContent).toBe('11월 5일 (목)')
    expect(sheet.querySelector('.receipt-sheet-meta')?.textContent).toBe('롯데마트 · 12,000원')
    const cards = [...sheet.querySelectorAll('.receipt-card')].map(card => ({
      name: card.querySelector('.receipt-card-name')?.textContent,
      unitPrice: card.querySelector('.receipt-card-price')?.textContent,
      detail: card.querySelector('.receipt-card-detail')?.textContent,
    }))
    expect(cards).toEqual([
      { name: '그릭요거트', unitPrice: '3,980원', detail: '2개 · 합계 7,960원' },
      { name: '페투치네', unitPrice: '2,500원', detail: '1개' },
      { name: '두부', unitPrice: '1,500원', detail: '1개' },
      { name: '대파', unitPrice: '1,520원', detail: '1개' },
    ])
    expect(sheet.querySelector('a.receipt-sheet-edit')?.getAttribute('href')).toBe('/tx/t1')
    unmount()
  })

  it('품목이 없는 내역은 누르면 바로 수정 화면으로 간다', async () => {
    const { container, unmount } = await renderRow(transaction({ receiptItems: [] }))

    expect(container.querySelector('a.tx-row')?.getAttribute('href')).toBe('/tx/t1')
    unmount()
  })
})
