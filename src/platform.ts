import type { Person } from './domain/types'

export const IS_WEB_BUILD = import.meta.env.MODE === 'web'

// 웹(아이폰 홈 화면 앱)은 우사기, 안드로이드 앱은 쿠리만쥬가 쓴다.
export const DEVICE_PERSON: Person = IS_WEB_BUILD ? '우사기' : '쿠리만쥬'
