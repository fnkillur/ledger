import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateWheel } from './DateTimePicker'

let container: HTMLDivElement
let root: Root

const selected = (label: string) => container.querySelector(`[aria-label="${label}"] [aria-selected="true"]`)?.textContent

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('DateWheel', () => {
  it('년·월·일 세 줄로 지금 날짜를 가리키고, 그 달의 날수만큼 일을 보여 준다', async () => {
    await act(async () => root.render(<DateWheel value="2024-02-10" onChange={() => {}} />))

    expect([selected('년'), selected('월'), selected('일')]).toEqual(['2024년', '2월', '10일'])
    expect(container.querySelectorAll('[aria-label="일"] [role="option"]')).toHaveLength(29)
  })

  it('달을 굴려 그 달에 없는 날이 되면 그 달 마지막 날로 맞춘다', async () => {
    const onChange = vi.fn()
    await act(async () => root.render(<DateWheel value="2023-03-31" onChange={onChange} />))

    const months = container.querySelector('[aria-label="월"]') as HTMLElement
    months.scrollTop = 36
    await act(async () => {
      months.dispatchEvent(new Event('scroll'))
      await new Promise(resolve => setTimeout(resolve, 200))
    })

    expect(onChange).toHaveBeenCalledWith('2023-02-28')
  })
})
