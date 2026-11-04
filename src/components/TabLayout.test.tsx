import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import TabLayout from './TabLayout'

const renderAt = async (path: string) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<TabLayout />}>
            <Route path="*" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  )
  const activeLabels = [...container.querySelectorAll('.tab-link.active')].map(link => link.textContent)
  root.unmount()
  return activeLabels
}

describe('TabLayout', () => {
  it('지금 있는 탭에 선택 표시를 한다', async () => {
    expect(await renderAt('/list')).toEqual(['내역'])
    expect(await renderAt('/')).toEqual(['캘린더'])
  })

  it('주기 화면에서도 캘린더 탭을 선택된 것으로 보여 준다', async () => {
    expect(await renderAt('/cycles')).toEqual(['캘린더'])
  })
})
