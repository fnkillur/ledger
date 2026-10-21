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
