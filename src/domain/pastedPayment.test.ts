import { describe, expect, it } from 'vitest'
import { findOccurredAt, parsePastedPayment } from './pastedPayment'

const now = new Date(2026, 9, 21, 15, 0)
const local = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`

describe('findOccurredAt', () => {
  it.each([
    ['승인 10/21 13:45 스타벅스', '2026-10-21 13:45'],
    ['2026.10.20 09:05 결제', '2026-10-20 9:05'],
    ['10월 19일 18:30 사용', '2026-10-19 18:30'],
    ['10/18 일시불', '2026-10-18 12:00'],
    ['12/30 21:00 결제', '2025-12-30 21:00'],
  ])('%s → %s', (text, expected) => {
    expect(local(findOccurredAt(text, now))).toBe(expected)
  })

  it('날짜가 없으면 지금 시각을 쓴다', () => {
    expect(findOccurredAt('5,000원 결제', now)).toBe(now)
  })

  it('금액의 쉼표나 잘못된 날짜를 날짜로 오인하지 않는다', () => {
    expect(findOccurredAt('누적 45/99 12,000원 승인', now)).toBe(now)
  })
})

describe('parsePastedPayment', () => {
  it('카톡 알림 문구에서 금액·날짜를 읽는다', () => {
    const parsed = parsePastedPayment('[Web발신]\n승인 우*사기\n32,000원 일시불\n10/20 19:12\n올리브영에서\n누적 512,300원', now)

    expect(parsed).toMatchObject({ kind: '지출', amount: 32000, merchant: '올리브영' })
    expect(local(new Date(parsed!.occurredAt))).toBe('2026-10-20 19:12')
  })
})

describe('connect code', async () => {
  const { decodeConnectCode, encodeConnectCode } = await import('../sync/connectCode')
  const endpoint = 'https://script.google.com/macros/s/AKfyTEST_abc-123/exec'
  const token = '0f8b8a1e-1111-2222-3333-444455556666'

  it('인코딩한 코드를 그대로 복원한다', () => {
    expect(decodeConnectCode(`  ${encodeConnectCode(endpoint, token)}\n`)).toEqual({ endpoint, token })
  })

  it('형식이 다르거나 다른 주소면 거부한다', () => {
    expect(decodeConnectCode('hello')).toBeNull()
    expect(decodeConnectCode(encodeConnectCode('https://evil.example/exec', token))).toBeNull()
  })
})
