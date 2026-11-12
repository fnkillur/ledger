import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import ScopeChips from './ScopeChips'

describe('ScopeChips', () => {
  it('전체·공금·사람별 용돈으로 고른다', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<ScopeChips value="전체" onChange={() => {}} />))

    const chips = [...container.querySelectorAll('button')]
    expect(chips.map(chip => chip.textContent)).toEqual(['전체', '공금', '용돈', '용돈'])
    expect(chips.map(chip => chip.getAttribute('aria-label'))).toEqual(['전체', '공금', '쿠리만쥬 용돈', '우사기 용돈'])
    root.unmount()
  })
})
