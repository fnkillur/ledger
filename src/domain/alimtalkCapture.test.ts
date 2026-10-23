import { describe, expect, it } from 'vitest'
import { parseAlimtalkCapture } from './alimtalkCapture'

// 삼성카드 알림톡 캡처를 글자 인식한 실제 결과(이름·카드번호 일부는 원문 그대로 가려진 상태).
const SAMSUNG_OCR = [
  '11:30 표                                1 수',
  '삼성카드 ·                        =',
  '<                  ® 1588-8700 v                 Q    -_',
  '삼성카드',
  '양           ^@"ㅇ~',
  '알림톡 도착                                 © |',
  '삼성3975승인 박*윤',
  '2,500원 일시불',
  '10/20 18:23 Apple',
  '누적2,311,850원',
  '이번달 이용내역 조회',
  '오후 6:23',
  'A',
  '69 삼성카드                  :    | 나노      수',
  '알림톡 도착',
  '삼성7981승인 박*윤',
  '4,000원 일시불',
  '10/20 23:52 아이파킹주식회사',
  '누적2,315,850원',
  '이번달 이용내역 조회',
  '에 A',
  '1108 22일 목요일',
  '5                       20261 10% 22          >                      >',
  '7          e',
  '알림톡 도착',
  '[삼성카드]7981',
  '자동결제 10/21접수',
  '아파트관리비',
  '241,360원',
  '오전 9:19',
  '삼성카드바로가기 A',
  'pe',
  '+',
].join('\n')

const NOW = new Date(2026, 9, 23, 11, 30)

const summarize = (text: string) =>
  parseAlimtalkCapture(text, NOW).map(item => ({
    amount: item.amount,
    merchant: item.merchant,
    occurredAt: new Date(item.occurredAt).toLocaleString('sv-SE').slice(0, 16),
    isCancel: item.isCancel,
  }))

describe('parseAlimtalkCapture', () => {
  it('승인 알림은 날짜·시각 뒤를 가맹점으로, 자동결제는 접수 다음 줄을 가맹점으로 읽는다', () => {
    expect(summarize(SAMSUNG_OCR)).toEqual([
      { amount: 2500, merchant: 'Apple', occurredAt: '2026-10-20 18:23', isCancel: false },
      { amount: 4000, merchant: '아이파킹주식회사', occurredAt: '2026-10-20 23:52', isCancel: false },
      { amount: 241360, merchant: '아파트관리비', occurredAt: '2026-10-21 12:00', isCancel: false },
    ])
  })

  it('캡처 여러 장이 겹쳐서 같은 알림이 두 번 읽혀도 한 번만 남긴다', () => {
    expect(summarize(`${SAMSUNG_OCR}\n${SAMSUNG_OCR}`)).toHaveLength(3)
  })

  it('취소 알림은 취소로 표시하고, 금액이 없는 말풍선은 건너뛴다', () => {
    const text = ['알림톡 도착', '삼성3975승인취소 박*윤', '2,500원 일시불', '10/20 19:01 Apple', '알림톡 도착', '이번달 혜택 안내', '알림톡 도착', '(광고) 5,000원 할인 쿠폰 도착'].join('\n')

    expect(summarize(text)).toEqual([{ amount: 2500, merchant: 'Apple', occurredAt: '2026-10-20 19:01', isCancel: true }])
  })
})
