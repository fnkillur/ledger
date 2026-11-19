import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReceiptLoading, { CANCEL_OFFER_DELAY_MS } from './ReceiptLoading'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const cancelButton = () => [...document.querySelectorAll('button')].find(button => button.textContent === '취소')

describe('ReceiptLoading', () => {
  it('영상 첫 장면을 미리 보여 주고, 오래 걸리면 취소 버튼을 띄운다', async () => {
    const onCancel = vi.fn()
    await act(async () => root.render(<ReceiptLoading onRetry={() => {}} onCancel={onCancel} />))

    expect(document.querySelector('.receipt-loading video')?.getAttribute('poster')).toContain('receipt-loading.jpg')
    expect(cancelButton()).toBeUndefined()

    await act(async () => vi.advanceTimersByTime(CANCEL_OFFER_DELAY_MS))
    await act(async () => cancelButton()!.click())
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('실패 이유는 문장마다 줄을 바꿔 보여 준다', async () => {
    await act(async () => root.render(<ReceiptLoading errorMessage="영수증 분석 서버가 붐벼요. 잠시 뒤 다시 시도해 주세요." onRetry={() => {}} onCancel={() => {}} />))

    const message = document.querySelector('.receipt-loading-message')
    expect(message?.querySelectorAll('br')).toHaveLength(1)
    expect(message?.textContent).toBe('영수증 분석 서버가 붐벼요.잠시 뒤 다시 시도해 주세요.')
  })

  it('읽는 중에도 실패한 뒤에도 우측 상단 닫기 버튼으로 나갈 수 있다', async () => {
    const onCancel = vi.fn()
    await act(async () => root.render(<ReceiptLoading onRetry={() => {}} onCancel={onCancel} />))
    await act(async () => (document.querySelector('.receipt-loading-close[aria-label="닫기"]') as HTMLButtonElement).click())

    await act(async () => root.render(<ReceiptLoading errorMessage="실패했어요." onRetry={() => {}} onCancel={onCancel} />))
    await act(async () => (document.querySelector('.receipt-loading-close[aria-label="닫기"]') as HTMLButtonElement).click())

    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
