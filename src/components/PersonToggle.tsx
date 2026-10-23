import { usePersonName } from '../db/hooks'
import { PEOPLE, type Person } from '../domain/types'
import PersonAvatar from './PersonAvatar'

type PersonToggleProps = {
  value: Person
  onChange: (person: Person) => void
}

function PersonToggle({ value, onChange }: PersonToggleProps) {
  const personName = usePersonName()

  return (
    <div className="person-toggle" role="radiogroup" aria-label="누구">
      {PEOPLE.map(person => (
        <button key={person} type="button" role="radio" aria-checked={person === value} className="person-toggle-option" onClick={() => onChange(person)}>
          <PersonAvatar person={person} size={20} />
          {personName(person)}
        </button>
      ))}
    </div>
  )
}

export default PersonToggle
