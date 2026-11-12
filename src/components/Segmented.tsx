type SegmentedProps<T extends string> = {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  label: string
  labelOf?: (value: T) => string
}

function Segmented<T extends string>({ options, value, onChange, label, labelOf = option => option }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className="segmented-option"
          onClick={() => onChange(option)}
        >
          {labelOf(option)}
        </button>
      ))}
    </div>
  )
}

export default Segmented
