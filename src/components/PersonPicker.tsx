import type { PersonFilter } from '../domain/stats'
import { PEOPLE } from '../domain/types'
import { updateViewState, useViewState } from '../utils/viewState'
import PersonAvatar from './PersonAvatar'

function PersonPicker() {
  const { personFilter } = useViewState()

  const select = (value: PersonFilter) => updateViewState({ personFilter: value })

  return (
    <div className="person-picker" role="radiogroup" aria-label="사람">
      <button
        type="button"
        role="radio"
        aria-checked={personFilter === '합산'}
        aria-label="둘 다"
        className="person-picker-option"
        onClick={() => select('합산')}
      >
        <span className="avatar-pair" aria-hidden="true">
          {PEOPLE.map(person => (
            <PersonAvatar key={person} person={person} size={16} />
          ))}
        </span>
      </button>
      {PEOPLE.map(person => (
        <button
          key={person}
          type="button"
          role="radio"
          aria-checked={personFilter === person}
          aria-label={person}
          className="person-picker-option"
          onClick={() => select(person)}
        >
          <PersonAvatar person={person} size={22} />
        </button>
      ))}
    </div>
  )
}

export default PersonPicker
