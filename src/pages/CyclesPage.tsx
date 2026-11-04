import { PlusIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import CalendarModeSwitch from '../components/calendar/CalendarModeSwitch'
import EmptyState from '../components/EmptyState'
import PersonAvatar from '../components/PersonAvatar'
import { deleteCycleLog, logCycle, saveCycle } from '../db/cycles'
import { useCycleRows, usePersonName } from '../db/hooks'
import { daysBetween, type CycleInput, type CycleItem, type CycleLog, type CycleState, type CycleTarget } from '../domain/cycle'
import { cycleBadge, formatPeriod } from '../domain/cycleText'
import { PEOPLE } from '../domain/types'
import { DEVICE_PERSON } from '../platform'
import { toDateKey } from '../utils/format'

type TargetFilter = '전체' | CycleTarget

const FILTERS: TargetFilter[] = ['전체', '공동', ...PEOPLE]

const UNDO_MS = 4000

const PRESETS: CycleInput[] = [
  { name: '수건 교체', icon: '🧺', target: '공동', period: { amount: 1, unit: 'year' }, link: null, notify: { enabled: false, offsets: [0], afterDays: null }, memo: '' },
  { name: '정수기 필터', icon: '💧', target: '공동', period: { amount: 6, unit: 'month' }, link: null, notify: { enabled: true, offsets: [0, 3], afterDays: null }, memo: '' },
  { name: '칫솔 교체', icon: '🪥', target: '공동', period: { amount: 3, unit: 'month' }, link: null, notify: { enabled: false, offsets: [0], afterDays: null }, memo: '' },
  { name: '치과', icon: '🦷', target: '공동', period: null, link: { category: '', keyword: '치과', person: '' }, notify: { enabled: false, offsets: [], afterDays: null }, memo: '' },
]

const todayKey = () => toDateKey(new Date().toISOString())

const formatShortDate = (dateKey: string) => {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}월 ${day}일`
}

const progressOf = (state: CycleState, today: string) => {
  if (!state.lastDate || !state.nextDate) return null
  const total = daysBetween(state.lastDate, state.nextDate)
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, daysBetween(state.lastDate, today) / total))
}

// 교체 주기(D-day)와 다녀온 지(D+)를 한눈에 본다.
function CyclesPage() {
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('id')
  const navigate = useNavigate()

  const today = todayKey()
  const rows = useCycleRows(today)

  const [filter, setFilter] = useState<TargetFilter>('전체')
  const [undo, setUndo] = useState<{ log: CycleLog; name: string } | null>(null)

  const visible = (rows ?? []).filter(row => filter === '전체' || row.item.target === filter)

  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [undo])

  const handleDone = async (item: CycleItem) => {
    const log = await logCycle(item.id, today, DEVICE_PERSON)
    setUndo({ log, name: item.name })
  }

  const handleUndo = async () => {
    if (!undo) return
    await deleteCycleLog(undo.log.id)
    setUndo(null)
  }

  return (
    <div className="page cycles-page">
      <header className="period-header">
        <div className="period-header-row">
          <CalendarModeSwitch mode="주기" />
          <h1 className="cycles-title">챙길 것</h1>
        </div>
      </header>

      <main className="page-content">
        {rows && rows.length === 0 && <CyclePresets onPick={preset => saveCycle(preset)} />}

        {rows && rows.length > 0 && (
          <>
            <TargetFilterChips value={filter} onChange={setFilter} />
            <ul className="cycle-list">
              {visible.map(row => (
                <CycleRow
                  key={row.item.id}
                  item={row.item}
                  state={row.state}
                  today={today}
                  isLinked={row.item.id === linkedId}
                  onOpen={() => navigate(`/cycles/${row.item.id}`)}
                  onDone={() => handleDone(row.item)}
                />
              ))}
            </ul>
          </>
        )}
      </main>

      <Link to="/cycles/new" className="fab" aria-label="주기 항목 추가">
        <PlusIcon size={26} weight="bold" aria-hidden="true" />
      </Link>

      {undo && (
        <div className="cycle-undo" role="status">
          <span>{undo.name} 했어요</span>
          <button type="button" className="text-button text-primary" onClick={handleUndo}>
            되돌리기
          </button>
        </div>
      )}
    </div>
  )
}

function TargetFilterChips({ value, onChange }: { value: TargetFilter; onChange: (filter: TargetFilter) => void }) {
  const personName = usePersonName()

  return (
    <div className="scope-chips" role="radiogroup" aria-label="대상">
      {FILTERS.map(filter => (
        <button key={filter} type="button" role="radio" aria-checked={filter === value} className="chip scope-chip" onClick={() => onChange(filter)}>
          {filter !== '전체' && <PersonAvatar person={filter} size={16} />}
          {filter === '전체' || filter === '공동' ? filter : personName(filter)}
        </button>
      ))}
    </div>
  )
}

type CycleRowProps = {
  item: CycleItem
  state: CycleState
  today: string
  isLinked: boolean
  onOpen: () => void
  onDone: () => void
}

function CycleRow({ item, state, today, isLinked, onOpen, onDone }: CycleRowProps) {
  const rowRef = useRef<HTMLLIElement>(null)

  const badge = cycleBadge(state, item.period !== null)
  const progress = progressOf(state, today)

  // 알림을 누르고 들어오면 그 항목으로 내려가 잠깐 강조한다.
  useEffect(() => {
    if (isLinked) rowRef.current?.scrollIntoView({ block: 'center' })
  }, [isLinked])

  return (
    <li ref={rowRef} className={`cycle-row${isLinked ? ' is-linked' : ''}`}>
      <button type="button" className="cycle-row-main" onClick={onOpen}>
        <span className="cycle-icon" aria-hidden="true">
          {item.icon || '🔁'}
        </span>
        <span className="cycle-text">
          <strong>{item.name}</strong>
          <small>
            {item.target !== '공동' && <PersonAvatar person={item.target} size={14} />}
            {formatPeriod(item.period)}
            {state.lastDate && ` · ${formatShortDate(state.lastDate)}`}
            {state.lastSource === 'payment' && state.lastMerchant && ` · ${state.lastMerchant}`}
          </small>
          {progress !== null && (
            <span className={`cycle-progress tone-${badge.tone}`} aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </span>
        <span className={`cycle-badge tone-${badge.tone}`}>{badge.text}</span>
      </button>
      <button type="button" className="cycle-done" onClick={onDone}>
        했어요
      </button>
    </li>
  )
}

function CyclePresets({ onPick }: { onPick: (preset: CycleInput) => void }) {
  return (
    <>
      <EmptyState sticker="peek">
        바꿀 때가 된 것, 다녀온 지 얼마나 됐는지
        <br />
        여기서 챙겨 볼까요?
      </EmptyState>
      <div className="cycle-presets">
        {PRESETS.map(preset => (
          <button key={preset.name} type="button" className="chip" onClick={() => onPick(preset)}>
            {preset.icon} {preset.name} · {formatPeriod(preset.period)}
          </button>
        ))}
      </div>
    </>
  )
}

export default CyclesPage
