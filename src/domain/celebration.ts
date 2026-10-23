export const CHEER_MESSAGES = [
  '기록 완료! 오늘도 꼼꼼해요',
  '착착 쌓이는 중이에요',
  '이 정도면 가계부 장인',
  '한 줄 더 똑똑해진 가계부',
  '오늘도 한 걸음 더!',
  '기록하는 습관, 정말 멋져요',
  '오늘의 기록 하나 추가!',
  '덕분에 가계부가 든든해요',
]

export const pickCheer = (random: () => number, previous?: string) => {
  const candidates = CHEER_MESSAGES.filter(message => message !== previous)
  return candidates[Math.floor(random() * candidates.length)]
}

const shiftDay = (dateKey: string, offset: number) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const recordStreak = (recordedDays: Set<string>, todayKey: string) => {
  let streak = 0
  while (recordedDays.has(shiftDay(todayKey, -streak))) streak++
  return streak
}

export const cheerSubline = ({ streak, todayCount }: { streak: number; todayCount: number }) => {
  if (streak >= 2) return `${streak}일 연속 기록 중`
  if (todayCount >= 2) return `오늘 ${todayCount}번째 기록이에요`
  return null
}
