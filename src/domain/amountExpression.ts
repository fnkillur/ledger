type Token = number | '+' | '-' | '*' | '/' | '(' | ')'

const tokenize = (expression: string): Token[] | null => {
  const tokens: Token[] = []
  const source = expression.replace(/[,\s원]/g, '')
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if ('+-*/()'.includes(char)) {
      tokens.push(char as Token)
      index += 1
      continue
    }
    const number = source.slice(index).match(/^\d+(\.\d+)?/)
    if (!number) return null
    tokens.push(Number(number[0]))
    index += number[0].length
  }
  return tokens
}

// 사칙연산과 괄호만 지원하는 재귀 하강 파서. eval을 쓰지 않는다.
const parse = (tokens: Token[]) => {
  let position = 0

  const parsePrimary = (): number => {
    const token = tokens[position++]
    if (token === '-') return -parsePrimary()
    if (token === '(') {
      const value = parseSum()
      if (tokens[position++] !== ')') throw new Error('괄호')
      return value
    }
    if (typeof token !== 'number') throw new Error('숫자')
    return token
  }

  const parseProduct = (): number => {
    let value = parsePrimary()
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++]
      const right = parsePrimary()
      value = operator === '*' ? value * right : value / right
    }
    return value
  }

  const parseSum = (): number => {
    let value = parseProduct()
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++]
      const right = parseProduct()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }

  const value = parseSum()
  if (position !== tokens.length) throw new Error('남은 토큰')
  return value
}

export const evaluateAmount = (expression: string): number | null => {
  const tokens = tokenize(expression.replace(/^=/, ''))
  if (!tokens || tokens.length === 0) return null
  try {
    const value = parse(tokens)
    return Number.isFinite(value) ? Math.round(value) : null
  } catch {
    return null
  }
}
