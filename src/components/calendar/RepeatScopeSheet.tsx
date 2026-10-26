import type { RepeatScope } from '../../domain/calendar'

const SCOPE_OPTIONS: { scope: RepeatScope; label: string }[] = [
  { scope: 'one', label: '이 일정만' },
  { scope: 'following', label: '이 일정과 이후 모두' },
  { scope: 'all', label: '반복 일정 전체' },
]

type RepeatScopeSheetProps = {
  action: '수정' | '삭제'
  allowOne?: boolean
  onSelect: (scope: RepeatScope) => void
  onClose: () => void
}

function RepeatScopeSheet({ action, allowOne = true, onSelect, onClose }: RepeatScopeSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={`반복 일정 ${action}`} onClick={event => event.stopPropagation()}>
        <p className="sheet-message">반복 일정이에요. 어디까지 {action}할까요?</p>
        <div className="scope-options">
          {SCOPE_OPTIONS.filter(option => allowOne || option.scope !== 'one').map(option => (
            <button
              key={option.scope}
              type="button"
              className={`button${action === '삭제' ? ' button-danger-outline' : ''}`}
              onClick={() => onSelect(option.scope)}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className="text-button" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

export default RepeatScopeSheet
