import { TARGET_TONE, type CalendarEvent, type CalendarTarget } from '../../domain/calendar'
import PersonAvatar from '../PersonAvatar'

type CalendarEventChipProps = {
  event: CalendarEvent
}

function CalendarEventChip({ event }: CalendarEventChipProps) {
  return (
    <span className={`calendar-chip ${TARGET_TONE[event.target]}`}>
      <TargetAvatars target={event.target} size={12} />
      <span className="calendar-chip-title">{event.title}</span>
    </span>
  )
}

export function TargetAvatars({ target, size }: { target: CalendarTarget; size: number }) {
  if (target === '없음') return null
  if (target === '공동') {
    return (
      <span className="target-avatars">
        <PersonAvatar person="쿠리만쥬" size={size} />
        <PersonAvatar person="우사기" size={size} />
      </span>
    )
  }
  return (
    <span className="target-avatars">
      <PersonAvatar person={target} size={size} />
    </span>
  )
}

export default CalendarEventChip
