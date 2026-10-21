import type { ScopeFilter } from '../domain/stats'
import { PEOPLE } from '../domain/types'
import PersonAvatar from './PersonAvatar'

const FILTERS: ScopeFilter[] = ['전체', '공동', ...PEOPLE]

type ScopeChipsProps = {
  value: ScopeFilter
  onChange: (filter: ScopeFilter) => void
}

const labelOf = (filter: ScopeFilter) => (filter === '전체' || filter === '공동' ? filter : '개인')

function ScopeChips({ value, onChange }: ScopeChipsProps) {
  return (
    <div className="scope-chips" role="radiogroup" aria-label="지출 범위">
      {FILTERS.map(filter => (
        <button
          key={filter}
          type="button"
          role="radio"
          aria-checked={filter === value}
          aria-label={filter === '전체' || filter === '공동' ? filter : `${filter} 개인`}
          className="chip scope-chip"
          onClick={() => onChange(filter)}
        >
          {filter === '공동' && <span aria-hidden="true">👫</span>}
          {filter !== '전체' && filter !== '공동' && <PersonAvatar person={filter} size={16} />}
          {labelOf(filter)}
        </button>
      ))}
    </div>
  )
}

export default ScopeChips
