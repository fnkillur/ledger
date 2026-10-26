import type { Rule } from './types'

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')

export const classifyMerchant = (merchant: string, rules: Rule[]) => {
  const target = normalize(merchant)
  if (!target) return null

  const matched = rules
    .filter(rule => rule.category && normalize(rule.keyword) && target.includes(normalize(rule.keyword)))
    .sort((left, right) => normalize(right.keyword).length - normalize(left.keyword).length)

  return matched[0]?.category ?? null
}

// 분류 규칙이 없는 처음 보는 가맹점은 이름에 흔히 들어가는 단어로 기본 카테고리를 추정한다.
const KEYWORDS: [string, string[]][] = [
  ['카페·간식', ['스타벅스', '커피', '카페', '이디야', '투썸', '빽다방', '컴포즈', '할리스', '폴바셋', '블루보틀', '파리바게뜨', '뚜레쥬르', '베이커리', '던킨', '배스킨', '설빙']],
  ['편의점·마트·잡화', ['gs25', 'cu', '씨유', '세븐일레븐', '이마트24', '편의점', '이마트', '홈플러스', '롯데마트', '코스트코', '트레이더스', '마트', '쿠팡', '컬리', '다이소', '노브랜드']],
  ['식비', ['배달의민족', '배민', '요기요', '쿠팡이츠', '땡겨요', '식당', '김밥', '맥도날드', '버거킹', '롯데리아', '맘스터치', '서브웨이', '치킨', '피자', '국밥', '분식']],
  ['교통·자동차', ['택시', '카카오t', '카카오모빌리티', '주유', '주차', '파킹', '티머니', '코레일', 'srt', '고속버스', '하이패스', '칼텍스', 's-oil', '에스오일', '오일뱅크', 'sk에너지']],
  ['주거·통신', ['관리비', 'sk텔레콤', 'skt', 'kt', '유플러스', '도시가스', '한국전력', '전기요금', '수도요금']],
  ['의료·건강·피트니스', ['약국', '병원', '의원', '치과', '한의원', '헬스', '필라테스', '요가']],
  ['쇼핑', ['무신사', '29cm', '지그재그', '에이블리', '백화점', '아울렛', '유니클로', '자라', '나이키', '아디다스', '올리브영']],
  ['미용', ['미용실', '헤어', '네일']],
  ['취미·여가', ['넷플릭스', '유튜브', '스포티파이', '멜론', '디즈니', '티빙', '왓챠', '웨이브', '쿠팡플레이', 'cgv', '메가박스', '롯데시네마', '스팀', '닌텐도', 'apple', '애플', '구글플레이']],
  ['술·유흥', ['이자카야', '호프', '포차', '주점', '술집', '노래']],
  ['교육', ['교보문고', '영풍문고', '알라딘', 'yes24', '예스24', '클래스101', '인프런', '학원']],
  ['보험·세금·기타금융', ['보험', '화재', '생명', '국세', '지방세']],
  ['여행·숙박', ['호텔', '모텔', '에어비앤비', '야놀자', '여기어때', '항공', '리조트', '펜션']],
]

const SHORT_LATIN = /^[a-z0-9-]{1,3}$/

const containsKeyword = (merchant: string, keyword: string) => {
  if (!SHORT_LATIN.test(keyword)) return normalize(merchant).includes(keyword)
  return new RegExp(`(^|[^a-z0-9])${keyword}([^a-z0-9]|$)`).test(merchant.toLowerCase())
}

export const guessCategory = (merchant: string) => {
  const matches = KEYWORDS.flatMap(([category, keywords]) =>
    keywords.filter(keyword => containsKeyword(merchant, keyword)).map(keyword => ({ category, length: keyword.length })),
  )
  return matches.sort((left, right) => right.length - left.length)[0]?.category ?? null
}

export const suggestCategory = (merchant: string, rules: Rule[], categoryNames: string[]) => {
  const fromRule = classifyMerchant(merchant, rules)
  if (fromRule) return fromRule
  const guessed = guessCategory(merchant)
  return guessed && categoryNames.includes(guessed) ? guessed : null
}
