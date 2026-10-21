import type { ScopeFilter } from '../domain/stats'
import PersonAvatar from './PersonAvatar'

type ScopeSplitProps = {
  items: { filter: Exclude<ScopeFilter, '전체'>; amount: number }[]
}

function ScopeSplit({ items }: ScopeSplitProps) {
  return (
    <span className="person-split">
      {items
        .filter(item => item.amount !== 0)
        .map(item => (
          <span
            key={item.filter}
            aria-label={`${item.filter === '공동' ? '공동' : `${item.filter} 개인`} ${item.amount.toLocaleString('ko-KR')}원`}
          >
            <PersonAvatar person={item.filter} size={14} />
            {item.amount.toLocaleString('ko-KR')}
          </span>
        ))}
    </span>
  )
}

export default ScopeSplit
