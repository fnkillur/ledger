const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export const formatWon = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

export const formatSignedWon = (amount: number, kind: '지출' | '수입' | '저축') => {
  if (kind === '수입') return `+${formatWon(amount)}`
  return formatWon(amount)
}

export const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  return `${year}년 ${month}월`
}

export const formatShortMonth = (monthKey: string) => `${Number(monthKey.split('-')[1])}월`

export const formatDayLabel = (iso: string) => {
  const date = new Date(iso)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`
}

export const formatTime = (iso: string) => {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const pad = (value: number) => String(value).padStart(2, '0')

export const toDateKey = (iso: string) => {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const toLocalInputValue = (iso: string) => {
  const date = new Date(iso)
  return `${toDateKey(iso)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const fromLocalInputValue = (value: string) => new Date(value).toISOString()

export const shiftMonth = (monthKey: string, offset: number) => {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 + offset, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export const currentMonthKey = () => {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}
