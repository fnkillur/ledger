import type { Category, Kind } from './types'

type Options = { excluded?: boolean; fixed?: boolean; personal?: boolean }

const DEFAULTS: [Kind, string, string, Options?][] = [
  ['지출', '편의점·마트·잡화', '🛒'],
  ['지출', '여행·숙박', '✈️'],
  ['지출', '쇼핑', '🛍️', { personal: true }],
  ['지출', '식비', '🍚'],
  ['지출', '교통·자동차', '🚗'],
  ['지출', '주거·통신', '🏠', { fixed: true }],
  ['지출', '보험·세금·기타금융', '🧾', { fixed: true }],
  ['지출', '의료·건강·피트니스', '💊'],
  ['지출', '취미·여가', '🎮', { personal: true }],
  ['지출', '카페·간식', '☕'],
  ['지출', '술·유흥', '🍺'],
  ['지출', '미용', '💇', { personal: true }],
  ['지출', '생활', '🧺'],
  ['지출', '원두', '🫘'],
  ['지출', '과자', '🍪'],
  ['지출', '모임계', '👥', { fixed: true, personal: true }],
  ['지출', '부모님용돈', '👵'],
  ['지출', '선물', '🎁'],
  ['지출', '교육', '📚', { personal: true }],
  ['지출', '축의금', '💐'],
  ['지출', '카드대금', '💳', { fixed: true }],
  ['지출', '카테고리 없음', '❔'],
  ['수입', '월급', '💼'],
  ['수입', '은행이자지원', '🏦'],
  ['수입', '연말정산', '🧮'],
  ['수입', '보험금환급', '🩹'],
  ['수입', '상여(출장포함)', '🎉'],
  ['수입', '배당금', '📈'],
  ['수입', 'K패스환급', '🚇'],
  ['수입', '인터넷환급', '🌐'],
  ['수입', '정산', '🔁', { excluded: true }],
  ['저축', '저축·투자', '🐷', { excluded: true }],
]

export const DEFAULT_CATEGORIES: Category[] = DEFAULTS.map(([kind, name, icon, options = {}], index) => ({
  kind,
  name,
  order: index + 1,
  excluded: options.excluded === true,
  fixed: options.fixed === true,
  icon,
  personal: options.personal === true,
}))
