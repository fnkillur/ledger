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
  root.unmount()
  return label
}

describe('TransactionRow', () => {
  it('공동 지출은 결제한 사람 대신 공동으로 보여 준다', async () => {
    expect(await personLabel(transaction({}))).toBe('공동')
  })

  it('개인 지출과 수입은 그 사람을 보여 준다', async () => {
    expect(await personLabel(transaction({ scope: '개인' }))).toBe('쿠리만쥬')
    expect(await personLabel(transaction({ kind: '수입', scope: '공동' }))).toBe('쿠리만쥬')
  })
})
