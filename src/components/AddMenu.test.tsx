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
  it('영수증은 카메라로 바로 찍거나 앨범에서 고를 수 있다', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AddMenu />
        </MemoryRouter>,
      ),
    )
    await act(async () => (container.querySelector('.fab') as HTMLButtonElement).click())

    const inputOf = (title: string) => [...container.querySelectorAll('.add-menu-item')].find(item => item.textContent?.includes(title))?.querySelector('input')
    expect(inputOf('영수증 찍기')?.getAttribute('capture')).toBe('environment')
    expect(inputOf('영수증 사진')?.hasAttribute('capture')).toBe(false)
  })
})
