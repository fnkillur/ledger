import { CakeIcon, PushPinIcon } from '@phosphor-icons/react'
import { isDayInfo, TARGET_TONE, type CalendarBar, type CalendarTarget } from '../../domain/calendar'
import PersonAvatar from '../PersonAvatar'

type CalendarEventChipProps = {
  bar: CalendarBar
}

// 칸이 좁아서 짤은 막대 왼쪽 위에 작은 동그라미로 걸쳐 두고, 막대 폭은 제목에 쓴다.
function CalendarEventChip({ bar }: CalendarEventChipProps) {
  const className = [
    'cal-chip',
    TARGET_TONE[bar.event.target],
    bar.event.allDay ? '' : 'is-timed',
    bar.continuesBefore ? 'continues-before' : '',
    bar.continuesAfter ? 'continues-after' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={className} style={{ gridColumn: `${bar.startColumn + 1} / span ${bar.span}`, gridRow: bar.lane + 2 }}>
      {!bar.continuesBefore && <TargetAvatars target={bar.event.target} size={10} className="chip-avatars" />}
      <span className="cal-chip-title">{bar.event.title}</span>
    </span>
  )
}

type TargetAvatarsProps = {
  target: CalendarTarget
  size: number
  className?: string
}

export function TargetAvatars({ target, size, className = '' }: TargetAvatarsProps) {
  if (isDayInfo(target)) return null
  const people = target === '공동' ? (['쿠리만쥬', '우사기'] as const) : [target]
  return (
    <span className={`target-avatars ${people.length > 1 ? 'is-pair ' : ''}${className}`}>
      {people.map(person => (
        <PersonAvatar key={person} person={person} size={size} />
      ))}
    </span>
  )
}

type DayInfoIconProps = {
  target: '기념일' | '없음'
  size: number
}

// 사람 짤 자리와 같은 크기의 동그라미에 대상 색으로 아이콘을 넣어 칩 높이와 리듬을 맞춘다.
export function DayInfoIcon({ target, size }: DayInfoIconProps) {
  const Icon = target === '기념일' ? CakeIcon : PushPinIcon
  return (
    <span className="day-info-icon" style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.62)} weight="fill" />
    </span>
  )
}

export default CalendarEventChip
