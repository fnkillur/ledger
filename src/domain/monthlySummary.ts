export type MonthlyLine = { category: string; amount: number; line: string }

const normalize = (text: string) => text.replace(/[\s·ㆍ・‧.,:;'"`\-_~]/g, '')

// 글자 인식이 %를 숫자로 읽는 경우가 많아서(35% → 3596), "원"이 붙었거나 천 단위 쉼표가 있는 숫자만 금액으로 본다.
const WON_PATTERN = /(\d[\d,.]*)\s*원/g
const GROUPED_PATTERN = /(?<![\d,.])(\d{1,3}(?:,\d{3})+)(?![\d,.]|\s*%)/g
const TOTAL_PATTERN = /총|합계|쓴\s*돈|지출/

const toNumber = (digits: string) => Number(digits.replace(/[,.]/g, ''))

const findAmounts = (line: string) => {
  const withWon = [...line.matchAll(WON_PATTERN)].map(match => toNumber(match[1]))
  if (withWon.length > 0) return withWon
  return [...line.matchAll(GROUPED_PATTERN)].map(match => toNumber(match[1]))
}

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row++) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column++) {
      const above = previous[column]
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[right.length]
}

// 글자 인식은 한두 글자를 틀리기 쉬워서, 이름 길이에 비례해 오타를 허용한다.
const containsFuzzy = (line: string, name: string) => {
  if (line.includes(name)) return true
  const allowed = Math.floor(name.length / 4)
  if (allowed === 0) return false
  for (let start = 0; start + name.length <= line.length + allowed; start++) {
    if (editDistance(line.slice(start, start + name.length), name) <= allowed) return true
  }
  return false
}

const matchCategory = (line: string, categoryNames: string[]) => {
  const target = normalize(line)
  return (
    categoryNames
      .map(name => ({ name, key: normalize(name) }))
      .sort((left, right) => right.key.length - left.key.length)
      .find(({ key }) => key.length > 0 && containsFuzzy(target, key))?.name ?? null
  )
}

const OTHERS_PATTERN = /그\s*외\s*(\d+)\s*개/

export type OthersCheck = { count: number; expected: number; actual: number; readCount: number }

// 토스는 상위 3개 아래에 "그 외 N개 합계"를 보여주고, 그걸 누르면 N개 목록이 나온다. 두 캡처를 함께 넣으면 합계로 검산할 수 있다.
export const parseMonthlySummary = (text: string, categoryNames: string[]) => {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const matched = new Map<string, MonthlyLine>()
  const unmatched: { line: string; amount: number }[] = []
  const othersMembers = new Set<string>()
  let total: number | null = null
  let othersExpected: { count: number; amount: number } | null = null
  let isInOthersList = false

  const addItem = (category: string, amount: number, line: string) => {
    if (matched.has(category)) return
    matched.set(category, { category, amount, line })
    if (isInOthersList) othersMembers.add(category)
  }

  lines.forEach((line, index) => {
    const amounts = findAmounts(line)
    const others = line.match(OTHERS_PATTERN)
    if (others) {
      if (amounts.length > 0) othersExpected = { count: Number(others[1]), amount: amounts[0] }
      else isInOthersList = true
      return
    }

    const category = matchCategory(line, categoryNames)
    if (category) {
      if (amounts.length > 0) addItem(category, amounts[0], line)
      return
    }
    if (amounts.length === 0) return

    const previousLine = index > 0 ? lines[index - 1] : ''
    const isTotalLabelAbove = TOTAL_PATTERN.test(previousLine) && findAmounts(previousLine).length === 0
    if (total === null && (TOTAL_PATTERN.test(line) || isTotalLabelAbove)) {
      total = Math.max(...amounts)
      return
    }
    const previousCategory = matchCategory(previousLine, categoryNames)
    if (previousCategory && findAmounts(previousLine).length === 0) {
      addItem(previousCategory, amounts[0], `${previousLine} ${line}`)
      return
    }
    if (amounts[0] > 0) unmatched.push({ line, amount: amounts[0] })
  })

  const items = [...matched.values()]
  const expected = othersExpected as { count: number; amount: number } | null
  const othersCheck: OthersCheck | null =
    expected && othersMembers.size > 0
      ? {
          count: expected.count,
          expected: expected.amount,
          actual: items.filter(item => othersMembers.has(item.category)).reduce((sum, item) => sum + item.amount, 0),
          readCount: othersMembers.size,
        }
      : null

  return { items, unmatched, total, othersCheck }
}
