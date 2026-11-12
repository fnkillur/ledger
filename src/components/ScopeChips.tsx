import { usePersonName } from '../db/hooks'
import type { ScopeFilter } from '../domain/stats'
import { PEOPLE, scopeLabel } from '../domain/types'
import PersonAvatar from './PersonAvatar'

const FILTERS: ScopeFilter[] = ['전체', '공동', ...PEOPLE]

type ScopeChipsProps = {
  value: ScopeFilter
  onChange: (filter: ScopeFilter) => void
}

const labelOf = (filter: ScopeFilter) => {
  if (filter === '전체') return filter
  return scopeLabel(filter === '공동' ? '공동' : '개인')
}

function ScopeChips({ value, onChange }: ScopeChipsProps) {
  const personName = usePersonName()

  return (
    <div className="scope-chips" role="radiogroup" aria-label="지출 범위">
      {FILTERS.map(filter => (
        <button
          key={filter}
          type="button"
          role="radio"
          aria-checked={filter === value}
          aria-label={filter === '전체' || filter === '공동' ? labelOf(filter) : `${personName(filter)} ${labelOf(filter)}`}
          className="chip scope-chip"
          onClick={() => onChange(filter)}
        >
          {filter !== '전체' && <PersonAvatar person={filter} size={16} />}
          {labelOf(filter)}
        </button>
      ))}
    </div>
  )
}

export default ScopeChips
