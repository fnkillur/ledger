import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AddMenu from './AddMenu'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AddMenu', () => {
  it('영수증으로 올리기를 누르면 카메라와 갤러리 중에 고른다', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AddMenu />
        </MemoryRouter>,
      ),
    )
    await act(async () => (container.querySelector('.fab') as HTMLButtonElement).click())
    const receiptItem = [...container.querySelectorAll('.add-menu-item')].find(item => item.textContent?.includes('영수증으로 올리기')) as HTMLButtonElement
    expect(container.querySelectorAll('.add-menu-item input[type="file"]')).toHaveLength(0)
    await act(async () => receiptItem.click())

    const sheet = document.querySelector('[role="dialog"][aria-label="영수증 올리기"]')
    const inputOf = (title: string) => [...(sheet?.querySelectorAll('label') ?? [])].find(label => label.textContent?.includes(title))?.querySelector('input')
    expect(inputOf('카메라')?.getAttribute('capture')).toBe('environment')
    expect(inputOf('갤러리')?.hasAttribute('capture')).toBe(false)
  })
})
