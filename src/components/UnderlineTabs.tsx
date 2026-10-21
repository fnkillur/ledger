type UnderlineTabsProps<T extends string> = {
  tabs: readonly T[]
  value: T
  onChange: (tab: T) => void
  label: string
}

function UnderlineTabs<T extends string>({ tabs, value, onChange, label }: UnderlineTabsProps<T>) {
  return (
    <div className="underline-tabs" role="tablist" aria-label={label}>
      {tabs.map(tab => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === value}
          className="underline-tab"
          onClick={() => {
            onChange(tab)
            window.scrollTo({ top: 0 })
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

export default UnderlineTabs
