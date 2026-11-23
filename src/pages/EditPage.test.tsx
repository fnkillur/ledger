import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'
import { UNCATEGORIZED, type Transaction } from '../domain/types'
import { analyzeReceipt } from '../sync/api'
import { saveSettings } from '../sync/settings'
import EditPage from './EditPage'

vi.mock('../sync/api', () => ({ analyzeReceipt: vi.fn() }))
vi.mock('../utils/image', () => ({ toJpegBase64: vi.fn(async () => 'aW1hZ2U=') }))

let container: HTMLDivElement
let root: Root

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  occurredAt: '2026-11-10T03:00:00.000Z',
  person: '쿠리만쥬',
  kind: '지출',
  amount: 5000,
  shareCount: 1,
  merchant: '롯데마트',
  category: '식재료',
  excluded: false,
  source: '수동',
  memo: '',
  rawText: '',
  deleted: false,
  updatedAt: '2026-11-10T03:00:00.000Z',
  scope: '공동',
  ...overrides,
})

const renderAt = async (entry: string | { pathname: string; state: unknown }) => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/', entry]} initialIndex={1}>
        <Routes>
          <Route path="/" element={<p>목록</p>} />
          <Route path="/tx/new" element={<EditPage />} />
          <Route path="/tx/:id" element={<EditPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  )
  await wait()
}

