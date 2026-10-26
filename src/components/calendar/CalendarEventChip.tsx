import { TARGET_TONE, type CalendarBar, type CalendarTarget } from '../../domain/calendar'
import PersonAvatar from '../PersonAvatar'

type CalendarEventChipProps = {
  bar: CalendarBar
}

// 칸이 좁아서 짤은 막대 왼쪽 위에 작은 동그라미로 걸쳐 두고, 막대 폭은 제목에 쓴다.
function CalendarEventChip({ bar }: CalendarEventChipProps) {
  const className = [
    'cal-chip',
    TARGET_TONE[bar.event.target],
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
  if (target === '없음') return null
  const people = target === '공동' ? (['쿠리만쥬', '우사기'] as const) : [target]
  return (
    <span className={`target-avatars ${people.length > 1 ? 'is-pair ' : ''}${className}`}>
      {people.map(person => (
        <PersonAvatar key={person} person={person} size={size} />
      ))}
    </span>
  )
}

export default CalendarEventChip
