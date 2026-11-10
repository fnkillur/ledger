import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { DEFAULT_CATEGORIES } from '../domain/defaultCategories'
import { UNCATEGORIZED } from '../domain/types'
import { analyzeReceipt } from '../sync/api'
import { saveSettings } from '../sync/settings'
import EditPage from './EditPage'

vi.mock('../sync/api', () => ({ analyzeReceipt: vi.fn() }))
vi.mock('../utils/image', () => ({ toJpegBase64: vi.fn(async () => 'aW1hZ2U=') }))

let container: HTMLDivElement
let root: Root

const wait = () => act(() => new Promise(resolve => setTimeout(resolve, 30)))

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
})
