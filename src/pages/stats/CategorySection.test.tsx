import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../domain/types'
import CategorySection from './CategorySection'

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  occurredAt: new Date(2026, 10, 10, 13).toISOString(),
  person: '쿠리만쥬',
  kind: '지출',
  amount: 10000,
  shareCount: 1,
  merchant: '',
  category: '카페',
  excluded: false,
  source: '알림',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '',
  scope: '공동',
  ...overrides,
})

const TRANSACTIONS = [
  transaction({ merchant: '스타벅스', amount: 6000 }),
  transaction({ merchant: '메가커피', amount: 2000 }),
  transaction({ merchant: '메가커피', amount: 2000 }),
  transaction({ merchant: '김밥천국', amount: 8000, category: '식비' }),
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

const render = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <CategorySection
          isMonthly
          previousLabel={null}
          title="카테고리별 지출"
          total={18000}
          ranking={[
            { category: '카페', amount: 10000 },
            { category: '식비', amount: 8000 },
          ]}
          changes={{ '이전 기간': { increased: [], decreased: [] }, '작년 같은 달': { increased: [], decreased: [] } }}
          transactions={TRANSACTIONS}
          excludedCategories={new Set()}
        />
      </MemoryRouter>,
    ),
  )
}

const rowButton = (category: string) => [...container.querySelectorAll('.bar-row')].find(row => row.textContent?.includes(category)) as HTMLButtonElement
const sortButton = (label: string) => [...container.querySelectorAll('.category-detail button')].find(button => button.textContent === label) as HTMLButtonElement

describe('CategorySection', () => {
  it('카테고리를 누르면 그 카테고리 내역의 총합·건수와 큰 금액순 목록을 시트로 보여 준다', async () => {
    await render()
    await act(async () => rowButton('카페').click())

    const sheet = container.querySelector('.category-detail')
    expect(sheet?.textContent).toContain('카페')
    expect(sheet?.textContent).toContain('3건')
    expect([...container.querySelectorAll('.category-detail .tx-row-title')].map(title => title.textContent)).toEqual(['스타벅스', '메가커피', '메가커피'])
  })

  it('횟수순은 가맹점별로 몇 번 썼는지 묶어 보여 준다', async () => {
    await render()
    await act(async () => rowButton('카페').click())
    await act(async () => sortButton('횟수순').click())

    expect([...container.querySelectorAll('.merchant-group')].map(row => row.textContent)).toEqual(['메가커피2회4,000원', '스타벅스1회6,000원'])
  })

  it('시트가 열려 있는 동안 뒤 화면은 스크롤되지 않고, 닫으면 다시 스크롤된다', async () => {
    await render()
    await act(async () => rowButton('카페').click())
    expect(document.documentElement.style.overflow).toBe('hidden')

    vi.useFakeTimers()
    await act(async () => (container.querySelector('.sheet-backdrop') as HTMLElement).click())
    await act(async () => vi.runAllTimers())
    vi.useRealTimers()

    expect(container.querySelector('.category-detail')).toBeNull()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('시트를 잡아 아래로 내리면 닫힌다', async () => {
    await render()
    await act(async () => rowButton('카페').click())
    const sheet = container.querySelector('.category-detail') as HTMLElement
    const touch = (type: string, clientY: number, timeStamp: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        touches: { value: [{ clientY }] },
        changedTouches: { value: [{ clientY }] },
        timeStamp: { value: timeStamp },
      })
      sheet.dispatchEvent(event)
    }

    vi.useFakeTimers()
    await act(async () => {
      touch('touchstart', 100, 0)
      touch('touchmove', 150, 100)
      touch('touchmove', 260, 200)
      touch('touchend', 260, 300)
    })
    await act(async () => vi.runAllTimers())
    vi.useRealTimers()

    expect(container.querySelector('.category-detail')).toBeNull()
  })

  it('정렬을 바꿔도 시트 높이는 처음 열린 높이 그대로 둔다', async () => {
    await render()
    await act(async () => rowButton('카페').click())
    const sheet = container.querySelector('.category-detail') as HTMLElement
    const openedHeight = sheet.style.height

    await act(async () => sortButton('횟수순').click())

    expect(openedHeight).toMatch(/px$/)
    expect(sheet.style.height).toBe(openedHeight)
  })
})
