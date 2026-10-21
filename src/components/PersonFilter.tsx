import type { PersonFilter as PersonFilterValue } from '../domain/stats'
import { updateViewState, useViewState } from '../utils/viewState'
import PersonAvatar from './PersonAvatar'

const OPTIONS: PersonFilterValue[] = ['합산', '쿠리만쥬', '우사기']

function PersonFilter() {
  const { personFilter } = useViewState()

  return (
    <div className="segmented" role="radiogroup" aria-label="사람">
      {OPTIONS.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === personFilter}
          className="segmented-option with-avatar"
          onClick={() => updateViewState({ personFilter: option })}
        >
          {option !== '합산' && <PersonAvatar person={option} size={18} />}
          {option}
        </button>
      ))}
    </div>
  )
}

export default PersonFilter
