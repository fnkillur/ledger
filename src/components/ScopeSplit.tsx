import { usePersonName } from '../db/hooks'
import type { ScopeFilter } from '../domain/stats'
import PersonAvatar from './PersonAvatar'

type ScopeSplitProps = {
  items: { filter: Exclude<ScopeFilter, '전체'>; amount: number }[]
  showLabels?: boolean
}

function ScopeSplit({ items, showLabels = false }: ScopeSplitProps) {
  const personName = usePersonName()

  return (
    <span className="person-split">
      {items
        .filter(item => item.amount !== 0)
        .map(item => (
          <span
            key={item.filter}
            aria-label={`${item.filter === '공동' ? '공동' : `${personName(item.filter)} 개인`} ${item.amount.toLocaleString('ko-KR')}원`}
          >
            <PersonAvatar person={item.filter} size={14} />
            {showLabels && <span className="person-split-label">{item.filter === '공동' ? '공동' : personName(item.filter)}</span>}
            {item.amount.toLocaleString('ko-KR')}원
          </span>
        ))}
    </span>
  )
}

export default ScopeSplit