const typeInto = async (label: string, value: string) => {
  const input = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const pickCategory = async (name: string) => {
  const findChip = () => [...container.querySelectorAll('[role="radiogroup"][aria-label="카테고리"] button')].find(chip => chip.textContent?.includes(name)) as HTMLButtonElement | undefined
  // 저장소에서 내역을 읽어 와야 화면이 그려지므로, 카테고리가 보일 때까지 기다린다.
  for (let attempt = 0; attempt < 20 && !container.querySelector('.category-chip'); attempt += 1) await wait()
  if (!findChip()) await act(async () => (container.querySelector('.category-chip.is-more') as HTMLButtonElement).click())
  await act(async () => findChip()!.click())
  await wait()
}

const switchOf = (label: string) => container.querySelector(`[role="switch"][aria-label="${label}"]`)

const clickSave = async () => {
  await act(async () => (container.querySelector('.bottom-cta .button-primary') as HTMLButtonElement).click())
  await wait()
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  await db.categories.bulkPut(DEFAULT_CATEGORIES)
  saveSettings({ endpoint: 'https://script.google.com/macros/s/x/exec', token: 'test-token-1234567890', defaultPerson: '쿠리만쥬' })
  vi.mocked(analyzeReceipt).mockResolvedValue({ merchant: '롯데마트', total: 20470, items: [{ name: '호박고구마', amount: 20470, category: '식재료' }] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('영수증으로 나누기', () => {
  it('+ 메뉴에서 영수증을 고르고 들어오면 카테고리를 불러온 뒤 함께 보낸다', async () => {
    const receiptFile = new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' })
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[{ pathname: '/tx/new', state: { receiptFile } }]}>
          <Routes>
            <Route path="/tx/new" element={<EditPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    )
    await wait()

    expect(analyzeReceipt).toHaveBeenCalledTimes(1)
    const { categories } = vi.mocked(analyzeReceipt).mock.calls[0][1]
    expect(categories).toContain('식재료')
    expect(categories).not.toContain(UNCATEGORIZED)
    expect(container.textContent).not.toContain('카테고리 목록이 없어요')
  })
  it('영수증에 결제 날짜·시각이 있으면 새로 쓰는 내역의 날짜에 채운다', async () => {
    vi.mocked(analyzeReceipt).mockResolvedValue({ merchant: '롯데마트', total: 20470, paidAt: '2026-11-10T18:42', items: [{ name: '호박고구마', amount: 20470, category: '식재료' }] })
    const receiptFile = new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' })
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[{ pathname: '/tx/new', state: { receiptFile } }]}>
          <Routes>
            <Route path="/tx/new" element={<EditPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    )
    await wait()

    expect(container.textContent).toContain('11월 10일')
    expect(container.textContent).toContain('오후 6:42')
  })
})

describe('식재료 영수증 품목', () => {
  it('영수증으로 나눠 저장하면 식재료 묶음에만 품목과 영수증 금액을 남긴다', async () => {
    vi.mocked(analyzeReceipt).mockResolvedValue({
      merchant: '롯데마트',
      total: 5000,
      items: [
        { name: '호박고구마', amount: 3000, quantity: 2, category: '식재료' },
        { name: '키친타월', amount: 2000, quantity: 1, category: '편의점·마트·잡화' },
      ],
    })
    await renderAt({ pathname: '/tx/new', state: { receiptFile: new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' }) } })

    await clickSave()

    const saved = await db.transactions.toArray()
    expect(saved.find(item => item.category === '식재료')?.receiptItems).toEqual([{ name: '호박고구마', amount: 3000, quantity: 2 }])
    expect(saved.find(item => item.category === '편의점·마트·잡화')?.receiptItems).toEqual([])
  })

  it('품목이 남은 내역을 열면 품목과 금액을 보여 준다', async () => {
    await db.transactions.put(transaction({ receiptItems: [{ name: '호박고구마', amount: 3000 }, { name: '두부', amount: 2000 }] }))
    await renderAt('/tx/tx-1')

    const items = [...container.querySelectorAll('.receipt-lines li')].map(item => item.textContent)
    expect(items).toEqual(['호박고구마3,000원', '두부2,000원'])
  })
})

describe('자동 분류·지난 내역 바꾸기', () => {
  beforeEach(async () => {
    await db.transactions.put(transaction({ id: 'past', merchant: '스타벅스', category: '편의점·마트·잡화' }))
  })

  it('자동 분류도 지난 내역 바꾸기도 꺼진 채로 시작해서, 필요할 때만 켠다', async () => {
    await renderAt('/tx/new')
    await typeInto('가맹점·내용', '스타벅스')
    await pickCategory('식재료')

    expect(switchOf('자동 분류 규칙 저장')?.getAttribute('aria-checked')).toBe('false')
    expect(switchOf('지난 내역도 바꾸기')).toBeNull()

    await act(async () => (switchOf('자동 분류 규칙 저장') as HTMLButtonElement).click())
    expect(switchOf('지난 내역도 바꾸기')?.getAttribute('aria-checked')).toBe('false')
  })

  it('영수증 읽기에 실패해 직접 고르더라도 자동 분류를 묻지 않는다', async () => {
    vi.mocked(analyzeReceipt).mockRejectedValue(new Error('영수증을 읽지 못했어요.'))
    await renderAt({ pathname: '/tx/new', state: { receiptFile: new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' }) } })
    await act(async () => ([...document.querySelectorAll('button')].find(button => button.textContent === '직접 입력하기') as HTMLButtonElement).click())
    await typeInto('가맹점·내용', '스타벅스')
    await pickCategory('식재료')

    expect(switchOf('자동 분류 규칙 저장')).toBeNull()
  })

  it('영수증을 읽는 동안 입력 화면을 가리는 로딩 화면을 띄운다', async () => {
    vi.mocked(analyzeReceipt).mockReturnValue(new Promise(() => {}))
    await renderAt({ pathname: '/tx/new', state: { receiptFile: new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' }) } })

    const loading = document.querySelector('[role="dialog"][aria-label="영수증 읽는 중"]')
    expect(loading?.querySelector('video')).not.toBeNull()
    expect(loading?.textContent).toContain('영수증을 읽고 있어요')
  })

  it('읽기에 실패하면 같은 사진으로 다시 시도할 수 있다', async () => {
    vi.mocked(analyzeReceipt).mockRejectedValueOnce(new Error('영수증을 읽지 못했어요. (503 UNAVAILABLE This model is currently experiencing high demand.)'))
    await renderAt({ pathname: '/tx/new', state: { receiptFile: new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' }) } })

    const failed = document.querySelector('[role="dialog"][aria-label="영수증 읽기 실패"]')
    expect(failed?.textContent).toContain('영수증 분석 서버가 붐벼요')
    await act(async () => ([...document.querySelectorAll('button')].find(button => button.textContent === '다시 시도') as HTMLButtonElement).click())
    await wait()

    expect(analyzeReceipt).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="dialog"][aria-label^="영수증 읽"]')).toBeNull()
    expect(container.querySelector('.receipt-panel')?.textContent).toContain('호박고구마')
  })

  it('영수증으로 저장한 내역을 고칠 때도 자동 분류를 묻지 않는다', async () => {
    await db.transactions.put(transaction({ merchant: '스타벅스', receiptItems: [] }))
    await renderAt('/tx/tx-1')
    await pickCategory('편의점·마트·잡화')

    expect(switchOf('자동 분류 규칙 저장')).toBeNull()
  })
})

describe('공금·용돈', () => {
  it('지출을 새로 쓸 때 공금과 용돈 중에 고른다', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/tx/new']}>
          <Routes>
            <Route path="/tx/new" element={<EditPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    )
    await wait()

    const options = [...container.querySelectorAll('[aria-label="공금·용돈"] button')].map(option => option.textContent)
    expect(options).toEqual(['공금', '용돈'])
  })

  it('저장된 내역의 카테고리를 바꿔도 공금·용돈은 그대로 둔다', async () => {
    await db.transactions.put(transaction({ category: '식재료', scope: '개인' }))
    await renderAt('/tx/tx-1')

    await pickCategory('쇼핑')
    await pickCategory('외식')
    await clickSave()

    expect(await db.transactions.get('tx-1')).toMatchObject({ category: '외식', scope: '개인' })
  })

  it('새로 쓸 때 카테고리를 골라도 공금·용돈은 고른 그대로다', async () => {
    await renderAt('/tx/new')
    await typeInto('금액', '12000')

    await pickCategory('쇼핑')
    const chosen = container.querySelector('[aria-label="공금·용돈"] [aria-checked="true"]')

    expect(chosen?.textContent).toBe('공금')
  })
})

