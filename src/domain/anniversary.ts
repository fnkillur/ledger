// 두 날짜는 설정에서 넣을 때까지 비어 있다. 저장소가 공개라 코드에는 실제 날짜를 두지 않는다.
export type Anniversaries = { 사귄날?: string; 결혼한날?: string }

const KINDS = [
  { key: '사귄날', days: '사귄 지', years: '사귄 지' },
  { key: '결혼한날', days: '결혼', years: '결혼' },
] as const

const DAY_MS = 24 * 60 * 60 * 1000
const LOOKAHEAD_DAYS = 400

// 시트는 2019-01-02 같은 글자를 날짜 칸으로 바꿔 버려서, 20190102 같은 숫자로 주고받는다. 지운 날짜는 빈 값으로 보낸다.
const toSettingValue = (dateKey: string | undefined) => (dateKey ? Number(dateKey.replaceAll('-', '')) : '')

const fromSettingValue = (value: unknown) => {
  const digits = String(value ?? '')
  if (!/^\d{8}$/.test(digits)) return undefined
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

export const anniversariesFromSettings = (settings: Record<string, unknown>): Anniversaries =>
  Object.fromEntries(
    KINDS.flatMap(kind => {
      const dateKey = fromSettingValue(settings[kind.key])
      return dateKey ? [[kind.key, dateKey]] : []
    }),
  )

export const anniversariesToSettings = (anniversaries: Anniversaries) => ({
  사귄날: toSettingValue(anniversaries.사귄날),
  결혼한날: toSettingValue(anniversaries.결혼한날),
})

const toUtc = (dateKey: string) => Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)))

const toDateKey = (time: number) => new Date(time).toISOString().slice(0, 10)

// 처음 만난 날을 1일로 센다.
export const daysTogether = (startKey: string, dateKey: string) => Math.round((toUtc(dateKey) - toUtc(startKey)) / DAY_MS) + 1

export const anniversaryLabels = (dateKey: string, anniversaries: Anniversaries) =>
  KINDS.flatMap(kind => {
    const startKey = anniversaries[kind.key]
    if (!startKey || dateKey <= startKey) return []
    const days = daysTogether(startKey, dateKey)
    const years = Number(dateKey.slice(0, 4)) - Number(startKey.slice(0, 4))
    const labels: string[] = []
    if (days % 100 === 0) labels.push(`${kind.days} ${days.toLocaleString('ko-KR')}일`)
    if (dateKey.slice(5) === startKey.slice(5)) labels.push(`${kind.years} ${years}주년`)
    return labels
  })

export const nextAnniversary = (todayKey: string, anniversaries: Anniversaries) => {
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const dateKey = toDateKey(toUtc(todayKey) + offset * DAY_MS)
    const [label] = anniversaryLabels(dateKey, anniversaries)
    if (label) return { dateKey, label, daysLeft: offset }
  }
  return null
}
