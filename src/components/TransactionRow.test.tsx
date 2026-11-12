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
